export default function Hero() {
  return (
    <section
      id="home"
      aria-labelledby="hero-heading"
      className="grain relative flex min-h-svh flex-col overflow-hidden pt-16 sm:pt-[4.5rem]"
    >
      {/* Cinematic backdrop — pure CSS so the layout never depends on an external image */}
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_30%_35%,rgba(192,141,93,0.16),transparent_65%),radial-gradient(ellipse_60%_60%_at_75%_70%,rgba(154,123,79,0.12),transparent_60%),linear-gradient(to_bottom,#0c0a08,#14110d_60%,#0c0a08)]" />
        {/* Divided profile silhouette — desktop/tablet only, sized in viewport units */}
        <div className="absolute top-1/2 right-0 hidden h-[120%] w-[46%] max-w-[640px] -translate-y-1/2 opacity-60 md:block lg:w-[42%]">
          <div className="absolute inset-y-0 right-[12%] w-px bg-ivory/25" />
          <div className="absolute inset-y-[8%] right-[30%] w-[46%] rounded-t-full bg-[linear-gradient(160deg,#2b241c_0%,#171310_45%,#0c0a08_100%)] blur-[0.5px]" />
          <div className="absolute inset-y-[8%] right-[30%] w-[23%] rounded-t-full bg-[linear-gradient(200deg,rgba(192,141,93,0.28),transparent_70%)]" />
          <div
            className="absolute inset-y-[8%] right-[30%] w-[46%] rounded-t-full opacity-40"
            style={{
              background:
                "repeating-linear-gradient(0deg, transparent 0 5px, rgba(237,230,214,0.04) 5px 6px)",
            }}
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
      </div>

      <div className="shell relative flex w-full flex-1 flex-col justify-center py-[clamp(3rem,7vh,5.5rem)]">
        <div className="restrained-fade min-w-0">
          <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.28em]">
            <span aria-hidden="true" className="inline-block h-px w-10 shrink-0 bg-accent/70" />
            <span>PSYCHOLOGY · PHILOSOPHY · HUMAN BEHAVIOR</span>
          </p>
          <h1
            id="hero-heading"
            className="serif-display max-w-6xl text-[clamp(2.6rem,7.5vw,6rem)] leading-[1.02] font-light break-words text-ivory"
          >
            THE HUMAN MIND IS FULL OF{" "}
            <em className="font-normal text-accent not-italic sm:italic">
              CONTRA&shy;DICTIONS.
            </em>
          </h1>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end xl:gap-20">
            <div className="min-w-0">
              <p className="max-w-xl text-[clamp(1.05rem,1.5vw+0.75rem,1.25rem)] leading-relaxed text-muted">
                We seek the truth, yet defend our illusions. We crave
                connection, yet fear being understood. The Human Paradox
                explores the psychology behind who we are — and why we do what
                we do.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <a
                  href="#ebook"
                  className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent hover:text-ink sm:w-auto"
                >
                  Explore the Ebook
                </a>
                <a
                  href="#ideas"
                  className="inline-flex min-h-[48px] w-full items-center justify-center border border-ivory/25 px-8 py-4 text-sm tracking-wide text-ivory transition-colors hover:border-accent hover:text-accent sm:w-auto"
                >
                  Discover Our Ideas
                </a>
              </div>
              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-ink-line pt-6 text-sm sm:gap-x-10">
                <div>
                  <dt className="text-xs tracking-[0.2em] text-faint">
                    ISSUE Nº
                  </dt>
                  <dd className="serif-display mt-1 text-2xl text-ivory">01</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-[0.2em] text-faint">THEMES</dt>
                  <dd className="serif-display mt-1 text-2xl text-ivory">03</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-[0.2em] text-faint">
                    READING
                  </dt>
                  <dd className="serif-display mt-1 text-2xl text-ivory">
                    Slow
                  </dd>
                </div>
              </dl>
            </div>

            <figure className="relative hidden min-w-0 lg:block">
              <blockquote className="border-l border-accent/50 pl-6 text-[clamp(1.05rem,1.4vw+0.7rem,1.25rem)] leading-relaxed text-ivory/85 italic">
                “We are not one self, but many selves arguing quietly inside a
                single mind.”
              </blockquote>
              <figcaption className="mt-4 pl-6 text-xs tracking-[0.24em] text-faint">
                FROM THE JOURNAL
              </figcaption>
            </figure>
          </div>
        </div>
      </div>

      <div className="hairline relative" aria-hidden="true" />
    </section>
  );
}
