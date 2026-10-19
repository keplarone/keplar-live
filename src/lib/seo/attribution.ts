/**
 * Coarse first-touch attribution for paid conversions: the landing page path, the source class (search, ai, social, direct,
 * other) and optional utm_source / utm_campaign, nothing else. Never the browser id, the referrer URL or any personal detail.
 * The browser stores it (consent-gated, src/lib/seo-events.ts) and sends it when checkout starts; the server allow-lists it
 * into the Whop checkout metadata; the verified webhook copies it onto the payment row (src/lib/billing/sync.ts), so revenue
 * can be reported by landing page on /admin/seo. It grants nothing and is never used for entitlements.
 */
import { SEO_SOURCES, type SeoSource } from "@/lib/seo/events";
import { collection } from "@/lib/create/platform/store";

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

type PaidRow = { id: string; workspaceId: string; at: string; plan?: string; amountUsd?: number; refundedAt?: string; attribution?: Attribution };
export type PaidByLanding = { landing: string; src: string; payments: number; amountUsd: number | null };

/** Paid plan payments of the last `days` days grouped by landing page and source class. Only rows the webhook stored with attribution count; the rest are reported as one "(no attribution)" line so the share is visible. */
export async function paidByLanding(days = 90, now = Date.now()): Promise<PaidByLanding[]> {
  const since = new Date(now - days * 864e5).toISOString();
  const rows = (await collection<PaidRow>("whop_payments").listSystem().catch(() => [])) as PaidRow[];
  const by = new Map<string, PaidByLanding>();
  for (const r of rows) {
    if (r.at < since || r.refundedAt) continue;
    const key = r.attribution ? `${r.attribution.landing}\u0000${r.attribution.src}` : "(no attribution)\u0000";
    const cur = by.get(key) ?? { landing: r.attribution?.landing ?? "(no attribution)", src: r.attribution?.src ?? "", payments: 0, amountUsd: null };
    cur.payments += 1;
    if (typeof r.amountUsd === "number") cur.amountUsd = (cur.amountUsd ?? 0) + r.amountUsd;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.payments - a.payments || a.landing.localeCompare(b.landing));
}
