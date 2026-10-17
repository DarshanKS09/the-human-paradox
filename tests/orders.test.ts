import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createOrderStore,
  OrderTransitionError,
  type OrderStore,
} from "@/lib/orders";

let dbPath = "";
let store: OrderStore;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "thp-orders-")), "orders.json");
  store = createOrderStore(dbPath);
});

function makeOrder(email = "reader@example.com") {
  return store.create({
    productId: "ymine-01",
    amountPaise: 4900,
    currency: "INR",
    email,
    idempotencyKey: null,
    receiptToken: "rcpt",
  });
}

describe("order persistence and state transitions", () => {
  it("persists orders and round-trips them from disk", () => {
    const created = makeOrder();
    const reloaded = createOrderStore(dbPath).get(created.id);
    expect(reloaded?.email).toBe("reader@example.com");
    expect(reloaded?.amountPaise).toBe(4900);
    expect(reloaded?.status).toBe("created");
  });

  it("marks created orders paid exactly once (idempotent)", () => {
    const order = makeOrder();
    const first = store.markPaid(order.id, "pay_1");
    expect(first.newlyPaid).toBe(true);
    expect(first.order.status).toBe("paid");
    expect(first.order.paidAt).not.toBeNull();

    const second = store.markPaid(order.id, "pay_1");
    expect(second.newlyPaid).toBe(false);
    expect(second.order.status).toBe("paid");
  });

  it("refuses to mark a failed order as paid", () => {
    const order = makeOrder();
    store.markFailed(order.id);
    expect(() => store.markPaid(order.id, "pay_1")).toThrowError(OrderTransitionError);
  });

  it("never downgrades a paid order to failed", () => {
    const order = makeOrder();
    store.markPaid(order.id, "pay_1");
    const after = store.markFailed(order.id);
    expect(after.status).toBe("paid");
  });

  it("dedupes webhook events by id", () => {
    const order = makeOrder();
    expect(store.recordEvent("evt_1", order.id)).toBe(true);
    expect(store.recordEvent("evt_1", order.id)).toBe(false);
    expect(store.hasEvent("evt_1")).toBe(true);
  });

  it("enforces the download limit", () => {
    const order = makeOrder();
    store.markPaid(order.id, "pay_1");
    store.consumeDownload(order.id, 2);
    store.consumeDownload(order.id, 2);
    expect(() => store.consumeDownload(order.id, 2)).toThrowError(OrderTransitionError);
  });

  it("refuses downloads for unpaid orders", () => {
    const order = makeOrder();
    expect(() => store.consumeDownload(order.id, 5)).toThrowError(OrderTransitionError);
  });

  it("rejects unknown order ids", () => {
    expect(store.get("ord_00000000000000000000000000000000")).toBeNull();
    expect(() => store.markPaid("ord_00000000000000000000000000000000", "pay_x")).toThrowError(
      OrderTransitionError
    );
  });

  it("finds the latest paid order by email for recovery", () => {
    makeOrder("reader@example.com");
    const paid = makeOrder("reader@example.com");
    store.markPaid(paid.id, "pay_9");
    const found = store.latestPaidByEmail("READER@example.com");
    expect(found?.id).toBe(paid.id);
    expect(store.latestPaidByEmail("nobody@example.com")).toBeNull();
  });

  it("reuses idempotency keys safely across repeated submissions", () => {
    const first = store.create({
      productId: "ymine-01",
      amountPaise: 4900,
      currency: "INR",
      email: "reader@example.com",
      idempotencyKey: "key-12345678",
      receiptToken: "rcpt",
    });
    const byKey = store.getByIdempotencyKey("key-12345678");
    expect(byKey?.id).toBe(first.id);
    expect(() =>
      store.create({
        productId: "ymine-01",
        amountPaise: 4900,
        currency: "INR",
        email: "reader@example.com",
        idempotencyKey: "key-12345678",
        receiptToken: "rcpt",
      })
    ).toThrowError(OrderTransitionError);
  });
});
