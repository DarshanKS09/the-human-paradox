"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * FREE distribution form: one email input, one button. On success the
 * server confirms the SMTP provider accepted the message, and the Google
 * Drive link is offered directly.
 *
 * Contains no payment UI (no price, no methods, no pay button). The mode
 * is decided server-side and cannot be overridden from the browser.
 */
export default function FreeClaimForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  const busy = status === "sending";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setStatus("error");
      setError("Enter a valid email address so we can send your copy.");
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/free/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        emailAccepted?: boolean;
        driveUrl?: string;
        code?: string;
        message?: string;
      };

      if (res.ok && body.ok && body.emailAccepted) {
        setDriveUrl(body.driveUrl ?? null);
        setStatus("sent");
        return;
      }

      setStatus("error");
      setError(mapError(body.code, body.message));
    } catch {
      setStatus("error");
      setError("Could not reach the server. Check your connection and retry.");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-6">
        <p
          role="status"
          className="border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ivory"
        >
          Your ebook is on its way — we have emailed the download link to{" "}
          <span className="font-medium">{email.trim()}</span>. If it does not
          arrive within a few minutes, please check your spam folder.
        </p>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent sm:w-auto"
          >
            Download Your Ebook
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setDriveUrl(null);
            setEmail("");
          }}
          className="mt-4 block text-sm text-muted underline underline-offset-4 hover:text-ivory"
        >
          Send to a different email address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4 sm:mt-6 sm:space-y-5" noValidate={false}>
      <div>
        <label
          htmlFor="free-email"
          className="block text-sm font-medium text-ivory"
        >
          Email address
        </label>
        <input
          id="free-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "free-error" : "free-hint"}
          placeholder="you@example.com"
          className="mt-2 block min-h-[52px] w-full border border-ivory/25 bg-ink px-4 py-3 text-base text-ivory placeholder:text-faint disabled:opacity-60"
          enterKeyHint="send"
          inputMode="email"
        />
        <p id="free-hint" className="mt-2 text-xs leading-relaxed text-faint">
          We send your download link here. No account is created, and we never
          ask for payment details.
        </p>
      </div>

      {error && (
        <p
          id="free-error"
          role="alert"
          className="border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ivory"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[52px] w-full items-center justify-center bg-ivory px-8 py-4 text-base font-medium tracking-wide text-ink transition-colors hover:bg-accent disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Sending…" : "Send Me the Free Ebook"}
      </button>
    </form>
  );
}

function mapError(code?: string, message?: string): string {
  switch (code) {
    case "INVALID_EMAIL":
      return message ?? "Enter a valid email address.";
    case "EBOOK_UNAVAILABLE":
      return "The ebook link is not available right now. Please try again shortly.";
    case "EMAIL_NOT_CONFIGURED":
      return "Email delivery is not set up yet. Please try again later.";
    case "ALREADY_SENT":
      return message ?? "We already sent your copy a moment ago. Please check your inbox.";
    default:
      return message ?? "We could not send the email just now. Please try again in a moment.";
  }
}