import { EBOOK } from "@/config/site";

export default function EbookCover() {
  return (
    <div
      role="img"
      aria-label={`Ebook cover: ${EBOOK.title}`}
      className="grain relative aspect-[3/4] w-full overflow-hidden bg-[linear-gradient(165deg,#201913_0%,#12100c_55%,#0a0908_100%)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-ivory/15"
    >
      {/* Spine highlight */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[10px] bg-gradient-to-r from-black/70 via-white/10 to-transparent"
      />
      {/* Divided face motif */}
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute left-1/2 top-[16%] h-[46%] w-[52%] -translate-x-1/2 rounded-t-full bg-[linear-gradient(170deg,#3a2f22,#16120d_60%)]" />
        <div className="absolute left-1/2 top-[16%] h-[46%] w-[26%] -translate-x-0 rounded-tr-full bg-[linear-gradient(190deg,rgba(192,141,93,0.5),transparent_75%)]" />
        <div className="absolute left-1/2 top-0 h-full w-px bg-ivory/30" />
      </div>
      <div className="relative flex h-full flex-col justify-between p-8 pl-10">
        <p className="text-[10px] tracking-[0.32em] text-ivory/60">
          THE HUMAN PARADOX
        </p>
        <div>
          <h3 className="serif-display text-3xl font-light leading-tight text-ivory">
            Your Mind Is <em className="text-accent">Not</em> Your Enemy
          </h3>
          <div aria-hidden="true" className="my-4 h-px w-12 bg-accent/70" />
          <p className="text-[10px] tracking-[0.28em] text-muted">
            A REFLECTION ON THOUGHT
          </p>
        </div>
      </div>
    </div>
  );
}
