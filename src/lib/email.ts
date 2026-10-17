import nodemailer, { type SMTPTransportOptions } from "nodemailer";
import { PRODUCT } from "./product";

/**
 * Transactional email via Brevo SMTP using Nodemailer.
 *
 * Requires a Brevo account with SMTP credentials and a verified sender
 * (email address or domain). The transport is created fresh per send and
 * fully awaited inside the request — no background workers, so this is
 * safe on serverless deployments (e.g. Vercel).
 *
 * Failures throw EmailError — callers record the failure and keep the
 * payment valid (email outage must never invalidate a paid order;
 * recovery happens via request-link).
 */

export class EmailError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EmailError";
    this.code = code;
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  /** Never logged. Only ever passed to the SMTP transport. */
  password: string;
}

export interface DownloadEmailInput {
  to: string;
  downloadUrl: string;
  expiresAtIso: string | null;
  smtp: SmtpConfig;
  emailFrom: string;
  /**
   * `protected` = expiring server-mediated download (paid mode).
   * `drive`     = public Google Drive share link (free mode); the copy must
   *               not claim expiry or exclusivity.
   */
  delivery?: "protected" | "drive";
}

/** Minimal transport surface — injectable for tests. */
export interface MailTransportLike {
  verify(): Promise<unknown>;
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export type TransportFactory = (
  options: SMTPTransportOptions
) => MailTransportLike;

/**
 * Secure transport settings derived from the configured port:
 * - Port 465 → implicit TLS (`secure: true`).
 * - Any other port (587, 2525, …) → plain connect + enforced STARTTLS
 *   upgrade (`secure: false`, `requireTLS: true`), so mail is never sent
 *   in the clear.
 */
export function buildSmtpTransportOptions(
  smtp: SmtpConfig
): SMTPTransportOptions {
  const implicitTls = smtp.port === 465;
  return {
    host: smtp.host,
    port: smtp.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDownloadEmailHtml(input: {
  downloadUrl: string;
  expiresAtIso: string | null;
  delivery?: "protected" | "drive";
}): { subject: string; html: string; text: string } {
  const drive = input.delivery === "drive";
  const safeUrl = escapeHtml(input.downloadUrl);
  const subject = drive
    ? `${PRODUCT.brand} — Your free ebook: ${PRODUCT.title}`
    : `${PRODUCT.brand} — Your ebook is ready: ${PRODUCT.title}`;

  const heading = drive
    ? "Your free copy is ready."
    : "Your purchase is confirmed.";
  const intro = drive
    ? `Thank you for requesting <strong>${escapeHtml(PRODUCT.title)}</strong>. It is free to download.`
    : `Thank you for purchasing <strong>${escapeHtml(PRODUCT.title)}</strong> for ${escapeHtml(PRODUCT.priceLabel)}.`;
  const note = drive
    ? "This link is hosted on Google Drive and is not password protected. Please avoid re-sharing it, though we cannot prevent anyone with the link from downloading the file. If you have trouble, reply to this email and we will help."
    : `This secure link expires on ${escapeHtml(input.expiresAtIso ?? "")}. If it expires, reply from this email address or use the replacement-link option on our website and we will issue a fresh link for your verified purchase.`;
  const noteText = drive
    ? "This link is hosted on Google Drive and is not password protected. Please avoid re-sharing it, though we cannot prevent anyone with the link from downloading the file."
    : `This secure link expires on ${input.expiresAtIso}. If it expires, use the replacement-link option on our website and we will issue a fresh link for your verified purchase.`;

  const html = `<!doctype html><html><body style="background:#0c0a08;color:#ede6d6;font-family:Georgia,serif;padding:32px;line-height:1.6">
<div style="max-width:560px;margin:0 auto">
<p style="letter-spacing:3px;font-size:12px;color:#c08d5d">THE HUMAN PARADOX</p>
<h1 style="font-weight:normal">${heading}</h1>
<p>${intro}</p>
<p><a href="${safeUrl}" style="display:inline-block;background:#ede6d6;color:#0c0a08;padding:14px 28px;text-decoration:none">Download Your Ebook</a></p>
<p style="color:#a8a094;font-size:14px">${note}</p>
<p style="color:#6e675c;font-size:12px">${escapeHtml(PRODUCT.title)} · The Human Paradox</p>
</div></body></html>`;
  const text = [
    `${PRODUCT.brand} — ${heading}`,
    ``,
    drive
      ? `Thank you for requesting "${PRODUCT.title}". It is free to download.`
      : `Thank you for purchasing "${PRODUCT.title}" for ${PRODUCT.priceLabel}.`,
    ``,
    `Download your ebook here: ${input.downloadUrl}`,
    ``,
    noteText,
  ].join("\n");
  return { subject, html, text };
}

function classifySmtpError(err: unknown): EmailError {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  // Fixed, safe messages only: SMTP errors can echo host/user details, so
  // raw error text is never propagated or logged.
  if (code === "EAUTH" || code === "EENVELOPE") {
    return new EmailError(
      "EMAIL_AUTH_FAILED",
      "Email server rejected the SMTP credentials or sender."
    );
  }
  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "EDNS" ||
    code === "ETLS"
  ) {
    return new EmailError(
      "EMAIL_CONNECTION_FAILED",
      "Could not connect to the email server."
    );
  }
  return new EmailError(
    "EMAIL_SEND_FAILED",
    "The confirmation email could not be delivered."
  );
}

const defaultTransportFactory: TransportFactory = (options) =>
  nodemailer.createTransport(options) as unknown as MailTransportLike;

export async function sendDownloadEmail(
  input: DownloadEmailInput,
  createTransport: TransportFactory = defaultTransportFactory
): Promise<{ emailId: string }> {
  const { subject, html, text } = buildDownloadEmailHtml({
    downloadUrl: input.downloadUrl,
    expiresAtIso: input.expiresAtIso,
    delivery: input.delivery ?? "protected",
  });
  const transport = createTransport(
    buildSmtpTransportOptions(input.smtp)
  );
  try {
    // Explicit configuration check: fails fast on bad host/credentials
    // instead of during delivery.
    await transport.verify();
  } catch (err) {
    throw classifySmtpError(err);
  }
  try {
    const info = await transport.sendMail({
      from: input.emailFrom,
      to: input.to,
      subject,
      html,
      text,
    });
    return { emailId: info?.messageId ?? "unknown" };
  } catch (err) {
    throw classifySmtpError(err);
  }
}
