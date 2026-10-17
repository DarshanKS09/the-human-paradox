import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { checkEbookAvailability } from "@/lib/ebook-storage";

/**
 * Deployment diagnostics. Reports readiness booleans only — never secrets,
 * never customer data, never full download tokens.
 *
 * Useful for confirming on Vercel that distribution mode, token signing,
 * durable storage, the private ebook, and SMTP are all actually configured.
 */
export async function GET() {
  const cfg = getServerConfig();
  const freeMode = cfg.distributionMode === "FREE";
  // FREE delivery is a Google Drive share link; the local PDF is only
  // relevant to the (dormant) PAID download route.
  const availability = freeMode ? null : await checkEbookAvailability();

  return NextResponse.json(
    {
      ok: true,
      distributionMode: cfg.distributionMode,
      checks: {
        tokenSigningConfigured: cfg.downloadTokenSecret !== null,
        smtpConfigured: cfg.smtp !== null,
        ebookDelivery: freeMode ? "google-drive" : "protected-download",
        // Required for FREE mode; false blocks claims (fail closed).
        driveLinkConfigured: cfg.ebookDriveUrl !== null,
        // Paid-mode-only concerns.
        ebookAvailable: availability?.available ?? null,
        ebookSource: availability?.source ?? null,
        ebookResolvedPath: availability?.resolvedPath ?? null,
        durableClaimStorage: cfg.kvRestApiUrl !== null && cfg.kvRestApiToken !== null,
        // False when APP_BASE_URL is unset and links fall back to localhost.
        appBaseUrlConfigured:
          Boolean(process.env.APP_BASE_URL?.trim()) &&
          !cfg.appBaseUrl.includes("localhost"),
        paymentsConfigured: cfg.payments !== null,
        paymentTestMode: cfg.payments?.testMode ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}