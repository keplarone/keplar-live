/**
 * First-party, privacy-respecting search-to-activation measurement.
 *
 * What is stored (collection `seo_events`, see docs/seo/MEASUREMENT.md): the event name, the landing page path the visit started
 * on, a coarse source class (search / ai / social / direct / other), an optional utm_source and utm_campaign, an optional
 * placement label for CTA clicks, and a random per-browser id. NEVER stored: prompt text, uploads, emails, account ids,
 * IP addresses, user agents, referrer URLs. Collected only after the visitor allowed Analytics in the cookie banner
 * (the consent cookie is re-checked on the server); Global Privacy Control / Do Not Track visitors are skipped.
 * Retention: 180 days by default (KEPLAR_RETAIN_SEO_EVENTS_DAYS), pruned with the other telemetry.
 */
import { allows, parseRecord } from "@/lib/consent";
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";

export const SEO_EVENTS = [
  "landing_view",
  "cta_click",
  "signup_start",
  "signup_complete",
  "first_prompt",
  "synthesis_success",
  "pricing_view",
  "checkout_start",
  "subscription_complete",
  "experiment_exposure",
] as const;
export type SeoEvent = (typeof SEO_EVENTS)[number];
/** Coarse device class from the viewport (never the user agent string). */
export const SEO_DEVICES = ["mobile", "desktop"] as const;
export type SeoDevice = (typeof SEO_DEVICES)[number];
export const SEO_SOURCES = ["search", "ai", "social", "direct", "other", "internal"] as const;
export type SeoSource = (typeof SEO_SOURCES)[number];

export type SeoEventRow = {
  id: string;
  workspaceId: string;
  at: string;
  day: string;
  event: SeoEvent;
  landing: string;
  src: SeoSource;
  vid: string;
  where?: string;
  utmSource?: string;
  utmCampaign?: string;
  level?: string;
  dev?: SeoDevice;
};

const SYSTEM = "system";
const rows = () => collection<SeoEventRow>("seo_events");

const LEVELS = new Set(["consensus", "partial", "none", "single", "unscored"]);
const tag = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : undefined);

export type SeoInput = { event: SeoEvent; landing: string; src: SeoSource; vid: string; where?: string; utmSource?: string; utmCampaign?: string; level?: string; dev?: SeoDevice };

/** Strict allow-list validation. Anything else is dropped; free text never reaches the database. */
export function sanitizeSeoEvent(body: unknown): SeoInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const event = SEO_EVENTS.find((e) => e === b.e);
  if (!event) return null;
  const landing = tag(b.landing, /^(\/[a-z0-9][a-z0-9\-/]{0,79}|\/|\(unknown\))$/);
  const vid = tag(b.vid, /^[a-f0-9]{16,32}$/);
  const src = SEO_SOURCES.find((s) => s === b.src) ?? "other";
  if (!landing || !vid) return null;
  const level = typeof b.level === "string" && LEVELS.has(b.level) ? b.level : undefined;
  return {
    event,
    landing,
    src,
    vid,
    where: tag(b.where, /^[a-z0-9:_\-]{1,48}$/),
    utmSource: tag(b.utmSource, /^[\w.\-]{1,40}$/),
    utmCampaign: tag(b.utmCampaign, /^[\w.\-]{1,60}$/),
    level,
    dev: SEO_DEVICES.find((d) => d === b.dev),
  };
}

/** True when the request carries a consent cookie that allows analytics, and no GPC / DNT signal. */
export function consentOk(headers: Headers): boolean {
  if (headers.get("sec-gpc") === "1" || headers.get("dnt") === "1") return false;
  const m = /(?:^|;\s*)keplar_consent=([^;]+)/.exec(headers.get("cookie") ?? "");
  return Boolean(m && allows(parseRecord(m[1]), "analytics"));
}

export async function recordSeoEvent(input: SeoInput, at = new Date()): Promise<SeoEventRow> {
  const iso = at.toISOString();
  const row: SeoEventRow = { id: id("se"), workspaceId: SYSTEM, at: iso, day: iso.slice(0, 10), ...input };
  for (const k of Object.keys(row) as (keyof SeoEventRow)[]) if (row[k] === undefined) delete row[k];
  return rows().insert(row);
}

