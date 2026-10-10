/** Redaction for shared chats. Pure (no server imports) so the share dialog can preview exactly what the server will store. */
const MASK = "[hidden]";
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone numbers: optional +country, 7+ digits with common separators. Long digit runs (cards, accounts, IDs): 9+ digits possibly grouped.
const PHONE = /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?(?![\w])/g;
// A sentence-ending period after the number is fine; a decimal point (version numbers, amounts) is not part of an ID.
const LONG_NUMBER = /(?<![\w+]|\d\.)\+?\d(?:[ -]?\d){8,}(?!\w|\.\d)/g;
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces personal details and the owner's terms. Returns the text and how many replacements were made. */
export function redactText(text: string, opts: { auto: boolean; terms: string[] }): { text: string; count: number } {
  let count = 0;
  let out = text;
  const swap = (rx: RegExp) => { out = out.replace(rx, () => { count++; return MASK; }); };
  if (opts.auto) { swap(EMAIL); swap(LONG_NUMBER); swap(PHONE); }
  for (const term of opts.terms) {
    const t = term.trim();
    if (t.length < 2) continue;
    swap(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(t)}(?![\\p{L}\\p{N}])`, "giu"));
  }
  return { text: out, count };
}
