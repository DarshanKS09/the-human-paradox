import { PRODUCT } from "@/lib/product";
import { getServerConfig } from "@/lib/config";
import { getFreeClaimStore, getStore, rateLimitOr429 } from "@/lib/http";
import {
  verifyToken,
  PURPOSE_DOWNLOAD,
  PURPOSE_FREE_DOWNLOAD,
} from "@/lib/tokens";
import { OrderTransitionError } from "@/lib/orders";
import { readEbookPdf, EbookUnavailableError } from "@/lib/ebook-storage";

/** Streams the private PDF with attachment headers, or null when unavailable. */
async function serveEbook(): Promise<Response | null> {
  try {
    const { stream, size } = await readEbookPdf();
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${PRODUCT.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (size !== null && Number.isFinite(size)) {
      headers["Content-Length"] = String(size);
    }
    return new Response(stream, { status: 200, headers });
  } catch (err) {
    if (err instanceof EbookUnavailableError) return null;
    throw err;
  }
}

function htmlPage(status: number, title: string, heading: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · The Human Paradox</title></head>` +
      `<body style="background:#0c0a08;color:#ede6d6;font-family:Georgia,serif;padding:48px 24px;line-height:1.6">` +
      `<div style="max-width:560px;margin:0 auto"><p style="letter-spacing:3px;font-size:12px;color:#c08d5d">THE HUMAN PARADOX</p>` +
      `<h1 style="font-weight:normal">${heading}</h1><p style="color:#a8a094">${body}</p>` +
      `<p><a style="color:#ede6d6" href="/checkout">Go to checkout</a></p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * Serves the private PDF only to verified purchasers holding a valid,
 * unexpired, order-bound download token — within the download limit.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = rateLimitOr429(req, "download", 60, 60_000);
  if (limited) return limited;

  const { token } = await params;
  const cfg = getServerConfig();
  if (!cfg.downloadTokenSecret) {
    return htmlPage(503, "Unavailable", "Download unavailable.", "Digital delivery is still being set up. Please try again later.");
  }

  const mode = cfg.distributionMode;
  const isPaidToken = verifyToken(cfg.downloadTokenSecret, PURPOSE_DOWNLOAD, token);
  const isFreeToken = verifyToken(
    cfg.downloadTokenSecret,
    PURPOSE_FREE_DOWNLOAD,
    token
  );
  if (!isPaidToken && !isFreeToken) {
    return htmlPage(
      410,
      "Link expired",
      "This download link has expired or is invalid.",
      "If you already have the ebook, visit the checkout page and request a fresh download link with your email address."
    );
  }

  const recordId = (isPaidToken ?? isFreeToken)?.orderId ?? "";

  // FREE claim download
  if (isFreeToken) {
    if (mode !== "FREE") {
      return htmlPage(403, "Not available", "This link is not available.", "Please request a fresh link from the checkout page.");
    }
    const claimStore = getFreeClaimStore();
    const claim = await claimStore.getById(recordId);
    if (!claim || claim.downloadToken !== token) {
      return htmlPage(
        410,
        "Link expired",
        "This link has been replaced by a newer one.",
        "Please use the newest link you received, or visit the checkout page to request a fresh one."
      );
    }
    if (claim.downloadCount >= cfg.freeMaxDownloadsPerClaim) {
      return htmlPage(
        410,
        "Download limit reached",
        "This link has reached its download limit.",
        "Visit the checkout page and enter the same email address to request a fresh link."
      );
    }
    claim.downloadCount += 1;
    claim.updatedAt = new Date().toISOString();
    await claimStore.save(claim);

    const pdf = await serveEbook();
    if (!pdf) {
      return htmlPage(
        503,
        "Unavailable",
        "The ebook file is not available right now.",
        "Please try again shortly, or visit the checkout page to request a fresh link."
      );
    }
    return pdf;
  }

  // PAID order download (existing secured flow, unchanged)
  const store = getStore();
  const order = store.get(recordId);
  if (!order || order.status !== "paid") {
    return htmlPage(403, "Not available", "This download is not available.", "Only verified purchases can download the ebook.");
  }
  if (order.fulfillment.downloadToken !== token) {
    // A newer link was issued for this order; the old one is superseded.
    return htmlPage(
      410,
      "Link expired",
      "This download link has been replaced by a newer one.",
      "Please use the latest link from your confirmation email, or request a fresh link from the checkout page with your purchase email address."
    );
  }

  try {
    store.consumeDownload(order.id, cfg.maxDownloadsPerOrder);
  } catch (err) {
    if (err instanceof OrderTransitionError) {
      return htmlPage(
        410,
        "Download limit reached",
        "This link has reached its download limit.",
        "If you need the ebook again, please contact us from your purchase email address and we will help."
      );
    }
    throw err;
  }

  const pdf = await serveEbook();
  if (!pdf) {
    return htmlPage(
      503,
      "Unavailable",
      "The ebook file is not available right now.",
      "Your purchase is safe. Please try again shortly or contact us from your purchase email address."
    );
  }
  return pdf;
}
