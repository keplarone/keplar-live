/**
 * Post-generation critique for a site: a banned-pattern checker, contrast check, overflow heuristics and semantic HTML
 * checks over the (already sanitized) files. Pure. `fixSite` applies the fixes that need no model; whatever is left
 * is handed to one model repair pass by job.ts.
 *
 * What this cannot do: it reads source, not pixels. A rendered mobile screenshot / overflow check needs a browser; that
 * runs in scripts/site-qa.mjs (used for QA here), not inside the serverless build.
 */
import { contrast, hueOf, parseHex, rgbToHsl } from "./color";
import { hasDesignSystem, stripDesignSystem } from "./design-css";
import type { SiteBrief } from "./brief";
import { stockFindings } from "./sameness";
import type { Recipe } from "./variation";

export type Severity = "error" | "warn";
export type Finding = { code: string; severity: Severity; file: string; message: string; sample?: string };
export type LintReport = {
  errors: number;
  warnings: number;
  findings: Finding[];
  contrast: { pair: string; ratio: number; min: number; ok: boolean }[];
  placeholders: number;
};

const LOREM = /lorem ipsum|dolor sit amet|consectetur adipiscing|sed do eiusmod/i;
const CLICHES = [
  /unlock the (power|potential)/i, /\brevolutioni[sz]e/i, /\bseamless(ly)?\b/i, /elevate your/i, /cutting[- ]edge/i, /game[- ]chang/i, /\bsupercharge/i, /next[- ]level/i,
  /in today'?s (fast[- ]paced|digital|modern)/i, /^welcome to\b/i, /\bleverag(e|ing)\b/i, /\bempower(s|ing)?\b/i, /state[- ]of[- ]the[- ]art/i, /\bsynerg/i, /one[- ]stop[- ]shop/i, /world[- ]class/i,
  /innovative solutions/i, /take (your|it) .{0,30}to the next level/i, /your journey/i, /\bnavigate the (complex|landscape)/i, /\bdelve\b/i, /\btapestry\b/i, /\bbespoke solutions\b/i,
];
const TESTIMONIAL_HEADING = /\b(testimonials?|what (our )?(clients|customers|people|guests|users) (say|are saying)|loved by|trusted by|as seen (in|on)|featured in|rated \d)/i;
const HISTORY = /\b(?:since|est\.?|established(?: in)?|founded(?: in)?)\s+(?:19|20)\d{2}\b|\bfamily[- ](?:run|owned)\b|\blocally[- ]owned\b|\b\d{1,2}\+? years(?: of experience| in business)\b/gi;
const STAT = /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(\+|k\+|m\+|x|%)?\s*(happy |satisfied |active |monthly )?(customers|clients|users|downloads|reviews|projects|companies|teams|businesses|guests|patients|members|stars?|countries|installs)\b/gi;
const PURPLE_NAMES = /\b(purple|violet|indigo|fuchsia|magenta|orchid|plum)\b/i;
const BAD_ARROWS = new Set(["→", "←", "↑", "↓", "↗", "↘", "↖", "↙", "↔", "©", "®", "™", "•", "·", "—", "–"]);

const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const bodyOf = (html: string) => /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function isPurple(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  const [h, s, l] = rgbToHsl(rgb);
  return h >= 255 && h <= 312 && s > 0.3 && l > 0.2 && l < 0.85;
}

/** CSS custom properties from the stylesheet text (later declarations win). */
export function cssVars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Only :root blocks define the palette (later rules such as .k-invert re-scope tokens); the first definition wins.
  const roots = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
  for (const body of roots.length ? roots : [css]) for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;}{]+)/g)) if (!(m[1] in out)) out[m[1]] = m[2].trim();
  return out;
}
const resolveColor = (v: string | undefined, vars: Record<string, string>, depth = 0): string | null => {
  if (!v || depth > 4) return null;
  const t = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3,6}$/.test(t)) return parseHex(t) ? t : null;
  const m = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(t);
  if (m) return resolveColor(vars[m[1]], vars, depth + 1);
  return null;
};

