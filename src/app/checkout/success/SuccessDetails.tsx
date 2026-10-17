"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface OrderStatus {
  ok: boolean;
  code?: string;
  status?: "created" | "pending" | "paid" | "failed";
  productTitle?: string;
  amountLabel?: string;
  emailMasked?: string;
  paidAt?: string | null;
  emailSent?: boolean;
  downloadToken?: string | null;
  downloadExpiresAt?: string | null;
  downloadsRemaining?: number;
}

export default function SuccessDetails() {
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const rt = params.get("rt") ?? "";

  const [data, setData] = useState<OrderStatus | null>(() =>
    orderId && rt ? null : { ok: false, code: "MISSING_REF" }
  );
  const [loading, setLoading] = useState(() => Boolean(orderId && rt));

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}?rt=${encodeURIComponent(rt)}`
      );
      const body = (await res.json()) as OrderStatus;
      setData(body);
    } catch {
      setData({ ok: false, code: "NETWORK_ERROR" });
    } finally {
      setLoading(false);
    }
  }, [orderId, rt]);

  useEffect(() => {
    if (!orderId || !rt) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}?rt=${encodeURIComponent(rt)}`
        );
        const body = (await res.json()) as OrderStatus;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setData({ ok: false, code: "NETWORK_ERROR" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, rt]);

  if (loading) {
    return (
      <p role="status" className="text-muted">
        Checking your purchase status…
      </p>
    );
  }

  if (!data || !data.ok || !data.status) {
    return (
      <div>
        <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
          CONFIRMATION
        </p>
        <h1 className="serif-display mt-4 text-4xl font-light text-ivory">
          We could not find this purchase.
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          This confirmation link is invalid or has expired. If you completed a
          payment, go to the checkout page and use “Get a fresh download link”
          with your purchase email address — a verified purchase is always
          recoverable.
        </p>
        <a
          href="/checkout"
          className="mt-8 inline-flex min-h-[48px] items-center justify-center border border-ivory/25 px-8 py-4 text-sm text-ivory transition-colors hover:border-accent hover:text-accent"
        >
          Go to checkout
        </a>
      </div>
    );
  }

  if (data.status === "paid") {
    return (
      <div className="text-center sm:text-left">
        <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
          CONFIRMATION
        </p>
        <h1 className="serif-display mt-4 text-[clamp(2rem,5vw+1rem,3rem)] leading-tight font-light text-ivory">
          Your purchase is confirmed.
        </h1>
        <p className="mt-4 text-lg text-muted">
          {data.productTitle} · {data.amountLabel}
        </p>
        {data.downloadToken && (
          <a
            href={`/api/download/${encodeURIComponent(data.downloadToken)}`}
            className="mt-8 inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
          >
            Download Your Ebook
          </a>
        )}
        <div className="mt-8 border-t border-ink-line pt-6 text-left text-sm leading-relaxed text-muted">
          <p>
            A download link has been sent to {data.emailMasked ?? "your email address"}.
            {data.emailSent === false &&
              " If the email has not arrived within a few minutes, please check your spam folder — your download button above works regardless."}
          </p>
          {typeof data.downloadsRemaining === "number" && (
            <p className="mt-2 text-faint">
              {data.downloadsRemaining} download{data.downloadsRemaining === 1 ? "" : "s"} remaining
              on this link
              {data.downloadExpiresAt
                ? ` · valid until ${new Date(data.downloadExpiresAt).toLocaleString()}`
                : ""}
              .
            </p>
          )}
        </div>
      </div>
    );
  }

  if (data.status === "pending") {
    return (
      <div>
        <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
          CONFIRMATION
        </p>
        <h1 className="serif-display mt-4 text-4xl font-light text-ivory">
          Your payment is pending.
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          The gateway has not confirmed your payment yet. This usually resolves
          within a few minutes — your download will unlock automatically once
          confirmed.
        </p>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          className="mt-8 inline-flex min-h-[48px] items-center justify-center border border-ivory/25 px-8 py-4 text-sm text-ivory transition-colors hover:border-accent hover:text-accent"
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
        CONFIRMATION
      </p>
      <h1 className="serif-display mt-4 text-4xl font-light text-ivory">
        This payment did not go through.
      </h1>
      <p className="mt-4 leading-relaxed text-muted">
        No ebook access was granted for this order. If money left your account,
        it will be reversed by your bank or the gateway — otherwise please try
        again.
      </p>
      <a
        href="/checkout"
        className="mt-8 inline-flex min-h-[48px] items-center justify-center border border-ivory/25 px-8 py-4 text-sm text-ivory transition-colors hover:border-accent hover:text-accent"
      >
        Try again
      </a>
    </div>
  );
}
