/**
 * SSRF-safe outbound HTTP for MCP servers (user-supplied URLs).
 *
 * Guarantees (each covered by tests/mcp-ssrf.test.ts):
 *  - Production: https only. Elsewhere http is allowed, but the target must still be a public address.
 *  - The host is resolved ONCE here, every returned address must be public, and the socket is then pinned to that
 *    validated address (custom `lookup`), so a DNS answer that changes between "check" and "connect" (rebinding) is useless.
 *  - IP literals in any notation the URL parser normalises (decimal, hex, octal, short forms, IPv4-mapped IPv6) are checked as IPs.
 *  - Loopback, private, CGNAT, link-local (incl. 169.254.169.254 metadata), multicast, reserved, documentation, ULA and
 *    non-global IPv6 ranges are refused; so are localhost / .local / .internal names, single-label names and credentials in URLs.
 *  - Redirects are followed by hand (max 3) and every hop is re-validated from scratch; credentials are dropped when the origin changes.
 *  - Time and size are bounded: the body is streamed and cut off at `maxBytes`; no content-encoding is requested (no decompression bombs).
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class SsrfError extends Error {
  constructor(message: string, public code: "blocked" | "invalid_url" | "dns" = "blocked") {
    super(message);
  }
}
export class FetchError extends Error {
  constructor(message: string, public kind: "timeout" | "network" | "too_large" | "redirect") {
    super(message);
  }
}

/* ---------- address classification ---------- */

function v4Octets(ip: string): number[] | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const o = p.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  return o.every((n) => n >= 0 && n <= 255) ? o : null;
}

export function isPublicIPv4(ip: string): boolean {
  const o = v4Octets(ip);
  if (!o) return false;
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Parse an IPv6 literal into eight 16-bit groups (handles `::` and an embedded dotted IPv4 tail). */
function v6Groups(ip: string): number[] | null {
  if (ip.includes("%")) return null; // zone ids: never
  let s = ip.toLowerCase();
  const tail = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const o = v4Octets(tail[1]);
    if (!o) return null;
    s = s.slice(0, -tail[1].length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (x: string) => (x === "" ? [] : x.split(":"));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 && fill < 1) return null;
  const all = halves.length === 2 ? [...head, ...Array(fill).fill("0"), ...rest] : head;
  if (all.length !== 8) return null;
  const g = all.map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return g.every((n) => Number.isInteger(n)) ? g : null;
}

export function isPublicIPv6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  // Only global unicast 2000::/3 can be public. That already excludes ::, ::1, ::ffff:0:0/96 (mapped), 64:ff9b::/96 (NAT64),
  // fc00::/7 (ULA), fe80::/10 (link-local), fec0::/10, ff00::/8 (multicast) and the deprecated IPv4-compatible forms.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0002 && g[2] === 0) return false; // benchmarking
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x0010) return false; // ORCHID
  if (g[0] === 0x2002) return isPublicIPv4(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4 embeds an IPv4
  if (g[0] === 0x3fff && g[1] < 0x1000) return false; // documentation
  return true;
}

export function isPublicIp(ip: string): boolean {
  const fam = net.isIP(ip);
  return fam === 4 ? isPublicIPv4(ip) : fam === 6 ? isPublicIPv6(ip) : false;
}

/* ---------- URL validation ---------- */

const BLOCKED_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|home\.arpa|in-addr\.arpa|ip6\.arpa|onion)$/;
const ALLOWED_LOW_PORTS = new Set([80, 443]);
export const isProduction = () => process.env.NODE_ENV === "production";

/** Syntax and policy checks that need no network. Returns the parsed URL (fragment removed). */
export function checkUrl(raw: string, opts: { allowHttp?: boolean } = {}): URL {
  if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) throw new SsrfError("Enter a valid server address.", "invalid_url");
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new SsrfError("Enter a valid server address, like https://example.com/mcp.", "invalid_url");
  }
  const httpOk = opts.allowHttp ?? !isProduction();
  if (u.protocol !== "https:" && !(httpOk && u.protocol === "http:")) throw new SsrfError(isProduction() ? "Only https:// addresses are allowed." : "Only http:// and https:// addresses are allowed.", "invalid_url");
  if (u.username || u.password) throw new SsrfError("Put credentials in the token field, not in the address.", "invalid_url");
  u.hash = "";
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) throw new SsrfError("Enter a valid server address.", "invalid_url");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (port < 1024 && !ALLOWED_LOW_PORTS.has(port)) throw new SsrfError("That port isn't allowed.", "blocked");
  if (net.isIP(host)) {
    if (!isPublicIp(host)) throw new SsrfError("That address points to a private or internal network, which Keplar won't connect to.", "blocked");
  } else {
    if (BLOCKED_NAME.test(host) || !host.includes(".")) throw new SsrfError("That host name points to a private or internal network, which Keplar won't connect to.", "blocked");
    if (!/^[a-z0-9.-]+$/.test(host)) throw new SsrfError("Enter a valid server address.", "invalid_url"); // IDNs arrive punycoded
  }
  return u;
}

/* ---------- network seams (tests replace these; production uses DNS + node:http(s)) ---------- */

export type Resolver = (host: string) => Promise<string[]>;
export type RawRequest = { url: URL; ip: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number; maxBytes: number; stopWhen?: (soFar: Buffer) => boolean };
export type RawResponse = { status: number; headers: Record<string, string>; body: Buffer };
export type Transport = (r: RawRequest) => Promise<RawResponse>;

