/**
 * Custom domains for published Create sites. Flow:
 *   add     -> plan + limit + hostname checks, claim the hostname in our table (unique), add it to the Vercel project,
 *              read the DNS Vercel wants, show it to the owner.
 *   verify  -> (button, UI poll, and the background job) ownership TXT + Vercel's verification + Vercel's DNS config.
 *              active only when all three are good. Vercel issues the HTTPS certificate once DNS is correct.
 *   remove  -> remove from the Vercel project first, then from our table.
 * Status: pending (waiting for DNS), verifying (a check is running), active (serving), error (needs attention).
 */
import { randomBytes } from "node:crypto";
import { EntitlementError } from "@/lib/create/platform/plans";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId } from "@/lib/create/platform/ids";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import type { Workspace } from "@/lib/create/platform/workspace";
import { getSite } from "@/lib/site-builder/store";
import { checkOwnership, ownershipHost, ownershipValue } from "./dns";
import { collectDns, diagnose, type Problem, type Routing } from "./diagnose";
import { validateHostname } from "./hostname";
import { domainLimit, upgradeFor } from "./limits";
import { invalidateHost } from "./routing";
import { domainStore, type DomainRow, type DomainStatus } from "./store";
import { VercelError, addProjectDomain, domainsConfigured, getDomainConfig, getProjectDomain, removeProjectDomain, verifyProjectDomain, type VercelConfig, type VercelDomain } from "./vercel";

/** Fallbacks when Vercel's config call has nothing (it normally returns the record to use). */
export const FALLBACK_A = "216.198.79.1";
export const FALLBACK_CNAME = "cname.vercel-dns.com";
/** A domain that has not reached active after this long stops being rechecked (the owner can press Verify to restart). */
export const GIVE_UP_AFTER_MS = 7 * 86_400_000;
let manualMinGapMs = 8_000;
/** Tests only. */
export const setVerifyGapForTests = (ms: number) => {
  manualMinGapMs = ms;
};
const STALE_VERIFYING_MS = 3 * 60_000;

/** Seconds until the next background check: quick while new, slower as it ages; a healthy domain is rechecked every 6 hours. */
export function nextCheckDelayMs(status: DomainStatus, ageMs: number): number | null {
  if (status === "active") return 6 * 3_600_000;
  if (status === "error") return null;
  if (ageMs < 3_600_000) return 5 * 60_000;
  if (ageMs < 86_400_000) return 30 * 60_000;
  return 3 * 3_600_000;
}

export type PublicRecord = {
  type: "A" | "CNAME" | "TXT";
  name: string;
  host: string;
  /** What to enter: Vercel's own recommended value. */
  value: string;
  /** Other values Vercel also accepts for this record. */
  alsoAccepted: string[];
  /** What DNS actually returned for this name at the last check (A/CNAME rows only; empty = nothing found). */
  found: string[];
  purpose: string;
  done: boolean;
};
export type PublicDomain = {
  id: string;
  hostname: string;
  siteId: string;
  status: DomainStatus;
  apex: boolean;
  ownershipVerified: boolean;
  records: PublicRecord[];
  /** Specific DNS problems found at the last check, with what was found and how to fix it. */
  problems: Problem[];
  /** Where the domain's DNS is hosted (nameservers), when known. */
  nameservers: string[];
  /** Plain-language reason it is not active yet, or the last problem. */
  message: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  url: string;
};

const isApexOf = (row: DomainRow) => {
  const apex = row.verification.vercel?.apexName;
  if (apex) return apex === row.hostname;
  return row.hostname.split(".").length === 2;
};

