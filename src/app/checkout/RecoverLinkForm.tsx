"use client";

import { useState } from "react";

/**
 * Paid-mode recovery form: re-issues a protected download link for a
 * verified purchase. Not rendered in FREE mode (the free claim flow is a
 * single form).
 */
export default function RecoverLinkForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/download/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // Generic message below covers network failure too.
    } finally {
      setBusy(false);
      setDone(true);
    }
  }

  if (done) {
    return (
      <p role="status" className="mt-4 text-sm leading-relaxed text-muted">
        If a completed purchase exists for this email address, a fresh download
        link is on its way. Please also check your spam folder.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
      <label htmlFor="recover-email" className="sr-only">
        Email address
      </label>
      <input
        id="recover-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        placeholder="you@example.com"
        className="block min-h-[48px] w-full border border-ivory/25 bg-ink px-4 py-3 text-ivory placeholder:text-faint disabled:opacity-60 sm:flex-1"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[48px] items-center justify-center border border-ivory/25 px-6 py-3 text-sm text-ivory transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {busy ? "Sending…" : "Get a fresh link"}
      </button>
    </form>
  );
}
