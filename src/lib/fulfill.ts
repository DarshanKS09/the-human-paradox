import { createOrderStore, type Order } from "./orders";
import { issueToken, PURPOSE_DOWNLOAD } from "./tokens";
import {
  sendDownloadEmail,
  EmailError,
  type SmtpConfig,
  type TransportFactory,
} from "./email";

/**
 * Idempotent fulfillment: safe to call from payment verification AND the
 * webhook (both call it; whichever runs second is a no-op returning the
 * same download token while it is still valid).
 *
 * - Issues (or reuses) a time-limited download token.
 * - Attempts the confirmation email. Email failure is RECORDED, never
 *   thrown: a paid order stays paid and the link can be re-sent via the
 *   recovery endpoint.
 */

export interface FulfillDeps {
  dbPath: string;
  downloadTokenSecret: string;
  linkTtlSeconds: number;
  appBaseUrl: string;
  smtp: SmtpConfig | null;
  emailFrom: string;
  nowSeconds?: number;
  /** Injected in tests; defaults to a live Nodemailer SMTP transport. */
  createTransport?: TransportFactory;
}

export interface FulfillResult {
  order: Order;
  downloadToken: string;
  downloadUrl: string;
  expiresAtIso: string;
  emailSent: boolean;
  emailError: string | null;
}

export async function fulfillOrder(deps: FulfillDeps, orderId: string): Promise<FulfillResult> {
  const store = createOrderStore(deps.dbPath);
  const now = deps.nowSeconds ?? Math.floor(Date.now() / 1000);

  const current = store.get(orderId);
  if (!current) throw new Error("Unknown order");
  if (current.status !== "paid") throw new Error("Order is not paid");

  // Reuse the existing token while it is still valid — prevents duplicate
  // fulfillment from webhook retries or double verification.
  let token = current.fulfillment.downloadToken;
  let expiresAtIso = current.fulfillment.tokenExpiresAt;
  if (!token || !expiresAtIso || Date.parse(expiresAtIso) / 1000 <= now) {
    token = issueToken(deps.downloadTokenSecret, PURPOSE_DOWNLOAD, orderId, deps.linkTtlSeconds, now);
    expiresAtIso = new Date((now + deps.linkTtlSeconds) * 1000).toISOString();
  }
  const downloadUrl = `${deps.appBaseUrl}/api/download/${token}`;

  let emailSent = current.fulfillment.emailSentAt !== null;
  let emailError: string | null = current.fulfillment.emailError;

  if (!emailSent) {
    if (!deps.smtp) {
      emailError = "EMAIL_NOT_CONFIGURED";
    } else {
      try {
        await sendDownloadEmail(
          {
            to: current.email,
            downloadUrl,
            expiresAtIso,
            smtp: deps.smtp,
            emailFrom: deps.emailFrom,
          },
          deps.createTransport
        );
        emailSent = true;
        emailError = null;
      } catch (err) {
        emailError = err instanceof EmailError ? err.code : "EMAIL_SEND_FAILED";
      }
    }
  }

  const order = store.setFulfillment(orderId, {
    downloadToken: token,
    tokenIssuedAt: new Date(now * 1000).toISOString(),
    tokenExpiresAt: expiresAtIso,
    emailSentAt: emailSent ? (current.fulfillment.emailSentAt ?? new Date(now * 1000).toISOString()) : null,
    emailError,
  });

  return { order, downloadToken: token, downloadUrl, expiresAtIso, emailSent, emailError };
}
