/**
 * Google Search Console. With no service account this returns a reason and no numbers.
 * It never fills impressions, clicks, or position with a sample.
 */
import { createSign } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type SearchRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type SearchConsoleResult = { ok: false; reason: string } | { ok: true; siteUrl: string; rows: SearchRow[] };

export function searchConsoleStatus(env: Record<string, string | undefined> = process.env): { configured: false; missing: string[] } | { configured: true; siteUrl: string; clientEmail: string; privateKey: string } {
  const missing = ["GSC_CLIENT_EMAIL", "GSC_PRIVATE_KEY", "GSC_SITE_URL"].filter((k) => !env[k]?.trim());
  if (missing.length) return { configured: false, missing };
  return {
    configured: true,
    siteUrl: env.GSC_SITE_URL!.trim(),
    clientEmail: env.GSC_CLIENT_EMAIL!.trim(),
    privateKey: env.GSC_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  };
}

function b64url(bytes: Buffer | string): string {
  return Buffer.from(bytes).toString("base64url");
}

/** RS256 assertion for a Google service account. Throws if the key is not a private key. */
export function serviceAccountJwt(email: string, privateKey: string, now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const claim = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const data = `${header}.${claim}`;
  const sig = createSign("RSA-SHA256").update(data).sign(privateKey);
  return `${data}.${sig.toString("base64url")}`;
}

type TokenResponse = { access_token?: string };
type QueryResponse = { rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] };

/**
 * Last 28 days of query rows, or a reason. `fetchImpl` is for tests.
 * A failed call is `{ ok: false }`. It is not reported as zero traffic.
 */
export async function fetchSearchAnalytics(opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; now?: number } = {}): Promise<SearchConsoleResult> {
  const status = searchConsoleStatus(opts.env ?? process.env);
  if (!status.configured) return { ok: false, reason: `Search Console is not configured. Missing ${status.missing.join(", ")}. No impressions or clicks are shown.` };
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const assertion = serviceAccountJwt(status.clientEmail, status.privateKey, opts.now);
    const tokenRes = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    const token = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
    if (!tokenRes.ok || !token.access_token) return { ok: false, reason: "Search Console refused the service-account token. No metrics are shown." };
    const end = new Date(opts.now ?? Date.now());
    const start = new Date(end.getTime() - 28 * 864e5);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(status.siteUrl)}/searchAnalytics/query`;
    const queryRes = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: day(start), endDate: day(end), dimensions: ["query"], rowLimit: 25 }),
    });
    const data = (await queryRes.json().catch(() => ({}))) as QueryResponse;
    if (!queryRes.ok) return { ok: false, reason: "Search Console did not return query rows. No metrics are shown." };
    const rows = (data.rows ?? []).map((r) => ({
      keys: Array.isArray(r.keys) ? r.keys.map(String) : [],
      clicks: Number(r.clicks) || 0,
      impressions: Number(r.impressions) || 0,
      ctr: Number(r.ctr) || 0,
      position: Number(r.position) || 0,
    }));
    return { ok: true, siteUrl: status.siteUrl, rows };
  } catch {
    return { ok: false, reason: "Search Console could not be reached. No metrics are shown." };
  }
}
