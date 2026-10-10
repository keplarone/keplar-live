/**
 * Anti-sameness. Two parts:
 *  1. `stockFindings`: structural banned patterns that make generated sites interchangeable (hero + three equal cards + closing CTA,
 *     centered-everything, default fonts, one composition repeated, no error page of its own). Pure, over the files.
 *  2. A fingerprint library: every finished build leaves a small, content-free structural fingerprint (no text, no names). A new
 *     build is compared with recent ones; if it is too close to one of them, the repair pass is told to vary the structure.
 * It cannot judge taste. It catches the repetition that people notice.
 */
import { getDirection } from "./design";
import { hueOf, parseHex } from "./color";
import type { Finding } from "./lint";
import { recipeTokens, type Recipe } from "./variation";

export type FingerprintTokens = { structure: string[]; custom: string[]; base: string[]; recipe: string[] };
export type FingerprintRow = { id: string; workspaceId: string; createdAt: string; kind: string; direction: string; tokens: FingerprintTokens };

const classesOf = (attrs: string) => (/class=["']([^"']*)["']/i.exec(attrs)?.[1] ?? "").split(/\s+/).filter(Boolean);
const mainOf = (html: string) => /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
const BASE_NOISE = new Set(["k-section", "k-wrap", "k-wrap--narrow", "k-section--tight"]);

type Sec = { classes: string[]; html: string };

/** Top-level sections of the main landmark (non-nested, by depth counting). */
export function sectionsOf(html: string): Sec[] {
  const main = mainOf(html);
  const out: Sec[] = [];
  let depth = 0;
  let start = -1;
  let cls: string[] = [];
  const tokens = [...main.matchAll(/<(\/?)(section|div|article|header|aside|main|ul|ol|figure|dl|table|nav|footer)\b([^>]*)>/gi)];
  for (const t of tokens) {
    const closing = t[1] === "/";
    if (!closing) {
      if (depth === 0) {
        start = t.index!;
        cls = classesOf(t[3]);
      }
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ classes: cls, html: main.slice(start, t.index! + t[0].length) });
        start = -1;
      }
    }
  }
  return out.length ? out : [{ classes: [], html: main }];
}

const label = (c: string[]) => c.filter((x) => !BASE_NOISE.has(x)).sort().slice(0, 3).join("+") || "plain";

const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "path", "circle", "rect", "line", "use", "wbr"]);
type Node = { tag: string; sig: string; kids: Node[] };

function parseTree(html: string): Node {
  const root: Node = { tag: "root", sig: "", kids: [] };
  const stack: Node[] = [root];
  for (const t of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*?)(\/?)>/gi)) {
    const tag = t[2].toLowerCase();
    if (t[1] === "/") {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node: Node = { tag, sig: `${tag}.${classesOf(t[3]).sort().join(".")}`, kids: [] };
    stack[stack.length - 1].kids.push(node);
    if (!VOID.has(tag) && t[4] !== "/") stack.push(node);
  }
  return root;
}

/** The largest number of sibling blocks with an identical tag and class set inside a section (the "row of three cards"). */
export function repeatedSiblings(sectionHtml: string): number {
  let best = 0;
  const walk = (n: Node, depth: number) => {
    const counts = new Map<string, number>();
    for (const k of n.kids) {
      if (/^(div|article|li|figure|a|section)$/.test(k.tag) && k.sig.includes(".") && !/\.$/.test(k.sig)) counts.set(k.sig, (counts.get(k.sig) ?? 0) + 1);
    }
    for (const c of counts.values()) best = Math.max(best, c);
    if (depth < 5) for (const k of n.kids) walk(k, depth + 1);
  };
  walk(parseTree(sectionHtml), 0);
  return best;
}

const wordCount = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

