/**
 * Readability-style extraction for web pages (pure: no DOM, no network, no scripts run).
 *
 * A small tolerant HTML tree builder, then the main content is found the way reader modes do it: drop chrome (scripts,
 * nav, footers, cookie banners, share bars, ads), prefer <article>/<main>, otherwise score blocks by paragraph text and
 * commas with a link-density penalty, and emit clean markdown-ish text (headings, lists, quotes, code, tables).
 * Also returns page metadata, JSON-LD facts, and — for Create — a design reference: palette, fonts, nav and calls to action.
 */
import { decodeEntities } from "./xml";

type Node = { tag: string; attrs: Record<string, string>; children: (Node | string)[]; parent: Node | null };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title", "noscript", "template", "svg", "math"]);
const AUTO_CLOSE: Record<string, string[]> = { p: ["p"], li: ["li"], dt: ["dt", "dd"], dd: ["dt", "dd"], tr: ["tr"], td: ["td", "th"], th: ["td", "th"], option: ["option"] };
const BLOCK_CLOSES_P = new Set(["div", "section", "article", "aside", "header", "footer", "nav", "ul", "ol", "table", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "form", "figure", "main", "hr"]);

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rx = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Tolerant tree builder: implicit closes, void and raw-text elements, stray end tags ignored. */
export function parseHtml(html: string): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const rx = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (s: string) => { if (s) cur.children.push(decodeEntities(s)); };
  while ((m = rx.exec(html))) {
    text(html.slice(last, m.index));
    last = rx.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let n: Node | null = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    const closes = AUTO_CLOSE[tag];
    if (closes && closes.includes(cur.tag)) cur = cur.parent ?? root;
    if (BLOCK_CLOSES_P.has(tag) && cur.tag === "p") cur = cur.parent ?? root;
    const node: Node = { tag, attrs: parseAttrs(m[3] ?? ""), children: [], parent: cur };
    cur.children.push(node);
    if (RAW.has(tag)) {
      const end = new RegExp(`</${tag}\\s*>`, "i");
      const rest = html.slice(last);
      const e = end.exec(rest);
      const inner = e ? rest.slice(0, e.index) : rest;
      if (tag !== "svg" && tag !== "math") node.children.push(tag === "title" || tag === "textarea" ? decodeEntities(inner) : inner);
      last = e ? last + e.index + e[0].length : html.length;
      rx.lastIndex = last;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) cur = node;
  }
  text(html.slice(last));
  return root;
}

function* walk(n: Node): Generator<Node> {
  yield n;
  for (const c of n.children) if (typeof c !== "string") yield* walk(c);
}
const textOf = (n: Node): string => n.children.map((c) => (typeof c === "string" ? c : RAW.has(c.tag) ? "" : textOf(c))).join("");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

const CHROME_TAGS = new Set(["script", "style", "noscript", "template", "svg", "math", "iframe", "form", "button", "input", "select", "textarea", "nav", "footer", "aside", "dialog", "canvas", "video", "audio", "object", "embed"]);
const UNLIKELY = /(^|[\s_-])(comment|disqus|share|sharing|social|promo|related|sidebar|footer|foot|nav|navbar|menu|breadcrumb|banner|cookie|consent|gdpr|subscribe|newsletter|signup|advert|ads?|sponsor|popup|modal|overlay|outbrain|taboola|toolbar|masthead|skip|hidden|rating|pagination|pager|widget)([\s_-]|$)/i;
const LIKELY = /article|content|main|body|post|entry|story|text|prose|markdown|blog|page/i;

function isChrome(n: Node): boolean {
  if (CHROME_TAGS.has(n.tag)) return true;
  if (n.tag === "header" && !(n.parent && /article|main/.test(n.parent.tag))) return true;
  const a = n.attrs;
  if ("hidden" in a || a["aria-hidden"] === "true" || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style ?? "")) return true;
  if (a.role && /navigation|banner|contentinfo|complementary|dialog|search/.test(a.role)) return true;
  const sig = `${a.class ?? ""} ${a.id ?? ""}`;
  return UNLIKELY.test(sig) && !LIKELY.test(sig) && n.tag !== "body" && n.tag !== "article" && n.tag !== "main";
}

function prune(n: Node) {
  n.children = n.children.filter((c) => typeof c === "string" || !isChrome(c));
  for (const c of n.children) if (typeof c !== "string") prune(c);
}

function linkDensity(n: Node): number {
  const all = norm(textOf(n)).length || 1;
  let links = 0;
  for (const x of walk(n)) if (x.tag === "a") links += norm(textOf(x)).length;
  return Math.min(1, links / all);
}

