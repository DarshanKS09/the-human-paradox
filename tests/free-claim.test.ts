import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { claimFreeEbook, FreeClaimInputError } from "@/lib/free-claim";
import { createFreeClaimStore, claimEmailKey } from "@/lib/free-claims";
import { createOrderStore } from "@/lib/orders";
import type { MailTransportLike, SmtpConfig } from "@/lib/email";
import { parseDistributionMode } from "@/lib/config";

const SMTP: SmtpConfig = {
  host: "smtp-relay.brevo.com",
  port: 587,
  user: "user",
  password: "pass",
};

let dbPath = "";

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "thp-free-")), "claims.json");
});

function deps(overrides: Record<string, unknown> = {}) {
  return {
    store: createFreeClaimStore({
      kvRestApiUrl: null,
      kvRestApiToken: null,
      dbPath,
    }),
    downloadTokenSecret: "free_secret_1234567890abcdef",
    linkTtlSeconds: 72 * 3600,
    appBaseUrl: "https://example.com",
    smtp: null,
    emailFrom: "The Human Paradox <hello@example.com>",
    cooldownMinutes: 10,
    maxEmailsPerDay: 3,
    nowMs: 1_700_000_000_000,
    ...overrides,
  };
}

function fakeTransport(sent: string[]) {
  return () => {
    const transport: MailTransportLike = {
      verify: async () => true,
      sendMail: async (message) => {
        sent.push(message.to);
        return { messageId: "smtp-1" };
      },
    };
    return transport;
  };
}

function failingTransport() {
  return () => {
    const transport: MailTransportLike = {
      verify: async () => {
        const err = new Error("auth failed") as Error & { code: string };
        err.code = "EAUTH";
        throw err;
      },
      sendMail: async () => ({ messageId: "never" }),
    };
    return transport;
  };
}

describe("distribution mode configuration", () => {
  it("defaults safely to FREE when unset or unrecognized", () => {
    expect(parseDistributionMode(null)).toBe("FREE");
    expect(parseDistributionMode("")).toBe("FREE");
    expect(parseDistributionMode("nonsense")).toBe("FREE");
    expect(parseDistributionMode("free")).toBe("FREE");
  });

  it("enables paid mode only for an explicit PAID value", () => {
    expect(parseDistributionMode("PAID")).toBe("PAID");
    expect(parseDistributionMode("paid")).toBe("PAID");
  });
});

describe("free claim validation", () => {
  it("requires a valid email address", async () => {
    for (const bad of [undefined, null, "", "nope", "a@b", "a b@c.co", 123]) {
      await expect(claimFreeEbook(deps(), bad)).rejects.toThrowError(
        FreeClaimInputError
      );
    }
  });

  it("accepts and normalizes a valid email", async () => {
    const result = await claimFreeEbook(deps(), " Reader@Example.com ");
    expect(result.downloadToken.length).toBeGreaterThan(20);
    expect(result.downloadUrl).toContain("/api/download/");
  });
});

describe("free claim grants protected access without payment", () => {
  it("issues a signed, expiring download token and creates no order", async () => {
    const result = await claimFreeEbook(deps(), "reader@example.com");

    // Token is HMAC-signed and purpose-scoped.
    expect(result.downloadToken.split(".")[1]).toBe("fr");
    const claimsFile = createFreeClaimStore({
      kvRestApiUrl: null,
      kvRestApiToken: null,
      dbPath,
    });
    expect(await claimsFile.getById(result.claimId)).not.toBeNull();

    // No paid order is created anywhere.
    const ordersFile = join(dbPath, "..", "orders.json");
    const orderStore = createOrderStore(ordersFile);
    expect(orderStore.latestPaidByEmail("reader@example.com")).toBeNull();
  });

  it("does not expose the customer's email in the token payload", async () => {
    const result = await claimFreeEbook(deps(), "reader@example.com");
    expect(result.downloadToken).not.toContain("reader@example.com");
    expect(result).not.toHaveProperty("email");
  });
});

describe("anti-abuse: repeated submissions", () => {
  it("reuses one claim and does not resend email within the cooldown", async () => {
    const sent: string[] = [];
    const base = deps({
      smtp: SMTP,
      createTransport: fakeTransport(sent),
    });
    const first = await claimFreeEbook(base, "reader@example.com");
    expect(first.emailStatus).toBe("SENT");
    expect(sent).toHaveLength(1);

    const second = await claimFreeEbook(
      { ...base, nowMs: (base.nowMs as number) + 60_000 },
      "reader@example.com"
    );
    expect(second.claimId).toBe(first.claimId);
    expect(second.downloadToken).toBe(first.downloadToken);
    expect(second.emailSent).toBe(false);
    expect(second.emailStatus).toBe("COOLDOWN");
    expect(sent).toHaveLength(1); // no email spam
  });

  it("allows a resend after the cooldown", async () => {
    const sent: string[] = [];
    const base = deps({ smtp: SMTP, createTransport: fakeTransport(sent) });
    await claimFreeEbook(base, "reader@example.com");
    await claimFreeEbook({ ...base, nowMs: (base.nowMs as number) + 11 * 60_000 }, "reader@example.com");
    expect(sent).toHaveLength(2);
  });

  it("stops sending after the daily cap", async () => {
    const sent: string[] = [];
    const base = deps({ smtp: SMTP, createTransport: fakeTransport(sent) });
    let now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      const result = await claimFreeEbook({ ...base, nowMs: now }, "reader@example.com");
      now += 11 * 60_000;
      expect(result.emailStatus === "SENT").toBe(i < 3);
    }
    expect(sent).toHaveLength(3);
  });

  it("treats the same address as one claim regardless of case", async () => {
    const base = deps();
    const a = await claimFreeEbook(base, "Reader@Example.com");
    const b = await claimFreeEbook(base, "reader@example.com");
    expect(a.claimId).toBe(b.claimId);
  });

  it("stores email keys hashed, not as raw addresses", () => {
    const key = claimEmailKey("reader@example.com");
    expect(key).not.toContain("reader@example.com");
    expect(key.startsWith("thp:freeclaim:email:")).toBe(true);
  });
});

describe("SMTP delivery outcomes", () => {
  it("sends the ebook email through the configured SMTP transport", async () => {
    const sent: string[] = [];
    const result = await claimFreeEbook(
      deps({ smtp: SMTP, createTransport: fakeTransport(sent) }),
      "reader@example.com"
    );
    expect(sent).toEqual(["reader@example.com"]);
    expect(result.emailSent).toBe(true);
  });

  it("never reports success when SMTP is not configured", async () => {
    const result = await claimFreeEbook(deps(), "reader@example.com");
    expect(result.emailSent).toBe(false);
    expect(result.emailStatus).toBe("NOT_CONFIGURED");
    expect(result.downloadToken.length).toBeGreaterThan(0); // download still works
  });

  it("records failure without claiming the email was sent, and allows retry", async () => {
    const result = await claimFreeEbook(
      deps({ smtp: SMTP, createTransport: failingTransport() }),
      "reader@example.com"
    );
    expect(result.emailSent).toBe(false);
    expect(result.emailAttempted).toBe(true);
    expect(result.emailStatus).toBe("FAILED");

    const sent: string[] = [];
    const retry = await claimFreeEbook(
      deps({ smtp: SMTP, createTransport: fakeTransport(sent) }),
      "reader@example.com"
    );
    expect(retry.emailStatus).toBe("SENT");
    expect(sent).toEqual(["reader@example.com"]);
  });
});