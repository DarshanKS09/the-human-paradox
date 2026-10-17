import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EbookCover from "@/components/EbookCover";
import CheckoutForm from "./CheckoutForm";
import FreeClaimForm from "./FreeClaimForm";
import RecoverLinkForm from "./RecoverLinkForm";
import { getServerConfig } from "@/lib/config";
import { PRODUCT } from "@/lib/product";

export const metadata: Metadata = {
  title: "Get Your Free Copy",
  description: `Get "${PRODUCT.title}" free. Enter your email and we will send the download link straight away. No payment, no account.`,
};

export default function CheckoutPage() {
  const cfg = getServerConfig();
  const freeMode = cfg.distributionMode === "FREE";
  // In FREE mode there is no payment to make, so no gateway credentials
  // are required to offer the claim flow.
  // FREE delivery needs a validated Drive link + token signing; PAID delivery
  // additionally needs a reachable PDF. Only offer what can actually work.
  const claimAvailable = freeMode
    ? cfg.downloadTokenSecret !== null && cfg.ebookDriveUrl !== null
    : cfg.payments !== null && cfg.downloadTokenSecret !== null;

  return (
    <>
      <Navbar />
      <main id="main" className="pt-16 sm:pt-[4.5rem]">
        <div className="shell section-pad grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start xl:gap-20">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
              CHECKOUT — FIRST RELEASE
            </p>
            <h1 className="serif-display mt-4 max-w-xl text-[clamp(2rem,4.5vw+1rem,3.25rem)] leading-[1.1] font-light text-ivory">
              {PRODUCT.title}
            </h1>
            <div className="mt-8 w-full max-w-[280px] sm:max-w-[320px]">
              <EbookCover />
            </div>
            <p className="mt-8 max-w-xl leading-relaxed text-muted">
              Explore the patterns of thought, inner conflicts, and mental
              habits that shape how you experience yourself and the world
              around you.
            </p>
            <p className="serif-display mt-6 text-4xl text-ivory">
              {freeMode ? "Free" : PRODUCT.priceLabel}
              <span className="ml-3 align-middle font-sans text-xs tracking-[0.2em] text-faint">
                {freeMode ? "DIGITAL PDF · FREE RELEASE" : "ONE-TIME · DIGITAL PDF"}
              </span>
            </p>
          </div>

          <div className="min-w-0 border border-ink-line bg-ink-soft p-6 sm:p-10">
            {claimAvailable ? (
              <>
                <h2 className="serif-display text-2xl font-normal text-ivory">
                  {freeMode ? "Get Your Free Copy" : "Complete your purchase"}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {freeMode ? (
                    <>
                      This ebook is free. Enter your email address and we will
                      email you the download link right away. No payment, no
                      account — just your copy.
                    </>
                  ) : (
                    <>
                      Enter your email address, then pay {PRODUCT.priceLabel}.
                      Your download link appears immediately after successful
                      payment and is also emailed to you. No account needed.
                    </>
                  )}
                </p>
                {freeMode ? <FreeClaimForm /> : <CheckoutForm />}
              </>
            ) : (
              <div>
                <h2 className="serif-display text-2xl font-normal text-ivory">
                  Checkout is being set up
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {freeMode
                    ? cfg.ebookDriveUrl
                      ? "Free ebook delivery is being set up. Please try again shortly — no payment is involved."
                      : "Free ebook delivery is almost ready. The download link has not been configured yet — please check back shortly."
                    : "Online payments for this ebook are not live yet. Purchasing will be available soon — thank you for your patience. No payment is possible on this page right now, and no demo or simulated checkout is offered."}
                </p>
              </div>
            )}

            {!freeMode && (
              <div className="mt-10 border-t border-ink-line pt-8">
                <h3 className="text-sm font-medium text-ivory">
                  Already purchased? Get a fresh download link
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Enter the email address you purchased with and we will send
                  a new time-limited link if your purchase is verified.
                </p>
                <RecoverLinkForm />
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
