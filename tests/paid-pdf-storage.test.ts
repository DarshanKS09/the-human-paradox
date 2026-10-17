import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkEbookAvailability,
  checkEbookAvailabilitySync,
  resolveLocalEbookPath,
} from "@/lib/ebook-storage";
import { resetServerConfigCache } from "@/lib/config";

const PDF_TEXT = "%PDF-1.4\n%fixture\n%%EOF\n";

beforeEach(() => {
  resetServerConfigCache();
});

/**
 * These helpers back the PAID-mode protected download endpoint. The FREE
 * Google Drive flow does not read the ebook through this module at all.
 */
describe("paid-mode PDF availability diagnostics", () => {
  it("reports unavailable and a resolved path when the PDF is missing", () => {
    process.env.EBOOK_PDF_PATH = join(tmpdir(), "definitely-missing.pdf");
    resetServerConfigCache();
    const sync = checkEbookAvailabilitySync();
    expect(sync.available).toBe(false);
    expect(sync.source).toBe("none");
    expect(sync.resolvedPath).toContain("definitely-missing.pdf");
    expect(resolveLocalEbookPath()).toBeNull();
  });

  it("resolves a relative EBOOK_PDF_PATH against the process working directory", () => {
    process.env.EBOOK_PDF_PATH = "./private/ebook.pdf";
    resetServerConfigCache();
    expect(checkEbookAvailabilitySync().resolvedPath).toBe(
      resolve(process.cwd(), "private/ebook.pdf")
    );
  });

  it("reports available when the file exists and is non-empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thp-pdf-"));
    const pdf = join(dir, "ebook.pdf");
    writeFileSync(pdf, PDF_TEXT);
    process.env.EBOOK_PDF_PATH = pdf;
    resetServerConfigCache();
    expect(checkEbookAvailabilitySync().available).toBe(true);
    expect((await checkEbookAvailability()).source).toBe("file");
  });

  it("treats a zero-byte file as unavailable", () => {
    const dir = mkdtempSync(join(tmpdir(), "thp-pdf-"));
    const pdf = join(dir, "empty.pdf");
    writeFileSync(pdf, "");
    process.env.EBOOK_PDF_PATH = pdf;
    resetServerConfigCache();
    expect(checkEbookAvailabilitySync().available).toBe(false);
  });

  it("prefers private remote storage when EBOOK_PDF_URL is configured", async () => {
    process.env.EBOOK_PDF_PATH = join(tmpdir(), "missing.pdf");
    process.env.EBOOK_PDF_URL = "https://private.example.com/ebook.pdf";
    process.env.EBOOK_PDF_TOKEN = "secret-token";
    resetServerConfigCache();

    const captured: { url: string; init: RequestInit | undefined }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await checkEbookAvailability(fakeFetch);
    expect(result.available).toBe(true);
    expect(result.source).toBe("remote");
    expect(captured[0].url).toBe("https://private.example.com/ebook.pdf");
    // Credentials travel in the auth header, never the URL.
    expect(captured[0].url).not.toContain("secret-token");

    delete process.env.EBOOK_PDF_URL;
    delete process.env.EBOOK_PDF_TOKEN;
    resetServerConfigCache();
  });
});