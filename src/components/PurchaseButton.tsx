import { EBOOK } from "@/config/site";
import { getServerConfig } from "@/lib/config";

/**
 * Landing-page ebook CTA. Free mode links to the free claim checkout;
 * paid mode keeps the configured (or on-site) paid checkout URL.
 * The mode is resolved on the server and cannot be chosen by the client.
 */
export default function PurchaseButton() {
  const freeMode = getServerConfig().distributionMode === "FREE";
  const checkoutUrl = EBOOK.checkoutUrl.trim();

  if (freeMode) {
    return (
      <div className="min-w-0">
        <a
          href="/checkout"
          className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
        >
          Get Your Free Ebook
        </a>
        <p className="mt-4 max-w-md text-sm text-faint">
          Free release · Instant PDF delivery to your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <a
        href={checkoutUrl || "/checkout"}
        {...(checkoutUrl
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
      >
        {EBOOK.priceLabel}
      </a>
      <p className="mt-4 max-w-md text-sm text-faint">
        Secure checkout · Instant PDF delivery after payment.
      </p>
    </div>
  );
}