"use client";

import { useState } from "react";
import { EBOOK } from "@/config/site";

export default function PurchaseButton() {
  const [notice, setNotice] = useState(false);
  const checkoutUrl = EBOOK.checkoutUrl.trim();

  if (checkoutUrl) {
    return (
      <a
        href={checkoutUrl}
        className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
      >
        {EBOOK.priceLabel}
      </a>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setNotice(true)}
        aria-live="polite"
        className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
      >
        {EBOOK.priceLabel}
      </button>
      {notice && (
        <p
          role="status"
          className="mt-4 max-w-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ivory"
        >
          {EBOOK.availabilityNote}
        </p>
      )}
      {!notice && (
        <p className="mt-4 max-w-md text-sm text-faint">
          Checkout is not live yet — tap to check availability.
        </p>
      )}
    </div>
  );
}
