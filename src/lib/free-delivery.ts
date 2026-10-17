import { sendDownloadEmail, EmailError, type SmtpConfig, type TransportFactory } from "./email";
import { isValidEmail, normalizeEmail } from "./validate";

/**
 * FREE distribution: deliver the configured Google Drive link by email.
 *
 * Deliberately stateless — the Drive URL already lives in configuration, so
 * there is no order, claim record, database or receipt token involved.
 * Flow: validate email → validate Drive link → send via Brevo → report the
 * provider's acceptance.
 */

export class FreeDeliveryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "FreeDeliveryError";
    this.code = code;
    this.status = status;
  }
}

export interface FreeDeliveryDeps {
  /** Validated Drive share link (already parsed by the config layer). */
  driveUrl: string | null;
  smtp: SmtpConfig | null;
  emailFrom: string;
  createTransport?: TransportFactory;
}

export interface FreeDeliveryResult {
  /** True only when the SMTP provider accepted the message. */
  accepted: boolean;
}

/** Validates the request and sends the ebook link. */
export async function deliverFreeEbook(
  deps: FreeDeliveryDeps,
  rawEmail: unknown
): Promise<FreeDeliveryResult> {
  if (!isValidEmail(rawEmail)) {
    throw new FreeDeliveryError(
      "INVALID_EMAIL",
      400,
      "Enter a valid email address so we can send your copy."
    );
  }
  if (!deps.driveUrl) {
    // Fail closed: never send a broken or missing link.
    throw new FreeDeliveryError(
      "EBOOK_UNAVAILABLE",
      503,
      "The ebook download link is not configured yet. Please check back shortly."
    );
  }
  if (!deps.smtp) {
    throw new FreeDeliveryError(
      "EMAIL_NOT_CONFIGURED",
      503,
      "Email delivery is not set up yet. Please try again later."
    );
  }

  try {
    await sendDownloadEmail(
      {
        to: normalizeEmail(rawEmail as string),
        downloadUrl: deps.driveUrl,
        expiresAtIso: null,
        delivery: "drive",
        smtp: deps.smtp,
        emailFrom: deps.emailFrom,
      },
      deps.createTransport
    );
  } catch (err) {
    // EmailError carries a safe, already-classified code.
    throw new FreeDeliveryError(
      err instanceof EmailError ? err.code : "EMAIL_SEND_FAILED",
      502,
      "We could not send the email just now. Please try again in a moment."
    );
  }

  return { accepted: true };
}