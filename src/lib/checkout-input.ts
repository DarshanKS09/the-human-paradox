import { PRODUCT } from "./product";
import { isValidEmail, isValidProductId, normalizeEmail } from "./validate";

export class CheckoutInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CheckoutInputError";
    this.code = code;
  }
}

export interface ParsedCheckoutInput {
  email: string;
  productId: string;
  idempotencyKey: string | null;
}

/**
 * Validates checkout input. A browser-supplied amount is NEVER trusted:
 * when present and different from the server price, the request is
 * rejected outright.
 */
export function parseCheckoutInput(body: unknown): ParsedCheckoutInput {
  if (typeof body !== "object" || body === null) {
    throw new CheckoutInputError("INVALID_BODY", "Request body must be valid JSON.");
  }
  const { email, productId, amountPaise, idempotencyKey } = body as Record<string, unknown>;

  if (!isValidEmail(email)) {
    throw new CheckoutInputError("INVALID_EMAIL", "Enter a valid email address.");
  }
  if (!isValidProductId(productId)) {
    throw new CheckoutInputError("UNKNOWN_PRODUCT", "Unknown product.");
  }
  if (amountPaise !== undefined && amountPaise !== null && amountPaise !== PRODUCT.pricePaise) {
    throw new CheckoutInputError(
      "AMOUNT_MISMATCH",
      "The purchase amount does not match the product price."
    );
  }

  return {
    email: normalizeEmail(email as string),
    productId: PRODUCT.id,
    idempotencyKey:
      typeof idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)
        ? idempotencyKey
        : null,
  };
}
