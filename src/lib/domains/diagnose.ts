/**
 * Is the domain's address record really pointing at Keplar's host (Vercel)? Two sources, used together:
 *   1. Vercel's domain config (`misconfigured`, `conflicts`, recommended values) = the source of truth.
 *   2. Live DNS answers from Google and Cloudflare (DNS-over-HTTPS, never cached) = what the user can be shown, and a second
 *      opinion when Vercel's own check lags behind.
 * `diagnose` is pure (findings in, verdict + plain-language problems out) so it is tested without a network.
 */
import { queryAll, type ResolverName } from "./dns";

export type Expected = { ipv4: string[]; cname: string[] };
export type ResolverView = { resolver: ResolverName; ok: boolean; a: string[]; aaaa: string[]; cname: string[] };
export type WrongHost = { host: string; type: "A" | "CNAME"; values: string[] };
export type DnsFindings = {
  /** ISO time of the lookups. */
  at: string;
  views: ResolverView[];
  /** Where the user's DNS is hosted (NS of the registrable domain). */
  nameservers: string[];
  /** Records for this domain found at hosts the user probably typed by mistake. Only filled when nothing was found at the right host. */
  wrongHost: WrongHost[];
};
export type VercelConflict = { name: string; type: string; value: string };
export type Problem = { code: string; severity: "error" | "warning" | "info"; title: string; detail: string; fix: string };
export type Routing = {
  /** True when every resolver that answered sees only Vercel's addresses (or a CNAME to Vercel) and nothing else. */
  pointedByDns: boolean;
  /** What was actually found for the hostname (union of the resolvers). */
  found: { a: string[]; aaaa: string[]; cname: string[] };
  nameservers: string[];
  resolversAnswered: ResolverName[];
  problems: Problem[];
  at: string;
};

/* ── known address ranges ── */
const ipToInt = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const isV4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
const inCidr = (ip: string, cidr: string) => {
  if (!isV4(ip)) return false;
  const [base, bits] = cidr.split("/");
  const size = 2 ** (32 - Number(bits));
  return Math.floor(ipToInt(ip) / size) === Math.floor(ipToInt(base) / size);
};
const VERCEL_V4 = ["76.76.21.0/24", "216.198.79.0/24", "64.29.17.0/24"];
const CLOUDFLARE_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const PROVIDERS: [string, string[]][] = [
  ["Shopify", ["23.227.38.0/24"]],
  ["Squarespace", ["198.185.159.0/24", "198.49.23.0/24", "198.185.158.0/24"]],
  ["Wix", ["185.230.63.0/24", "23.236.62.147/32", "34.149.87.45/32"]],
  ["GitHub Pages", ["185.199.108.0/22"]],
  ["Netlify", ["75.2.60.5/32", "99.83.190.102/32"]],
];
export const isVercelIp = (ip: string) => VERCEL_V4.some((c) => inCidr(ip, c));
export const isCloudflareIp = (ip: string) => (isV4(ip) ? CLOUDFLARE_V4.some((c) => inCidr(ip, c)) : /^(2606:4700|2803:f800|2a06:98c|2405:b500|2405:8100|2c0f:f248)/i.test(ip));
export const providerOf = (ip: string): string | null => (isCloudflareIp(ip) ? "Cloudflare" : PROVIDERS.find(([, cs]) => cs.some((c) => inCidr(ip, c)))?.[0] ?? null);
export const isVercelCname = (t: string, expected: string[] = []) => {
  const x = t.replace(/\.$/, "").toLowerCase();
  return expected.some((e) => e.replace(/\.$/, "").toLowerCase() === x) || x === "cname.vercel-dns.com" || /(^|\.)vercel-dns(-\d+)?\.com$/.test(x);
};
/** An address we accept for an A record: anything Vercel recommends or any address in Vercel's own ranges. */
export const isAcceptedIp = (ip: string, expected: Expected) => expected.ipv4.includes(ip) || isVercelIp(ip);
const label = (ip: string) => {
  const p = providerOf(ip);
  return p ? `${ip} (${p})` : ip;
};
const list = (xs: string[]) => xs.join(", ");