export function contrastChecks(css: string) {
  const v = cssVars(css);
  const pairs: [string, string, string, number][] = [
    ["ink on page", "--ink", "--bg", 7],
    ["muted text on page", "--ink-2", "--bg", 4.5],
    ["muted text on raised surface", "--ink-2", "--bg-2", 4.5],
    ["accent text on page", "--accent-text", "--bg", 4.5],
    ["button text on accent", "--on-accent", "--accent", 4.5],
    ["accent text on soft accent", "--accent-text", "--accent-soft", 4.5],
  ];
  const out: LintReport["contrast"] = [];
  for (const [label, a, b, min] of pairs) {
    const fg = resolveColor(`var(${a})`, v);
    const bg = resolveColor(`var(${b})`, v);
    if (!fg || !bg) continue;
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    out.push({ pair: label, ratio, min, ok: ratio >= min });
  }
  return out;
}

/** Rules that set both a text color and a background to colors we can resolve; flags weak pairs. */
function ruleContrast(css: string, file: string, findings: Finding[], vars?: Record<string, string>) {
  const v = vars ?? cssVars(css);
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(css)) && n < 400) {
    const decl = m[2];
    const col = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(decl)?.[1];
    const bgv = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(decl)?.[1];
    if (!col || !bgv) continue;
    n++;
    const fg = resolveColor(col, v);
    const bg = resolveColor(bgv.trim().split(/\s+/)[0], v);
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) findings.push({ code: "low-contrast", severity: ratio < 3 ? "error" : "warn", file, message: `Text contrast ${ratio.toFixed(1)}:1 (needs 4.5:1) in \`${m[1].trim().slice(0, 50)}\`.`, sample: m[1].trim().slice(0, 60) });
  }
}

export type LintContext = { brief?: Pick<SiteBrief, "content" | "idea"> | null; /** The structure recipe drawn for the project (enables the 404 and vocabulary checks). */ recipe?: Recipe | null; /** Site predates the design system: skip checks that need it. */ legacy?: boolean };

