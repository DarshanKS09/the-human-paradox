/**
 * Single authoritative product definition.
 *
 * The price here is the ONLY price the server trusts. Checkout APIs must
 * never accept an amount supplied by the browser.
 */
export const PRODUCT = {
  id: "ymine-01",
  title: "Your Mind Is Not Your Enemy",
  brand: "The Human Paradox",
  /** Price in the smallest currency unit (paise). ₹49 = 4900 paise. */
  pricePaise: 4900,
  currency: "INR",
  priceLabel: "₹49",
  fileName: "Your-Mind-Is-Not-Your-Enemy.pdf",
} as const;

export type ProductId = typeof PRODUCT.id;
