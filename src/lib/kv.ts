/**
 * Minimal durable key-value client over an Upstash/Vercel KV-compatible
 * REST API (plain fetch, no dependencies).
 *
 * Why this exists: the default order/claim store writes to the local
 * filesystem, which is EPHEMERAL on serverless hosts such as Vercel
 * (each invocation may get a fresh, read-only bundle filesystem). When
 * `KV_REST_API_URL` / `KV_REST_API_TOKEN` are configured, records are kept
 * in a durable store instead and survive deployments and cold starts.
 */

export interface KvClient {
  get(key: string): Promise<string | null>;
  /** Returns true when the key was newly created (atomic NX). */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function createKvClient(restUrl: string, restToken: string): KvClient {
  const base = stripTrailingSlash(restUrl);
  const headers = {
    Authorization: `Bearer ${restToken}`,
    "Content-Type": "application/json",
  };

  async function command<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      // Never surface provider internals; callers record a generic failure.
      throw new Error("KV_COMMAND_FAILED");
    }
    return (await res.json()) as T;
  }

  return {
    async get(key) {
      const result = await command<{ result: string | null }>("/get", [key]);
      return result?.result ?? null;
    },
    async setIfAbsent(key, value, ttlSeconds) {
      // Upstash: SET key value EX ttl NX -> "OK" only when newly created.
      const result = await command<{ result: string | null }>(
        "/set",
        [key, value, "EX", ttlSeconds, "NX"]
      );
      return result?.result === "OK";
    },
    async set(key, value, ttlSeconds) {
      await command("/set", [key, value, "EX", ttlSeconds]);
    },
  };
}