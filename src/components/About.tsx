export default function About() {
  return (
    <section id="about" aria-labelledby="about-heading" className="scroll-mt-16">
      <div className="shell section-pad grid gap-10 md:grid-cols-[0.9fr_1.1fr] lg:grid-cols-[0.8fr_1.2fr] xl:gap-16">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
            ABOUT
          </p>
          <h2
            id="about-heading"
            className="serif-display mt-4 text-[clamp(2rem,4.5vw+1rem,3.25rem)] leading-[1.1] font-light text-ivory"
          >
            A journal of the inner life.
          </h2>
        </div>
        <div className="min-w-0 space-y-6 text-[clamp(1.05rem,1.5vw+0.75rem,1.25rem)] leading-relaxed text-muted lg:pt-12">
          <p>
            The Human Paradox is a psychology and philosophy publication about
            the contradictions we live with — the gap between who we are and
            who we believe ourselves to be.
          </p>
          <p>
            Through essays, reflections, and videos, we examine ego, emotion,
            identity, and relationships — not to fix the mind, but to
            understand it more honestly.
          </p>
          <p className="border-l border-accent/50 pl-5 text-ivory/85 italic">
            We publish slowly, and only what is worth sitting with.
          </p>
        </div>
      </div>
      <div className="hairline" aria-hidden="true" />
    </section>
  );
}
