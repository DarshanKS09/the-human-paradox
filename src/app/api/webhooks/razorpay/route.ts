import { NextResponse } from "next/server";
import { PRODUCT } from "@/lib/product";
import { getServerConfig } from "@/lib/config";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { fulfillOrder } from "@/lib/fulfill";
import { getStore } from "@/lib/http";

/**
 * Razorpay webhook receiver. Verifies the HMAC signature against the
 * UNMODIFIED raw body, dedupes by event id, and reconciles order state.
 * Always returns 2xx for valid signatures so temporary fulfillment
 * problems (e.g. email outage) do not cause harmful retries — retries
 * themselves are idempotent.
 */

interface WebhookPaymentEntity {
  id: string;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  status?: string;
}

interface WebhookBody {
  id?: string;
  event?: string;
  payload?: {
    payment?: { entity?: WebhookPaymentEntity };
  };
}

export async function POST(req: Request) {
  const cfg = getServerConfig();
  const webhookSecret = cfg.payments?.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
  if (!webhookSecret) {
    // Payments not configured: acknowledge without action.
    return NextResponse.json({ ok: false, action: "ignored" }, { status: 200 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_SIGNATURE" },
      { status: 401 }
    );
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_BODY" }, { status: 400 });
  }

  const eventId = typeof body.id === "string" ? body.id : null;
  const event = typeof body.event === "string" ? body.event : "unknown";
  const entity = body.payload?.payment?.entity;
  const gatewayOrderId = entity?.order_id ?? null;

  const store = getStore();
  if (eventId && store.hasEvent(eventId)) {
    return NextResponse.json({ ok: true, action: "deduped" });
  }

  const order = gatewayOrderId ? store.getByGatewayOrderId(gatewayOrderId) : null;
  if (eventId) store.recordEvent(eventId, order?.id ?? gatewayOrderId ?? "unknown");

  if (!order || !entity) {
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  if (event === "payment.captured") {
    // Verify amount/currency/product match before fulfilling — never trust
    // the event alone.
    if (entity.amount !== PRODUCT.pricePaise || entity.currency !== PRODUCT.currency) {
      console.warn(
        JSON.stringify({
          msg: "webhook amount mismatch",
          event: eventId,
          gatewayOrder: gatewayOrderId,
        })
      );
      return NextResponse.json({ ok: true, action: "ignored-amount-mismatch" });
    }
    store.setGatewayPaymentId(order.id, entity.id);
    store.markPaid(order.id, entity.id);
    if (!cfg.downloadTokenSecret) {
      return NextResponse.json({ ok: true, action: "paid-email-deferred" });
    }
    // Email failure is recorded inside fulfillOrder, never thrown.
    await fulfillOrder(
      {
        dbPath: cfg.ordersDbPath,
        downloadTokenSecret: cfg.downloadTokenSecret,
        linkTtlSeconds: cfg.downloadLinkTtlHours * 3600,
        appBaseUrl: cfg.appBaseUrl,
        smtp: cfg.smtp,
        emailFrom: cfg.emailFrom,
      },
      order.id
    );
    return NextResponse.json({ ok: true, action: "fulfilled" });
  }

  if (event === "payment.failed") {
    store.markFailed(order.id);
    return NextResponse.json({ ok: true, action: "marked-failed" });
  }

  return NextResponse.json({ ok: true, action: "ignored" });
}
