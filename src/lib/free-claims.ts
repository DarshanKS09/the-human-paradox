import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createKvClient, type KvClient } from "./kv";

/**
 * Free-claim records. Kept separate from paid orders on purpose: a free
 * claim must never look like, or trigger, a paid order / payment flow.
 *
 * Storage is durable when `KV_REST_API_URL` is configured (serverless-safe);
 * otherwise it falls back to a local JSON file for single-instance dev.
 */

export interface FreeClaim {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  downloadToken: string | null;
  tokenExpiresAt: string | null;
  emailCount: number;
  /** Epoch ms of the most recent successful email send. */
  lastEmailSentAtMs: number;
  lastEmailAttemptAtMs: number;
  emailError: string | null;
  downloadCount: number;
}

export function generateClaimId(): string {
  return `clm_${randomBytes(16).toString("hex")}`;
}

export function isValidClaimId(value: unknown): boolean {
  return typeof value === "string" && /^clm_[0-9a-f]{32}$/.test(value);
}

/** Emails are never used as raw storage keys. */
export function claimEmailKey(email: string): string {
  const hash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `thp:freeclaim:email:${hash}`;
}

export function claimIdKey(id: string): string {
  return `thp:freeclaim:id:${id}`;
}

export interface FreeClaimStore {
  /** Atomic create-or-read by email. Never creates duplicates. */
  claimForEmail(
    email: string,
    nowMs: number
  ): Promise<{ claim: FreeClaim; created: boolean }>;
  getById(id: string): Promise<FreeClaim | null>;
  save(claim: FreeClaim): Promise<FreeClaim>;
}

interface FileShape {
  version: 1;
  byEmail: Record<string, FreeClaim>;
  byId: Record<string, FreeClaim>;
}

function createFileStore(dbPath: string): FreeClaimStore {
  function load(): FileShape {
    try {
      const parsed = JSON.parse(readFileSync(dbPath, "utf8")) as FileShape;
      if (!parsed || parsed.version !== 1) return { version: 1, byEmail: {}, byId: {} };
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return { version: 1, byEmail: {}, byId: {} };
      }
      throw err;
    }
  }
  function save(db: FileShape): void {
    mkdirSync(dirname(dbPath), { recursive: true });
    const tmp = `${dbPath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db), "utf8");
    renameSync(tmp, dbPath);
  }
  return {
    claimForEmail(email, nowMs) {
      // Synchronous fs ops cannot interleave on the Node event loop.
      const db = load();
      const key = claimEmailKey(email);
      const existing = db.byEmail[key];
      if (existing) return Promise.resolve({ claim: { ...existing }, created: false });
      const claim: FreeClaim = {
        id: generateClaimId(),
        email: email.trim().toLowerCase(),
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        downloadToken: null,
        tokenExpiresAt: null,
        emailCount: 0,
        lastEmailSentAtMs: 0,
        lastEmailAttemptAtMs: 0,
        emailError: null,
        downloadCount: 0,
      };
      db.byEmail[key] = claim;
      db.byId[claim.id] = claim;
      save(db);
      return Promise.resolve({ claim: { ...claim }, created: true });
    },
    getById(id) {
      const found = load().byId[id];
      return Promise.resolve(found ? { ...found } : null);
    },
    save(claim) {
      const db = load();
      db.byEmail[claimEmailKey(claim.email)] = claim;
      db.byId[claim.id] = claim;
      save(db);
      return Promise.resolve({ ...claim });
    },
  };
}

function createKvStore(kv: KvClient): FreeClaimStore {
  return {
    async claimForEmail(email, nowMs) {
      const key = claimEmailKey(email);
      const existingRaw = await kv.get(key);
      if (existingRaw) {
        return { claim: JSON.parse(existingRaw) as FreeClaim, created: false };
      }
      const claim: FreeClaim = {
        id: generateClaimId(),
        email: email.trim().toLowerCase(),
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        downloadToken: null,
        tokenExpiresAt: null,
        emailCount: 0,
        lastEmailSentAtMs: 0,
        lastEmailAttemptAtMs: 0,
        emailError: null,
        downloadCount: 0,
      };
      // Atomic NX create prevents duplicate claims from concurrent requests.
      const created = await kv.setIfAbsent(
        key,
        JSON.stringify(claim),
        60 * 60 * 24 * 365
      );
      if (!created) {
        const raced = await kv.get(key);
        if (raced) return { claim: JSON.parse(raced) as FreeClaim, created: false };
      }
      await kv.set(claimIdKey(claim.id), JSON.stringify(claim), 60 * 60 * 24 * 365);
      return { claim, created: true };
    },
    async getById(id) {
      const raw = await kv.get(claimIdKey(id));
      return raw ? (JSON.parse(raw) as FreeClaim) : null;
    },
    async save(claim) {
      const ttl = 60 * 60 * 24 * 365;
      await kv.set(claimEmailKey(claim.email), JSON.stringify(claim), ttl);
      await kv.set(claimIdKey(claim.id), JSON.stringify(claim), ttl);
      return claim;
    },
  };
}

export function createFreeClaimStore(options: {
  kvRestApiUrl: string | null;
  kvRestApiToken: string | null;
  dbPath: string;
}): FreeClaimStore {
  if (options.kvRestApiUrl && options.kvRestApiToken) {
    return createKvStore(createKvClient(options.kvRestApiUrl, options.kvRestApiToken));
  }
  return createFileStore(options.dbPath);
}