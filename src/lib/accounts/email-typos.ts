/**
 * "Did you mean keplar.one?" Pure (no DOM, no node APIs): runs in the form on blur and on the server.
 * Suggests a well-known domain when the typed one is a near miss (one or two edits, a swapped pair, or extra
 * letters glued in front such as `fafafafkeplar.one`). Never suggests for a domain that already is on the list.
 */
export const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "aol.com", "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com", "fastmail.com", "hey.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "keplar.one",
] as const;

/** Optimal-string-alignment distance (insert, delete, replace, swap adjacent), small inputs only. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** A close, more common domain for `domain` (lower-cased, no "@"), or null. */
export function suggestDomain(domain: string): string | null {
  const d = domain.trim().toLowerCase();
  if (!d || !d.includes(".") || (COMMON_DOMAINS as readonly string[]).includes(d)) return null;
  let best: { domain: string; score: number } | null = null;
  for (const c of COMMON_DOMAINS) {
    // letters glued in front of a real domain ("fafafafkeplar.one", "agmail.com"), but not a legitimate subdomain ("mail.keplar.one")
    const glued = c.length >= 8 && d.endsWith(c) && !d.endsWith(`.${c}`);
    const dist = distance(d, c);
    const limit = c.length <= 8 ? 1 : 2;
    const score = glued ? 0.5 : dist <= limit ? dist : Infinity;
    if (score !== Infinity && (!best || score < best.score)) best = { domain: c, score };
  }
  return best?.domain ?? null;
}

/** The corrected full address ("team@ekeplar.one" -> "team@keplar.one"), or null when nothing looks wrong. */
export function suggestEmail(email: string): string | null {
  const at = email.trim().lastIndexOf("@");
  if (at < 1) return null;
  const s = suggestDomain(email.trim().slice(at + 1));
  return s ? `${email.trim().slice(0, at)}@${s}` : null;
}
