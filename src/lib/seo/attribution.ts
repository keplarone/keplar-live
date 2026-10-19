/**
 * Coarse first-touch attribution for paid conversions: the landing page path, the source class (search, ai, social, direct,
 * other) and optional utm_source / utm_campaign, nothing else. Never the browser id, the referrer URL or any personal detail.
 * The browser stores it (consent-gated, src/lib/seo-events.ts) and sends it when checkout starts; the server allow-lists it
 * into the Whop checkout metadata; the verified webhook copies it onto the payment row (src/lib/billing/sync.ts), so revenue
 * can be reported by landing page on /admin/seo (src/lib/seo/attribution-report.ts). This module is pure and shared with the
 * browser (checkout sends it), so it imports neither the store nor src/lib/seo/events.ts. It grants nothing and is never used for entitlements.
 */
import { SEO_SOURCES, type SeoSource } from "@/lib/seo/sources";

export type Attribution = { landing: string; src: SeoSource; utmSource?: string; utmCampaign?: string };

const LANDING = /^(\/[a-z0-9][a-z0-9\-/]{0,79}|\/|\(unknown\))$/;
const UTM_SOURCE = /^[\w.\-]{1,40}$/;
const UTM_CAMPAIGN = /^[\w.\-]{1,60}$/;

/** Strict allow-list validation of a browser-supplied attribution object; anything else is dropped. */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const landing = typeof b.landing === "string" && LANDING.test(b.landing) ? b.landing : null;
  const src = SEO_SOURCES.find((s) => s === b.src);
  if (!landing || !src) return null;
  return {
    landing,
    src,
    ...(typeof b.utmSource === "string" && UTM_SOURCE.test(b.utmSource) ? { utmSource: b.utmSource } : {}),
    ...(typeof b.utmCampaign === "string" && UTM_CAMPAIGN.test(b.utmCampaign) ? { utmCampaign: b.utmCampaign } : {}),
  };
}

/** The checkout metadata keys for an attribution (flat strings, as Whop metadata requires). */
export function attributionMetadata(a: Attribution | null | undefined): Record<string, string> {
  if (!a) return {};
  return { landing: a.landing, src: a.src, ...(a.utmSource ? { utm_source: a.utmSource } : {}), ...(a.utmCampaign ? { utm_campaign: a.utmCampaign } : {}) };
}

/** Read an attribution back out of payment metadata (untrusted: validated again). */
export function attributionFromMetadata(md: Record<string, unknown> | null | undefined): Attribution | null {
  if (!md) return null;
  return sanitizeAttribution({ landing: md.landing, src: md.src, utmSource: md.utm_source, utmCampaign: md.utm_campaign });
}
