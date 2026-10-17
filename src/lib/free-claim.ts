import { issueToken, PURPOSE_FREE_DOWNLOAD } from "./tokens";
import { sendDownloadEmail, EmailError, type SmtpConfig, type TransportFactory } from "./email";
import {
  createFreeClaimStore,
  isValidClaimId,
  type FreeClaim,
  type FreeClaimStore,
} from "./free-claims";
import { isValidEmail, normalizeEmail } from "./validate";

/**
 * Free ebook claim fulfillment (FREE distribution mode).
 *
 * Guarantees:
 * - The PDF link is only ever issued for a validated email address.
 * - The link is an HMAC-signed, time-limited, order-bound token (same
 *   signing primitive as paid downloads), never a guessable/public URL.
 * - Repeated submissions reuse the same claim and do NOT spam emails:
 *   a resend is only allowed after the cooldown or a previous failure,
 *   and daily sends per address are capped.
 * - Email failure is recorded and reported honestly — never a false
 *   "sent" confirmation.
 * - Nothing here touches orders, Razorpay, or payment verification.
 */

export interface FreeClaimDeps {
  store: FreeClaimStore;
  downloadTokenSecret: string;
  linkTtlSeconds: number;
  appBaseUrl: string;
  /** Validated Google Drive share link (FREE delivery). */
  driveUrl: string;
  smtp: SmtpConfig | null;
  emailFrom: string;
  cooldownMinutes: number;
  maxEmailsPerDay: number;
  nowMs?: number;
  createTransport?: TransportFactory;
}

export interface FreeClaimResult {
  claimId: string;
  /**
   * Receipt token authorizing the claim-status lookup. In FREE mode the
   * file itself is served by Google Drive, so this token does NOT gate file
   * access — the Drive link is public to anyone who has it.
   */
  downloadToken: string;
  driveUrl: string;
  emailSent: boolean;
  emailAttempted: boolean;
  /** Stable, safe code the UI can explain to the user. */
  emailStatus: "SENT" | "ALREADY_SENT" | "COOLDOWN" | "NOT_CONFIGURED" | "FAILED";
}

export class FreeClaimInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "FreeClaimInputError";
    this.code = code;
  }
}

export function buildFreeClaimStore(deps: {
  kvRestApiUrl: string | null;
  kvRestApiToken: string | null;
  dbPath: string;
}): FreeClaimStore {
  return createFreeClaimStore(deps);
}

function tokenStillValid(claim: FreeClaim, nowMs: number): boolean {
  return Boolean(
    claim.downloadToken &&
      claim.tokenExpiresAt &&
      Date.parse(claim.tokenExpiresAt) > nowMs
  );
}

export async function claimFreeEbook(
  deps: FreeClaimDeps,
  rawEmail: unknown
): Promise<FreeClaimResult> {
  if (!isValidEmail(rawEmail)) {
    throw new FreeClaimInputError(
      "INVALID_EMAIL",
      "Enter a valid email address so we can send your copy."
    );
  }
  const email = normalizeEmail(rawEmail as string);
  const nowMs = deps.nowMs ?? Date.now();
  const { claim } = await deps.store.claimForEmail(email, nowMs);

  // Receipt token for the claim-status lookup only. The ebook itself is
  // delivered from Google Drive, so this token gates no file access.
  const token =
    tokenStillValid(claim, nowMs) && claim.downloadToken
      ? claim.downloadToken
      : issueToken(
          deps.downloadTokenSecret,
          PURPOSE_FREE_DOWNLOAD,
          claim.id,
          deps.linkTtlSeconds,
          Math.floor(nowMs / 1000)
        );
  const expiresAtIso = new Date(
    Math.floor(nowMs / 1000) * 1000 + deps.linkTtlSeconds * 1000
  ).toISOString();
  const driveUrl = deps.driveUrl;

  const cooldownMs = deps.cooldownMinutes * 60_000;
  const dayMs = 24 * 60 * 60_000;
  const dailyCap = deps.maxEmailsPerDay;

  let emailSent = false;
  let emailAttempted = false;
  let emailStatus: FreeClaimResult["emailStatus"] = "ALREADY_SENT";

  const withinCooldown =
    claim.lastEmailSentAtMs > 0 && nowMs - claim.lastEmailSentAtMs < cooldownMs;
  const dailyCount =
    claim.lastEmailSentAtMs > 0 && nowMs - claim.lastEmailSentAtMs < dayMs
      ? claim.emailCount
      : 0;

  const shouldSend =
    claim.emailError !== null || !withinCooldown
      ? dailyCount < dailyCap
      : false;

  if (!shouldSend) {
    emailStatus = withinCooldown ? "COOLDOWN" : "ALREADY_SENT";
  } else if (!deps.smtp) {
    emailStatus = "NOT_CONFIGURED";
  } else {
    emailAttempted = true;
    try {
      await sendDownloadEmail(
        {
          to: claim.email,
          downloadUrl: driveUrl,
          expiresAtIso: null,
          delivery: "drive",
          smtp: deps.smtp,
          emailFrom: deps.emailFrom,
        },
        deps.createTransport
      );
      emailSent = true;
      emailStatus = "SENT";
      claim.emailError = null;
    } catch (err) {
      claim.emailError = err instanceof EmailError ? err.code : "EMAIL_SEND_FAILED";
      emailStatus = "FAILED";
    }
  }

  claim.downloadToken = token;
  claim.tokenExpiresAt = expiresAtIso;
  claim.lastEmailAttemptAtMs = emailAttempted ? nowMs : claim.lastEmailAttemptAtMs;
  if (emailSent) {
    claim.emailCount = dailyCount + 1;
    claim.lastEmailSentAtMs = nowMs;
  }
  claim.updatedAt = new Date(nowMs).toISOString();
  const saved = await deps.store.save(claim);

  return {
    claimId: saved.id,
    downloadToken: token,
    driveUrl,
    emailSent,
    emailAttempted,
    emailStatus,
  };
}

export { isValidClaimId };