const defaultResolver: Resolver = async (host) => (await dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export const directTransport: Transport = (r) =>
  new Promise<RawResponse>((resolve, reject) => {
    const isHttps = r.url.protocol === "https:";
    const family = net.isIP(r.ip);
    const hostname = r.url.hostname.replace(/^\[|\]$/g, "");
    const lib = isHttps ? https : http;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = lib.request(
      {
        host: hostname,
        port: r.url.port || (isHttps ? 443 : 80),
        method: r.method,
        path: r.url.pathname + r.url.search,
        headers: { ...r.headers, host: r.url.host, "accept-encoding": "identity" },
        servername: net.isIP(hostname) ? undefined : hostname, // SNI + certificate check against the NAME, connection pinned to the validated IP
        // Pin: whatever the name resolves to later, this socket goes to the address we validated.
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => (opts?.all ? cb(null, [{ address: r.ip, family }]) : cb(null, r.ip, family))) as never,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > r.maxBytes) {
            req.destroy();
            return done(() => reject(new FetchError("The server's response was too large.", "too_large")));
          }
          chunks.push(c);
          if (r.stopWhen && r.stopWhen(Buffer.concat(chunks))) {
            const body = Buffer.concat(chunks);
            req.destroy();
            done(() => resolve({ status: res.statusCode ?? 0, headers: flat(res.headers), body }));
          }
        });
        res.on("end", () => done(() => resolve({ status: res.statusCode ?? 0, headers: flat(res.headers), body: Buffer.concat(chunks) })));
        res.on("error", () => done(() => reject(new FetchError("The connection was interrupted.", "network"))));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(() => reject(new FetchError("The server took too long to respond.", "timeout")));
    }, r.timeoutMs);
    req.on("error", (e: NodeJS.ErrnoException) => done(() => reject(new FetchError(netMessage(e), "network"))));
    if (r.body !== undefined) req.write(r.body);
    req.end();
  });

function flat(h: http.IncomingHttpHeaders): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (v !== undefined) o[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  return o;
}
function netMessage(e: NodeJS.ErrnoException): string {
  switch (e.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "The server's address couldn't be found.";
    case "ECONNREFUSED":
      return "The server refused the connection.";
    case "ECONNRESET":
      return "The connection was reset by the server.";
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "The server's security certificate isn't valid.";
    default:
      return "Couldn't connect to the server.";
  }
}

let resolver: Resolver = defaultResolver;
let transport: Transport = directTransport;
/** Tests only. Call with no argument to restore the real network. */
export function setNetworkForTests(o?: { resolver?: Resolver; transport?: Transport }) {
  resolver = o?.resolver ?? defaultResolver;
  transport = o?.transport ?? directTransport;
}

/** Resolve a host and return a validated address. Every answer must be public, or none is used. */
export async function resolvePublic(host: string): Promise<string> {
  const h = host.replace(/^\[|\]$/g, "");
  if (net.isIP(h)) {
    if (!isPublicIp(h)) throw new SsrfError("That address points to a private or internal network, which Keplar won't connect to.");
    return h;
  }
  let addrs: string[];
  try {
    addrs = await resolver(h);
  } catch {
    throw new SsrfError("The server's address couldn't be found.", "dns");
  }
  if (!addrs.length) throw new SsrfError("The server's address couldn't be found.", "dns");
  if (!addrs.every(isPublicIp)) throw new SsrfError("That host resolves to a private or internal network address, which Keplar won't connect to.");
  return addrs[0];
}

export type SafeFetchOpts = {
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  /** Header names that carry credentials; dropped when a redirect leaves the original origin. */
  secretHeaders?: string[];
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  stopWhen?: (soFar: Buffer) => boolean;
  allowHttp?: boolean;
  /** Called with each redirect target after it passed validation and before it is requested. Throwing aborts the fetch. */
  beforeRedirect?: (next: URL) => void | Promise<void>;
};

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/** Validate, resolve, pin, request, follow redirects safely. Throws SsrfError or FetchError; never returns a response from a private address. */
export async function safeFetch(rawUrl: string, opts: SafeFetchOpts = {}): Promise<RawResponse & { finalUrl: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let url = checkUrl(rawUrl, { allowHttp: opts.allowHttp });
  let method = opts.method ?? "GET";
  let body = opts.body;
  let headers = { ...(opts.headers ?? {}) };
  const secret = new Set((opts.secretHeaders ?? []).map((h) => h.toLowerCase()));
  const origin0 = url.origin;
  const max = opts.maxRedirects ?? 3;
  for (let hop = 0; ; hop++) {
    const ip = await resolvePublic(url.hostname);
    const left = deadline - Date.now();
    if (left <= 0) throw new FetchError("The server took too long to respond.", "timeout");
    const res = await transport({ url, ip, method, headers, body, timeoutMs: left, maxBytes: opts.maxBytes ?? 512 * 1024, stopWhen: opts.stopWhen });
    if (!REDIRECT.has(res.status)) return { ...res, finalUrl: url.toString() };
    const loc = res.headers["location"];
    if (!loc) return { ...res, finalUrl: url.toString() };
    if (hop >= max) throw new FetchError("The server redirected too many times.", "redirect");
    if (method !== "GET" && (res.status === 301 || res.status === 302 || res.status === 303)) throw new FetchError("The server redirected in a way Keplar won't follow.", "redirect");
    let next: URL;
    try {
      next = new URL(loc, url);
    } catch {
      throw new FetchError("The server sent an invalid redirect.", "redirect");
    }
    // Full re-validation of the new target: scheme, name, IP literal, DNS (done at the top of the next loop turn).
    url = checkUrl(next.toString(), { allowHttp: opts.allowHttp });
    if (opts.beforeRedirect) await opts.beforeRedirect(url);
    if (url.origin !== origin0) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !secret.has(k.toLowerCase())));
    if (res.status === 303) {
      method = "GET";
      body = undefined;
    }
  }
}
