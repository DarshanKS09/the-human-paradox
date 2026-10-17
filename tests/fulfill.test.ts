import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrderStore } from "@/lib/orders";
import { fulfillOrder } from "@/lib/fulfill";
import type { MailTransportLike, SmtpConfig } from "@/lib/email";

let dbPath = "";

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "thp-fulfill-")), "orders.json");
});

const SMTP: SmtpConfig = {
  host: "smtp-relay.brevo.com",
  port: 587,
  user: "test-user",
  password: "test-password",
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    dbPath,
    downloadTokenSecret: "test_secret_12345678901234567890",
    linkTtlSeconds: 72 * 3600,
    appBaseUrl: "https://example.com",
    smtp: null,
    emailFrom: "The Human Paradox <hello@example.com>",
    nowSeconds: 1_700_000_000,
    ...overrides,
  };
}

function paidOrder() {
  const store = createOrderStore(dbPath);
  const order = store.create({
    productId: "ymine-01",
    amountPaise: 4900,
    currency: "INR",
    email: "reader@example.com",
    idempotencyKey: null,
    receiptToken: "rcpt",
  });
  store.markPaid(order.id, "pay_1");
  return order.id;
}

describe("idempotent fulfillment", () => {
  it("fulfills a paid order without an email provider (recorded, not failed)", async () => {
    const orderId = paidOrder();
    const result = await fulfillOrder(deps(), orderId);
    expect(result.downloadToken.length).toBeGreaterThan(20);
    expect(result.downloadUrl).toContain("/api/download/");
    expect(result.emailSent).toBe(false);
    expect(result.emailError).toBe("EMAIL_NOT_CONFIGURED");
    expect(result.order.fulfillment.downloadToken).toBe(result.downloadToken);
  });

  it("reuses the same download token on duplicate fulfillment", async () => {
    const orderId = paidOrder();
    const first = await fulfillOrder(deps(), orderId);
    const second = await fulfillOrder(deps(), orderId);
    expect(second.downloadToken).toBe(first.downloadToken);
  });

  it("sends the email when SMTP is configured", async () => {
    const sent: string[] = [];
    const createTransport = () => {
      const transport: MailTransportLike = {
        verify: async () => true,
        sendMail: async () => {
          sent.push("yes");
          return { messageId: "smtp-1" };
        },
      };
      return transport;
    };
    const orderId = paidOrder();
    const result = await fulfillOrder(
      deps({ smtp: SMTP, createTransport, nowSeconds: 1_700_000_001 }),
      orderId
    );
    expect(result.emailSent).toBe(true);
    expect(result.emailError).toBeNull();
    expect(sent).toEqual(["yes"]);
  });

  it("records SMTP failures without invalidating the paid order", async () => {
    const createTransport = () => {
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
    const orderId = paidOrder();
    const result = await fulfillOrder(
      deps({ smtp: SMTP, createTransport }),
      orderId
    );
    expect(result.emailSent).toBe(false);
    expect(result.emailError).toBe("EMAIL_AUTH_FAILED");
    // The download itself is still fulfilled: payment stays valid.
    expect(result.downloadToken.length).toBeGreaterThan(20);
  });

  it("refuses to fulfill unpaid orders", async () => {
    const store = createOrderStore(dbPath);
    const order = store.create({
      productId: "ymine-01",
      amountPaise: 4900,
      currency: "INR",
      email: "reader@example.com",
      idempotencyKey: null,
      receiptToken: "rcpt",
    });
    await expect(fulfillOrder(deps(), order.id)).rejects.toThrow();
  });
});
