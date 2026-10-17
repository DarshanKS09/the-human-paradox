/**
 * Server-side configuration. Every value comes from the environment —
 * nothing secret is ever imported by client components.
 *
 * Test vs live mode is determined by the Razorpay key prefix:
 * `rzp_test_*` = test mode, `rzp_live_*` = live mode.
 */
import type { SmtpConfig } from "./email";

/** How the ebook is distributed. Server-side only; never client-selectable. */
export type DistributionMode = "FREE" | "PAID";

export function parseDistributionMode(value: string | null): DistributionMode {
  return String(value ?? "").trim().toUpperCase() === "PAID" ? "PAID" : "FREE";
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
  /** Durable KV store (Upstash/Vercel KV REST). Null = local file store. */
  kvRestApiUrl: string | null;
  kvRestApiToken: string | null;
  freeClaimsDbPath: string;
  freeLinkTtlHours: number;
  freeEmailCooldownMinutes: number;
  freeMaxEmailsPerDay: number;
  freeMaxDownloadsPerClaim: number;
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
  const freeTtlHours = Number.parseInt(env("FREE_LINK_TTL_HOURS") ?? "72", 10);
  const freeCooldown = Number.parseInt(
    env("FREE_EMAIL_COOLDOWN_MINUTES") ?? "10",
    10
  );
  const freeDaily = Number.parseInt(env("FREE_MAX_EMAILS_PER_DAY") ?? "3", 10);
  const freeDownloads = Number.parseInt(
    env("FREE_MAX_DOWNLOADS_PER_CLAIM") ?? "10",
    10
  );
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
    kvRestApiUrl: env("KV_REST_API_URL"),
    kvRestApiToken: env("KV_REST_API_TOKEN"),
    freeClaimsDbPath: env("FREE_CLAIMS_DB_PATH") ?? "./data/free-claims.json",
    freeLinkTtlHours:
      Number.isFinite(freeTtlHours) && freeTtlHours > 0 ? freeTtlHours : 72,
    freeEmailCooldownMinutes:
      Number.isFinite(freeCooldown) && freeCooldown >= 0 ? freeCooldown : 10,
    freeMaxEmailsPerDay:
      Number.isFinite(freeDaily) && freeDaily > 0 ? freeDaily : 3,
    freeMaxDownloadsPerClaim:
      Number.isFinite(freeDownloads) && freeDownloads > 0 ? freeDownloads : 10,
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
    emailFrom: env("EMAIL_FROM") ?? "The Human Paradox <hello@example.com>",
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
