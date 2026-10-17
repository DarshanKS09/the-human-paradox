import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getServerConfig } from "./config";

/**
 * Reads the private ebook PDF from durable storage.
 *
 * - `EBOOK_PDF_URL` (private object storage such as S3/R2 via a server-side
 *   fetch, or any authenticated endpoint) is preferred, because the serverless
 *   bundle filesystem is read-only and ephemeral on Vercel.
 * - Falls back to `EBOOK_PDF_PATH` only where a persistent volume exists.
 *
 * The PDF is never written to `public/` and is only ever streamed from
 * here by the protected download route.
 */

export interface EbookPdf {
  stream: ReadableStream<Uint8Array>;
  size: number | null;
}

export class EbookUnavailableError extends Error {
  constructor() {
    super("EBOOK_UNAVAILABLE");
    this.name = "EbookUnavailableError";
  }
}

export async function readEbookPdf(
  fetchImpl: typeof fetch = fetch
): Promise<EbookPdf> {
  const cfg = getServerConfig();

  if (cfg.ebookPdfUrl) {
    try {
      const res = await fetchImpl(cfg.ebookPdfUrl, {
        headers: cfg.ebookPdfToken
          ? { Authorization: `Bearer ${cfg.ebookPdfToken}` }
          : undefined,
        cache: "no-store",
      });
      if (res.ok && res.body) {
        const length = res.headers.get("content-length");
        return {
          stream: res.body as ReadableStream<Uint8Array>,
          size: length ? Number.parseInt(length, 10) : null,
        };
      }
    } catch {
      // Fall through to the local-file path / unavailable error below.
    }
  }

  try {
    const size = statSync(cfg.ebookPdfPath).size;
    const nodeStream = createReadStream(cfg.ebookPdfPath);
    return {
      stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
      size,
    };
  } catch {
    throw new EbookUnavailableError();
  }
}