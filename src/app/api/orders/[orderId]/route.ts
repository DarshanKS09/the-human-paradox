import { NextResponse } from "next/server";
import { PRODUCT } from "@/lib/product";
import { getServerConfig } from "@/lib/config";
import { getStore, jsonError, rateLimitOr429 } from "@/lib/http";
import { verifyToken, PURPOSE_RECEIPT } from "@/lib/tokens";
import { isValidOrderId, maskEmail } from "@/lib/validate";

/**
 * Returns the authoritative order status to the purchaser holding the
 * short-lived receipt token. A query parameter alone (`?success=true`)
 * is never proof of payment — only this backend state is.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const limited = rateLimitOr429(req, "order-status", 60, 60_000);
  if (limited) return limited;

  const { orderId } = await params;
  if (!isValidOrderId(orderId)) {
    return jsonError(404, "ORDER_NOT_FOUND", "Order not found.");
  }

  const cfg = getServerConfig();
  if (!cfg.downloadTokenSecret) {
    return jsonError(503, "PAYMENTS_NOT_CONFIGURED", "Payments are not set up yet.");
  }

  const rt = new URL(req.url).searchParams.get("rt");
  const verified = verifyToken(cfg.downloadTokenSecret, PURPOSE_RECEIPT, rt ?? "");
  if (!verified || verified.orderId !== orderId) {
    return jsonError(404, "ORDER_NOT_FOUND", "Order not found.");
  }

  const order = getStore().get(orderId);
  if (!order) {
    return jsonError(404, "ORDER_NOT_FOUND", "Order not found.");
  }

  const base = {
    ok: true,
    orderId: order.id,
    status: order.status,
    productTitle: PRODUCT.title,
    amountLabel: PRODUCT.priceLabel,
    emailMasked: maskEmail(order.email),
    paidAt: order.paidAt,
    emailSent: order.fulfillment.emailSentAt !== null,
  };

  if (order.status !== "paid") {
    return NextResponse.json(base);
  }

  const remaining = Math.max(0, cfg.maxDownloadsPerOrder - order.downloadCount);
  return NextResponse.json({
    ...base,
    downloadToken: order.fulfillment.downloadToken,
    downloadExpiresAt: order.fulfillment.tokenExpiresAt,
    downloadsRemaining: remaining,
  });
}
