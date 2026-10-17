import { describe, expect, it } from "vitest";
import {
  buildDownloadEmailHtml,
  buildSmtpTransportOptions,
  sendDownloadEmail,
  EmailError,
  type MailTransportLike,
  type SmtpConfig,
} from "@/lib/email";

const SMTP: SmtpConfig = {
  host: "smtp-relay.brevo.com",
  port: 587,
  user: "test-user",
  password: "test-password",
};

function baseInput() {
  return {
    to: "reader@example.com",
    downloadUrl: "https://example.com/api/download/T",
    expiresAtIso: "2026-01-01T00:00:00.000Z",
    smtp: SMTP,
    emailFrom: "The Human Paradox <hello@example.com>",
  };
}

describe("transactional purchase email", () => {
  it("contains branding, title, amount, and the download link", () => {
    const { subject, html, text } = buildDownloadEmailHtml({
      downloadUrl: "https://example.com/api/download/TOKEN123",
      expiresAtIso: "2026-01-01T00:00:00.000Z",
    });
    expect(subject).toContain("The Human Paradox");
    expect(subject).toContain("Your Mind Is Not Your Enemy");
    expect(html).toContain("Your Mind Is Not Your Enemy");
    expect(html).toContain("₹49");
    expect(html).toContain("https://example.com/api/download/TOKEN123");
    expect(html).toContain("replacement-link");
    expect(text).toContain("https://example.com/api/download/TOKEN123");
  });

  it("escapes untrusted content in the HTML body", () => {
    const { html } = buildDownloadEmailHtml({
      downloadUrl: 'https://example.com/x?q="><script>',
      expiresAtIso: "2026-01-01",
    });
    expect(html).not.toContain("<script>");
  });
});

describe("SMTP transport security", () => {
  it("uses STARTTLS (not implicit TLS) for port 587", () => {
    const options = buildSmtpTransportOptions({ ...SMTP, port: 587 });
    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
  });

  it("uses implicit TLS for port 465", () => {
    const options = buildSmtpTransportOptions({ ...SMTP, port: 465 });
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
  });

  it("enforces STARTTLS on alternate ports such as 2525", () => {
    const options = buildSmtpTransportOptions({ ...SMTP, port: 2525 });
    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
  });

  it("never places the password anywhere but the transport auth block", () => {
    const options = buildSmtpTransportOptions(SMTP);
    expect(options.auth).toEqual({ user: "test-user", pass: "test-password" });
    const visible = JSON.stringify({ ...options, auth: undefined });
    expect(visible).not.toContain("test-password");
  });
});

describe("SMTP delivery", () => {
  it("verifies the connection, then sends and returns the message id", async () => {
    const calls: string[] = [];
    let sentTo = "";
    const factory = () => {
      const transport: MailTransportLike = {
        verify: async () => {
          calls.push("verify");
          return true;
        },
        sendMail: async (message) => {
          calls.push("sendMail");
          sentTo = message.to;
          expect(message.from).toContain("hello@example.com");
          expect(message.subject).toContain("Your Mind Is Not Your Enemy");
          return { messageId: "smtp-msg-123" };
        },
      };
      return transport;
    };

    const result = await sendDownloadEmail(baseInput(), factory);
    expect(result.emailId).toBe("smtp-msg-123");
    expect(calls).toEqual(["verify", "sendMail"]);
    expect(sentTo).toBe("reader@example.com");
  });

  it("maps authentication failures to EMAIL_AUTH_FAILED", async () => {
    const factory = () => {
      const transport: MailTransportLike = {
        verify: async () => {
          const err = new Error("Invalid login") as Error & { code: string };
          err.code = "EAUTH";
          throw err;
        },
        sendMail: async () => ({ messageId: "never" }),
      };
      return transport;
    };
    await expect(sendDownloadEmail(baseInput(), factory)).rejects.toMatchObject({
      name: "EmailError",
      code: "EMAIL_AUTH_FAILED",
    });
  });

  it("maps connection failures to EMAIL_CONNECTION_FAILED", async () => {
    const factory = () => {
      const transport: MailTransportLike = {
        verify: async () => {
          const err = new Error("connect timeout") as Error & { code: string };
          err.code = "ETIMEDOUT";
          throw err;
        },
        sendMail: async () => ({ messageId: "never" }),
      };
      return transport;
    };
    await expect(sendDownloadEmail(baseInput(), factory)).rejects.toMatchObject({
      code: "EMAIL_CONNECTION_FAILED",
    });
  });

  it("maps delivery failures to EMAIL_SEND_FAILED without leaking details", async () => {
    const factory = () => {
      const transport: MailTransportLike = {
        verify: async () => true,
        sendMail: async () => {
          throw new Error("552 secret-internal-response-with-sensitive-stuff");
        },
      };
      return transport;
    };
    try {
      await sendDownloadEmail(baseInput(), factory);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EmailError);
      expect((err as EmailError).code).toBe("EMAIL_SEND_FAILED");
      expect((err as Error).message).not.toContain("secret-internal");
    }
  });
});
