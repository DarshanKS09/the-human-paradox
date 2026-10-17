import { describe, expect, it } from "vitest";
import { NAV_LINKS, SECTION_LINKS } from "@/config/site";

/**
 * Navigation must work from EVERY page (the header/footer are shared by the
 * landing page, checkout and the paid confirmation page). Bare hash links
 * such as "#ebook" resolve against the current path and broke on /checkout.
 */
describe("primary navigation links", () => {
  it("Home points at the site root, not the current page", () => {
    const home = NAV_LINKS.find((l) => l.label === "Home");
    expect(home?.href).toBe("/");
  });

  it("section links use absolute root paths with anchors", () => {
    expect(NAV_LINKS.find((l) => l.label === "The Ebook")?.href).toBe("/#ebook");
    expect(NAV_LINKS.find((l) => l.label === "About")?.href).toBe("/#about");
  });

  it("never emits a bare hash link (they break on non-home routes)", () => {
    for (const link of NAV_LINKS) {
      expect(link.href).not.toMatch(/^#/);
      expect(link.href.startsWith("/")).toBe(true);
    }
  });

  it("exposes the landing anchors used by header, hero, footer and CTAs", () => {
    expect(SECTION_LINKS).toEqual({
      home: "/",
      ebook: "/#ebook",
      ideas: "/#ideas",
      about: "/#about",
      checkout: "/checkout",
    });
  });

  it("keeps the free CTA pointing at the checkout page", () => {
    expect(SECTION_LINKS.checkout).toBe("/checkout");
  });
});