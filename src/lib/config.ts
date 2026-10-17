/**
 * Server-side configuration. Every value comes from the environment —
 * nothing secret is ever imported by client components.
 *
 * Test vs live mode is determined by the Razorpay key prefix:
 * `rzp_test_*` = test mode, `rzp_live_*` = live mode.
 */
import type { SmtpConfig } from "./email";
import { PRODUCT } from "./product";

/** Brand name used as the sender display name in transactional email. */
const PRODUCT_BRAND = PRODUCT.brand;

/** How the ebook is distributed. Server-side only; never client-selectable. */
export type DistributionMode = "FREE" | "PAID";

export function parseDistributionMode(value: string | null): DistributionMode {
  return String(value ?? "").trim().toUpperCase() === "PAID" ? "PAID" : "FREE";
}

/**
 * Validates a Google Drive share link.
 *
 * Accepts the common share forms (https://drive.google.com/file/d/<id>/view,
 * /open?id=<id>, or a direct https://drive.google.com/uc?export=download&id=<id>)
 * and rejects anything else, so a malformed value can never be emailed.
 */
export function parseEbookDriveUrl(value: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const driveHosts = ["drive.google.com", "www.drive.google.com"];
  if (!driveHosts.includes(host)) return null;
  const hasId =
    /\/file\/d\/[A-Za-z0-9_-]{5,}/.test(url.pathname) ||
    (url.searchParams.get("id") ?? "").length >= 5;
  if (!hasId) return null;
  return url.toString();
}

/**
 * Ensures the sender always carries the brand display name, so recipients
 * see "The Human Paradox" instead of the raw mailbox name.
 *
 * - "a@b.com"                      -> 'The Human Paradox <a@b.com>'
 * - 'Brand <a@b.com>'               -> unchanged (explicit display name wins)
 * - missing                        -> 'The Human Paradox <hello@example.com>'
 */
export function normalizeEmailFrom(
  value: string | null,
  brand: string,
  fallbackAddress = "hello@example.com"
): string {
  const raw = (value ?? "").trim();
  if (!raw) return `${brand} <${fallbackAddress}>`;
  // Already has an explicit display name.
  if (/^[^<>]*<[^<>]+>$/.test(raw)) return raw;
  const address = raw.replace(/^mailto:/i, "").trim();
  return `${brand} <${address}>`;
}

export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing required server configuration: ${missing.join(", ")}`);
    this.name = "ConfigError";
    this.missing = missing;
  }
}

export interface PaymentsConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  testMode: boolean;
}

export interface ServerConfig {
  /** Defaults to FREE when unset/invalid — safe fallback. */
  distributionMode: DistributionMode;
  payments: PaymentsConfig | null;
  paymentsMissing: string[];
  downloadTokenSecret: string | null;
  ordersDbPath: string;
  ebookPdfPath: string;
  /** Private remote object storage (durable on serverless); null = local file. */
  ebookPdfUrl: string | null;
  ebookPdfToken: string | null;
  /**
   * Google Drive share link used for FREE delivery. Null when unset or
   * invalid. NOTE: a Drive share link is public — anyone holding it can
   * download the file.
   */
  ebookDriveUrl: string | null;
  /** Durable KV store (Upstash/Vercel KV REST) — PAID mode order storage only. */
  kvRestApiUrl: string | null;
  kvRestApiToken: string | null;
  /** Set to block live gateway calls (audit/test safety). */
  allowLivePayments: boolean;
  smtp: SmtpConfig | null;
  smtpMissing: string[];
  emailFrom: string;
  appBaseUrl: string;
  downloadLinkTtlHours: number;
  maxDownloadsPerOrder: number;
}

function env(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

let cached: ServerConfig | null = null;

/** Test-only hook to reset the cached config between tests. */
export function resetServerConfigCache(): void {
  cached = null;
}

export function getServerConfig(): ServerConfig {
  if (cached) return cached;

  const keyId = env("RAZORPAY_KEY_ID");
  const keySecret = env("RAZORPAY_KEY_SECRET");
  const webhookSecret = env("RAZORPAY_WEBHOOK_SECRET");

  const missing: string[] = [];
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");
  if (!webhookSecret) missing.push("RAZORPAY_WEBHOOK_SECRET");

  const smtpHost = env("SMTP_HOST");
  const smtpUser = env("SMTP_USER");
  const smtpPassword = env("SMTP_PASSWORD");
  const smtpPortRaw = env("SMTP_PORT");
  const smtpPort = smtpPortRaw ? Number.parseInt(smtpPortRaw, 10) : 587;

  const smtpMissing: string[] = [];
  if (!smtpHost) smtpMissing.push("SMTP_HOST");
  if (!smtpUser) smtpMissing.push("SMTP_USER");
  if (!smtpPassword) smtpMissing.push("SMTP_PASSWORD");

  const ttlHours = Number.parseInt(env("DOWNLOAD_LINK_TTL_HOURS") ?? "72", 10);
  const maxDownloads = Number.parseInt(
    env("MAX_DOWNLOADS_PER_ORDER") ?? "5",
    10
  );

  cached = {
    distributionMode: parseDistributionMode(env("DISTRIBUTION_MODE")),
    allowLivePayments: parseDistributionMode(env("DISTRIBUTION_MODE")) === "PAID",
    payments:
      missing.length === 0
        ? {
            keyId: keyId as string,
            keySecret: keySecret as string,
            webhookSecret: webhookSecret as string,
            testMode: (keyId as string).startsWith("rzp_test_"),
          }
        : null,
    paymentsMissing: missing,
    downloadTokenSecret: env("DOWNLOAD_TOKEN_SECRET"),
    ordersDbPath: env("ORDERS_DB_PATH") ?? "./data/orders.json",
    ebookPdfPath: env("EBOOK_PDF_PATH") ?? "./private/ebook.pdf",
    ebookPdfUrl: env("EBOOK_PDF_URL"),
    ebookPdfToken: env("EBOOK_PDF_TOKEN"),
    ebookDriveUrl: parseEbookDriveUrl(env("EBOOK_DRIVE_URL")),
    kvRestApiUrl: env("KV_REST_API_URL"),
    kvRestApiToken: env("KV_REST_API_TOKEN"),
    smtp:
      smtpMissing.length === 0
        ? {
            host: smtpHost as string,
            port:
              Number.isFinite(smtpPort) && smtpPort > 0 && smtpPort <= 65535
                ? smtpPort
                : 587,
            user: smtpUser as string,
            password: smtpPassword as string,
          }
        : null,
    smtpMissing,
    emailFrom: normalizeEmailFrom(env("EMAIL_FROM"), PRODUCT_BRAND),
    appBaseUrl: (env("APP_BASE_URL") ?? "http://localhost:3000").replace(
      /\/$/,
      ""
    ),
    downloadLinkTtlHours:
      Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 72,
    maxDownloadsPerOrder:
      Number.isFinite(maxDownloads) && maxDownloads > 0 ? maxDownloads : 5,
  };
  return cached;
}

export function requirePayments(cfg = getServerConfig()): PaymentsConfig {
  if (!cfg.payments) throw new ConfigError(cfg.paymentsMissing);
  return cfg.payments;
}

export function requireDownloadTokenSecret(
  cfg = getServerConfig()
): string {
  const secret = cfg.downloadTokenSecret;
  if (!secret) throw new ConfigError(["DOWNLOAD_TOKEN_SECRET"]);
  return secret;
}
