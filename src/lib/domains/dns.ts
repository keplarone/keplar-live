/**
 * Ownership proof for custom domains: the owner publishes TXT `_keplar-verify.<hostname>` = `keplar-verify=<token>`.
 * Every tenant shares one Vercel project, so Vercel's own check can't tell tenants apart; without this a user could claim a
 * hostname whose DNS still points at Vercel (a dangling CNAME). Read through DNS-over-HTTPS (JSON), so no resolver config is
 * needed on serverless and tests can mock fetch.
 */
export const OWNERSHIP_PREFIX = "_keplar-verify";
export const ownershipHost = (hostname: string) => `${OWNERSHIP_PREFIX}.${hostname}`;
export const ownershipValue = (token: string) => `keplar-verify=${token}`;

/** Two independent public resolvers, asked in parallel on every check. Nothing is cached on our side. */
export const RESOLVERS = [
  { name: "Google", base: "https://dns.google/resolve", bust: true },
  { name: "Cloudflare", base: "https://cloudflare-dns.com/dns-query", bust: false },
] as const;
export type ResolverName = (typeof RESOLVERS)[number]["name"];
export type DnsType = "A" | "AAAA" | "CNAME" | "TXT" | "NS";
const TYPE_NUM: Record<DnsType, number> = { A: 1, NS: 2, CNAME: 5, TXT: 16, AAAA: 28 };
export type DnsRecord = { type: DnsType; name: string; data: string };
/** What one resolver said. `ok` false = it did not give a usable answer (timeout, SERVFAIL, HTTP error). NXDOMAIN / empty = ok with no records. */
export type ResolverAnswer = { resolver: ResolverName; ok: boolean; records: DnsRecord[] };

export const cleanName = (n: string) => n.trim().toLowerCase().replace(/\.$/, "");

/** One query to one resolver. Fresh every time: no-store fetch, a random padding parameter (Google's documented cache-buster for its HTTP front end). */
export async function queryResolver(r: (typeof RESOLVERS)[number], name: string, type: DnsType): Promise<ResolverAnswer> {
  try {
    const pad = r.bust ? `&random_padding=${Math.random().toString(36).slice(2, 12)}` : "";
    const res = await fetch(`${r.base}?name=${encodeURIComponent(name)}&type=${type}${pad}`, { headers: { accept: "application/dns-json", "cache-control": "no-cache" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { resolver: r.name, ok: false, records: [] };
    const j = (await res.json()) as { Status?: number; Answer?: { type?: number; data?: string; name?: string }[] };
    if (j.Status !== 0 && j.Status !== 3) return { resolver: r.name, ok: false, records: [] }; // NOERROR or NXDOMAIN are real answers
    const records: DnsRecord[] = [];
    for (const a of j.Answer ?? []) {
      if (typeof a.data !== "string") continue;
      const t = (Object.keys(TYPE_NUM) as DnsType[]).find((k) => TYPE_NUM[k] === a.type);
      if (!t) continue;
      records.push({ type: t, name: cleanName(a.name ?? name), data: t === "TXT" ? a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, "") : t === "CNAME" || t === "NS" ? cleanName(a.data) : a.data.trim().toLowerCase() });
    }
    return { resolver: r.name, ok: true, records };
  } catch {
    return { resolver: r.name, ok: false, records: [] };
  }
}

/** The same question to every resolver at once. */
export const queryAll = (name: string, type: DnsType): Promise<ResolverAnswer[]> => Promise.all(RESOLVERS.map((r) => queryResolver(r, name, type)));

/** TXT strings at `name` from either resolver (union), or null when no resolver answered. NXDOMAIN / no records = []. */
export async function lookupTxt(name: string): Promise<string[] | null> {
  const answers = await queryAll(name, "TXT");
  if (!answers.some((a) => a.ok)) return null;
  return [...new Set(answers.flatMap((a) => a.records.filter((x) => x.type === "TXT").map((x) => x.data)))];
}

export async function checkOwnership(hostname: string, token: string): Promise<boolean | null> {
  const txt = await lookupTxt(ownershipHost(hostname));
  if (txt === null) return null;
  const want = ownershipValue(token);
  return txt.some((t) => t.trim() === want);
}
