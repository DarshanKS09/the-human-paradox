import { NextResponse } from "next/server";
import { getServerConfig } from "./config";
import { createOrderStore, type OrderStore } from "./orders";
import { checkRateLimit, clientIp } from "./rate-limit";

let store: OrderStore | null = null;

/** Paid-order store rooted at ORDERS_DB_PATH (server only). */
export function getStore(): OrderStore {
  if (!store) store = createOrderStore(getServerConfig().ordersDbPath);
  return store;
}

/** Test-only hook to drop the cached store between tests. */
export function resetStore(): void {
  store = null;
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * Fixed-window rate limiting. Returns a 429 response when exceeded,
 * otherwise null (request may proceed).
 */
export function rateLimitOr429(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const key = `${scope}:${clientIp(req.headers)}`;
  const result = checkRateLimit(key, limit, windowMs);
  if (result.allowed) return null;
  const res = NextResponse.json(
    { ok: false, code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(result.retryAfterSeconds));
  return res;
}

export function isRedirectAllowed(url: string | null, baseUrl: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, baseUrl);
    const base = new URL(baseUrl);
    return parsed.origin === base.origin;
  } catch {
    return false;
  }
}
