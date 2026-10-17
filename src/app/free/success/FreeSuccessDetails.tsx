"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface ClaimStatus {
  ok: boolean;
  code?: string;
  emailSent?: boolean;
  driveUrl?: string | null;
}

/**
 * FREE-mode confirmation. It never claims a payment happened — the ebook
 * is free. The download button works only with the server-issued token,
 * and status is read back from the backend.
 */
export default function FreeSuccessDetails() {
  const params = useSearchParams();
  const claimId = params.get("claim") ?? "";
  const token = params.get("t") ?? "";

  const missingRef = !claimId || !token;
  const [status, setStatus] = useState<ClaimStatus | null>(() =>
    missingRef ? { ok: false, code: "MISSING_REF" } : null
  );
  const [loading, setLoading] = useState(!missingRef);

  useEffect(() => {
    if (missingRef) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/free/claim/${encodeURIComponent(claimId)}?t=${encodeURIComponent(token)}`
        );
        const body = (await res.json()) as ClaimStatus;
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) setStatus({ ok: false, code: "NETWORK_ERROR" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId, token, missingRef]);

  if (loading) {
    return (
      <p role="status" className="text-muted">
        Preparing your download…
      </p>
    );
  }

  if (!status || !status.ok) {
    return (
      <div>
        <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
          YOUR COPY
        </p>
        <h1 className="serif-display mt-4 text-4xl font-light text-ivory">
          We could not verify this link.
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          This download link has expired or is invalid. Go back to the checkout
          page and enter your email address again to request a fresh link.
        </p>
        <a
          href="/checkout"
          className="mt-8 inline-flex min-h-[48px] items-center justify-center border border-ivory/25 px-8 py-4 text-sm text-ivory transition-colors hover:border-accent hover:text-accent"
        >
          Get a fresh link
        </a>
      </div>
    );
  }

  return (
    <div className="text-center sm:text-left">
      <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
        YOUR COPY
      </p>
      <h1 className="serif-display mt-4 text-[clamp(2rem,5vw+1rem,3rem)] leading-tight font-light text-ivory">
        Your ebook is ready.
      </h1>
      <p className="mt-4 text-lg text-muted">
        Your Mind Is Not Your Enemy — Free
      </p>
      <a
        href={status.driveUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!status.driveUrl}
        className="mt-8 inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
      >
        Download Your Ebook
      </a>
      <div className="mt-8 border-t border-ink-line pt-6 text-left text-sm leading-relaxed text-muted">
        <p>
          {status.emailSent
            ? "We have also emailed this link to your address. If it has not arrived within a few minutes, please check your spam folder — the button above works regardless."
            : "We could not send the email just now, but the button above is ready to use. If you need the link again, return to the checkout page with the same email address."}
        </p>
        <p className="mt-2 text-faint">
          The file is hosted on Google Drive and opens in a new tab. The link is
          not password protected, so please avoid re-sharing it.
        </p>
      </div>
    </div>
  );
}