export function stockFindings(files: Record<string, string>, ctx: { recipe?: Recipe | null } = {}): Finding[] {
  const out: Finding[] = [];
  const index = files["index.html"];
  if (!index) return out;
  const css = Object.entries(files).filter(([p]) => p.endsWith(".css")).map(([, c]) => c).join("\n");
  const secs = sectionsOf(index);
  if (secs.length >= 3) {
    const first = secs[0];
    const last = secs[secs.length - 1];
    const isHero = first.classes.some((c) => /hero/.test(c)) || /<h1\b/i.test(first.html);
    const cards = secs.slice(1, -1).some((s) => repeatedSiblings(s.html) >= 3 && wordCount(s.html) < 260);
    const isCta = last.classes.some((c) => /cta|band|accent-band|banner|closing/.test(c)) || (wordCount(last.html) <= 45 && /class="[^"]*k-btn/.test(last.html));
    if (isHero && cards && isCta) out.push({ code: "stock-hero-cards-cta", severity: "error", file: "index.html", message: "The home page is the stock template: a hero, a row of three or more equal cards, then a closing call-to-action band. Recompose it (different section structures, no equal card row, no closing banner)." });
  }
  const labels = secs.map((s) => label(s.classes));
  const dup = labels.filter((l, i) => l !== "plain" && labels.indexOf(l) !== i);
  if (secs.length >= 4 && dup.length >= 2) out.push({ code: "repeated-composition", severity: "warn", file: "index.html", message: `The same section composition is used ${dup.length + 1} times on the home page (${dup[0]}). Give each section its own structure.` });
  const centered = (css.match(/text-align\s*:\s*center/gi) ?? []).length;
  if (centered >= 6) out.push({ code: "centered-everything", severity: "warn", file: "styles.css", message: `${centered} rules center text. Centered-everything is a template tell; align most text to a column edge.` });
  const own = css.split(/\/\* ?KEPLAR[^*]*\*\//i).pop() ?? css;
  const defaultFont = /font-family\s*:\s*(?:"?)(inter|roboto|arial|helvetica|open sans|poppins|montserrat)\b/i.exec(own);
  if (defaultFont) out.push({ code: "default-font", severity: "warn", file: "styles.css", message: `The stylesheet sets ${defaultFont[1]} directly. Use the direction's fonts (var(--f-display), var(--f-body)).` });
  if (ctx.recipe && !files["404.html"]) out.push({ code: "no-error-page", severity: "warn", file: "404.html", message: "No 404.html. Every site needs its own error page in the site's voice." });
  if (ctx.recipe) {
    const v = ctx.recipe.vocab;
    const prefix = v === "atelier" ? "at" : v === "kitchen" ? "kt" : v === "workshop" ? "wk" : v === "press" ? "pr" : v === "field" ? "fd" : v === "studio" ? "sd" : v === "market" ? "mk" : "sg";
    const used = (index.match(new RegExp(`class="[^"]*\\b${prefix}-[a-z]`, "g")) ?? []).length;
    if (used === 0) out.push({ code: "no-project-vocabulary", severity: "warn", file: "index.html", message: `No ${prefix}-* component classes. The recipe asks for project-specific components named ${prefix}-*.` });
  }
  const generic = /<h[23][^>]*>\s*(features|why choose us|our services|what we offer|get started|meet the team|testimonials)\s*<\/h[23]>/gi;
  const g = [...index.matchAll(generic)].map((m) => m[1]);
  if (g.length >= 2) out.push({ code: "generic-headings", severity: "warn", file: "index.html", message: `Stock section headings (${[...new Set(g)].join(", ")}). Name sections after the actual content.` });
  return out;
}

/* ── fingerprints ── */

export function fingerprintOf(files: Record<string, string>, meta: { direction: string; accent?: string | null; recipe?: Recipe | null }): FingerprintTokens {
  const index = files["index.html"] ?? "";
  const secs = sectionsOf(index).slice(0, 10);
  const labels = secs.map((s) => label(s.classes));
  const structure = [
    ...labels.map((l, i) => `s${i}:${l}`),
    ...labels.slice(1).map((l, i) => `p:${labels[i]}>${l}`),
    `n:${Math.min(12, secs.length)}`,
    `pages:${Object.keys(files).filter((f) => f.endsWith(".html")).length}`,
    `dir:${meta.direction}`,
    `font:${getDirection(meta.direction).fonts.displayName}`,
  ];
  const acc = meta.accent && parseHex(meta.accent) ? Math.round(hueOf(meta.accent) / 30) * 30 : null;
  if (acc !== null) structure.push(`hue:${acc}`);
  const all = Object.values(files).filter((f) => f.startsWith("<")).join(" ");
  const custom = new Set<string>();
  const base = new Set<string>();
  for (const m of all.matchAll(/class=["']([^"']*)["']/gi)) for (const c of m[1].split(/\s+/)) if (c) (c.startsWith("k-") ? base : custom).add(c);
  return { structure, custom: [...custom].slice(0, 120), base: [...base].slice(0, 160), recipe: meta.recipe ? recipeTokens(meta.recipe) : [] };
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i || 1);
}

/** 0 to 1. Weighted so the shared base primitives (k-*) barely count and the structure and recipe count most. */
export function similarity(a: FingerprintTokens, b: FingerprintTokens): number {
  const rec = a.recipe.length && b.recipe.length ? jaccard(a.recipe, b.recipe) : 0;
  const hasRec = a.recipe.length && b.recipe.length;
  const s = jaccard(a.structure, b.structure);
  const c = jaccard(a.custom, b.custom);
  const k = jaccard(a.base, b.base);
  return hasRec ? 0.38 * s + 0.2 * c + 0.07 * k + 0.35 * rec : 0.6 * s + 0.3 * c + 0.1 * k;
}

export const SAMENESS_LIMIT = 0.62;

export function closest(tokens: FingerprintTokens, library: FingerprintRow[]): { score: number; row: FingerprintRow | null } {
  let best = 0;
  let row: FingerprintRow | null = null;
  for (const r of library) {
    const sc = similarity(tokens, r.tokens);
    if (sc > best) {
      best = sc;
      row = r;
    }
  }
  return { score: Math.round(best * 100) / 100, row };
}

export function samenessFinding(score: number): Finding | null {
  return score >= SAMENESS_LIMIT
    ? { code: "too-similar", severity: "error", file: "index.html", message: `This site's structure is ${Math.round(score * 100)}% the same as a recent build (section order, component names, layout). Change the section structures, order and component names so it reads as its own design.` }
    : null;
}

/** Option ids the library used most recently (to steer a new recipe away from them). */
export function recentRecipeTokens(library: FingerprintRow[], max = 40): string[] {
  const sorted = [...library].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, max);
  const counts = new Map<string, number>();
  for (const r of sorted) for (const t of r.tokens.recipe) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
}
