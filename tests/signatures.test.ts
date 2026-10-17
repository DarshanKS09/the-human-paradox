import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertPaymentValid,
  GatewayError,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "@/lib/razorpay";

const SECRET = "test_key_secret_123";

function paymentSig(orderId: string, paymentId: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

describe("payment signature verification", () => {
  it("accepts a correctly computed signature", () => {
    expect(
      verifyPaymentSignature({
        orderId: "order_ABC",
        paymentId: "pay_XYZ",
        signature: paymentSig("order_ABC", "pay_XYZ"),
        keySecret: SECRET,
      })
    ).toBe(true);
  });

  it("rejects tampered order/payment ids and wrong secrets", () => {
    const good = paymentSig("order_ABC", "pay_XYZ");
    expect(
      verifyPaymentSignature({ orderId: "order_ABC2", paymentId: "pay_XYZ", signature: good, keySecret: SECRET })
    ).toBe(false);
    expect(
      verifyPaymentSignature({ orderId: "order_ABC", paymentId: "pay_XYZ", signature: good, keySecret: "wrong" })
    ).toBe(false);
    expect(
      verifyPaymentSignature({ orderId: "order_ABC", paymentId: "pay_XYZ", signature: "00".repeat(32), keySecret: SECRET })
    ).toBe(false);
    expect(
      verifyPaymentSignature({ orderId: "", paymentId: "pay_XYZ", signature: good, keySecret: SECRET })
    ).toBe(false);
  });
});

describe("webhook signature verification", () => {
  const raw = JSON.stringify({ id: "evt_1", event: "payment.captured" });
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");

  it("accepts the signature of the unmodified raw body", () => {
    expect(verifyWebhookSignature(raw, sig, SECRET)).toBe(true);
  });

  it("rejects modified bodies, wrong secrets, and missing signatures", () => {
    expect(verifyWebhookSignature(`${raw} `, sig, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, sig, "other-secret")).toBe(false);
    expect(verifyWebhookSignature(raw, null, SECRET)).toBe(false);
  });
});

describe("authoritative payment checks", () => {
  const valid = {
    id: "pay_1",
    orderId: "order_1",
    amount: 4900,
    currency: "INR",
    status: "captured",
    email: "a@b.co",
    captured: true,
  };

  it("accepts a captured ₹49 payment for the expected order", () => {
    expect(() => assertPaymentValid(valid, "order_1")).not.toThrow();
  });

  it("rejects wrong order id, wrong amount, wrong currency", () => {
    expect(() => assertPaymentValid(valid, "order_2")).toThrowError(GatewayError);
    expect(() => assertPaymentValid({ ...valid, amount: 4800 }, "order_1")).toThrowError(GatewayError);
    expect(() => assertPaymentValid({ ...valid, currency: "USD" }, "order_1")).toThrowError(GatewayError);
  });

  it("rejects uncaptured and pending payments", () => {
    expect(() =>
      assertPaymentValid({ ...valid, status: "authorized", captured: false }, "order_1")
    ).toThrowError(GatewayError);
    try {
      assertPaymentValid({ ...valid, status: "created", captured: false }, "order_1");
      expect.unreachable();
    } catch (err) {
      expect((err as GatewayError).code).toBe("PAYMENT_PENDING");
    }
  });
});