export function publicDomain(row: DomainRow): PublicDomain {
  const apexName = row.verification.vercel?.apexName || row.hostname.split(".").slice(-2).join(".");
  const rel = (name: string) => (name === apexName ? "@" : name.endsWith(`.${apexName}`) ? name.slice(0, -(apexName.length + 1)) : name);
  const apex = isApexOf(row);
  const cfg = row.verification.config;
  const routing = row.verification.routing;
  // Pointed = Vercel says so (source of truth), or both resolvers show only Vercel's addresses.
  const routed = Boolean((cfg && !cfg.misconfigured) || routing?.pointedByDns);
  const records: PublicRecord[] = [];
  if (apex) records.push({ type: "A", name: "@", host: row.hostname, value: cfg?.ipv4[0] ?? FALLBACK_A, alsoAccepted: cfg?.ipv4.slice(1) ?? [], found: routing?.found.a ?? [], purpose: "Points your domain at Keplar's hosting.", done: routed });
  else records.push({ type: "CNAME", name: rel(row.hostname), host: row.hostname, value: cfg?.cname[0] ?? FALLBACK_CNAME, alsoAccepted: cfg?.cname.slice(1) ?? [], found: routing ? (routing.found.cname.length ? routing.found.cname : routing.found.a) : [], purpose: "Points this subdomain at Keplar's hosting.", done: routed });
  records.push({ type: "TXT", name: rel(ownershipHost(row.hostname)), host: ownershipHost(row.hostname), value: ownershipValue(row.ownershipToken), alsoAccepted: [], found: [], purpose: "Proves the domain is yours.", done: row.ownershipVerified });
  for (const c of row.verification.vercel?.challenges ?? []) {
    if (c.type.toUpperCase() !== "TXT") continue;
    records.push({ type: "TXT", name: rel(c.domain), host: c.domain, value: c.value, alsoAccepted: [], found: [], purpose: "Hosting provider ownership check (needed because this domain is already used elsewhere).", done: row.verification.vercel?.verified === true });
  }
  return {
    id: row.id,
    hostname: row.hostname,
    siteId: row.siteId,
    status: row.status,
    apex,
    ownershipVerified: row.ownershipVerified,
    records,
    problems: row.status === "active" || routed ? [] : (routing?.problems ?? []),
    nameservers: routing?.nameservers ?? [],
    message: row.status === "active" ? null : (row.lastError ?? row.verification.reason ?? null),
    lastCheckedAt: row.lastCheckedAt,
    createdAt: row.createdAt,
    url: `https://${row.hostname}`,
  };
}

function requireConfigured() {
  if (!domainsConfigured()) throw new HttpError(503, "Custom domains aren't set up on this server yet.", "not_configured");
}

function vercelProblem(e: unknown): HttpError {
  if (e instanceof VercelError) {
    if (e.code === "domain_already_in_use" || e.code === "domain_taken" || e.status === 409) return new HttpError(409, "That domain is already connected somewhere else. If you own it, remove it from the other project first.", "domain_taken");
    if (e.code === "invalid_domain" || e.status === 400) return new HttpError(400, "That doesn't look like a domain that can be connected.", "invalid_domain");
    if (e.code === "forbidden" || e.status === 401 || e.status === 403) return new HttpError(502, "Custom domains are temporarily unavailable. We've been notified.", "provider_error");
    if (e.status === 429) return new HttpError(429, "Too many domain changes right now. Try again in a few minutes.", "rate_limited");
  }
  return new HttpError(502, "Couldn't reach the domain service. Try again in a moment.", "provider_unavailable");
}

async function ownedRow(ws: Workspace, domainId: string): Promise<DomainRow> {
  const row = await domainStore().get(domainId);
  // Same answer for "doesn't exist" and "someone else's": no probing of other tenants' ids.
  if (!row || row.workspaceId !== ws.id) throw new HttpError(404, "Domain not found.", "not_found");
  return row;
}

export async function listForSite(ws: Workspace, siteId: string) {
  const site = await getSite(ws, siteId); // 404 for other tenants' sites
  const all = await domainStore().listByWorkspace(ws.id);
  return {
    domains: all.filter((d) => d.siteId === site.id).map(publicDomain),
    limit: ws.entitlements.customDomains,
    used: all.length,
    plan: ws.plan,
    configured: domainsConfigured(),
    published: site.publishedVersion !== null,
  };
}

export async function addDomain(ws: Workspace, siteId: string, input: unknown): Promise<PublicDomain> {
  if (ws.anonymous || !ws.userId) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  const limit = ws.entitlements.customDomains;
  if (limit <= 0) throw new EntitlementError("Custom domains are available on Plus, Pro and Business. Upgrade to connect your own domain.", upgradeFor(ws.plan));
  if (!ws.verified) throw new HttpError(403, "Verify your email address before connecting a domain.", "unverified");
  requireConfigured();
  await rateLimit(`dom:add:${ws.id}`, 30, 3600, { shared: true });
  const site = await getSite(ws, siteId);
  if (site.publishedVersion === null) throw new HttpError(409, "Publish your site first, then connect a domain to it.", "not_published");
  const v = validateHostname(input);
  if (!v.ok) throw new HttpError(400, v.error, "invalid_domain");
  const store = domainStore();
  const existing = await store.findByHostname(v.hostname);
  if (existing) throw new HttpError(409, existing.workspaceId === ws.id ? "You've already added that domain." : "That domain is already connected to another Keplar account.", "domain_taken");

  const t = new Date().toISOString();
  const row: DomainRow = {
    id: newId("dom"),
    userId: ws.userId,
    workspaceId: ws.id,
    siteId: site.id,
    hostname: v.hostname,
    status: "verifying",
    ownershipToken: randomBytes(16).toString("hex"),
    ownershipVerified: false,
    verification: {},
    lastError: null,
    lastCheckedAt: null,
    nextCheckAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    verifiedAt: null,
    createdAt: t,
    updatedAt: t,
  };
  // Claim first (unique hostname + atomic per-workspace limit), then talk to Vercel.
  const claim = await store.insertIfUnderLimit(row, limit);
  if (claim === "duplicate") throw new HttpError(409, "That domain is already connected to another Keplar account.", "domain_taken");
  if (claim === "limit") throw new EntitlementError(`Your plan includes ${limit} custom domain${limit === 1 ? "" : "s"}. Remove one or upgrade for more.`, upgradeFor(ws.plan));

  let vd: VercelDomain;
  try {
    vd = await addProjectDomain(row.hostname);
  } catch (e) {
    await store.remove(row.id); // nothing was added on Vercel's side
    throw vercelProblem(e);
  }
  const refreshed = await refresh(row, { vercel: vd, manual: false });
  return publicDomain(refreshed);
}

