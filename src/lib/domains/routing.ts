/**
 * Host routing for custom domains. A request whose Host is not one of Keplar's own is looked up in the domains table;
 * an active domain maps to its site, anything else is a 404. Used by src/proxy.ts (rewrite to /s/<slug>) and by the
 * /s route itself (which re-checks the host, so a rewritten URL can never serve another tenant's site).
 */
import { BUSINESS_HOST, DOCS_HOST, PRODUCTION_HOST, siteUrl } from "@/lib/site";
import { domainStore } from "./store";

export function hostOf(req: Request): string {
  const raw = (req.headers.get("host") || new URL(req.url).host).toLowerCase().trim();
  // strip :port and a trailing dot; IPv6 literals ("[::1]:3000") are kept bracketed
  const noPort = raw.startsWith("[") ? raw.slice(0, raw.indexOf("]") + 1) : raw.replace(/:\d+$/, "");
  return noPort.replace(/\.$/, "");
}

const hostnameOfUrl = (u: string | undefined) => {
  try {
    return u ? new URL(u).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
};

function appHosts(): Set<string> {
  const s = new Set<string>([PRODUCTION_HOST, `www.${PRODUCTION_HOST}`, DOCS_HOST, BUSINESS_HOST, "business.localhost", "localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);
  const own = hostnameOfUrl(siteUrl);
  if (own) {
    s.add(own);
    s.add(own.startsWith("www.") ? own.slice(4) : `www.${own}`);
  }
  const auth = hostnameOfUrl(process.env.BETTER_AUTH_URL);
  if (auth) s.add(auth);
  for (const h of (process.env.KEPLAR_APP_HOSTS ?? "").split(",")) if (h.trim()) s.add(h.trim().toLowerCase());
  return s;
}

/** Keplar's own hosts (the app, previews, localhost): everything routes normally there. */
export function isAppHost(host: string): boolean {
  if (!host) return true; // no Host at all (internal calls): treat as ours, never as a customer domain
  return host.endsWith(".vercel.app") || appHosts().has(host);
}

export type CustomSite = { hostname: string; domainId: string; siteId: string; workspaceId: string; slug: string };

type Entry = { at: number; value: CustomSite | null };
const cache = new Map<string, Entry>();
const POSITIVE_MS = 30_000;
const NEGATIVE_MS = 10_000;

export function invalidateHost(hostname?: string) {
  if (hostname) cache.delete(hostname.toLowerCase());
  else cache.clear();
}

async function lookup(host: string): Promise<CustomSite | null> {
  // Imported lazily: the proxy runs on every request and should not load the auth stack for ordinary app hosts.
  const [{ workspaceById }, { sites }] = await Promise.all([import("@/lib/create/platform/workspace"), import("@/lib/site-builder/store")]);
  const row = await domainStore().findByHostname(host);
  if (!row || row.status !== "active") return null;
  const ws = await workspaceById(row.workspaceId);
  const limit = ws?.entitlements.customDomains ?? 0;
  if (limit <= 0) return null; // downgraded to Free: the domain stays stored but stops serving
  const mine = await domainStore().listByWorkspace(row.workspaceId);
  if (mine.findIndex((d) => d.id === row.id) >= limit) return null; // over the (reduced) allowance: oldest domains keep serving
  const site = await sites().get(row.workspaceId, row.siteId);
  if (!site || site.deletedAt) return null; // deleted site: the domain stops serving at once (it is detached from hosting when the site is purged)
  return { hostname: row.hostname, domainId: row.id, siteId: site.id, workspaceId: site.workspaceId, slug: site.slug };
}

/** Active custom domain -> site, cached briefly per instance (positive 30 s, negative 10 s). Lookup errors are not cached. */
export async function resolveCustomHost(host: string): Promise<CustomSite | null> {
  const h = host.toLowerCase();
  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < (hit.value ? POSITIVE_MS : NEGATIVE_MS)) return hit.value;
  const value = await lookup(h);
  if (cache.size > 2000) cache.clear();
  cache.set(h, { at: Date.now(), value });
  return value;
}
