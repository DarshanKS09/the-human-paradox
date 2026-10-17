import { describe, expect, it } from "vitest";
import {
  issueToken,
  verifyToken,
  tokenFingerprint,
  PURPOSE_DOWNLOAD,
  PURPOSE_RECEIPT,
} from "@/lib/tokens";

const SECRET = "test_download_secret_1234567890";
const ORDER = "ord_0123456789abcdef0123456789abcdef";

describe("download and receipt tokens", () => {
  it("round-trips a valid token", () => {
    const token = issueToken(SECRET, PURPOSE_DOWNLOAD, ORDER, 3600, 1_000_000);
    const verified = verifyToken(SECRET, PURPOSE_DOWNLOAD, token, 1_000_100);
    expect(verified).toEqual({ orderId: ORDER, expiresAtSeconds: 1_003_600 });
  });

  it("rejects expired tokens", () => {
    const token = issueToken(SECRET, PURPOSE_DOWNLOAD, ORDER, 60, 1_000_000);
    expect(verifyToken(SECRET, PURPOSE_DOWNLOAD, token, 1_000_061)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const token = issueToken(SECRET, PURPOSE_DOWNLOAD, ORDER, 3600, 1_000_000);
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(verifyToken(SECRET, PURPOSE_DOWNLOAD, tampered, 1_000_100)).toBeNull();
  });

  it("rejects wrong secrets and wrong purposes", () => {
    const token = issueToken(SECRET, PURPOSE_DOWNLOAD, ORDER, 3600, 1_000_000);
    expect(verifyToken("other-secret", PURPOSE_DOWNLOAD, token, 1_000_100)).toBeNull();
    expect(verifyToken(SECRET, PURPOSE_RECEIPT, token, 1_000_100)).toBeNull();
  });

  it("rejects malformed and oversized tokens", () => {
    expect(verifyToken(SECRET, PURPOSE_DOWNLOAD, "not-a-token", 1_000_100)).toBeNull();
    expect(verifyToken(SECRET, PURPOSE_DOWNLOAD, "", 1_000_100)).toBeNull();
    expect(verifyToken(SECRET, PURPOSE_DOWNLOAD, "x".repeat(600), 1_000_100)).toBeNull();
  });

  it("fingerprints never contain the full token", () => {
    const token = issueToken(SECRET, PURPOSE_DOWNLOAD, ORDER, 3600, 1_000_000);
    const fp = tokenFingerprint(token);
    expect(token).not.toContain(fp.replace("…", ""));
    expect(fp.length).toBeLessThan(token.length);
  });
});
