"use client";

import { useState } from "react";
import { NAV_LINKS, SECTION_LINKS, SITE } from "@/config/site";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-ink-line bg-ink/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="shell flex h-16 min-h-[4rem] items-center justify-between gap-4 sm:h-[4.5rem]"
      >
        <a
          href={SECTION_LINKS.home}
          className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.18em] text-ivory sm:flex-none sm:text-[13px] sm:tracking-[0.22em]"
        >
          {SITE.wordmark}
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-muted transition-colors hover:text-ivory"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <a
            href={SECTION_LINKS.ebook}
            className="inline-flex items-center border border-ivory/25 px-5 py-2.5 text-sm text-ivory transition-colors hover:border-accent hover:text-accent"
          >
            Explore the Ebook
          </a>
        </div>

        <button
          type="button"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-ivory md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="border-t border-ink-line bg-ink pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul className="shell space-y-1 py-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] items-center py-2 text-base text-ivory"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="pt-2">
              <a
                href={SECTION_LINKS.ebook}
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] items-center justify-center border border-ivory/25 px-5 py-3 text-center text-sm text-ivory"
              >
                Explore the Ebook
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
