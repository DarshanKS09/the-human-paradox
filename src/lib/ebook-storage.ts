import { createReadStream, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
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

export interface EbookAvailability {
  available: boolean;
  /** Where the file is expected, for diagnostics only. */
  resolvedPath: string;
  source: "remote" | "file" | "none";
}

/**
 * Resolves the local PDF path against the process working directory, which
 * is the project root for `next dev` / `next start`. Returns null when the
 * file is absent.
 */
export function resolveLocalEbookPath(): string | null {
  const configured = getServerConfig().ebookPdfPath;
  const absolute = isAbsolute(configured)
    ? configured
    : resolve(process.cwd(), configured);
  try {
    const stat = statSync(absolute);
    return stat.isFile() && stat.size > 0 ? absolute : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether the ebook can actually be served, so the claim flow can
 * fail closed instead of emailing a link that would 503.
 */
/**
 * Synchronous variant for server components that cannot await (rendering
 * the checkout page). Ignores remote storage and reports local-file state.
 */
export function checkEbookAvailabilitySync(): EbookAvailability {
  const cfg = getServerConfig();
  const resolvedPath = isAbsolute(cfg.ebookPdfPath)
    ? cfg.ebookPdfPath
    : resolve(process.cwd(), cfg.ebookPdfPath);
  const local = resolveLocalEbookPath();
  if (local) return { available: true, resolvedPath: local, source: "file" };
  if (cfg.ebookPdfUrl) {
    // A remote URL may still be valid; assume yes and let the claim route
    // verify for real before sending anything.
    return { available: true, resolvedPath, source: "remote" };
  }
  return { available: false, resolvedPath, source: "none" };
}

export async function checkEbookAvailability(
  fetchImpl: typeof fetch = fetch
): Promise<EbookAvailability> {
  const cfg = getServerConfig();
  const resolvedPath = isAbsolute(cfg.ebookPdfPath)
    ? cfg.ebookPdfPath
    : resolve(process.cwd(), cfg.ebookPdfPath);

  if (cfg.ebookPdfUrl) {
    try {
      const res = await fetchImpl(cfg.ebookPdfUrl, {
        method: "HEAD",
        headers: cfg.ebookPdfToken
          ? { Authorization: `Bearer ${cfg.ebookPdfToken}` }
          : undefined,
        cache: "no-store",
      });
      if (res.ok) return { available: true, resolvedPath, source: "remote" };
    } catch {
      // fall through to the local check below
    }
  }

  const local = resolveLocalEbookPath();
  if (local) return { available: true, resolvedPath: local, source: "file" };
  return { available: false, resolvedPath, source: "none" };
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