import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { checkEbookAvailability } from "@/lib/ebook-storage";

/**
 * Deployment diagnostics. Reports readiness booleans only — never secrets,
 * never customer data, never download tokens.
 */
export async function GET() {
  const cfg = getServerConfig();
  const freeMode = cfg.distributionMode === "FREE";

  // FREE delivery needs only two things: a valid Drive link and SMTP.
  // It uses no database, no claim records and no receipt tokens.
  const paidStorage = freeMode ? null : await checkEbookAvailability();

  return NextResponse.json(
    {
      ok: true,
      distributionMode: cfg.distributionMode,
      checks: {
        // Required for FREE mode.
        driveLinkConfigured: cfg.ebookDriveUrl !== null,
        smtpConfigured: cfg.smtp !== null,
        freeDeliveryReady:
          cfg.ebookDriveUrl !== null && cfg.smtp !== null,
        // PAID mode only.
        tokenSigningConfigured: cfg.downloadTokenSecret !== null,
        paymentsConfigured: cfg.payments !== null,
        paymentTestMode: cfg.payments?.testMode ?? null,
        ebookAvailable: paidStorage?.available ?? null,
        ebookSource: paidStorage?.source ?? null,
        ebookResolvedPath: paidStorage?.resolvedPath ?? null,
        // False when APP_BASE_URL is unset and links fall back to localhost.
        appBaseUrlConfigured:
          Boolean(process.env.APP_BASE_URL?.trim()) &&
          !cfg.appBaseUrl.includes("localhost"),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}