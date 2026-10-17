import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { claimFreeEbook } from "@/lib/free-claim";
import { createFreeClaimStore } from "@/lib/free-claims";
import {
  checkEbookAvailability,
  checkEbookAvailabilitySync,
  resolveLocalEbookPath,
} from "@/lib/ebook-storage";
import { getServerConfig, resetServerConfigCache } from "@/lib/config";
import type { MailTransportLike } from "@/lib/email";

const PDF_TEXT = "%PDF-1.4\n%fixture\n%%EOF\n";

beforeEach(() => {
  resetServerConfigCache();
  process.env.ORDERS_DB_PATH = join(tmpdir(), "thp-diag-orders.json");
  process.env.FREE_CLAIMS_DB_PATH = join(tmpdir(), "thp-diag-claims.json");
});

function deps(overrides: Record<string, unknown> = {}) {
  return {
    store: createFreeClaimStore({
      kvRestApiUrl: null,
      kvRestApiToken: null,
      dbPath: join(mkdtempSync(join(tmpdir(), "thp-diag-")), "claims.json"),
    }),
    downloadTokenSecret: "diag_secret_0123456789",
    linkTtlSeconds: 3600,
    appBaseUrl: "https://example.com",
    driveUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view",
    smtp: null,
    emailFrom: "The Human Paradox <x@y.com>",
    cooldownMinutes: 10,
    maxEmailsPerDay: 3,
    ...overrides,
  };
}

describe("ebook availability diagnostics", () => {
  it("reports unavailable and a resolved path when the PDF is missing", () => {
    process.env.EBOOK_PDF_PATH = join(tmpdir(), "definitely-missing.pdf");
    resetServerConfigCache();
    const sync = checkEbookAvailabilitySync();
    expect(sync.available).toBe(false);
    expect(sync.source).toBe("none");
    // Absolute in, absolute out — no cwd-relative surprises.
    expect(sync.resolvedPath).toContain("definitely-missing.pdf");
    expect(resolveLocalEbookPath()).toBeNull();
  });

  it("resolves a relative EBOOK_PDF_PATH against the process working directory", () => {
    process.env.EBOOK_PDF_PATH = "./private/ebook.pdf";
    resetServerConfigCache();
    const sync = checkEbookAvailabilitySync();
    expect(sync.resolvedPath).toBe(resolve(process.cwd(), "private/ebook.pdf"));
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
    // Credentials travel in the auth header, never the URL or logs.
    expect(captured[0].url).not.toContain("secret-token");
  });
});

describe("claim fail-closed behaviour", () => {
  it("still mints a token only when called directly, but never emails silently", async () => {
    const sent: string[] = [];
    const createTransport = () => {
      const transport: MailTransportLike = {
        verify: async () => true,
        sendMail: async (m) => {
          sent.push(m.to);
          return { messageId: "m1" };
        },
      };
      return transport;
    };
    process.env.EBOOK_PDF_PATH = join(tmpdir(), "missing.pdf");
    resetServerConfigCache();

    // With SMTP missing the result is honest: no false "sent".
    const noSmtp = await claimFreeEbook(deps(), "a@b.co");
    expect(noSmtp.emailSent).toBe(false);
    expect(noSmtp.emailStatus).toBe("NOT_CONFIGURED");

    // With SMTP present the email is attempted through the real transport.
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASSWORD = "p";
    resetServerConfigCache();
    const withSmtp = await claimFreeEbook(
      deps({
        smtp: getServerConfig().smtp,
        createTransport,
      }),
      "c@d.co"
    );
    expect(sent).toEqual(["c@d.co"]);
    expect(withSmtp.emailSent).toBe(true);
  });
});