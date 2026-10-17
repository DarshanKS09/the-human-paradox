import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { getFreeClaimStore, jsonError, rateLimitOr429 } from "@/lib/http";
import { isValidClaimId } from "@/lib/free-claims";
import { verifyToken, PURPOSE_FREE_DOWNLOAD } from "@/lib/tokens";

/**
 * Claim status lookup (FREE mode only). Requires the same HMAC token that
 * was issued for the download, so claim records cannot be enumerated.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const limited = rateLimitOr429(req, "free-claim-status", 60, 60_000);
  if (limited) return limited;

  const cfg = getServerConfig();
  if (cfg.distributionMode !== "FREE" || !cfg.downloadTokenSecret) {
    return jsonError(404, "NOT_AVAILABLE", "Not found.");
  }

  const { claimId } = await params;
  if (!isValidClaimId(claimId)) {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }
  const token = new URL(req.url).searchParams.get("t");
  const verified = verifyToken(
    cfg.downloadTokenSecret,
    PURPOSE_FREE_DOWNLOAD,
    token ?? ""
  );
  if (!verified || verified.orderId !== claimId) {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }

  const claim = await getFreeClaimStore().getById(claimId);
  if (!claim || claim.downloadToken !== token) {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }

  return NextResponse.json({
    ok: true,
    claimId: claim.id,
    emailSent: claim.emailError === null && claim.emailCount > 0,
    downloadExpiresAt: claim.tokenExpiresAt,
    downloadsRemaining: Math.max(0, cfg.freeMaxDownloadsPerClaim - claim.downloadCount),
  });
}