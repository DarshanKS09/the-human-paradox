import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { fulfillOrder } from "@/lib/fulfill";
import { getStore, rateLimitOr429 } from "@/lib/http";
import { isValidEmail, normalizeEmail } from "@/lib/validate";

/**
 * Recovery: issue (or re-send) a download link for a verified paid order.
 * Always returns the same generic response so purchase existence cannot
 * be enumerated by email address.
 */
export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "request-link", 10, 60_000);
  if (limited) return limited;

  const generic = NextResponse.json({
    ok: true,
    message:
      "If a completed purchase exists for this email address, a fresh download link is on its way.",
  });

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return generic;
  }
  if (!isValidEmail(body.email)) return generic;

  const cfg = getServerConfig();
  if (!cfg.downloadTokenSecret) return generic;

  const email = normalizeEmail(body.email as string);
  const order = getStore().latestPaidByEmail(email);
  if (!order) return generic;
  if (order.downloadCount >= cfg.maxDownloadsPerOrder) return generic;

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
  return generic;
}
