import { describe, expect, it } from "vitest";
import { normalizeEmailFrom } from "@/lib/config";
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

describe("email sender formatting", () => {
  const BRAND = "The Human Paradox";

  it("adds the brand name when only a bare address is configured", () => {
    expect(normalizeEmailFrom("someone@gmail.com", BRAND)).toBe(
      "The Human Paradox <someone@gmail.com>"
    );
  });

  it("keeps an explicitly configured display name", () => {
    expect(normalizeEmailFrom("Custom Name <a@b.com>", BRAND)).toBe(
      "Custom Name <a@b.com>"
    );
  });

  it("falls back to a branded sender when unset or empty", () => {
    expect(normalizeEmailFrom(null, BRAND)).toBe(
      "The Human Paradox <hello@example.com>"
    );
    expect(normalizeEmailFrom("   ", BRAND)).toBe(
      "The Human Paradox <hello@example.com>"
    );
  });

  it("strips a mailto: prefix and trims whitespace", () => {
    expect(normalizeEmailFrom("  mailto:a@b.com  ", BRAND)).toBe(
      "The Human Paradox <a@b.com>"
    );
  });

  it("never leaves the sender without a display name", () => {
    for (const input of ["a@b.com", "mailto:a@b.com", null, ""]) {
      expect(normalizeEmailFrom(input, BRAND)).toMatch(/^The Human Paradox </);
    }
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
