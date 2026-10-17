import { describe, expect, it } from "vitest";
import { parseEbookDriveUrl, resetServerConfigCache, getServerConfig } from "@/lib/config";
import { buildDownloadEmailHtml } from "@/lib/email";

const VALID_VIEW =
  "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view?usp=sharing";
const VALID_OPEN = "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const VALID_DIRECT =
  "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("EBOOK_DRIVE_URL validation", () => {
  it("accepts standard Google Drive share links", () => {
    for (const url of [VALID_VIEW, VALID_OPEN, VALID_DIRECT]) {
      expect(parseEbookDriveUrl(url)).toBeTruthy();
    }
  });

  it("rejects empty, malformed, non-Drive and non-HTTPS values", () => {
    const bad = [
      null,
      "",
      "   ",
      "not a url",
      "https://evil.example.com/file/d/1AbCdEfGhIjKlMnOp/view",
      "http://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", // not https
      "https://drive.google.com/", // no file id
      "javascript:alert(1)",
    ];
    for (const value of bad) {
      expect(parseEbookDriveUrl(value)).toBeNull();
    }
  });

  it("is exposed on the server config and null when unset", () => {
    delete process.env.EBOOK_DRIVE_URL;
    resetServerConfigCache();
    expect(getServerConfig().ebookDriveUrl).toBeNull();

    process.env.EBOOK_DRIVE_URL = VALID_VIEW;
    resetServerConfigCache();
    expect(getServerConfig().ebookDriveUrl).toContain("drive.google.com");

    // An invalid value never reaches the UI or an email.
    process.env.EBOOK_DRIVE_URL = "https://evil.example.com/x.pdf";
    resetServerConfigCache();
    expect(getServerConfig().ebookDriveUrl).toBeNull();

    delete process.env.EBOOK_DRIVE_URL;
    resetServerConfigCache();
  });
});

describe("free delivery email copy", () => {
  it("includes the title and Drive link, and does not promise expiry", () => {
    const { subject, html, text } = buildDownloadEmailHtml({
      downloadUrl: VALID_VIEW,
      expiresAtIso: null,
      delivery: "drive",
    });
    expect(subject).toContain("The Human Paradox");
    expect(subject).toContain("Your Mind Is Not Your Enemy");
    expect(html).toContain("Your Mind Is Not Your Enemy");
    expect(html).toContain(VALID_VIEW);
    expect(html).toContain("free");
    // No false expiry/exclusivity claims for a public share link.
    expect(html).not.toMatch(/expires on/i);
    expect(text).not.toMatch(/secure link expires/i);
    // Honest about the link not being password protected.
    expect(html).toMatch(/not password protected/i);
  });

  it("keeps expiry wording for the protected (paid) delivery", () => {
    const { html, text } = buildDownloadEmailHtml({
      downloadUrl: "https://example.com/api/download/TOKEN",
      expiresAtIso: "2026-01-01T00:00:00.000Z",
      delivery: "protected",
    });
    expect(html).toContain("expires on");
    expect(text).toContain("expires on");
    expect(html).toContain("₹49");
  });
});