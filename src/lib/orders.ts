import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persistent server-side order store backed by a JSON file with atomic
 * writes (write-temp-then-rename) and an in-process mutex serializing
 * read-modify-write cycles.
 *
 * Suitability: correct for single-instance deployments (VPS, single
 * container with a mounted volume). For multi-instance / serverless
 * production, replace `createOrderStore` with a Postgres-backed
 * implementation behind the same interface (see docs/checkout-setup.md).
 * In-memory state and browser storage are NEVER authoritative here.
 */

export type PaymentStatus = "created" | "pending" | "paid" | "failed";

export interface OrderFulfillment {
  /** Server-held bearer token string (never sent to logs). */
  downloadToken: string | null;
  tokenIssuedAt: string | null;
  tokenExpiresAt: string | null;
  emailSentAt: string | null;
  emailError: string | null;
}

export interface Order {
  id: string;
  productId: string;
  amountPaise: number;
  currency: string;
  email: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  receiptToken: string;
  status: PaymentStatus;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  fulfillment: OrderFulfillment;
  downloadCount: number;
  firstDownloadedAt: string | null;
}

interface DbShape {
  version: 1;
  orders: Record<string, Order>;
  /** gatewayOrderId -> orderId */
  byGatewayOrder: Record<string, string>;
  /** idempotencyKey -> orderId */
  byIdempotencyKey: Record<string, string>;
  /** Razorpay webhook event id -> orderId (dedupe) */
  processedEvents: Record<string, string>;
}

export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

function emptyDb(): DbShape {
  return {
    version: 1,
    orders: {},
    byGatewayOrder: {},
    byIdempotencyKey: {},
    processedEvents: {},
  };
}

export function generateOrderId(): string {
  return `ord_${randomBytes(16).toString("hex")}`;
}

export interface OrderStore {
  create(input: {
    productId: string;
    amountPaise: number;
    currency: string;
    email: string;
    idempotencyKey: string | null;
    receiptToken: string;
  }): Order;
  get(orderId: string): Order | null;
  getByGatewayOrderId(gatewayOrderId: string): Order | null;
  getByIdempotencyKey(key: string): Order | null;
  /** Latest paid order for an email address (recovery flow). */
  latestPaidByEmail(email: string): Order | null;
  setGatewayOrderId(orderId: string, gatewayOrderId: string): Order;
  setGatewayPaymentId(orderId: string, paymentId: string): Order;
  /** created|pending -> paid. Returns {order, newlyPaid}. Idempotent. */
  markPaid(orderId: string, paymentId: string): { order: Order; newlyPaid: boolean };
  /** created|pending -> failed. Idempotent for failed. */
  markFailed(orderId: string): Order;
  /** Record a webhook event id. Returns false when already processed. */
  recordEvent(eventId: string, orderId: string): boolean;
  hasEvent(eventId: string): boolean;
  /** Replace fulfillment metadata (caller must have computed it). */
  setFulfillment(orderId: string, fulfillment: OrderFulfillment): Order;
  /**
   * Atomically check download policy and increment the counter.
   * Throws OrderTransitionError when the order may not be downloaded.
   */
  consumeDownload(orderId: string, maxDownloads: number): Order;
  /** Generic compare-and-set update helper used by fulfillment. */
  update<T>(orderId: string, fn: (order: Order) => { order: Order; result: T }): T;
}

