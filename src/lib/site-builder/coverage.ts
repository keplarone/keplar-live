import { BRIEF_LIMITS, pageFiles, type SiteBrief } from "./brief";

/**
 * "Requested vs built": a plain text check of the finished files against what the approved brief asked for (name, pages, sections,
 * the main goal, the accent color). It reads the HTML and CSS only. It says whether the thing is there, not whether it looks good;
 * the browser test and the visual review cover that.
 */
export type CoverageItem = { ask: string; built: boolean; where: string; note: string };

const STOP = new Set(["the", "and", "for", "with", "your", "our", "that", "this", "from", "into", "about", "what", "when", "how", "you", "are", "can", "a", "an", "of", "to", "in", "on", "at", "or", "is", "it", "my", "we"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
const stem = (w: string) => w.replace(/(ing|ers|er|es|s|ed)$/, "");

function visible(html: string) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
}
function attrText(html: string) {
  const out: string[] = [];
  for (const m of html.matchAll(/\b(?:id|class|aria-label|alt|title|name)="([^"]{1,80})"/gi)) out.push(m[1].replace(/[-_]/g, " "));
  return out.join(" ");
}
const hasWords = (hay: string, need: string[]) => {
  const h = new Set(words(hay).map(stem));
  const n = need.map(stem);
  return n.length > 0 && n.filter((w) => h.has(w)).length >= Math.max(1, Math.ceil(n.length * 0.6));
};

export function coverage(brief: SiteBrief, files: Record<string, string>): CoverageItem[] {
  const out: CoverageItem[] = [];
  const html = Object.entries(files).filter(([p]) => p.endsWith(".html"));
  const css = Object.entries(files).filter(([p]) => p.endsWith(".css")).map(([, c]) => c).join("\n");
  const textOf = (h: string) => `${visible(h)} ${attrText(h)}`;
  if (brief.name) {
    const hit = html.find(([, h]) => new RegExp(brief.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(visible(h)));
    out.push({ ask: `Name: ${brief.name}`, built: Boolean(hit), where: hit?.[0] ?? "", note: hit ? "On the page" : "Not found in the page text" });
  }
  for (const pf of pageFiles(brief.pages, BRIEF_LIMITS.pages)) {
    const has = pf.file in files;
    out.push({ ask: `Page: ${pf.name}`, built: has, where: has ? pf.file : "", note: has ? pf.file : "No such page was written" });
  }
  for (const sec of brief.sections.slice(0, BRIEF_LIMITS.sections)) {
    const need = words(sec);
    const hit = html.find(([, h]) => hasWords(textOf(h), need));
    out.push({ ask: `Section: ${sec}`, built: Boolean(hit), where: hit?.[0] ?? "", note: hit ? `Found in ${hit[0]}` : "No matching heading or text found" });
  }
  if (brief.goal.trim()) {
    const need = words(brief.goal).slice(0, 6);
    const hit = html.find(([, h]) => [...h.matchAll(/<(a|button|label|form|h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].some((m) => hasWords(visible(m[2]), need.slice(0, 3)) || hasWords(m[0].replace(/<[^>]+>/g, " "), need.slice(0, 3))));
    out.push({ ask: `Goal: ${brief.goal.slice(0, 80)}`, built: Boolean(hit), where: hit?.[0] ?? "", note: hit ? `A link, button or heading for it in ${hit[0]}` : "No link, button or heading for it found" });
  }
  if (brief.accent) {
    const hex = brief.accent.toLowerCase();
    const has = css.toLowerCase().includes(hex) || html.some(([, h]) => h.toLowerCase().includes(hex));
    out.push({ ask: `Accent color ${brief.accent}`, built: has, where: has ? "CSS" : "", note: has ? "Used in the styles" : "Not used in the styles" });
  }
  // Real features the brief asks for in so many words: the placeholder must be on a page, or the feature is missing.
  const ask = `${brief.idea} ${brief.purpose} ${brief.goal} ${brief.sections.join(" ")} ${brief.content}`.toLowerCase();
  for (const f of FEATURE_ASKS) {
    if (!f.re.test(ask)) continue;
    const hit = html.find(([, h]) => h.includes(`data-k-feature="${f.id}"`));
    out.push({ ask: `Feature: ${f.label}`, built: Boolean(hit), where: hit?.[0] ?? "", note: hit ? `Working ${f.label.toLowerCase()} on ${hit[0]}` : `No ${f.label.toLowerCase()} placed on any page` });
  }
  return out.slice(0, 24);
}

/** Wording in a brief that clearly asks for a feature. Conservative on purpose: a miss is fine, a false "missing" is not. */
const FEATURE_ASKS: { id: string; label: string; re: RegExp }[] = [
  { id: "booking", label: "Bookings", re: /\b(book(ing|ings)?|appointments?)\b/ },
  { id: "newsletter", label: "Newsletter or waitlist signup", re: /\b(newsletter|waitlist|wait list|mailing list|subscribe)\b/ },
  { id: "checkout", label: "Checkout (BETA)", re: /\b(checkout|online store|online shop|accept payments?|buy buttons?)\b/ },
  { id: "members", label: "Member login (BETA)", re: /\b(member login|members[- ]only|member area|members area|member accounts?|user accounts?|customer accounts?)\b/ },
  { id: "search", label: "Site search", re: /\b(site search|search bar|search box|search function|searchable)\b/ },
  { id: "blog", label: "Blog", re: /\b(blog|blogging)\b/ },
  { id: "form", label: "Contact form", re: /\b(contact form|enquiry form|inquiry form|get in touch|contact us)\b/ },
];

/** The gaps worth fixing automatically: pages and sections the brief asked for that the files do not show. (Name, goal and accent are text guesses, so they are reported but never trigger a rebuild.) */
export function gapsOf(items: CoverageItem[]): CoverageItem[] {
  return items.filter((i) => !i.built && /^(Page|Section|Feature): /.test(i.ask)).slice(0, 4);
}

/** The change request sent to the builder for those gaps. It names exactly what is missing and says to leave everything else alone. */
export function fixPrompt(gaps: CoverageItem[]): string {
  const list = gaps.map((g) => g.ask.replace(/^(Page|Section|Feature): /, (_, k: string) => `${k.toLowerCase()} `)).join("; ");
  return `Self-review against the approved brief found these missing: ${list}. Add each one with real, specific content that fits this site, linked from the navigation where it is a page. Keep everything else exactly as it is.${gaps.some((g) => g.ask.startsWith("Feature: ")) ? " For a missing feature, place its data-k-feature placeholder (see REAL FEATURES) on the right page; do not write your own form." : ""}`;
}
