import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { PRODUCT } from "./product";

/**
 * Razorpay integration. Secrets stay on the server: only `keyId`
 * (the publishable key) is ever sent to the browser, inside the
 * create-order response, which is the gateway's documented pattern.
 */

export class GatewayError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
  }
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amount: number;
  currency: string;
  status: string;
  email: string | null;
  captured: boolean;
}

/** Minimal surface of the SDK we use — injectable for tests. */
export interface RazorpayClientLike {
  orders: {
    create(input: {
      amount: number;
      currency: string;
      receipt: string;
      notes?: Record<string, string>;
    }): Promise<{ id: string; amount: number; currency: string }>;
  };
  payments: {
    fetch(paymentId: string): Promise<{
      id: string;
      order_id?: string | null;
      amount: number;
      currency: string;
      status: string;
      captured?: boolean;
      email?: string | null;
    }>;
  };
}

let singleton: Razorpay | null = null;

export function getRazorpayClient(
  keyId: string,
  keySecret: string
): RazorpayClientLike {
  if (!singleton) {
    singleton = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return singleton as unknown as RazorpayClientLike;
}

/** Test-only hook to drop the cached SDK client between tests. */
export function resetRazorpayClient(): void {
  singleton = null;
}

export async function createGatewayOrder(
  keyId: string,
  keySecret: string,
  receipt: string,
  client?: RazorpayClientLike
): Promise<GatewayOrder> {
  const rzp = client ?? getRazorpayClient(keyId, keySecret);
  try {
    const order = await rzp.orders.create({
      amount: PRODUCT.pricePaise,
      currency: PRODUCT.currency,
      receipt,
      notes: { product_id: PRODUCT.id, product: PRODUCT.title },
    });
    if (order.amount !== PRODUCT.pricePaise || order.currency !== PRODUCT.currency) {
      throw new GatewayError(
        "GATEWAY_AMOUNT_MISMATCH",
        "Gateway returned an unexpected order amount or currency."
      );
    }
    return { id: order.id, amount: order.amount, currency: order.currency };
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    throw new GatewayError(
      "GATEWAY_ORDER_FAILED",
      "Could not create a payment order. Please try again."
    );
  }
}

function hmacHex(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/**
 * Verifies the checkout success signature:
 * HMAC-SHA256(`${orderId}|${paymentId}`, keySecret) === signature.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const { orderId, paymentId, signature, keySecret } = input;
  if (!orderId || !paymentId || !signature) return false;
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  const expected = hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

/**
 * Verifies a webhook signature against the UNMODIFIED raw request body:
 * HMAC-SHA256(rawBody, webhookSecret) === signature header.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
): boolean {
  if (!rawBody || !signature) return false;
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  const expected = hmacHex(webhookSecret, rawBody);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

export async function fetchGatewayPayment(
  paymentId: string,
  keyId: string,
  keySecret: string,
  client?: RazorpayClientLike
): Promise<GatewayPayment> {
  const rzp = client ?? getRazorpayClient(keyId, keySecret);
  try {
    const p = await rzp.payments.fetch(paymentId);
    return {
      id: p.id,
      orderId: p.order_id ?? null,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      email: p.email ?? null,
      captured: p.status === "captured" || p.captured === true,
    };
  } catch {
    throw new GatewayError(
      "GATEWAY_PAYMENT_LOOKUP_FAILED",
      "Could not confirm the payment with the gateway."
    );
  }
}

/**
 * Authoritative payment check. The payment MUST be captured, MUST match
 * the expected gateway order, and MUST equal the server-side price.
 */
export function assertPaymentValid(
  payment: GatewayPayment,
  expectedGatewayOrderId: string
): void {
  if (payment.orderId !== expectedGatewayOrderId) {
    throw new GatewayError("ORDER_MISMATCH", "Payment does not match this order.");
  }
  if (payment.amount !== PRODUCT.pricePaise || payment.currency !== PRODUCT.currency) {
    throw new GatewayError(
      "AMOUNT_MISMATCH",
      "Paid amount does not match the product price."
    );
  }
  if (!payment.captured) {
    throw new GatewayError(
      payment.status === "created" || payment.status === "authorized"
        ? "PAYMENT_PENDING"
        : "PAYMENT_NOT_CAPTURED",
      "Payment has not been captured."
    );
  }
}
