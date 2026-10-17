import { NextResponse } from "next/server";
import { PRODUCT } from "@/lib/product";
import { getServerConfig, requirePayments } from "@/lib/config";
import { createGatewayOrder, GatewayError } from "@/lib/razorpay";
import { getStore, jsonError, rateLimitOr429 } from "@/lib/http";
import { issueToken, PURPOSE_RECEIPT } from "@/lib/tokens";
import { requireDownloadTokenSecret } from "@/lib/config";
import { CheckoutInputError, parseCheckoutInput } from "@/lib/checkout-input";
import { OrderTransitionError } from "@/lib/orders";

const RECEIPT_TTL_SECONDS = 30 * 60;

export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "create-order", 30, 60_000);
  if (limited) return limited;

  const cfg = getServerConfig();
  // FREE distribution mode: no payment orders may be created.
  if (cfg.distributionMode !== "PAID") {
    return jsonError(
      404,
      "NOT_AVAILABLE",
      "Paid checkout is not available in the current distribution mode."
    );
  }
  let payments;
  try {
    payments = requirePayments(cfg);
  } catch {
    return jsonError(
      503,
      "PAYMENTS_NOT_CONFIGURED",
      "Online payments are not set up yet. Please try again later."
    );
  }
  let receiptSecret: string;
  try {
    receiptSecret = requireDownloadTokenSecret(cfg);
  } catch {
    return jsonError(
      503,
      "PAYMENTS_NOT_CONFIGURED",
      "Online payments are not set up yet. Please try again later."
    );
  }

  let input;
  try {
    const body = (await req.json()) as unknown;
    input = parseCheckoutInput(body);
  } catch (err) {
    if (err instanceof CheckoutInputError) {
      return jsonError(400, err.code, err.message);
    }
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }

  const email = input.email;
  const idempotencyKey = input.idempotencyKey;

  const store = getStore();

  // Idempotent retry: same key + still unpaid -> return the existing order
  // instead of creating a second gateway order.
  if (idempotencyKey) {
    const existing = store.getByIdempotencyKey(idempotencyKey);
    if (existing && existing.email === email) {
      if (existing.status === "paid") {
        return NextResponse.json({
          ok: true,
          orderId: existing.id,
          status: "paid",
          receiptToken: existing.receiptToken,
        });
      }
      if (existing.gatewayOrderId && existing.status !== "failed") {
        return NextResponse.json({
          ok: true,
          orderId: existing.id,
          gatewayOrderId: existing.gatewayOrderId,
          keyId: payments.keyId,
          amountPaise: PRODUCT.pricePaise,
          currency: PRODUCT.currency,
          productTitle: PRODUCT.title,
          email: existing.email,
          receiptToken: existing.receiptToken,
          testMode: payments.testMode,
          reused: true,
        });
      }
    }
  }

  let order;
  try {
    order = store.create({
      productId: PRODUCT.id,
      amountPaise: PRODUCT.pricePaise,
      currency: PRODUCT.currency,
      email,
      idempotencyKey,
      // Placeholder: replaced with the order-bound token below.
      receiptToken: "pending",
    });
  } catch (err) {
    if (err instanceof OrderTransitionError && idempotencyKey) {
      const existing = store.getByIdempotencyKey(idempotencyKey);
      if (existing && existing.gatewayOrderId && existing.status !== "failed") {
        return NextResponse.json({
          ok: true,
          orderId: existing.id,
          gatewayOrderId: existing.gatewayOrderId,
          keyId: payments.keyId,
          amountPaise: PRODUCT.pricePaise,
          currency: PRODUCT.currency,
          productTitle: PRODUCT.title,
          email: existing.email,
          receiptToken: existing.receiptToken,
          testMode: payments.testMode,
          reused: true,
        });
      }
    }
    return jsonError(409, "ORDER_CONFLICT", "Could not start checkout. Please retry.");
  }

  // Receipt token is bound to the final order id.
  const receiptToken = issueToken(
    receiptSecret,
    PURPOSE_RECEIPT,
    order.id,
    RECEIPT_TTL_SECONDS
  );
  store.update(order.id, (o) => ({ order: { ...o, receiptToken }, result: null }));

  try {
    const gateway = await createGatewayOrder(
      payments.keyId,
      payments.keySecret,
      order.id
    );
    store.setGatewayOrderId(order.id, gateway.id);
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      gatewayOrderId: gateway.id,
      keyId: payments.keyId,
      amountPaise: PRODUCT.pricePaise,
      currency: PRODUCT.currency,
      productTitle: PRODUCT.title,
      email,
      receiptToken,
      testMode: payments.testMode,
    });
  } catch (err) {
    store.markFailed(order.id);
    const code = err instanceof GatewayError ? err.code : "GATEWAY_ORDER_FAILED";
    return jsonError(
      502,
      code,
      "Could not start the payment. Please try again."
    );
  }
}
