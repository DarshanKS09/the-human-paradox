import { NextResponse } from "next/server";
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getServerConfig } from "@/lib/config";
import { checkEbookAvailability } from "@/lib/ebook-storage";

/**
 * Writes and removes a tiny probe file to confirm the claim store's
 * directory is writable. Performs no network or credential access.
 */
function probeClaimStorageWritable(): boolean {
  const cfg = getServerConfig();
  if (cfg.kvRestApiUrl && cfg.kvRestApiToken) return true; // durable KV used
  const target = isAbsolute(cfg.freeClaimsDbPath)
    ? cfg.freeClaimsDbPath
    : resolve(process.cwd(), cfg.freeClaimsDbPath);
  // Probe the actual claims FILE, not just its directory: a read-only
  // filesystem, a missing mount, or a directory in the file's place all
  // break saving claims.
  try {
    mkdirSync(dirname(target), { recursive: true });
  } catch {
    return false;
  }
  let existed = true;
  try {
    const fd = openSync(target, "r+"); // fails with EISDIR/EROFS/EACCES
    closeSync(fd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") return false;
    existed = false;
  }
  const probe = `${target}.write-probe`;
  try {
    const fd = openSync(probe, "w");
    writeSync(fd, "1");
    closeSync(fd);
    return true;
  } catch {
    return false;
  } finally {
    try {
      unlinkSync(probe);
    } catch {
      /* nothing to clean up */
    }
    if (!existed) {
      try {
        unlinkSync(target);
      } catch {
        /* leave anything unexpected in place */
      }
    }
  }
}

function isAbsolute(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/");
}

/**
 * Deployment diagnostics. Reports readiness booleans only — never secrets,
 * never customer data, never full download tokens.
 *
 * Useful for confirming on Vercel that distribution mode, token signing,
 * durable storage, the private ebook, and SMTP are all actually configured.
 */
export async function GET() {
  const cfg = getServerConfig();
  // Can this deployment actually persist free claims? Durable KV is the
  // only reliable option on serverless; local files are read-only there.
  const claimStorageWritable = probeClaimStorageWritable();
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
        // False on serverless without durable storage -> claims cannot save.
        claimStorageWritable,
        claimStorageUsable:
          (cfg.kvRestApiUrl !== null && cfg.kvRestApiToken !== null) ||
          claimStorageWritable,
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