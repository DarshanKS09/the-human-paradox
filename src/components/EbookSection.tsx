import EbookCover from "./EbookCover";
import PurchaseButton from "./PurchaseButton";
import { EBOOK } from "@/config/site";

export default function EbookSection() {
  return (
    <section
      id="ebook"
      aria-labelledby="ebook-heading"
      className="grain relative scroll-mt-16 bg-ink-soft"
    >
      <div className="shell section-pad grid gap-12 sm:gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center xl:gap-20">
        <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[340px] lg:mx-0 lg:max-w-none xl:max-w-[440px]">
          <p
            aria-hidden="true"
            className="serif-display pointer-events-none absolute -top-[clamp(2rem,4vw,3rem)] left-0 text-[clamp(4rem,8vw,5.5rem)] leading-none text-ivory/[0.05] select-none"
          >
            01
          </p>
          <EbookCover />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
            FEATURED EBOOK — FIRST RELEASE
          </p>
          <h2
            id="ebook-heading"
            className="serif-display mt-4 max-w-xl text-[clamp(2rem,4.5vw+1rem,3.25rem)] leading-[1.1] font-light text-ivory"
          >
            Your Mind Is Not Your Enemy
          </h2>
          <p className="mt-6 max-w-xl text-[clamp(1.05rem,1.5vw+0.75rem,1.25rem)] leading-relaxed text-muted">
            {EBOOK.description}
          </p>

          <ul className="mt-8 max-w-xl space-y-5">
            {EBOOK.benefits.map((b, i) => (
              <li key={b.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="serif-display mt-0.5 shrink-0 text-sm text-accent"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium text-ivory">{b.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">
                    {b.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-ink-line pt-8">
            <p className="serif-display text-[clamp(2rem,3vw+1.25rem,2.5rem)] text-ivory">
              {EBOOK.price}
              <span className="ml-3 align-middle font-sans text-xs tracking-[0.2em] text-faint">
                ONE-TIME · DIGITAL
              </span>
            </p>
          </div>
          <div className="mt-6">
            <PurchaseButton />
          </div>
        </div>
      </div>
      <div className="hairline" aria-hidden="true" />
    </section>
  );
}