/** The node that holds the main content. */
function mainNode(body: Node): Node {
  const by = (tag: string) => [...walk(body)].filter((n) => n.tag === tag).map((n) => ({ n, len: norm(textOf(n)).length })).sort((a, b) => b.len - a.len)[0];
  const art = by("article");
  if (art && art.len >= 500) return art.n;
  const main = by("main") ?? [...walk(body)].filter((n) => n.attrs.role === "main").map((n) => ({ n, len: norm(textOf(n)).length }))[0];
  if (main && main.len >= 400) return main.n;
  const scores = new Map<Node, number>();
  for (const n of walk(body)) {
    if (!/^(p|pre|td|blockquote|li)$/.test(n.tag)) continue;
    const t = norm(textOf(n));
    if (t.length < 25) continue;
    const s = 1 + (t.match(/[,，]/g)?.length ?? 0) + Math.min(3, Math.floor(t.length / 100));
    const p = n.parent, g = p?.parent;
    if (p) scores.set(p, (scores.get(p) ?? 0) + s);
    if (g) scores.set(g, (scores.get(g) ?? 0) + s / 2);
  }
  let best: Node | null = null, bestScore = 0;
  for (const [n, s] of scores) {
    const sig = `${n.attrs.class ?? ""} ${n.attrs.id ?? ""}`;
    const adj = s * (1 - linkDensity(n)) * (LIKELY.test(sig) ? 1.25 : 1);
    if (adj > bestScore) { best = n; bestScore = adj; }
  }
  // Pull in siblings that are also content (articles split across several divs).
  if (best?.parent && bestScore > 0) {
    const sib = best.parent.children.filter((c): c is Node => typeof c !== "string" && (c === best || (scores.get(c) ?? 0) >= bestScore * 0.3));
    if (sib.length > 1) return { tag: "div", attrs: {}, children: sib, parent: null };
  }
  return best ?? body;
}

/** Markdown-ish text of a subtree. */
function render(n: Node, out: string[], ctx: { list: number; pre: boolean } = { list: 0, pre: false }) {
  const inline = (x: Node): string => x.children.map((c) => (typeof c === "string" ? c : c.tag === "br" ? "\n" : c.tag === "img" ? (c.attrs.alt ? ` [image: ${c.attrs.alt}] ` : "") : c.tag === "code" ? `\`${textOf(c)}\`` : inline(c))).join("");
  for (const c of n.children) {
    if (typeof c === "string") { const t = norm(c); if (t) out.push(t); continue; }
    const tag = c.tag;
    if (/^h[1-6]$/.test(tag)) { const t = norm(inline(c)); if (t) out.push(`\n${"#".repeat(Number(tag[1]))} ${t}\n`); }
    else if (tag === "p") { const t = norm(inline(c)); if (t) out.push(`\n${t}\n`); }
    else if (tag === "pre") { const t = textOf(c).replace(/\n+$/, ""); if (t.trim()) out.push(`\n\`\`\`\n${t}\n\`\`\`\n`); }
    else if (tag === "li") { const t = norm(inline({ ...c, children: c.children.filter((x) => typeof x === "string" || !/^(ul|ol)$/.test(x.tag)) })); if (t) out.push(`\n${"  ".repeat(Math.max(0, ctx.list - 1))}- ${t}`); for (const sub of c.children) if (typeof sub !== "string" && /^(ul|ol)$/.test(sub.tag)) render(sub, out, { ...ctx, list: ctx.list + 1 }); }
    else if (tag === "ul" || tag === "ol") { render(c, out, { ...ctx, list: ctx.list + 1 }); out.push("\n"); }
    else if (tag === "blockquote") { const t = norm(textOf(c)); if (t) out.push(`\n> ${t}\n`); }
    else if (tag === "table") {
      const rows = [...walk(c)].filter((x) => x.tag === "tr").slice(0, 60).map((tr) => tr.children.filter((x): x is Node => typeof x !== "string" && (x.tag === "td" || x.tag === "th")).map((td) => norm(textOf(td)).replace(/\|/g, "\\|")));
      if (rows.length) out.push(`\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`);
    } else if (tag === "img") { if (c.attrs.alt && c.attrs.alt.length > 3) out.push(` [image: ${c.attrs.alt}] `); }
    else if (tag === "figcaption") { const t = norm(textOf(c)); if (t) out.push(`\n_${t}_\n`); }
    else if (tag === "br") out.push("\n");
    else if (tag === "hr") out.push("\n---\n");
    else if (/^(div|section|article|main|figure|header|dl|dd|dt|details|summary|span|a|strong|em|b|i|u|small|time|mark|sup|sub|abbr|cite|q|label|tbody|thead|center|font)$/.test(tag) || !RAW.has(tag)) render(c, out, ctx);
  }
}