/* ── live lookups (all fresh) ── */
export async function collectDns(hostname: string, apexName: string): Promise<DnsFindings> {
  const apex = hostname === apexName;
  const [a, aaaa, ns] = await Promise.all([queryAll(hostname, "A"), queryAll(hostname, "AAAA"), queryAll(apexName, "NS")]);
  const views: ResolverView[] = a.map((ans, i) => ({
    resolver: ans.resolver,
    ok: ans.ok && aaaa[i].ok,
    a: ans.records.filter((r) => r.type === "A").map((r) => r.data),
    aaaa: aaaa[i].records.filter((r) => r.type === "AAAA").map((r) => r.data),
    cname: ans.records.filter((r) => r.type === "CNAME").map((r) => r.data),
  }));
  const nameservers = [...new Set(ns.flatMap((n) => n.records.filter((r) => r.type === "NS").map((r) => r.data)))].sort();
  const findings: DnsFindings = { at: new Date().toISOString(), views, nameservers, wrongHost: [] };
  const anyAnswer = views.some((v) => v.ok);
  const found = views.some((v) => v.a.length || v.cname.length);
  if (anyAnswer && !found) {
    // Nothing at the right name: look where people usually put it by mistake.
    const probes = [`${hostname}.${apexName}`, ...(apex ? [`www.${hostname}`] : [apexName])];
    const results = await Promise.all(probes.map((h) => queryAll(h, "A")));
    results.forEach((res, i) => {
      const recs = res.flatMap((r) => r.records);
      const cn = [...new Set(recs.filter((r) => r.type === "CNAME").map((r) => r.data))];
      const av = [...new Set(recs.filter((r) => r.type === "A").map((r) => r.data))];
      if (cn.length) findings.wrongHost.push({ host: probes[i], type: "CNAME", values: cn });
      else if (av.length) findings.wrongHost.push({ host: probes[i], type: "A", values: av });
    });
  }
  return findings;
}

/* ── verdict ── */
type ViewState = "ok" | "conflict" | "wrong" | "proxy" | "ipv6" | "none" | "unavailable";
function stateOf(v: ResolverView, apex: boolean, exp: Expected): ViewState {
  if (!v.ok) return "unavailable";
  if (v.a.some(isCloudflareIp) || v.aaaa.some(isCloudflareIp)) return "proxy";
  if (v.cname.length && v.cname.some((c) => isVercelCname(c, exp.cname))) return v.aaaa.length ? "ipv6" : "ok";
  if (!v.a.length) return v.aaaa.length ? "ipv6" : "none";
  const good = v.a.filter((x) => isAcceptedIp(x, exp));
  if (!good.length) return "wrong";
  if (good.length < v.a.length) return "conflict";
  return v.aaaa.length ? "ipv6" : "ok";
}

