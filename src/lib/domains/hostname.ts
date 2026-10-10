/**
 * Strict hostname validation for custom domains. Whatever passes here is a plain ASCII DNS name that a customer could
 * actually own: no URLs, ports, paths, IPs, wildcards, underscores, internationalised (punycode) labels, platform
 * domains (keplar.one, vercel.app, ...) or bare public suffixes.
 */

export const MAX_HOSTNAME = 253;

/** Domains nobody can connect: ours, Vercel's, and shared hosting suffixes whose subdomains belong to other people. */
const BLOCKED_SUFFIXES = [
  "keplar.one", "keplar.site", "keplar.app",
  "vercel.app", "vercel.dev", "vercel.sh", "vercel.com", "vercel-dns.com", "now.sh", "vercel-storage.com",
  "github.io", "githubusercontent.com", "netlify.app", "herokuapp.com", "pages.dev", "workers.dev", "web.app", "firebaseapp.com",
  "onrender.com", "fly.dev", "azurewebsites.net", "amazonaws.com", "cloudfront.net", "ngrok.io", "ngrok-free.app", "trycloudflare.com",
];

/** Reserved / special-use top-level labels (RFC 2606, 6761, 6762) and other names that never resolve publicly. */
const BLOCKED_TLDS = new Set(["localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "corp", "private", "test", "invalid", "example", "onion", "arpa", "alt", "home.arpa"]);

/** Public suffixes that are two labels long; a domain equal to one of these (e.g. "co.uk") is not registrable. */
const TWO_LABEL_SUFFIXES = new Set(["co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "or.jp", "com.br", "com.mx", "co.in", "co.za", "com.cn", "com.sg", "com.tr", "com.ar", "co.kr", "com.hk", "com.tw"]);

export type HostnameResult = { ok: true; hostname: string } | { ok: false; error: string };

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateHostname(input: unknown): HostnameResult {
  if (typeof input !== "string") return { ok: false, error: "Enter a domain like example.com or shop.example.com." };
  let h = input.trim();
  if (h.length === 0) return { ok: false, error: "Enter a domain like example.com or shop.example.com." };
  if (h.length > 400) return { ok: false, error: "That domain is too long." };
  if (/[\u0000-\u0020\u007f]/.test(h) || /\s/.test(h)) return { ok: false, error: "A domain can't contain spaces." };
  if (/[^\u0000-\u007f]/.test(h)) return { ok: false, error: "Use the ASCII form of the domain. Internationalized (non-English letter) domains aren't supported yet." };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h) || /[/?#@\\:]/.test(h)) return { ok: false, error: "Enter just the domain name, like example.com. Leave out https://, paths, ports and @." };
  if (h.includes("*")) return { ok: false, error: "Wildcard domains aren't supported. Add each subdomain on its own." };
  h = h.toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.length > MAX_HOSTNAME) return { ok: false, error: "That domain is too long." };
  if (h.includes("_")) return { ok: false, error: "A domain can't contain underscores." };
  const labels = h.split(".");
  if (labels.length < 2) return { ok: false, error: "Enter a full domain like example.com (it needs a dot and an ending such as .com)." };
  for (const l of labels) {
    if (l.length === 0) return { ok: false, error: "A domain can't have empty parts (two dots in a row, or a leading dot)." };
    if (!LABEL.test(l)) return { ok: false, error: "Use only letters, digits and hyphens, and don't start or end a part with a hyphen. Each part is at most 63 characters." };
    if (l.startsWith("xn--") || /^..--/.test(l)) return { ok: false, error: "Internationalized (xn--) domains aren't supported yet." };
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) return { ok: false, error: "The domain must end in a real extension such as .com. IP addresses and numbers aren't allowed." };
  if (BLOCKED_TLDS.has(tld)) return { ok: false, error: "That ending can't be used for a public website." };
  for (const b of BLOCKED_SUFFIXES) {
    if (h === b || h.endsWith(`.${b}`)) return { ok: false, error: b === "keplar.one" || b === "keplar.site" ? "That domain belongs to Keplar and can't be connected." : `${b} addresses can't be connected. Use a domain you own.` };
  }
  if (TWO_LABEL_SUFFIXES.has(h)) return { ok: false, error: "That is a public suffix, not a domain you can own. Add a name under it, like yourname.co.uk." };
  return { ok: true, hostname: h };
}

/** Is this host one of Keplar's own (so never a customer domain)? Used by routing. */
export const isReservedHostname = (h: string) => !validateHostname(h).ok;
