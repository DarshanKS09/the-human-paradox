"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "sending" | "error";

/**
 * FREE distribution mode claim form.
 *
 * Contains no payment UI of any kind (no price, no methods, no pay
 * button). The mode itself is decided server-side; the browser cannot
 * request paid behavior from here.
 */
export default function FreeClaimForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
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
        claimId?: string;
        receiptToken?: string;
        code?: string;
        message?: string;
      };
      if (res.ok && body.ok && body.claimId && body.receiptToken) {
        router.push(
          `/free/success?claim=${encodeURIComponent(body.claimId)}&t=${encodeURIComponent(body.receiptToken)}`
        );
        return;
      }
      setStatus("error");
      setError(
        body.code === "INVALID_EMAIL"
          ? (body.message ?? "Enter a valid email address.")
          : body.code === "EBOOK_UNAVAILABLE"
            ? "The ebook link is not available right now. Please try again shortly."
            : body.code === "CLAIM_STORAGE_UNAVAILABLE"
              ? "We could not save your request right now. Please try again in a few minutes."
              : (body.message ??
                "We could not send your ebook right now. Please try again in a moment.")
      );
    } catch {
      setStatus("error");
      setError("Could not reach the server. Check your connection and retry.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate={false}>
      <div>
        <label htmlFor="free-email" className="block text-sm font-medium text-ivory">
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
          disabled={status === "sending"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "free-error" : "free-hint"}
          placeholder="you@example.com"
          className="mt-2 block min-h-[48px] w-full border border-ivory/25 bg-ink px-4 py-3 text-ivory placeholder:text-faint disabled:opacity-60"
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
        disabled={status === "sending"}
        className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Sending…" : "Send Me the Free Ebook"}
      </button>
    </form>
  );
}