export function diagnose(hostname: string, apexName: string, f: DnsFindings | null, exp: Expected, conflicts: VercelConflict[] = []): Routing {
  const apex = hostname === apexName;
  const primary = exp.ipv4[0] ?? "216.198.79.1";
  const target = exp.cname[0] ?? "cname.vercel-dns.com";
  const rel = apex ? "@" : hostname.slice(0, -(apexName.length + 1));
  const views = f?.views ?? [];
  const answered = views.filter((v) => v.ok);
  const uniq = (xs: string[]) => [...new Set(xs)];
  const found = { a: uniq(answered.flatMap((v) => v.a)), aaaa: uniq(answered.flatMap((v) => v.aaaa)), cname: uniq(answered.flatMap((v) => v.cname)) };
  const states = answered.map((v) => stateOf(v, apex, exp));
  const problems: Problem[] = [];
  const add = (p: Problem) => problems.push(p);

  const proxied = uniq([...found.a, ...found.aaaa].filter(isCloudflareIp));
  if (proxied.length) {
    add({
      code: "cloudflare_proxy",
      severity: "error",
      title: "Cloudflare's proxy (orange cloud) is on",
      detail: `${hostname} answers with Cloudflare addresses (${list(proxied.slice(0, 3))}) instead of ${primary}. That's what Cloudflare shows when the record is proxied, so visitors and Keplar's host never see the real record.`,
      fix: `In Cloudflare DNS, click the orange cloud next to the ${apex ? "A" : "CNAME"} record for ${rel} so it turns gray ("DNS only"). Then press Check again.`,
    });
  }
  const nonVercelA = found.a.filter((x) => !isAcceptedIp(x, exp) && !isCloudflareIp(x));
  const vercelConflictA = conflicts.filter((c) => c.type.toUpperCase() === "A" && !isAcceptedIp(c.value, exp) && !isCloudflareIp(c.value)).map((c) => c.value);
  const extra = uniq([...nonVercelA, ...vercelConflictA]);
  const goodA = found.a.filter((x) => isAcceptedIp(x, exp));
  if (extra.length && (goodA.length || vercelConflictA.length) && !found.cname.some((c) => isVercelCname(c, exp.cname))) {
    add({
      code: "conflicting_a",
      severity: "error",
      title: "There is another A record next to the right one",
      detail: `${hostname} has ${goodA.length ? `${list(goodA)} (correct) and also ` : "the correct record but also "}${list(extra.map(label))}. With two different addresses, visitors are sent to either one at random, so the domain can't be treated as pointed at Keplar.`,
      fix: `At your DNS provider${f?.nameservers.length ? ` (your nameservers are ${list(f.nameservers.slice(0, 2))})` : ""}, delete the A record for ${rel} with value ${list(extra)}. Leave only A ${rel} → ${primary}. Then press Check again.`,
    });
  } else if (extra.length && !goodA.length && !proxied.length) {
    add({
      code: "wrong_a",
      severity: "error",
      title: apex ? "The A record points somewhere else" : "This subdomain's address record points somewhere else",
      detail: `${hostname} currently points to ${list(extra.map(label))}, not to ${primary}.`,
      fix: apex ? `Change the A record for @ to ${primary} (edit it, don't add a second one).` : `Replace it with CNAME ${rel} → ${target}, then press Check again.`,
    });
  }
  const otherCname = found.cname.filter((c) => !isVercelCname(c, exp.cname));
  if (!apex && otherCname.length && !found.cname.some((c) => isVercelCname(c, exp.cname))) {
    add({ code: "cname_elsewhere", severity: "error", title: "The CNAME points somewhere else", detail: `${hostname} is a CNAME for ${list(otherCname)}, not ${target}.`, fix: `Edit the CNAME for ${rel} so its value is ${target}.` });
  }
  const v6 = found.aaaa.filter((x) => !isCloudflareIp(x));
  if (v6.length) {
    add({
      code: "aaaa_elsewhere",
      severity: "error",
      title: "An AAAA (IPv6) record points somewhere else",
      detail: `${hostname} also has an AAAA record (${list(v6.slice(0, 3))}). Phones and networks that use IPv6 prefer it over the A record, so they'd be sent there instead of to Keplar.`,
      fix: `Delete the AAAA record for ${rel}. Only the ${apex ? `A record (${primary})` : "CNAME"} should remain.`,
    });
  }
  const noneAnywhere = answered.length > 0 && !found.a.length && !found.cname.length && !found.aaaa.length;
  if (noneAnywhere) {
    const wh = f?.wrongHost ?? [];
    if (wh.length) {
      const w = wh[0];
      add({
        code: "wrong_host",
        severity: "error",
        title: "The record is on the wrong name",
        detail: `Nothing is set for ${hostname}, but ${w.host} has ${w.type} ${list(w.values)}. That usually means the name field was filled in wrongly (the provider adds your domain automatically, so ${rel === "@" ? "@ or leave it empty" : rel} is enough).`,
        fix: `Move that record so its name is ${rel === "@" ? "@ (or blank)" : rel}, with value ${apex ? primary : target}.`,
      });
    } else {
      add({
        code: "no_record",
        severity: "error",
        title: apex ? "No A record found" : "No CNAME record found",
        detail: `Neither Google's nor Cloudflare's DNS has any address record for ${hostname} yet.${f?.nameservers.length ? ` Your domain's DNS is hosted at ${list(f.nameservers.slice(0, 2))}; the record must be added there.` : ""}`,
        fix: apex ? `Add A ${rel} → ${primary}.` : `Add CNAME ${rel} → ${target}.`,
      });
    }
  }
  // Resolvers disagree: usually propagation.
  const okViews = views.filter((v) => v.ok);
  if (okViews.length > 1 && new Set(states).size > 1 && !problems.length) {
    const good = okViews.filter((v) => stateOf(v, apex, exp) === "ok").map((v) => v.resolver);
    const rest = okViews.filter((v) => stateOf(v, apex, exp) !== "ok").map((v) => v.resolver);
    add({ code: "spreading", severity: "info", title: "Your change is still spreading", detail: `${list(good)} already sees the new record, ${list(rest)} doesn't yet. That's normal for a while after a change.`, fix: "Wait a few minutes, then press Check again." });
  }
  if (views.length && !okViews.length) {
    add({ code: "dns_unavailable", severity: "info", title: "Couldn't read DNS just now", detail: "Neither Google's nor Cloudflare's resolver answered.", fix: "Press Check again in a minute." });
  }
  const pointedByDns = answered.length > 0 && states.every((s) => s === "ok");
  return { pointedByDns, found, nameservers: f?.nameservers ?? [], resolversAnswered: answered.map((v) => v.resolver), problems, at: f?.at ?? new Date().toISOString() };
}
