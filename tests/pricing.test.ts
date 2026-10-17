import { describe, expect, it } from "vitest";
import { PRODUCT } from "@/lib/product";
import { parseCheckoutInput, CheckoutInputError } from "@/lib/checkout-input";

describe("server-side product pricing", () => {
  it("is fixed at ₹49 INR (4900 paise)", () => {
    expect(PRODUCT.id).toBe("ymine-01");
    expect(PRODUCT.pricePaise).toBe(4900);
    expect(PRODUCT.currency).toBe("INR");
    expect(PRODUCT.priceLabel).toBe("₹49");
  });

  it("accepts a valid checkout body", () => {
    const parsed = parseCheckoutInput({
      email: "  Reader@Example.com ",
      productId: "ymine-01",
    });
    expect(parsed.email).toBe("reader@example.com");
    expect(parsed.productId).toBe("ymine-01");
  });

  it("accepts a matching client-supplied amount but never trusts it", () => {
    const parsed = parseCheckoutInput({
      email: "a@b.co",
      productId: "ymine-01",
      amountPaise: 4900,
    });
    expect(parsed.email).toBe("a@b.co");
  });

  it("rejects a manipulated purchase amount", () => {
    for (const amount of [1, 100, 4901, 490000, "4900", null]) {
      if (amount === null) continue; // null/undefined mean "not supplied"
      expect(() =>
        parseCheckoutInput({ email: "a@b.co", productId: "ymine-01", amountPaise: amount })
      ).toThrowError(CheckoutInputError);
    }
    try {
      parseCheckoutInput({ email: "a@b.co", productId: "ymine-01", amountPaise: 1 });
      expect.unreachable();
    } catch (err) {
      expect((err as CheckoutInputError).code).toBe("AMOUNT_MISMATCH");
    }
  });

  it("rejects invalid emails and unknown products", () => {
    expect(() =>
      parseCheckoutInput({ email: "not-an-email", productId: "ymine-01" })
    ).toThrowError(CheckoutInputError);
    expect(() =>
      parseCheckoutInput({ email: "a@b.co", productId: "other-book" })
    ).toThrowError(CheckoutInputError);
  });

  it("accepts only well-formed idempotency keys", () => {
    expect(
      parseCheckoutInput({ email: "a@b.co", productId: "ymine-01", idempotencyKey: "abc12345" })
        .idempotencyKey
    ).toBe("abc12345");
    expect(
      parseCheckoutInput({ email: "a@b.co", productId: "ymine-01", idempotencyKey: "x" })
        .idempotencyKey
    ).toBeNull();
  });
});