export type PageRead = {
  title: string;
  description?: string;
  siteName?: string;
  author?: string;
  published?: string;
  lang?: string;
  canonical?: string;
  image?: string;
  favicon?: string;
  headings: string[];
  text: string;
  /** Facts from JSON-LD structured data (Article, Product, Recipe, Event, FAQ …), one line each. */
  structured: string[];
  /** Design reference for Create. */
  design: { palette: string[]; fonts: string[]; nav: string[]; ctas: string[]; sections: string[] };
  words: number;
  /** The page renders its content with scripts: only metadata was readable. */
  scriptRendered: boolean;
};

const metaOf = (root: Node) => {
  const m = new Map<string, string>();
  for (const n of walk(root)) {
    if (n.tag !== "meta") continue;
    const k = (n.attrs.property ?? n.attrs.name ?? n.attrs.itemprop ?? "").toLowerCase();
    if (k && n.attrs.content && !m.has(k)) m.set(k, norm(n.attrs.content));
  }
  return m;
};

function absolutize(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function jsonLdFacts(root: Node): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth = 0) => {
    if (!v || typeof v !== "object" || depth > 4 || out.length >= 12) return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    const o = v as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) visit(o["@graph"], depth + 1);
    const type = String(Array.isArray(o["@type"]) ? o["@type"][0] : o["@type"] ?? "");
    if (!type) return;
    const s = (x: unknown) => (typeof x === "string" ? norm(x) : typeof x === "number" ? String(x) : x && typeof x === "object" && "name" in (x as object) ? norm(String((x as { name: unknown }).name)) : "");
    const parts: string[] = [];
    for (const k of ["name", "headline", "description", "datePublished", "dateModified", "startDate", "endDate", "location", "brand", "sku", "ratingValue", "recipeYield", "totalTime", "author", "publisher"]) {
      const val = Array.isArray(o[k]) ? (o[k] as unknown[]).map(s).filter(Boolean).join(", ") : s(o[k]);
      if (val) parts.push(`${k}: ${val.slice(0, 200)}`);
    }
    const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
    if (offers && typeof offers === "object" && (offers.price || offers.lowPrice)) parts.push(`price: ${offers.price ?? offers.lowPrice} ${offers.priceCurrency ?? ""}`.trim());
    const rating = o.aggregateRating as Record<string, unknown> | undefined;
    if (rating && typeof rating === "object" && rating.ratingValue) parts.push(`rating: ${rating.ratingValue}/${rating.bestRating ?? 5} (${rating.reviewCount ?? rating.ratingCount ?? "?"} reviews)`);
    if (Array.isArray(o.recipeIngredient)) parts.push(`ingredients: ${(o.recipeIngredient as unknown[]).map(s).join("; ").slice(0, 600)}`);
    if (Array.isArray(o.mainEntity) && type === "FAQPage") for (const q of (o.mainEntity as Record<string, unknown>[]).slice(0, 6)) parts.push(`Q: ${s(q.name)} A: ${s((q.acceptedAnswer as Record<string, unknown>)?.text).slice(0, 200)}`);
    if (parts.length && !/^(WebSite|WebPage|BreadcrumbList|Organization|SiteNavigationElement|ImageObject|SearchAction)$/.test(type)) out.push(`${type}: ${parts.join(" · ")}`);
  };
  for (const n of walk(root)) {
    if (n.tag !== "script" || !/ld\+json/i.test(n.attrs.type ?? "")) continue;
    try {
      visit(JSON.parse(String(n.children[0] ?? "")));
    } catch {
      /* broken JSON-LD is common */
    }
  }
  return out;
}

const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi;
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("")}`;

/** Most used colors in the page's CSS, near-duplicates merged, theme-color first. */
export function paletteFrom(css: string, theme?: string): string[] {
  const counts = new Map<string, number>();
  const add = (hex: string, w = 1) => counts.set(hex, (counts.get(hex) ?? 0) + w);
  for (const m of css.matchAll(HEX)) {
    const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
    add(`#${h.toLowerCase()}`);
  }
  for (const m of css.matchAll(RGB)) add(toHex(+m[1], +m[2], +m[3]));
  if (theme && /^#[0-9a-f]{3,6}$/i.test(theme)) add(theme.length === 4 ? `#${theme.slice(1).split("").map((c) => c + c).join("")}`.toLowerCase() : theme.toLowerCase(), 1000);
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out: string[] = [];
  for (const [hex] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const [r, g, b] = rgb(hex);
    if (out.some((o) => { const [r2, g2, b2] = rgb(o); return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) < 40; })) continue;
    out.push(hex);
    if (out.length >= 8) break;
  }
  return out;
}

