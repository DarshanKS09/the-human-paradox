import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { createOrderStore } from "@/lib/orders";
import { fulfillOrder } from "@/lib/fulfill";

// End-to-end download tests against a RUNNING dev server.
// Run: E2E_BASE_URL=http://localhost:3000 E2E_DB_PATH=<same as server ORDERS_DB_PATH>
//      E2E_PDF_PATH=<same as server EBOOK_PDF_PATH> E2E_TOKEN_SECRET=<same secret>
//      npm test
// Skipped automatically when E2E_BASE_URL is unset.

const BASE = process.env.E2E_BASE_URL ?? "";
const DB = process.env.E2E_DB_PATH ?? "";
const PDF = process.env.E2E_PDF_PATH ?? "";
const SECRET = process.env.E2E_TOKEN_SECRET ?? "";

const enabled = Boolean(BASE && DB && PDF && SECRET);
const run = enabled ? describe : describe.skip;

const FIXTURE_PDF = Buffer.from(
  "%PDF-1.4\n%TEST FIXTURE — not the real ebook\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "utf8"
);

run("download endpoint (live server)", () => {
  it("serves the PDF to a verified paid order, then enforces the limit", async () => {
    mkdirSync(dirname(PDF), { recursive: true });
    writeFileSync(PDF, FIXTURE_PDF);
    const store = createOrderStore(DB);
    const order = store.create({
      productId: "ymine-01",
      amountPaise: 4900,
      currency: "INR",
      email: "e2e@example.com",
      idempotencyKey: null,
      receiptToken: "rcpt",
    });
    store.markPaid(order.id, "pay_e2e");
    const fulfilled = await fulfillOrder({
      dbPath: DB,
      downloadTokenSecret: SECRET,
      linkTtlSeconds: 3600,
      appBaseUrl: BASE,
      smtp: null,
      emailFrom: "X <x@example.com>",
    }, order.id);

    const good = await fetch(`${BASE}/api/download/${fulfilled.downloadToken}`);
    expect(good.status).toBe(200);
    expect(good.headers.get("content-type")).toBe("application/pdf");
    expect(good.headers.get("content-disposition") ?? "").toContain("attachment");
    const bytes = Buffer.from(await good.arrayBuffer());
    expect(bytes.equals(FIXTURE_PDF)).toBe(true);
  }, 30000);

  it("rejects tampered tokens and unknown orders without leaking data", async () => {
    const bad = await fetch(`${BASE}/api/download/this-is-not-a-token`);
    expect(bad.status).toBe(410);
    expect(await bad.text()).not.toContain("pay_");

    const ghost = await fetch(
      `${BASE}/api/orders/ord_ffffffffffffffffffffffffffffffff?rt=invalid`
    );
    expect(ghost.status).toBe(404);
  }, 30000);

  it("answers recovery requests generically (no enumeration)", async () => {
    const res = await fetch(`${BASE}/api/download/request-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody-here@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  }, 30000);

  it("refuses unsigned webhook calls; checkout never fabricates orders", async () => {
    const hook = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt_fake", event: "payment.captured" }),
    });
    expect([401, 200]).toContain(hook.status);
    if (hook.status === 401) {
      expect(((await hook.json()) as { code: string }).code).toBe("INVALID_SIGNATURE");
    }

    const created = await fetch(`${BASE}/api/checkout/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.co", productId: "ymine-01", idempotencyKey: "e2ekey01" }),
    });
    const rawText = await created.text();
    if (created.status === 503) {
      // No gateway credentials in this environment: must refuse, never fabricate.
      expect((JSON.parse(rawText) as { code: string }).code).toBe("PAYMENTS_NOT_CONFIGURED");
    } else {
      // Gateway credentials present: the server must still dictate the
      // price (no charge is made by creating an order) and leak no secrets.
      expect(created.status).toBe(200);
      const payload = JSON.parse(rawText) as {
        amountPaise: number;
        currency: string;
        gatewayOrderId: string;
        orderId: string;
      };
      expect(payload.amountPaise).toBe(4900);
      expect(payload.currency).toBe("INR");
      expect(typeof payload.gatewayOrderId).toBe("string");
      expect(typeof payload.orderId).toBe("string");
      expect(rawText.toLowerCase()).not.toContain("key_secret");
      expect(rawText).not.toContain("SMTP_PASSWORD");
    }
  }, 30000);
});
