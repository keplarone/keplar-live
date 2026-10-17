import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-page share cards: /og/page?t=<title>&s=<sig>. pageMeta signs each page's own title on the server, and the route draws
 * a card only for a title it signed, so nobody can make keplar.one host an image with text of their choosing.
 * No secret configured: no signed URLs, and pages fall back to the site-wide card.
 */
const secret = () => process.env.OG_SIGNING_SECRET || process.env.BETTER_AUTH_SECRET || "";
export const OG_TITLE_MAX = 90;

export function ogSignature(title: string): string | null {
  const key = secret();
  return key ? createHmac("sha256", key).update(`og-page:${title}`).digest("base64url").slice(0, 22) : null;
}

/** The card URL for a page title, or null when cards can't be signed. */
export function pageOgUrl(title: string): string | null {
  const t = title.trim().slice(0, OG_TITLE_MAX);
  const sig = t ? ogSignature(t) : null;
  return sig ? `/og/page?t=${encodeURIComponent(t)}&s=${sig}` : null;
}

export function verifyOgTitle(title: string, sig: string): boolean {
  const want = ogSignature(title);
  if (!want || want.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
