import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless HMAC-SHA256 bearer tokens for downloads and order receipts.
 *
 * Format: `v1.<purpose>.<base64url(orderId)>.<exp>.<base64url(sig)>`
 * where sig = HMAC(secret, `v1.<purpose>.<orderB64>.<exp>`).
 *
 * Tokens never leave the server except to the verified purchaser, are never
 * logged in full, and expire. The order itself remains authoritative: every
 * download additionally requires a paid, unexpired, within-limit order.
 */

const VERSION = "v1";

export const PURPOSE_DOWNLOAD = "dl";
export const PURPOSE_RECEIPT = "rcpt";
/** Free-claim download token (FREE distribution mode). */
export const PURPOSE_FREE_DOWNLOAD = "fr";

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(secret: string, data: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(data).digest());
}

export function issueToken(
  secret: string,
  purpose: string,
  orderId: string,
  ttlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): string {
  const exp = nowSeconds + ttlSeconds;
  const orderB64 = b64urlEncode(orderId);
  const data = `${VERSION}.${purpose}.${orderB64}.${exp}`;
  return `${data}.${sign(secret, data)}`;
}

export interface VerifiedToken {
  orderId: string;
  expiresAtSeconds: number;
}

export function verifyToken(
  secret: string,
  purpose: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifiedToken | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [version, tokenPurpose, orderB64, expRaw, sig] = parts;
  if (version !== VERSION || tokenPurpose !== purpose) return null;
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || exp <= nowSeconds) return null;

  const data = `${VERSION}.${purpose}.${orderB64}.${exp}`;
  const expected = sign(secret, data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  let equal = false;
  try {
    equal = timingSafeEqual(a, b);
  } catch {
    return null;
  }
  if (!equal) return null;

  let orderId: string;
  try {
    orderId = b64urlDecode(orderB64);
  } catch {
    return null;
  }
  if (!/^ord_[0-9a-f]{32}$/.test(orderId) && !/^clm_[0-9a-f]{32}$/.test(orderId)) {
    return null;
  }
  return { orderId, expiresAtSeconds: exp };
}

/** Short fingerprint safe for logs: never log full tokens. */
export function tokenFingerprint(token: string): string {
  if (!token) return "none";
  return token.length <= 12 ? "***" : `${token.slice(0, 6)}…${token.slice(-4)}`;
}
