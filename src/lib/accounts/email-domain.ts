/**
 * Can this email domain receive mail at all? DNS only (no mail is sent, nothing is stored):
 * MX records, else an A/AAAA record (the implicit-MX fallback), and a "null MX" (`0 .`) means "no mail here".
 *
 * Only a definite "this name has no mail records" blocks (NXDOMAIN / no data). A DNS timeout or server failure
 * lets the request through, so a flaky resolver never locks real people out. Results are cached per instance.
 * `KEPLAR_MX_CHECK=off` disables the lookup (tests and offline dev).
 */
import dns from "node:dns/promises";

export type DomainMail = "ok" | "no_mail" | "unknown";
export type Resolver = { resolveMx: typeof dns.resolveMx; resolve4: typeof dns.resolve4; resolve6: typeof dns.resolve6 };

const DEFINITE = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);
const TTL_OK = 10 * 60_000;
const TTL_BAD = 2 * 60_000;
const cache = new Map<string, { at: number; result: DomainMail }>();
let resolver: Resolver = dns;

/** Tests only. */
export function __setResolver(r: Resolver | null) {
  resolver = r ?? dns;
  cache.clear();
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("dns timeout"), { code: "ETIMEOUT" })), ms))]);

const codeOf = (e: unknown) => String((e as { code?: unknown })?.code ?? "");

export const mailDomainOf = (email: string) => email.trim().toLowerCase().slice(email.trim().lastIndexOf("@") + 1).replace(/\.$/, "");

export async function checkMailDomain(domain: string, opts: { now?: number } = {}): Promise<DomainMail> {
  if (process.env.KEPLAR_MX_CHECK === "off") return "ok";
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  // A literal that can't be a public mail domain at all.
  if (!d || !d.includes(".") || d.length > 253 || !/^[a-z0-9.-]+$/.test(d) || d.split(".").some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return "no_mail";
  const now = opts.now ?? Date.now();
  const hit = cache.get(d);
  if (hit && now - hit.at < (hit.result === "ok" ? TTL_OK : TTL_BAD)) return hit.result;
  let result: DomainMail;
  try {
    const mx = await withTimeout(resolver.resolveMx(d), 3000);
    if (mx.length === 0) throw Object.assign(new Error("no mx"), { code: "ENODATA" });
    result = mx.every((m) => !m.exchange || m.exchange === ".") ? "no_mail" : "ok";
  } catch (e) {
    if (!DEFINITE.has(codeOf(e))) result = "unknown";
    else {
      // No MX: mail can still be delivered to the domain's own address record.
      const [a4, a6] = await Promise.all([
        withTimeout(resolver.resolve4(d), 3000).then((r) => ({ n: r.length, code: "" }), (err) => ({ n: 0, code: codeOf(err) })),
        withTimeout(resolver.resolve6(d), 3000).then((r) => ({ n: r.length, code: "" }), (err) => ({ n: 0, code: codeOf(err) })),
      ]);
      if (a4.n + a6.n > 0) result = "ok";
      else result = [a4.code, a6.code].every((c) => DEFINITE.has(c)) ? "no_mail" : "unknown";
    }
  }
  if (cache.size > 2000) cache.clear();
  cache.set(d, { at: now, result });
  return result;
}

export const NO_MAIL_MESSAGE = "That email domain can't receive mail. Check for a typo.";