export const retainSeoDays = (env: Record<string, string | undefined> = process.env) => {
  const n = Number(env.KEPLAR_RETAIN_SEO_EVENTS_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 180;
};

export async function pruneSeoEvents(at = Date.now(), batch = 5000): Promise<number> {
  return rows().purgeSystemBefore("at", new Date(at - retainSeoDays() * 864e5).toISOString(), batch);
}

/* ── reporting ─────────────────────────────────────────────────────────────── */

export type LandingStats = { landing: string; views: number; ctaClicks: number; signups: number; firstPrompts: number; syntheses: number; bySource: Partial<Record<SeoSource, number>> };

/** Distinct browsers per event per landing page, over the last `days` days. Pure over rows so it is easy to test. */
export function summarize(list: SeoEventRow[]): LandingStats[] {
  const by = new Map<string, { sets: Record<SeoEvent, Set<string>>; src: Map<SeoSource, Set<string>> }>();
  for (const r of list) {
    let e = by.get(r.landing);
    if (!e) by.set(r.landing, (e = { sets: Object.fromEntries(SEO_EVENTS.map((k) => [k, new Set<string>()])) as Record<SeoEvent, Set<string>>, src: new Map() }));
    e.sets[r.event].add(r.vid);
    if (r.event === "landing_view") (e.src.get(r.src) ?? e.src.set(r.src, new Set()).get(r.src)!).add(r.vid);
  }
  return [...by.entries()]
    .map(([landing, e]) => ({
      landing,
      views: e.sets.landing_view.size,
      ctaClicks: e.sets.cta_click.size,
      signups: e.sets.signup_complete.size,
      firstPrompts: e.sets.first_prompt.size,
      syntheses: e.sets.synthesis_success.size,
      bySource: Object.fromEntries([...e.src].map(([k, v]) => [k, v.size])),
    }))
    .sort((a, b) => b.views - a.views);
}

export async function seoReport(days = 28, at = Date.now()): Promise<LandingStats[]> {
  const gte = new Date(at - days * 864e5).toISOString();
  return summarize(await rows().listSystemRange({ field: "at", gte }, 50_000));
}

/** Report plus the clock it was built with, so pages can compute ages without calling Date.now() during render. */
export async function seoSnapshot(days = 28): Promise<{ at: number; report: LandingStats[] | null }> {
  const at = Date.now();
  return { at, report: await seoReport(days, at).catch(() => null) };
}

/* ── funnel ────────────────────────────────────────────────────────────────── */

/** The funnel in order. Each step's rate uses the step before it as the denominator, so every percentage says what it is out of. */
export const FUNNEL_STEPS: { event: SeoEvent; label: string }[] = [
  { event: "landing_view", label: "Visited a public page" },
  { event: "cta_click", label: "Clicked a call to action" },
  { event: "signup_start", label: "Opened sign-up" },
  { event: "signup_complete", label: "Created an account" },
  { event: "first_prompt", label: "Asked a first question" },
  { event: "synthesis_success", label: "Saw a combined answer" },
];
/** Separate, because people reach pricing from anywhere (it is not a step after the first answer). */
export const REVENUE_STEPS: { event: SeoEvent; label: string }[] = [
  { event: "pricing_view", label: "Viewed pricing" },
  { event: "checkout_start", label: "Chose a plan" },
  { event: "subscription_complete", label: "Finished checkout" },
];

export type FunnelRow = { event: SeoEvent; label: string; browsers: number; ofPrevious: number | null; previous: number | null };
export type FunnelReport = { steps: FunnelRow[]; revenue: FunnelRow[]; byDevice: Record<SeoDevice | "unknown", FunnelRow[]> };

function steps(list: SeoEventRow[], order: { event: SeoEvent; label: string }[]): FunnelRow[] {
  const sets = new Map<SeoEvent, Set<string>>(order.map((s) => [s.event, new Set()]));
  for (const r of list) sets.get(r.event)?.add(r.vid);
  return order.map((s, i) => {
    const n = sets.get(s.event)!.size;
    const prev = i ? sets.get(order[i - 1].event)!.size : null;
    return { event: s.event, label: s.label, browsers: n, previous: prev, ofPrevious: prev ? n / prev : null };
  });
}

/** Distinct browsers per funnel step, overall and per device class. Pure over rows. */
export function funnel(list: SeoEventRow[]): FunnelReport {
  const dev = (d: SeoDevice | "unknown") => list.filter((r) => (r.dev ?? "unknown") === d);
  return {
    steps: steps(list, FUNNEL_STEPS),
    revenue: steps(list, REVENUE_STEPS),
    byDevice: { mobile: steps(dev("mobile"), FUNNEL_STEPS), desktop: steps(dev("desktop"), FUNNEL_STEPS), unknown: steps(dev("unknown"), FUNNEL_STEPS) },
  };
}

/** Raw rows for the last `days` days (admin reports build funnels and experiment results from them). */
export async function seoRows(days = 28, at = Date.now()): Promise<SeoEventRow[]> {
  return rows().listSystemRange({ field: "at", gte: new Date(at - days * 864e5).toISOString() }, 50_000);
}
