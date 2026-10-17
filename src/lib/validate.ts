import { PRODUCT } from "./product";

export const EMAIL_MAX_LENGTH = 254;

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  // Practical RFC-5322 subset: one @, dot in domain, no spaces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidProductId(value: unknown): boolean {
  return value === PRODUCT.id;
}

/** Unguessable internal order IDs look like `ord_<32 hex chars>`. */
export function isValidOrderId(value: unknown): boolean {
  return typeof value === "string" && /^ord_[0-9a-f]{32}$/.test(value);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.length > 0 ? local[0] : "*";
  return `${head}***@${domain}`;
}
