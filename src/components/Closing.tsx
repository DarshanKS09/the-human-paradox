import { SECTION_LINKS } from "@/config/site";

export default function Closing() {
  return (
    <section
      aria-labelledby="closing-heading"
      className="grain relative overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_110%,rgba(192,141,93,0.14),transparent_65%)]"
      />
      <div className="shell-narrow section-pad relative text-center">
        <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
          A FINAL QUESTION
        </p>
        <h2
          id="closing-heading"
          className="serif-display mx-auto mt-6 max-w-3xl text-[clamp(2rem,5.5vw+1rem,3.75rem)] leading-[1.1] font-light text-ivory"
        >
          PERHAPS THE HARDEST PERSON TO UNDERSTAND IS YOURSELF.
        </h2>
        <p className="mx-auto mt-7 max-w-xl text-[clamp(1.05rem,1.5vw+0.75rem,1.25rem)] leading-relaxed text-muted">
          Question what you believe. Examine what you feel. Understand the
          person behind the thoughts.
        </p>
        <a
          href={SECTION_LINKS.ebook}
          className="mt-10 inline-flex min-h-[48px] w-full items-center justify-center border border-ivory/25 px-8 py-4 text-sm tracking-wide text-ivory transition-colors hover:border-accent hover:text-accent sm:w-auto"
        >
          Explore The Human Paradox
        </a>
      </div>
    </section>
  );
}
