/**
 * Vercel REST API for project domains (the Keplar project is the multi-tenant host for every custom domain).
 *   POST   /v10/projects/{id}/domains            add
 *   GET    /v9/projects/{id}/domains/{domain}    state + ownership challenge
 *   POST   /v9/projects/{id}/domains/{domain}/verify
 *   GET    /v6/domains/{domain}/config           DNS records Vercel wants + whether DNS is wrong
 *   DELETE /v9/projects/{id}/domains/{domain}
 * Env: VERCEL_DOMAINS_TOKEN (secret), VERCEL_PROJECT_ID, VERCEL_TEAM_ID. The token goes only in the Authorization header
 * to api.vercel.com; it, request bodies and Vercel's response bodies are never logged. Callers get VercelError with
 * Vercel's error code and a short message.
 */
const API = "https://api.vercel.com";
const TIMEOUT_MS = 12_000;

export class VercelError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "VercelError";
  }
}

export type VercelChallenge = { type: string; domain: string; value: string; reason: string };
export type VercelDomain = { name: string; apexName: string; verified: boolean; verification: VercelChallenge[]; redirect: string | null };
export type VercelConfig = {
  misconfigured: boolean;
  configuredBy: string | null;
  /** Recommended A values (best first) and CNAME targets (best first), trailing dots removed. */
  ipv4: string[];
  cname: string[];
  /** Records Vercel says are in the way (e.g. a second A record for the same name). */
  conflicts: { name: string; type: string; value: string }[];
};

const env = (k: string) => process.env[k]?.trim() ?? "";
export const domainsConfigured = () => Boolean(env("VERCEL_DOMAINS_TOKEN") && env("VERCEL_PROJECT_ID") && env("VERCEL_TEAM_ID"));

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  if (!domainsConfigured()) throw new VercelError(503, "not_configured", "Custom domains aren't set up on this server.");
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(env("VERCEL_TEAM_ID"))}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${env("VERCEL_DOMAINS_TOKEN")}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new VercelError(0, "network", "Couldn't reach Vercel.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const e = (data.error ?? {}) as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? e.code.slice(0, 60) : `http_${res.status}`;
    const message = typeof e.message === "string" ? e.message.slice(0, 300) : `Vercel returned HTTP ${res.status}.`;
    throw new VercelError(res.status, code, message);
  }
  return data;
}

const pid = () => encodeURIComponent(env("VERCEL_PROJECT_ID"));
const dom = (h: string) => encodeURIComponent(h);

function toDomain(d: Record<string, unknown>): VercelDomain {
  const ver = Array.isArray(d.verification) ? (d.verification as Record<string, unknown>[]) : [];
  return {
    name: String(d.name ?? ""),
    apexName: String(d.apexName ?? ""),
    verified: d.verified === true,
    verification: ver.filter((v) => typeof v.value === "string").map((v) => ({ type: String(v.type ?? "TXT"), domain: String(v.domain ?? ""), value: String(v.value), reason: String(v.reason ?? "") })),
    redirect: typeof d.redirect === "string" ? d.redirect : null,
  };
}

export const addProjectDomain = async (hostname: string) => toDomain(await call("POST", `/v10/projects/${pid()}/domains`, { name: hostname }));
export const getProjectDomain = async (hostname: string) => toDomain(await call("GET", `/v9/projects/${pid()}/domains/${dom(hostname)}`));
export const verifyProjectDomain = async (hostname: string) => toDomain(await call("POST", `/v9/projects/${pid()}/domains/${dom(hostname)}/verify`));
export async function removeProjectDomain(hostname: string): Promise<void> {
  try {
    await call("DELETE", `/v9/projects/${pid()}/domains/${dom(hostname)}`);
  } catch (e) {
    if (e instanceof VercelError && e.status === 404) return; // already gone
    throw e;
  }
}

const strip = (v: string) => v.replace(/\.$/, "");
export async function getDomainConfig(hostname: string): Promise<VercelConfig> {
  const d = await call("GET", `/v6/domains/${dom(hostname)}/config?projectIdOrName=${pid()}`);
  const ranked = (x: unknown): string[] =>
    (Array.isArray(x) ? (x as { rank?: number; value?: unknown }[]) : [])
      .slice()
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value]))
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map(strip);
  const conflicts = (Array.isArray(d.conflicts) ? (d.conflicts as Record<string, unknown>[]) : [])
    .filter((c) => typeof c.value === "string")
    .slice(0, 10)
    .map((c) => ({ name: String(c.name ?? "").slice(0, 253), type: String(c.type ?? "").slice(0, 10), value: String(c.value).slice(0, 253) }));
  return { misconfigured: d.misconfigured !== false, configuredBy: typeof d.configuredBy === "string" ? d.configuredBy : null, ipv4: ranked(d.recommendedIPv4), cname: ranked(d.recommendedCNAME), conflicts };
}
