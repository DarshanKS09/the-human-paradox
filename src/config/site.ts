/**
 * Single source of truth for brand, links, and product configuration.
 *
 * - YOUTUBE_URL: replace with the real channel URL when available.
 * - EBOOK_CHECKOUT_URL: leave as an empty string until a real checkout /
 *   product URL exists. When empty, the purchase CTA shows a
 *   "coming soon" notice instead of redirecting anywhere.
 */

export const SITE = {
  name: "The Human Paradox",
  wordmark: "THE HUMAN PARADOX",
  tagline:
    "A psychology, human behavior, and philosophy journal on the contradictions of the mind.",
  description:
    "The Human Paradox explores the psychology behind who we are — and why we do what we do. Essays on the mind, emotions, ego, identity, and uncomfortable truths.",
  url: "https://thehumanparadox.example.com",
  themeColor: "#0c0a08",
  locale: "en_US",
} as const;

export const YOUTUBE_URL: string =
  "https://www.youtube.com/@the_HumanParadox";
// TODO(owner): replace YOUTUBE_URL above with the real channel URL.

export const EBOOK = {
  title: "Your Mind Is Not Your Enemy",
  price: "₹49",
  priceLabel: "Get the Ebook — ₹49",
  description:
    "Explore the patterns of thought, inner conflicts, and mental habits that shape how you experience yourself and the world around you.",
  benefits: [
    {
      title: "Notice your patterns",
      text: "A reflective framework for observing recurring thoughts without judging them.",
    },
    {
      title: "Name inner conflicts",
      text: "Language for the contradictions between what you feel, want, and do.",
    },
    {
      title: "Question the narrator",
      text: "Gentle prompts to examine the stories you tell about yourself.",
    },
  ],
  // Leave empty until a real product/checkout URL is ready.
  checkoutUrl: "",
  availabilityNote:
    "Our ebook checkout is not live yet. Purchasing will be available soon — thank you for your patience.",
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "The Ebook", href: "#ebook" },
  { label: "About", href: "#about" },
] as const;