/** Core check. `vercel` lets add reuse the domain it just created. Never throws for provider trouble: it records it. */
async function refresh(row: DomainRow, opts: { vercel?: VercelDomain; manual: boolean }): Promise<DomainRow> {
  const store = domainStore();
  const startedAt = Date.now();
  const age = startedAt - Date.parse(row.createdAt);
  let patch: Partial<DomainRow> = {};
  try {
    let ownership = row.ownershipVerified;
    let ownershipUnknown = false;
    if (!ownership) {
      const ok = await checkOwnership(row.hostname, row.ownershipToken);
      if (ok === true) ownership = true;
      else if (ok === null) ownershipUnknown = true;
    }
    let vd = opts.vercel;
    if (!vd) {
      try {
        vd = await getProjectDomain(row.hostname);
      } catch (e) {
        if (e instanceof VercelError && e.status === 404) vd = await addProjectDomain(row.hostname); // it was removed on Vercel's side: put it back
        else throw e;
      }
    }
    if (!vd.verified) {
      try {
        vd = await verifyProjectDomain(row.hostname);
      } catch (e) {
        // 400 missing_txt_record etc. just means "not yet"; anything else is a provider problem.
        if (!(e instanceof VercelError) || e.status < 400 || e.status >= 500 || e.status === 429) throw e;
      }
    }
    let config: VercelConfig | null = null;
    try {
      config = await getDomainConfig(row.hostname);
    } catch (e) {
      if (!(e instanceof VercelError) || e.status !== 404) throw e;
    }
    const verification = {
      vercel: { verified: vd.verified, challenges: vd.verification, apexName: vd.apexName },
      config: config ?? row.verification.config ?? { misconfigured: true, configuredBy: null, ipv4: [], cname: [], conflicts: [] },
      routing: undefined as Routing | undefined,
      reason: undefined as string | undefined,
    };
    // Live DNS from Google and Cloudflare, fresh every time, next to Vercel's verdict.
    const apexName = vd.apexName || row.hostname.split(".").slice(-2).join(".");
    const cfg = verification.config;
    const expected = { ipv4: cfg.ipv4.length ? cfg.ipv4 : [FALLBACK_A], cname: cfg.cname.length ? cfg.cname : [FALLBACK_CNAME] };
    const routing = diagnose(row.hostname, apexName, await collectDns(row.hostname, apexName), expected, cfg.conflicts ?? []);
    if (cfg.misconfigured && !routing.pointedByDns && !routing.problems.some((p) => p.severity === "error")) {
      routing.problems.push({ code: "provider_not_pointed", severity: "error", title: "Keplar's host doesn't see the record yet", detail: `Google and Cloudflare show ${routing.found.a.length || routing.found.cname.length ? [...routing.found.a, ...routing.found.cname].join(", ") : "no address record"}, but the hosting provider still reports ${row.hostname} as not pointed at it.`, fix: "Check the record is exactly as shown above, wait a few minutes, then press Check again." });
    }
    verification.routing = routing;
    const routed = !cfg.misconfigured || routing.pointedByDns;
    let status: DomainStatus = "pending";
    if (ownership && vd.verified && routed) status = "active";
    else if (!ownership) verification.reason = ownershipUnknown ? "We couldn't read your DNS just now. We'll check again shortly." : "Waiting for the ownership TXT record. DNS changes can take anywhere from a few minutes to a few hours to spread.";
    else if (!vd.verified) verification.reason = "Waiting for the extra TXT record below. This domain is already used elsewhere, so the hosting provider needs its own proof.";
    else {
      const first = routing.problems.find((p) => p.severity === "error") ?? routing.problems[0];
      verification.reason = first ? `${first.title}. ${first.fix}` : "Waiting for the DNS record to point at Keplar's hosting. DNS changes can take anywhere from a few minutes to a few hours to spread. If you use Cloudflare, set the record to DNS only (gray cloud).";
    }
    if (status !== "active" && age > GIVE_UP_AFTER_MS && !opts.manual) {
      status = "error";
      verification.reason = "This domain was never set up correctly. Press Verify to try again, or remove it.";
    }
    const delay = nextCheckDelayMs(status, age);
    patch = {
      status,
      ownershipVerified: ownership,
      verification,
      lastError: null,
      lastCheckedAt: new Date().toISOString(),
      nextCheckAt: delay === null ? null : new Date(Date.now() + delay).toISOString(),
      verifiedAt: status === "active" ? (row.verifiedAt ?? new Date().toISOString()) : row.verifiedAt,
    };
  } catch (e) {
    // Provider trouble: keep what we knew, say so, retry soon.
    const prior: DomainStatus = row.status === "verifying" ? (row.verifiedAt ? "active" : "pending") : row.status;
    patch = {
      status: prior === "error" && !opts.manual ? "error" : prior,
      lastError: e instanceof VercelError && e.code === "not_configured" ? "Custom domains aren't set up on this server yet." : "We couldn't reach the domain service. We'll try again shortly.",
      lastCheckedAt: new Date().toISOString(),
      nextCheckAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
  }
  const saved = (await store.update(row.id, patch)) ?? { ...row, ...patch };
  invalidateHost(row.hostname);
  return saved;
}

/** Verify button and the UI's status poll. Throttled so a stuck tab can't hammer the provider. */
export async function verifyDomain(ws: Workspace, domainId: string, opts: { force?: boolean } = {}): Promise<PublicDomain> {
  let row = await ownedRow(ws, domainId);
  requireConfigured();
  const last = row.lastCheckedAt ? Date.parse(row.lastCheckedAt) : 0;
  const stuck = row.status === "verifying" && Date.now() - Date.parse(row.updatedAt) > STALE_VERIFYING_MS;
  if (!opts.force && Date.now() - last < manualMinGapMs && !stuck) return publicDomain(row);
  await rateLimit(`dom:verify:${ws.id}`, 40, 600, { shared: true });
  row = (await domainStore().update(row.id, { status: row.status === "active" ? "active" : "verifying", lastError: null })) ?? row;
  return publicDomain(await refresh(row, { manual: true }));
}

/** Status for polling: returns the stored state, and re-checks it when the last check is older than `maxAgeMs`. */
export async function domainStatus(ws: Workspace, domainId: string, maxAgeMs = 20_000): Promise<PublicDomain> {
  const row = await ownedRow(ws, domainId);
  if (row.status === "active" || row.status === "error" || !domainsConfigured()) return publicDomain(row);
  const last = row.lastCheckedAt ? Date.parse(row.lastCheckedAt) : 0;
  if (Date.now() - last < maxAgeMs) return publicDomain(row);
  return verifyDomain(ws, domainId);
}

export async function removeDomain(ws: Workspace, domainId: string): Promise<void> {
  const row = await ownedRow(ws, domainId);
  await disconnect(row);
}

async function disconnect(row: DomainRow) {
  if (domainsConfigured()) {
    try {
      await removeProjectDomain(row.hostname);
    } catch (e) {
      throw vercelProblem(e); // keep our row so the owner can retry; never leave a domain attached on Vercel with no owner row
    }
  }
  await domainStore().remove(row.id);
  invalidateHost(row.hostname);
}

/** Used when a site is deleted. */
export async function removeDomainsForSite(ws: Pick<Workspace, "id">, siteId: string): Promise<void> {
  for (const row of await domainStore().listBySite(ws.id, siteId)) await disconnect(row);
}

/** Background job: re-check every domain that is due. Returns counts. */
export async function recheckDue(limit = 25): Promise<{ checked: number; active: number; pending: number; error: number }> {
  if (!domainsConfigured()) return { checked: 0, active: 0, pending: 0, error: 0 };
  const due = await domainStore().listDue(new Date().toISOString(), limit);
  const out = { checked: 0, active: 0, pending: 0, error: 0 };
  for (let i = 0; i < due.length; i += 4) {
    const results = await Promise.all(due.slice(i, i + 4).map((r) => refresh(r, { manual: false })));
    for (const r of results) {
      out.checked++;
      if (r.status === "active") out.active++;
      else if (r.status === "error") out.error++;
      else out.pending++;
    }
  }
  return out;
}

export { domainLimit };
