const THEMES = [
  {
    numeral: "I",
    title: "The Human Mind",
    text: "Cognitive biases, self-deception, perception, and the stories we tell ourselves.",
  },
  {
    numeral: "II",
    title: "The Emotional Self",
    text: "Fear, loneliness, attachment, vulnerability, and the need to belong.",
  },
  {
    numeral: "III",
    title: "The Uncomfortable Truth",
    text: "Ego, identity, contradictions, and the realities we often avoid.",
  },
] as const;

export default function Philosophy() {
  return (
    <section
      id="ideas"
      aria-labelledby="ideas-heading"
      className="relative scroll-mt-16 sm:scroll-mt-[4.5rem]"
    >
      <div className="shell section-pad">
        <p className="text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
          CHAPTER ONE — WHAT WE EXPLORE
        </p>
        <h2
          id="ideas-heading"
          className="serif-display mt-4 max-w-4xl text-[clamp(2rem,5vw+1rem,3.5rem)] leading-[1.08] font-light text-ivory"
        >
          THE THINGS WE DON&rsquo;T TALK ABOUT
        </h2>

        <div className="mt-10 grid gap-px bg-ink-line sm:mt-14 md:grid-cols-3">
          {THEMES.map((theme, i) => (
            <article
              key={theme.title}
              className={`group bg-ink p-6 transition-colors duration-300 hover:bg-ink-soft sm:p-8 xl:p-10 ${
                i === 1 ? "lg:-mt-6 lg:border-t-2 lg:border-t-accent/60" : ""
              }`}
            >
              <p className="serif-display text-sm tracking-[0.3em] text-faint transition-colors group-hover:text-accent">
                {theme.numeral}
              </p>
              <h3 className="serif-display mt-5 text-[clamp(1.35rem,1vw+1.1rem,1.6rem)] font-normal text-ivory">
                {theme.title}
              </h3>
              <div
                aria-hidden="true"
                className="mt-5 h-px w-10 bg-ivory/20 transition-all duration-300 group-hover:w-16 group-hover:bg-accent"
              />
              <p className="mt-5 leading-relaxed text-muted">{theme.text}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-faint">
          These are editorial reflections on human behavior — invitations to
          think, not substitutes for professional psychological support.
        </p>
      </div>
      <div className="hairline" aria-hidden="true" />
    </section>
  );
}
