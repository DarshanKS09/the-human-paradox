"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT } from "@/lib/product";

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, callback: () => void): void;
}

interface RazorpayConstructor {
  new (options: {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    prefill: { email: string };
    theme: { color: string };
    handler(response: RazorpayHandlerResponse): void;
  }): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

type Status = "idle" | "creating" | "paying" | "verifying" | "error";

function loadRazorpayScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Payment widget could not be loaded. Check your connection and retry."));
    document.body.appendChild(script);
  });
}

function newIdempotencyKey(): string {
  // Called only from the submit handler, never during render/prerender:
  // crypto values are unstable at build time.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e12).toString(36)}`.slice(0, 32);
}

export default function CheckoutForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Lazily created on first submit: stable across retries of the same
  // attempt, but never evaluated during render/prerender.
  const idempotencyKeyRef = useRef<string | null>(null);

  const busy = status === "creating" || status === "paying" || status === "verifying";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    // Stable per attempt, so a retried submission reuses the same order
    // instead of creating a second one.
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
    const idempotencyKey = idempotencyKeyRef.current;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError("Enter a valid email address to receive your download link.");
      return;
    }

    setStatus("creating");
    let order: {
      ok: boolean;
      code?: string;
      message?: string;
      orderId?: string;
      gatewayOrderId?: string;
      keyId?: string;
      receiptToken?: string;
      status?: string;
    };
    try {
      const res = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          productId: PRODUCT.id,
          idempotencyKey,
        }),
      });
      order = (await res.json()) as typeof order;
    } catch {
      setStatus("error");
      setError("Could not reach the server. Check your connection and retry.");
      return;
    }

    if (!order.ok) {
      setStatus("error");
      if (order.status === "paid" && order.orderId && order.receiptToken) {
        router.push(`/checkout/success?order=${encodeURIComponent(order.orderId)}&rt=${encodeURIComponent(order.receiptToken)}`);
        return;
      }
      setError(
        order.code === "PAYMENTS_NOT_CONFIGURED"
          ? "Online payments are not live yet. Please try again later."
          : (order.message ?? "Could not start the payment. Please try again.")
      );
      return;
    }
    if (!order.orderId || !order.gatewayOrderId || !order.keyId || !order.receiptToken) {
      setStatus("error");
      setError("The server returned an incomplete order. Please try again.");
      return;
    }

    try {
      await loadRazorpayScript();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Payment widget failed to load.");
      return;
    }

    const RazorpayCtor = window.Razorpay;
    if (!RazorpayCtor) {
      setStatus("error");
      setError("Payment widget failed to load. Please try again.");
      return;
    }

    setStatus("paying");
    const { orderId, gatewayOrderId, keyId, receiptToken } = order;
    const rzp = new RazorpayCtor({
      key: keyId,
      amount: PRODUCT.pricePaise,
      currency: PRODUCT.currency,
      name: PRODUCT.brand,
      description: PRODUCT.title,
      order_id: gatewayOrderId,
      prefill: { email: trimmed },
      theme: { color: "#0c0a08" },
      handler: async (response) => {
        setStatus("verifying");
        try {
          const verifyRes = await fetch("/api/checkout/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          });
          const result = (await verifyRes.json()) as {
            ok: boolean;
            status?: string;
            message?: string;
          };
          if (result.ok && result.status === "paid") {
            router.push(`/checkout/success?order=${encodeURIComponent(orderId)}&rt=${encodeURIComponent(receiptToken)}`);
            return;
          }
          if (result.ok && result.status === "pending") {
            router.push(`/checkout/success?order=${encodeURIComponent(orderId)}&rt=${encodeURIComponent(receiptToken)}`);
            return;
          }
          setStatus("error");
          setError(result.message ?? "The payment could not be confirmed.");
        } catch {
          setStatus("error");
          setError(
            "Payment completed at the gateway but confirmation failed. Use “Get a fresh download link” below with your email — your purchase will be recognized once verified."
          );
        }
      },
    });
    rzp.on("payment.failed", () => {
      setStatus("error");
      setError("The payment did not go through. No amount was charged for a failed payment — please try again.");
    });
    rzp.open();
    // Razorpay Checkout runs in its own modal; keep status until it resolves.
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate={false}>
      <div>
        <label htmlFor="checkout-email" className="block text-sm font-medium text-ivory">
          Email address
        </label>
        <input
          id="checkout-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "checkout-error" : "checkout-email-hint"}
          placeholder="you@example.com"
          className="mt-2 block min-h-[48px] w-full border border-ivory/25 bg-ink px-4 py-3 text-ivory placeholder:text-faint disabled:opacity-60"
        />
        <p id="checkout-email-hint" className="mt-2 text-xs leading-relaxed text-faint">
          Your download link and receipt are sent here. No account is created.
        </p>
      </div>

      {error && (
        <p id="checkout-error" role="alert" className="border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ivory">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[48px] w-full items-center justify-center bg-ivory px-8 py-4 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-accent disabled:opacity-60 sm:w-auto"
      >
        {status === "creating" && "Starting secure checkout…"}
        {status === "paying" && "Waiting for payment…"}
        {status === "verifying" && "Confirming payment…"}
        {(status === "idle" || status === "error") && `Pay ${PRODUCT.priceLabel}`}
      </button>

      {busy && (
        <p role="status" className="text-sm text-muted">
          Do not close this page while your payment is being processed.
        </p>
      )}
    </form>
  );
}
