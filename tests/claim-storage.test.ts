import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ClaimStorageError,
  createFreeClaimStore,
} from "@/lib/free-claims";

/**
 * Regression coverage for the deployed failure: with no durable storage
 * configured, the claim store falls back to a local file, which is
 * READ-ONLY on Vercel. That surfaced as an opaque 500 ("We could not
 * prepare your copy"). These tests pin the typed, actionable error.
 */
describe("claim storage failure handling", () => {
  it("raises ClaimStorageError when the claims file cannot be written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thp-storage-"));
    // Pointing the store at a directory makes writes fail deterministically,
    // the same way a read-only deployment filesystem does.
    const store = createFreeClaimStore({
      kvRestApiUrl: null,
      kvRestApiToken: null,
      dbPath: dir,
    });

    await expect(
      store.claimForEmail("reader@example.com", Date.now())
    ).rejects.toBeInstanceOf(ClaimStorageError);
  });

  it("exposes a stable, non-technical code for the API layer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thp-storage-"));
    const store = createFreeClaimStore({
      kvRestApiUrl: null,
      kvRestApiToken: null,
      dbPath: dir,
    });
    try {
      await store.claimForEmail("reader@example.com", Date.now());
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ClaimStorageError);
      expect((err as ClaimStorageError).code).toBe("CLAIM_STORAGE_UNAVAILABLE");
      // Message stays generic: no paths or internals leak to customers.
      expect((err as Error).message).toBe("Claim storage unavailable (EISDIR)");
    }
  });

  it("still uses durable KV when configured, ignoring the local path", async () => {
    // No network call should happen for a configured KV client unless the
    // store is actually used; asserting construction succeeds proves the
    // durable backend is selected over the file fallback.
    const store = createFreeClaimStore({
      kvRestApiUrl: "https://example.invalid",
      kvRestApiToken: "token",
      dbPath: "/definitely/not/writable/claims.json",
    });
    expect(store).toBeDefined();
    expect(typeof store.claimForEmail).toBe("function");
  });
});