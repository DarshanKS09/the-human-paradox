"use client";

import { useEffect, useState } from "react";
import { SECTION_LINKS, SITE, YOUTUBE_URL } from "@/config/site";

export default function Footer() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    // Defer past prerender so the year is always computed on the client.
    const frame = requestAnimationFrame(() => {
      setYear(new Date().getFullYear());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <footer className="border-t border-ink-line bg-[#080706] pb-[env(safe-area-inset-bottom)]">
      <div className="shell grid gap-10 py-14 sm:grid-cols-[1.2fr_1fr] md:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.18em] text-ivory sm:text-[13px] sm:tracking-[0.22em]">
            {SITE.wordmark}
          </p>
          <p className="mt-4 max-w-md leading-relaxed text-muted">
            {SITE.tagline}
          </p>
        </div>
        <nav aria-label="Footer" className="min-w-0">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <li>
              <a
                href={SECTION_LINKS.home}
                className="flex min-h-[44px] items-center text-muted transition-colors hover:text-ivory"
              >
                Home
              </a>
            </li>
            <li>
              <a
                href={SECTION_LINKS.ebook}
                className="flex min-h-[44px] items-center text-muted transition-colors hover:text-ivory"
              >
                Ebook
              </a>
            </li>
            <li>
              <a
                href={SECTION_LINKS.about}
                className="flex min-h-[44px] items-center text-muted transition-colors hover:text-ivory"
              >
                About
              </a>
            </li>
            <li>
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] items-center text-muted transition-colors hover:text-ivory"
              >
                YouTube
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink-line">
        <p className="shell py-6 text-xs tracking-wide text-faint">
          © {year ?? "—"} {SITE.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