export function lintSite(files: Record<string, string>, ctx: LintContext = {}): LintReport {
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const given = norm(`${ctx.brief?.content ?? ""} ${ctx.brief?.idea ?? ""}`);
  const cssAll = Object.entries(files).filter(([p]) => p.endsWith(".css")).map(([, c]) => c).join("\n");
  const inlineCss = Object.values(files).flatMap((h) => [...h.matchAll(/style="([^"]*)"/g)].map((m) => m[1])).join(";");
  let placeholders = 0;

  // ── CSS-level checks
  const cssFile = Object.keys(files).find((p) => p.endsWith(".css")) ?? "styles.css";
  const fullCss = `${cssAll}\n${inlineCss}`;
  for (const g of fullCss.matchAll(/(?:linear|radial|conic)-gradient\(([^;{}]*)/gi)) {
    const body = g[1];
    const hexes = [...body.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((x) => x[0]);
    const hsl = [...body.matchAll(/hsla?\(\s*(\d+)/gi)].map((x) => Number(x[1]));
    if (hexes.some(isPurple) || PURPLE_NAMES.test(body) || hsl.some((h) => h >= 255 && h <= 312)) {
      add({ code: "purple-gradient", severity: "error", file: cssFile, message: "A purple/violet gradient: the default AI look. Use the palette tokens (var(--accent), var(--ink)) and flat color fields.", sample: g[0].slice(0, 80) });
      break;
    }
  }
  if (/linear-gradient\([^)]*(?:#fff|white)[^)]*\)/i.test(fullCss) && (fullCss.match(/linear-gradient\(/gi) ?? []).length > 6) add({ code: "gradient-heavy", severity: "warn", file: cssFile, message: "Many gradients; prefer flat color, hairlines and type." });
  ruleContrast(stripDesignSystem(cssAll), cssFile, findings, cssVars(cssAll));
  for (const m of stripDesignSystem(cssAll).matchAll(/(?<![-\w])(?<!\(\s*)(?:min-)?width\s*:\s*(\d{3,4})px/gi)) {
    const px = Number(m[1]);
    const isMin = /min-width/i.test(m[0]);
    if ((isMin && px >= 421) || (!isMin && px >= 480 && !/max-width/i.test(m[0]))) {
      add({ code: "fixed-width", severity: isMin ? "error" : "warn", file: cssFile, message: `Fixed ${isMin ? "min-" : ""}width of ${px}px can overflow phones (390px wide). Use max-width, %, or min().`, sample: m[0] });
      break;
    }
  }
  if (/width\s*:\s*100vw/i.test(stripDesignSystem(cssAll))) add({ code: "100vw", severity: "warn", file: cssFile, message: "width:100vw causes a horizontal scrollbar on desktop. Use 100%." });
  if (/white-space\s*:\s*nowrap/i.test(stripDesignSystem(cssAll))) add({ code: "nowrap", severity: "warn", file: cssFile, message: "white-space:nowrap can overflow on phones." });
  if (!ctx.legacy && !hasDesignSystem(cssAll) && cssAll) add({ code: "no-design-system", severity: "error", file: cssFile, message: "The Keplar design system block is missing from styles.css." });
  const own = stripDesignSystem(cssAll);
  if (own.length > 40_000) add({ code: "css-heavy", severity: "warn", file: cssFile, message: "The custom CSS is very large; the design system already covers the basics." });
  if (/#(?:6366f1|8b5cf6|7c3aed|a855f7|4f46e5|7c4dff)\b/i.test(own)) add({ code: "default-indigo", severity: "warn", file: cssFile, message: "Uses the stock indigo/violet palette. Pick from the tokens." });

  const pages = Object.entries(files).filter(([p]) => p.endsWith(".html"));
  for (const [file, html] of pages) {
    const body = bodyOf(html);
    const text = textOf(body);
    if (LOREM.test(text)) add({ code: "lorem", severity: "error", file, message: "Lorem ipsum filler text." });

    // Emoji used as icons or decoration.
    const emoji = [...text].filter((ch) => /\p{Extended_Pictographic}/u.test(ch) && !BAD_ARROWS.has(ch));
    if (emoji.length) add({ code: "emoji", severity: "error", file, message: `Emoji used as icons or decoration (${[...new Set(emoji)].slice(0, 4).join(" ")}). Use type, rules or inline SVG.` });

    // Unverified testimonials and credibility claims.
    for (const m of body.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
      const q = norm(textOf(m[1])).slice(0, 60);
      if (q.length > 12 && !given.includes(q.slice(0, 40))) add({ code: "fake-testimonial", severity: "error", file, message: "A quote that was not supplied by the owner (invented testimonial).", sample: textOf(m[1]).slice(0, 80) });
    }
    for (const m of body.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)) {
      const h = textOf(m[1]);
      if (TESTIMONIAL_HEADING.test(h) && !given.includes(norm(h).slice(0, 30))) add({ code: "fake-proof", severity: "error", file, message: `Heading "${h.slice(0, 50)}" claims social proof that was not provided.` });
    }
    if (/class="[^"]*\b(testimonials?|reviews?|logos?-?(cloud|strip|row)|stars?)\b/i.test(body) || /[★⭐]{2,}/.test(text)) add({ code: "fake-proof", severity: "error", file, message: "Testimonial/review/logo-strip markup or star ratings with no supplied source." });
    for (const m of text.matchAll(STAT)) {
      const digits = norm(m[1]);
      if (!given.includes(digits)) add({ code: "fake-stat", severity: "error", file, message: `Statistic "${m[0].trim()}" was not provided by the owner.`, sample: m[0].trim() });
    }
    if (/\b(99\.9\d?%|100% (satisfaction|guarantee)|award[- ]winning|#1 (rated|in))\b/i.test(text) && !given.includes("award")) add({ code: "fake-claim", severity: "error", file, message: "Unverifiable superlative claim (award-winning / 100% / #1)." });

    for (const m of text.matchAll(HISTORY)) {
      const key = norm(m[0]);
      if (!given.includes(key)) add({ code: "fake-history", severity: "error", file, message: `"${m[0].trim()}" is an invented history claim (the owner did not provide it). Remove it or mark a placeholder.`, sample: m[0].trim() });
    }

    // Cliché copy.
    const hits = CLICHES.filter((re) => re.test(text));
    if (hits.length) add({ code: "cliche-copy", severity: hits.length >= 3 ? "error" : "warn", file, message: `Generic AI-sounding phrases (${hits.length}): ${hits.slice(0, 3).map((r) => text.match(r)?.[0]).join(", ")}. Write specific copy.` });

    // Template-looking layout: several sibling .card blocks.
    const cards = (body.match(/class="[^"]*\bcard\b/g) ?? []).length;
    if (cards >= 3) add({ code: "card-grid", severity: "warn", file, message: `${cards} identical cards in a grid. Use rows, an index list, or an asymmetric composition.` });

    // Placeholders count.
    placeholders += (html.match(/class="[^"]*\bk-todo\b/g) ?? []).length + (text.match(/\[(Add|Your|Insert)[^\]]{2,40}\]/g) ?? []).length;

    // Semantics.
    if (!/<main[\s>]/i.test(body)) add({ code: "no-main", severity: "error", file, message: "Missing <main> landmark." });
    if (!/<header[\s>]/i.test(body)) add({ code: "no-header", severity: "warn", file, message: "Missing <header>." });
    if (!/<nav[\s>]/i.test(body)) add({ code: "no-nav", severity: "warn", file, message: "Missing <nav>." });
    if (!/<footer[\s>]/i.test(body)) add({ code: "no-footer", severity: "warn", file, message: "Missing <footer>." });
    const h1 = (body.match(/<h1[\s>]/gi) ?? []).length;
    if (h1 === 0) add({ code: "no-h1", severity: "error", file, message: "No <h1>." });
    if (h1 > 1) add({ code: "multi-h1", severity: "warn", file, message: `${h1} <h1> elements; use one per page.` });
    let prev = 0;
    for (const m of body.matchAll(/<h([1-6])[\s>]/gi)) {
      const lvl = Number(m[1]);
      if (prev && lvl > prev + 1) {
        add({ code: "heading-skip", severity: "warn", file, message: `Heading level jumps from h${prev} to h${lvl}.` });
        break;
      }
      prev = lvl;
    }
    if (!/<meta name="description"/i.test(html)) add({ code: "no-description", severity: "warn", file, message: "Missing meta description." });
    const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    if (!title) add({ code: "no-title", severity: "error", file, message: "Missing <title>." });
    else if (title.length > 70) add({ code: "long-title", severity: "warn", file, message: "Title is longer than 70 characters." });
    if ((body.match(/href="#"/g) ?? []).length >= 2) add({ code: "dead-links", severity: "warn", file, message: "Several links go nowhere (href=\"#\")." });
    for (const m of body.matchAll(/<input\b([^>]*)>/gi)) {
      const a = m[1];
      if (/type="(hidden|submit|button|checkbox|radio)"/i.test(a) || /name="_hp"/.test(a) || /tabindex="-1"/.test(a)) continue;
      const id = /\bid="([^"]+)"/.exec(a)?.[1];
      const labelled = /aria-label=/i.test(a) || (id && new RegExp(`for="${id}"`).test(body));
      const wrapped = new RegExp(`<label[^>]*>(?:(?!</label>)[\\s\\S])*${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60)}`, "i").test(body);
      if (!labelled && !wrapped) {
        add({ code: "unlabelled-input", severity: "error", file, message: "A form field has no label." });
        break;
      }
    }
    if ((body.match(/<table[\s>]/gi) ?? []).length && !/k-scroll/.test(body)) add({ code: "table-overflow", severity: "warn", file, message: "A table is not wrapped in .k-scroll; it can overflow phones." });
    if (/style="[^"]*(?:min-)?width\s*:\s*(\d{3,4})px/i.test(body)) {
      const px = Number(/style="[^"]*(?:min-)?width\s*:\s*(\d{3,4})px/i.exec(body)![1]);
      if (px > 400) add({ code: "fixed-width", severity: "error", file, message: `Inline width of ${px}px can overflow phones.` });
    }
    if (html.length > 90_000) add({ code: "heavy-page", severity: "warn", file, message: "Very large page; keep pages focused." });
    if (!ctx.legacy && !/<link rel="stylesheet" href="[^"]*fonts\.googleapis\.com/i.test(html)) add({ code: "no-fonts", severity: "warn", file, message: "The direction's fonts are not linked." });
  }

  const cc = ctx.legacy ? [] : contrastChecks(cssAll);
  for (const c of cc) if (!c.ok) add({ code: "low-contrast", severity: "error", file: cssFile, message: `${c.pair}: ${c.ratio}:1 (needs ${c.min}:1).` });

  if (!ctx.legacy) for (const f of stockFindings(files, { recipe: ctx.recipe })) add(f);

  // De-duplicate identical findings across pages for a short list.
  const seen = new Set<string>();
  const uniq = findings.filter((f) => {
    const k = `${f.code}|${f.file}|${f.sample ?? f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { errors: uniq.filter((f) => f.severity === "error").length, warnings: uniq.filter((f) => f.severity === "warn").length, findings: uniq, contrast: cc, placeholders };
}

/* ───────────────────────── fixes that need no model ───────────────────────── */

const EMOJI_RE = /(?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)/gu;
const stripEmoji = (s: string) => s.replace(EMOJI_RE, (m) => (BAD_ARROWS.has(m) ? m : ""));

/** Applies mechanical fixes. `final` also removes unverifiable testimonials/stats instead of leaving them. */
export function fixSite(files: Record<string, string>, ctx: LintContext & { description?: string; final?: boolean } = {}): { files: Record<string, string>; fixed: string[] } {
  const out: Record<string, string> = { ...files };
  const fixed = new Set<string>();
  const given = norm(`${ctx.brief?.content ?? ""} ${ctx.brief?.idea ?? ""}`);

  for (const [p, src] of Object.entries(files)) {
    let s = src;
    if (p.endsWith(".css")) {
      s = s.replace(/([a-z-]+)\s*:\s*((?:linear|radial|conic)-gradient\([^;{}]*)/gi, (m, prop: string, val: string) => {
        const hexes = [...val.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((x) => x[0]);
        const hsl = [...val.matchAll(/hsla?\(\s*(\d+)/gi)].map((x) => Number(x[1]));
        if (hexes.some(isPurple) || PURPLE_NAMES.test(val) || hsl.some((h) => h >= 255 && h <= 312)) {
          fixed.add("Replaced a purple gradient with the palette accent");
          return `${prop}:var(--accent)`;
        }
        return m;
      });
      if (hasDesignSystem(s)) {
        const own = stripDesignSystem(s);
        const head = s.slice(0, s.length - own.length);
        let o2 = own.replace(/white-space\s*:\s*nowrap\s*;?/gi, () => (fixed.add("Removed nowrap that could overflow phones"), ""));
        o2 = o2.replace(/(?<![-\w])(?<!\(\s*)width\s*:\s*(\d{3,4})px/gi, (m, n: string) => (Number(n) >= 480 ? (fixed.add("Made fixed widths fluid"), `width:min(${n}px,100%)`) : m));
        o2 = o2.replace(/(?<![-\w])(?<!\(\s*)min-width\s*:\s*(\d{3,4})px/gi, (m, n: string) => (Number(n) >= 421 ? (fixed.add("Capped fixed min-widths"), `min-width:min(${n}px,100%)`) : m));
        o2 = o2.replace(/width\s*:\s*100vw/gi, () => (fixed.add("Replaced 100vw with 100%"), "width:100%"));
        s = head + o2;
      }
    } else if (p.endsWith(".html")) {
      const bodyStart = s.indexOf("<body");
      let head = bodyStart >= 0 ? s.slice(0, bodyStart) : "";
      let body = bodyStart >= 0 ? s.slice(bodyStart) : s;
      const before = body;
      body = body.replace(/>([^<]+)</g, (m, t: string) => {
        const r = stripEmoji(t);
        return r === t ? m : `>${r}<`;
      });
      if (body !== before) fixed.add("Removed emoji used as icons");
      // keep one <h1>
      let seenH1 = false;
      body = body.replace(/<h1\b/gi, (m) => {
        if (!seenH1) {
          seenH1 = true;
          return m;
        }
        fixed.add("Demoted extra h1 to h2");
        return "<h2";
      });
      // close tags of demoted h1s: pair them in order
      body = fixH1Closes(body);
      // tables into a scroller
      if (/<table[\s>]/i.test(body) && !/k-scroll/.test(body)) {
        body = body.replace(/<table\b/gi, '<div class="k-scroll"><table').replace(/<\/table>/gi, "</table></div>");
        fixed.add("Wrapped tables so they scroll on phones");
      }
      // Invented history in the footer ("Acme · Family-run since 2012"): drop that segment.
      const b1 = body.replace(/<footer[\s\S]*?<\/footer>/gi, (foot) =>
        foot.replace(/>([^<>]+)</g, (m, txt: string) => {
          const segs = txt.split(/\s*[·•|]\s*/);
          const kept = segs.filter((g) => !new RegExp(HISTORY.source, "i").test(g) || given.includes(norm(g)));
          // A guessed copyright year ("Acme · 2023") becomes the current year.
          const year = String(new Date().getFullYear());
          const dated = kept.map((g) => g.replace(/\b(?:19|20)\d{2}\b/g, (y) => (y === year || given.includes(y) ? y : year)));
          if (kept.length === segs.length && dated.every((g, i) => g === kept[i])) return m;
          return `>${dated.join(" · ")}<`;
        }),
      );
      if (b1 !== body) { fixed.add("Fixed the footer (invented history, wrong year)"); body = b1; }
      if (ctx.final) {
        const b2 = body.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, inner: string) => {
          const q = norm(textOf(inner)).slice(0, 40);
          return q.length > 12 && !given.includes(q) ? "" : m;
        });
        if (b2 !== body) fixed.add("Removed invented testimonials");
        body = b2;
      }
      if (!/<meta name="description"/i.test(head) && ctx.description) {
        head = head.replace("</head>", `<meta name="description" content="${ctx.description.replace(/"/g, "&quot;").slice(0, 160)}">\n</head>`);
        fixed.add("Added a meta description");
      }
      s = head + body;
    }
    out[p] = s;
  }
  return { files: out, fixed: [...fixed] };
}

/** Re-pairs closing tags after extra <h1> were demoted: any </h1> beyond the first becomes </h2>. */
function fixH1Closes(body: string) {
  let n = 0;
  return body.replace(/<\/h1>/gi, () => (++n === 1 ? "</h1>" : "</h2>"));
}

/** A compact list of what is still wrong, for the repair prompt. */
export function findingsForPrompt(r: LintReport, max = 14): string {
  return r.findings
    .filter((f) => f.severity === "error")
    .slice(0, max)
    .map((f) => `- [${f.code}] ${f.file}: ${f.message}${f.sample ? ` (${f.sample})` : ""}`)
    .join("\n");
}

export { hueOf };
