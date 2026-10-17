import { NextResponse } from "next/server";
import { PRODUCT } from "@/lib/product";
import { getServerConfig, requirePayments } from "@/lib/config";
import {
  assertPaymentValid,
  fetchGatewayPayment,
  GatewayError,
  verifyPaymentSignature,
} from "@/lib/razorpay";
import { fulfillOrder } from "@/lib/fulfill";
import { getStore, jsonError, rateLimitOr429 } from "@/lib/http";
import { isValidOrderId } from "@/lib/validate";
import { maskEmail } from "@/lib/validate";

interface VerifyBody {
  orderId?: unknown;
  razorpayOrderId?: unknown;
  razorpayPaymentId?: unknown;
  razorpaySignature?: unknown;
}

export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "verify", 60, 60_000);
  if (limited) return limited;

  const cfg = getServerConfig();
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
    return jsonError(503, "PAYMENTS_NOT_CONFIGURED", "Payments are not set up yet.");
  }
  if (!cfg.downloadTokenSecret) {
    return jsonError(503, "PAYMENTS_NOT_CONFIGURED", "Payments are not set up yet.");
  }

  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;
  if (
    !isValidOrderId(orderId) ||
    typeof razorpayOrderId !== "string" ||
    razorpayOrderId.length === 0 ||
    typeof razorpayPaymentId !== "string" ||
    razorpayPaymentId.length === 0 ||
    typeof razorpaySignature !== "string" ||
    razorpaySignature.length === 0
  ) {
    return jsonError(400, "INVALID_PAYMENT_REF", "Incomplete payment reference.");
  }

  const store = getStore();
  const order = store.get(orderId as string);
  if (!order || order.gatewayOrderId !== razorpayOrderId) {
    // Generic message: do not reveal whether the order id exists.
    return jsonError(404, "ORDER_NOT_FOUND", "Order not found.");
  }

  const signatureOk = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    keySecret: payments.keySecret,
  });
  if (!signatureOk) {
    return jsonError(401, "INVALID_SIGNATURE", "Payment signature verification failed.");
  }

  // Signature is valid, but the signature alone is not proof of capture:
  // confirm status and amount directly with the gateway.
  let payment;
  try {
    payment = await fetchGatewayPayment(
      razorpayPaymentId,
      payments.keyId,
      payments.keySecret
    );
  } catch (err) {
    const code = err instanceof GatewayError ? err.code : "GATEWAY_PAYMENT_LOOKUP_FAILED";
    return jsonError(502, code, "Could not confirm the payment. Please try again.");
  }

  try {
    assertPaymentValid(payment, razorpayOrderId);
  } catch (err) {
    if (err instanceof GatewayError && err.code === "PAYMENT_PENDING") {
      store.update(order.id, (o) =>
        o.status === "created"
          ? { order: { ...o, status: "pending", gatewayPaymentId: payment.id }, result: null }
          : { order: o, result: null }
      );
      return NextResponse.json({ ok: true, status: "pending", orderId: order.id });
    }
    if (err instanceof GatewayError && err.code === "PAYMENT_NOT_CAPTURED") {
      store.markFailed(order.id);
    }
    const code = err instanceof GatewayError ? err.code : "PAYMENT_INVALID";
    return jsonError(402, code, "The payment could not be confirmed for this order.");
  }

  store.setGatewayPaymentId(order.id, payment.id);
  store.markPaid(order.id, payment.id);

  const fulfilled = await fulfillOrder(
    {
      dbPath: cfg.ordersDbPath,
      downloadTokenSecret: cfg.downloadTokenSecret as string,
      linkTtlSeconds: cfg.downloadLinkTtlHours * 3600,
      appBaseUrl: cfg.appBaseUrl,
      smtp: cfg.smtp,
      emailFrom: cfg.emailFrom,
    },
    order.id
  );

  return NextResponse.json({
    ok: true,
    status: "paid",
    orderId: order.id,
    productTitle: PRODUCT.title,
    amountLabel: PRODUCT.priceLabel,
    emailMasked: maskEmail(order.email),
    receiptToken: order.receiptToken,
    downloadToken: fulfilled.downloadToken,
    downloadUrl: fulfilled.downloadUrl,
    downloadExpiresAt: fulfilled.expiresAtIso,
    emailSent: fulfilled.emailSent,
  });
}
