import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidOrderId,
  isValidProductId,
  maskEmail,
  normalizeEmail,
} from "@/lib/validate";
import { checkRateLimit, resetRateLimiter } from "@/lib/rate-limit";

describe("input validation", () => {
  it("accepts real-world emails and normalizes them", () => {
    expect(isValidEmail("Reader@Example.com")).toBe(true);
    expect(normalizeEmail("  Reader@Example.com ")).toBe("reader@example.com");
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });

  it("validates product and order ids", () => {
    expect(isValidProductId("ymine-01")).toBe(true);
    expect(isValidProductId("other")).toBe(false);
    expect(isValidOrderId("ord_0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isValidOrderId("ord_short")).toBe(false);
    expect(isValidOrderId("order_123")).toBe(false);
  });

  it("masks emails for display", () => {
    expect(maskEmail("reader@example.com")).toBe("r***@example.com");
    expect(maskEmail("broken")).toBe("***");
  });
});

describe("rate limiting", () => {
  it("allows up to the limit, then blocks with a retry hint", () => {
    resetRateLimiter();
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", 3, 60_000, 1000 + i).allowed).toBe(true);
    }
    const blocked = checkRateLimit("k", 3, 60_000, 1005);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // Next window allows again.
    expect(checkRateLimit("k", 3, 60_000, 1000 + 60_000).allowed).toBe(true);
  });
});
