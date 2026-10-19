/**
 * Google Search Console: impressions, clicks, CTR and position by page or query, and the sitemap submission state, read
 * with a service account the owner adds to the Search Console property. Nothing here is estimated: when the credentials
 * are not set, every function reports "not configured" and the admin page says so.
 *
 * Setup (owner): create a service account in Google Cloud, enable the Search Console API, add the service account's email
 * as a user of the property, then set GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY (the PEM, with \n for newlines) and optionally
 * GSC_SITE_URL (default sc-domain:keplar.one) in Vercel. The key is signed here with node:crypto; no SDK is used.
 */
import { createSign } from "node:crypto";

export type GscConfig = { clientEmail: string; privateKey: string; siteUrl: string };
export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type GscQuery = { days: number; dimensions: ("page" | "query" | "date" | "device" | "country")[]; rowLimit?: number; now?: number };
export type GscSitemap = { path: string; lastSubmitted?: string; lastDownloaded?: string; errors?: number; warnings?: number; submitted?: number; indexed?: number | null };

export function gscConfig(env: Record<string, string | undefined> = process.env): GscConfig | null {
  const clientEmail = env.GSC_CLIENT_EMAIL?.trim();
  const privateKey = env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey, siteUrl: env.GSC_SITE_URL?.trim() || "sc-domain:keplar.one" };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A signed JWT assertion for the OAuth 2 service-account flow (RS256, read-only Search Console scope, one hour). */
export function serviceAccountAssertion(cfg: GscConfig, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: cfg.clientEmail, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(cfg.privateKey).toString("base64url")}`;
}

/** The Search Analytics request body for the last `days` full days (yesterday back), by the given dimensions. */
export function searchAnalyticsBody(q: GscQuery): { startDate: string; endDate: string; dimensions: string[]; rowLimit: number; dataState: "final" } {
  const now = q.now ?? Date.now();
  const day = (d: number) => new Date(now - d * 864e5).toISOString().slice(0, 10);
  return { startDate: day(q.days + 1), endDate: day(1), dimensions: q.dimensions, rowLimit: Math.min(25_000, Math.max(1, q.rowLimit ?? 500)), dataState: "final" };
}

/** Rows as the API returns them, numbers coerced and sorted by clicks then impressions. */
export function parseRows(json: unknown): GscRow[] {
  const rows = (json && typeof json === "object" && Array.isArray((json as { rows?: unknown }).rows) ? (json as { rows: unknown[] }).rows : []) as Record<string, unknown>[];
  return rows
    .map((r) => ({ keys: Array.isArray(r.keys) ? r.keys.map(String) : [], clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0, ctr: Number(r.ctr) || 0, position: Number(r.position) || 0 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export function parseSitemaps(json: unknown): GscSitemap[] {
  const list = (json && typeof json === "object" && Array.isArray((json as { sitemap?: unknown }).sitemap) ? (json as { sitemap: unknown[] }).sitemap : []) as Record<string, unknown>[];
  return list.map((s) => {
    const contents = Array.isArray(s.contents) ? (s.contents as Record<string, unknown>[]) : [];
    const sum = (k: string) => contents.reduce((n, c) => n + (Number(c[k]) || 0), 0);
    return { path: String(s.path ?? ""), lastSubmitted: typeof s.lastSubmitted === "string" ? s.lastSubmitted : undefined, lastDownloaded: typeof s.lastDownloaded === "string" ? s.lastDownloaded : undefined, errors: Number(s.errors) || 0, warnings: Number(s.warnings) || 0, submitted: sum("submitted"), indexed: contents.length ? sum("indexed") : null };
  });
}

let token: { value: string; exp: number } | null = null;
async function accessToken(cfg: GscConfig): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountAssertion(cfg) }), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Search Console token: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Search Console token: no access_token");
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

const api = (cfg: GscConfig, path: string) => `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(cfg.siteUrl)}${path}`;

export type GscReport = { configured: false } | { configured: true; siteUrl: string; error?: string; pages: GscRow[]; queries: GscRow[]; totals: { clicks: number; impressions: number; ctr: number; position: number } | null; sitemaps: GscSitemap[] };

/** The admin view: top pages and queries for the last `days` days, totals, and the sitemaps the property knows. Errors are reported, never hidden. */
export async function gscReport(days = 28, env: Record<string, string | undefined> = process.env): Promise<GscReport> {
  const cfg = gscConfig(env);
  if (!cfg) return { configured: false };
  try {
    const t = await accessToken(cfg);
    const headers = { authorization: `Bearer ${t}`, "content-type": "application/json" };
    const post = async (body: unknown) => { const r = await fetch(api(cfg, "/searchAnalytics/query"), { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`Search Analytics: HTTP ${r.status}`); return r.json(); };
    const [pages, queries, totalJson, sitemapsRes] = await Promise.all([
      post(searchAnalyticsBody({ days, dimensions: ["page"], rowLimit: 200 })),
      post(searchAnalyticsBody({ days, dimensions: ["query"], rowLimit: 200 })),
      post(searchAnalyticsBody({ days, dimensions: [], rowLimit: 1 })),
      fetch(api(cfg, "/sitemaps"), { headers, signal: AbortSignal.timeout(15_000) }),
    ]);
    const total = parseRows(totalJson)[0];
    const sitemaps = sitemapsRes.ok ? parseSitemaps(await sitemapsRes.json()) : [];
    return { configured: true, siteUrl: cfg.siteUrl, pages: parseRows(pages), queries: parseRows(queries), totals: total ? { clicks: total.clicks, impressions: total.impressions, ctr: total.ctr, position: total.position } : null, sitemaps };
  } catch (e) {
    return { configured: true, siteUrl: cfg.siteUrl, error: e instanceof Error ? e.message : "request failed", pages: [], queries: [], totals: null, sitemaps: [] };
  }
}
