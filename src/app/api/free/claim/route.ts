import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getServerConfig } from "@/lib/config";
import { jsonError, rateLimitOr429 } from "@/lib/http";
import { deliverFreeEbook, FreeDeliveryError } from "@/lib/free-delivery";

/**
 * FREE distribution endpoint: submit an email address, receive the
 * configured Google Drive link by email.
 *
 * No payment, no order, no claim record, no receipt token, no database.
 * Success is reported only when the SMTP provider accepts the message.
 */

// In-memory per-address cooldown (deliberately not persisted). Absorbs
// double-clicks and accidental repeats without any external database.
const COOLDOWN_MS = 5 * 60_000;
const recentSends = new Map<string, number>();

function emailKey(email: string): string {
  // Hashed so the address is never held or logged in the clear.
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

function prune(now: number): void {
  for (const [key, at] of recentSends) {
    if (now - at > COOLDOWN_MS) recentSends.delete(key);
  }
}

export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "free-claim", 5, 60_000);
  if (limited) return limited;

  const cfg = getServerConfig();
  if (cfg.distributionMode !== "FREE") {
    return jsonError(
      404,
      "NOT_AVAILABLE",
      "Free claims are not available in this mode."
    );
  }

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }

  if (typeof body.email === "string") {
    const now = Date.now();
    prune(now);
    const last = recentSends.get(emailKey(body.email));
    if (last && now - last < COOLDOWN_MS) {
      return jsonError(
        429,
        "ALREADY_SENT",
        "We already sent your copy to this address a moment ago. Please check your inbox and spam folder."
      );
    }
  }

  try {
    const result = await deliverFreeEbook(
      {
        driveUrl: cfg.ebookDriveUrl,
        smtp: cfg.smtp,
        emailFrom: cfg.emailFrom,
      },
      body.email
    );

    if (result.accepted && typeof body.email === "string") {
      recentSends.set(emailKey(body.email), Date.now());
    }

    // `emailAccepted` means the provider took the message — not that it was
    // delivered or read. The Drive link is public configuration and is
    // returned so the page can offer the download button immediately.
    return NextResponse.json({
      ok: true,
      emailAccepted: true,
      driveUrl: cfg.ebookDriveUrl,
    });
  } catch (err) {
    if (err instanceof FreeDeliveryError) {
      return jsonError(err.status, err.code, err.message);
    }
    return jsonError(
      500,
      "DELIVERY_FAILED",
      "We could not send the email just now. Please try again in a moment."
    );
  }
}