export function createOrderStore(dbPath: string): OrderStore {
  // All filesystem operations below are synchronous. Node runs JS on a
  // single thread, so a synchronous read-modify-write cannot interleave
  // with another request in this process — no lock needed. Across
  // processes/instances, use the Postgres implementation documented in
  // docs/checkout-setup.md instead of this file store.

  function load(): DbShape {
    try {
      const raw = readFileSync(dbPath, "utf8");
      const parsed = JSON.parse(raw) as DbShape;
      if (!parsed || parsed.version !== 1 || !parsed.orders) return emptyDb();
      return parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return emptyDb();
      throw err;
    }
  }

  function save(db: DbShape): void {
    mkdirSync(dirname(dbPath), { recursive: true });
    const tmp = `${dbPath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db), "utf8");
    renameSync(tmp, dbPath);
  }

  // NOTE: load/save/use are all synchronous, so each transact() call
  // runs to completion without interleaving. See constructor comment.
  function transact<T>(fn: (db: DbShape) => T): T {
    const db = load();
    const result = fn(db);
    save(db);
    return result;
  }

  function clone(order: Order): Order {
    return JSON.parse(JSON.stringify(order)) as Order;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function getOrThrow(db: DbShape, orderId: string): Order {
    const order = db.orders[orderId];
    if (!order) throw new OrderTransitionError(`Unknown order: ${orderId}`);
    return order;
  }

  return {
    create(input) {
      return transact((db) => {
        if (input.idempotencyKey) {
          const existingId = db.byIdempotencyKey[input.idempotencyKey];
          if (existingId && db.orders[existingId]) {
            throw new OrderTransitionError(
              "Idempotency key already used for another order"
            );
          }
        }
        const timestamp = nowIso();
        const order: Order = {
          id: generateOrderId(),
          productId: input.productId,
          amountPaise: input.amountPaise,
          currency: input.currency,
          email: input.email,
          gatewayOrderId: null,
          gatewayPaymentId: null,
          receiptToken: input.receiptToken,
          status: "created",
          idempotencyKey: input.idempotencyKey,
          createdAt: timestamp,
          updatedAt: timestamp,
          paidAt: null,
          fulfillment: {
            downloadToken: null,
            tokenIssuedAt: null,
            tokenExpiresAt: null,
            emailSentAt: null,
            emailError: null,
          },
          downloadCount: 0,
          firstDownloadedAt: null,
        };
        db.orders[order.id] = order;
        if (input.idempotencyKey) {
          db.byIdempotencyKey[input.idempotencyKey] = order.id;
        }
        return clone(order);
      });
    },

    get(orderId) {
      const db = load();
      const order = db.orders[orderId];
      return order ? clone(order) : null;
    },

    getByGatewayOrderId(gatewayOrderId) {
      const db = load();
      const id = db.byGatewayOrder[gatewayOrderId];
      const order = id ? db.orders[id] : undefined;
      return order ? clone(order) : null;
    },

    getByIdempotencyKey(key) {
      const db = load();
      const id = db.byIdempotencyKey[key];
      const order = id ? db.orders[id] : undefined;
      return order ? clone(order) : null;
    },

    latestPaidByEmail(email) {
      const db = load();
      const wanted = email.trim().toLowerCase();
      let best: Order | null = null;
      for (const order of Object.values(db.orders)) {
        if (order.email === wanted && order.status === "paid") {
          if (!best || order.createdAt > best.createdAt) best = order;
        }
      }
      return best ? clone(best) : null;
    },

    setGatewayOrderId(orderId, gatewayOrderId) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        order.gatewayOrderId = gatewayOrderId;
        order.updatedAt = nowIso();
        db.byGatewayOrder[gatewayOrderId] = order.id;
        return clone(order);
      });
    },

    setGatewayPaymentId(orderId, paymentId) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        order.gatewayPaymentId = paymentId;
        order.updatedAt = nowIso();
        return clone(order);
      });
    },

    markPaid(orderId, paymentId) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        if (order.status === "paid") {
          return { order: clone(order), newlyPaid: false };
        }
        if (order.status === "failed") {
          throw new OrderTransitionError(
            "Cannot mark a failed order as paid without review"
          );
        }
        order.status = "paid";
        order.gatewayPaymentId = paymentId;
        order.paidAt = nowIso();
        order.updatedAt = order.paidAt;
        return { order: clone(order), newlyPaid: true };
      });
    },

    markFailed(orderId) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        if (order.status === "paid") {
          // Never downgrade a verified payment via a failure event.
          return clone(order);
        }
        if (order.status === "failed") return clone(order);
        order.status = "failed";
        order.updatedAt = nowIso();
        return clone(order);
      });
    },

    recordEvent(eventId, orderId) {
      return transact((db) => {
        if (db.processedEvents[eventId]) return false;
        db.processedEvents[eventId] = orderId;
        return true;
      });
    },

    hasEvent(eventId) {
      return Boolean(load().processedEvents[eventId]);
    },

    setFulfillment(orderId, fulfillment) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        order.fulfillment = { ...fulfillment };
        order.updatedAt = nowIso();
        return clone(order);
      });
    },

    consumeDownload(orderId, maxDownloads) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        if (order.status !== "paid") {
          throw new OrderTransitionError("Order is not paid");
        }
        if (order.downloadCount >= maxDownloads) {
          throw new OrderTransitionError("Download limit reached");
        }
        order.downloadCount += 1;
        if (!order.firstDownloadedAt) order.firstDownloadedAt = nowIso();
        order.updatedAt = nowIso();
        return clone(order);
      });
    },

    update(orderId, fn) {
      return transact((db) => {
        const order = getOrThrow(db, orderId);
        const { order: next, result } = fn(clone(order));
        next.updatedAt = nowIso();
        db.orders[orderId] = next;
        return result;
      });
    },
  };
}
