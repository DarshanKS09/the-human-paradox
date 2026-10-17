import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { getFreeClaimStore, jsonError, rateLimitOr429 } from "@/lib/http";
import { claimFreeEbook, FreeClaimInputError } from "@/lib/free-claim";

/**
 * FREE distribution mode claim endpoint.
 *
 * No payment is created, required, or simulated. In PAID mode this route
 * refuses to run so a free claim can never shadow the paid checkout.
 */
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
  if (!cfg.downloadTokenSecret) {
    return jsonError(
      503,
      "DELIVERY_UNAVAILABLE",
      "Digital delivery is being set up. Please try again later."
    );
  }

  // Fail closed: never mint a receipt or send an email when the delivery
  // link is missing or malformed, so nobody receives a broken link.
  if (!cfg.ebookDriveUrl) {
    return jsonError(
      503,
      "EBOOK_UNAVAILABLE",
      "The ebook download link is not configured yet. Please check back shortly."
    );
  }

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }

  try {
    const result = await claimFreeEbook(
      {
        store: getFreeClaimStore(),
        downloadTokenSecret: cfg.downloadTokenSecret,
        linkTtlSeconds: cfg.freeLinkTtlHours * 3600,
        appBaseUrl: cfg.appBaseUrl,
        driveUrl: cfg.ebookDriveUrl,
        smtp: cfg.smtp,
        emailFrom: cfg.emailFrom,
        cooldownMinutes: cfg.freeEmailCooldownMinutes,
        maxEmailsPerDay: cfg.freeMaxEmailsPerDay,
      },
      body.email
    );
    // Deliberately excludes the customer's email and any SMTP detail.
    return NextResponse.json({
      ok: true,
      claimId: result.claimId,
      receiptToken: result.downloadToken,
      driveUrl: result.driveUrl,
      emailSent: result.emailSent,
      emailStatus: result.emailStatus,
    });
  } catch (err) {
    if (err instanceof FreeClaimInputError) {
      return jsonError(400, err.code, err.message);
    }
    // Never leak internals.
    return jsonError(
      500,
      "CLAIM_FAILED",
      "We could not prepare your copy. Please try again in a moment."
    );
  }
}