/** "Article | Site" → "Article" when the tail is the site's name or the head matches the page's h1. */
function cleanTitle(t: string, site: string | undefined, h1: string): string {
  const m = /^(.{2,}?)\s+[|\-–—·:»]\s+([^|–—·»]{2,60})$/.exec(t);
  if (!m) return t;
  const [, head, tail] = m;
  const same = (a: string, b: string) => a.toLowerCase().replace(/\W+/g, "") === b.toLowerCase().replace(/\W+/g, "");
  if ((site && same(tail, site)) || (h1 && same(head, h1))) return head;
  return t;
}

export function readHtml(html: string, url: string): PageRead {
  const root = parseHtml(html.length > 3_000_000 ? html.slice(0, 3_000_000) : html);
  const meta = metaOf(root);
  const all = [...walk(root)];
  const titleTag = norm(textOf(all.find((n) => n.tag === "title") ?? { tag: "", attrs: {}, children: [], parent: null }));
  const h1 = all.find((n) => n.tag === "h1");
  const title = cleanTitle(meta.get("og:title") || meta.get("twitter:title") || titleTag || (h1 ? norm(textOf(h1)) : "") || new URL(url).hostname, meta.get("og:site_name"), h1 ? norm(textOf(h1)) : "");
  const css = all.filter((n) => n.tag === "style").map((n) => String(n.children[0] ?? "")).join("\n") + "\n" + all.map((n) => n.attrs.style ?? "").join(";");
  const fonts = [...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map((m) => m[1].split(",")[0].replace(/["']/g, "").trim()).filter((f) => f && !/^(inherit|initial|var\(|-apple-system|system-ui|sans-serif|serif|monospace)/i.test(f));
  const fontCounts = new Map<string, number>();
  for (const f of fonts) fontCounts.set(f, (fontCounts.get(f) ?? 0) + 1);
  for (const n of all) if (n.tag === "link" && /fonts\.googleapis\.com/.test(n.attrs.href ?? "")) for (const fam of (n.attrs.href ?? "").matchAll(/family=([^:&]+)/g)) fontCounts.set(decodeURIComponent(fam[1]).replace(/\+/g, " "), 99);
  const navNode = all.find((n) => n.tag === "nav" || n.attrs.role === "navigation");
  const nav = navNode ? [...walk(navNode)].filter((n) => n.tag === "a").map((a) => norm(textOf(a))).filter((t) => t && t.length < 30).filter((t, i, a) => a.indexOf(t) === i).slice(0, 10) : [];
  const ctas = all.filter((n) => n.tag === "button" || (n.tag === "a" && /btn|button|cta|primary/i.test(n.attrs.class ?? ""))).map((n) => norm(textOf(n))).filter((t) => t && t.length < 40).filter((t, i, a) => a.indexOf(t) === i).slice(0, 8);
  const structured = jsonLdFacts(root);
  const body = all.find((n) => n.tag === "body") ?? root;
  const sections = [...walk(body)].filter((n) => /^h[23]$/.test(n.tag)).map((n) => norm(textOf(n))).filter(Boolean).slice(0, 14);
  prune(body);
  const main = mainNode(body);
  const parts: string[] = [];
  render(main, parts);
  const text = parts.join(" ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const headings = [...walk(main)].filter((n) => /^h[1-3]$/.test(n.tag)).map((n) => `${"#".repeat(Number(n.tag[1]))} ${norm(textOf(n))}`).filter((h) => h.length > 3).slice(0, 30);
  const htmlLang = all.find((n) => n.tag === "html")?.attrs.lang;
  const icon = all.find((n) => n.tag === "link" && /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(n.attrs.rel ?? ""));
  const canonical = all.find((n) => n.tag === "link" && /canonical/i.test(n.attrs.rel ?? ""))?.attrs.href;
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    title: title.slice(0, 300),
    description: (meta.get("og:description") || meta.get("description") || meta.get("twitter:description"))?.slice(0, 600),
    siteName: meta.get("og:site_name")?.slice(0, 100),
    author: (meta.get("author") || meta.get("article:author"))?.slice(0, 120),
    published: (meta.get("article:published_time") || meta.get("date") || all.find((n) => n.tag === "time" && n.attrs.datetime)?.attrs.datetime)?.slice(0, 40),
    lang: htmlLang?.slice(0, 12),
    canonical: absolutize(canonical, url),
    image: absolutize(meta.get("og:image") || meta.get("twitter:image"), url),
    favicon: absolutize(icon?.attrs.href ?? "/favicon.ico", url),
    headings,
    text,
    structured,
    design: { palette: paletteFrom(css, meta.get("theme-color")), fonts: [...fontCounts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 4), nav, ctas, sections },
    words,
    scriptRendered: words < 60 && !structured.length,
  };
}
