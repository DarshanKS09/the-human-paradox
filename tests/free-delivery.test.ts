import { describe, expect, it } from "vitest";
import { deliverFreeEbook, FreeDeliveryError } from "@/lib/free-delivery";
import type { MailTransportLike, SmtpConfig } from "@/lib/email";

const DRIVE_URL =
  "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view?usp=sharing";

const SMTP: SmtpConfig = {
  host: "smtp-relay.brevo.com",
  port: 587,
  user: "user",
  password: "pass",
};

function transport(sent: string[], failVerify?: string) {
  return () => {
    const t: MailTransportLike = {
      verify: async () => {
        if (failVerify) {
          const err = new Error(failVerify) as Error & { code: string };
          err.code = failVerify;
          throw err;
        }
        return true;
      },
      sendMail: async (m) => {
        sent.push({ to: m.to, url: m.html.match(/https:\/\/drive\.google\.com[^"]*/)?.[0] ?? "" } as never);
        return { messageId: "smtp-1" };
      },
    };
    return t;
  };
}

describe("free delivery", () => {
  it("sends the exact configured Drive link for a valid address", async () => {
    const sent: { to: string; url: string }[] = [];
    const result = await deliverFreeEbook(
      {
        driveUrl: DRIVE_URL,
        smtp: SMTP,
        emailFrom: "The Human Paradox <x@y.com>",
        createTransport: transport(sent as never),
      },
      "  Reader@Example.com "
    );
    expect(result.accepted).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("reader@example.com");
    // The emailed link is the configured Drive URL.
    expect(sent[0].url).toBe(DRIVE_URL);
  });

  it("rejects invalid email addresses without sending", async () => {
    const sent: unknown[] = [];
    for (const bad of [undefined, null, "", "nope", "a@b", 42]) {
      await expect(
        deliverFreeEbook(
          {
            driveUrl: DRIVE_URL,
            smtp: SMTP,
            emailFrom: "x@y.com",
            createTransport: transport(sent as never),
          },
          bad
        )
      ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    }
    expect(sent).toHaveLength(0);
  });

  it("fails closed when the Drive link is not configured", async () => {
    const sent: unknown[] = [];
    await expect(
      deliverFreeEbook(
        {
          driveUrl: null,
          smtp: SMTP,
          emailFrom: "x@y.com",
          createTransport: transport(sent as never),
        },
        "a@b.co"
      )
    ).rejects.toMatchObject({ code: "EBOOK_UNAVAILABLE" });
    expect(sent).toHaveLength(0);
  });

  it("fails closed when SMTP is not configured", async () => {
    await expect(
      deliverFreeEbook(
        { driveUrl: DRIVE_URL, smtp: null, emailFrom: "x@y.com" },
        "a@b.co"
      )
    ).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
  });

  it("never reports success when the provider rejects the send", async () => {
    const sent: unknown[] = [];
    try {
      await deliverFreeEbook(
        {
          driveUrl: DRIVE_URL,
          smtp: SMTP,
          emailFrom: "x@y.com",
          createTransport: transport(sent as never, "EAUTH"),
        },
        "a@b.co"
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FreeDeliveryError);
      expect((err as FreeDeliveryError).code).toBe("EMAIL_AUTH_FAILED");
    }
    expect(sent).toHaveLength(0);
  });

  it("maps connection failures to a retryable error", async () => {
    await expect(
      deliverFreeEbook(
        {
          driveUrl: DRIVE_URL,
          smtp: SMTP,
          emailFrom: "x@y.com",
          createTransport: transport([], "ETIMEDOUT"),
        },
        "a@b.co"
      )
    ).rejects.toMatchObject({ code: "EMAIL_CONNECTION_FAILED" });
  });
});