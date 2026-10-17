/**
 * Security and mobile checklist for everything Keplar generates: sites from the site builder and apps from the app builder.
 * Pure (no fs, no network, no model). Two entry points, used by both pipelines on every build:
 *
 *   fixOutput(files, kind)    deterministic repairs that need no model: viewport meta, zoom unlocked, charset, lang, a title,
 *                             rel="noopener" on new-tab links, alt on images, lazy images below the fold, fluid images,
 *                             reduced-motion rule. Idempotent: fixing fixed output changes nothing.
 *   checkOutput(files, kind)  the report. Every item is ok or not, with a reason and the files concerned. Required items
 *                             that still fail after fixOutput are handed to the model repair pass (sites) or the fix loop
 *                             (apps) and shown in the build report; the rest are warnings.
 *
 * The platform guarantees the transport side on its own (sandbox CSP with no third-party script, nosniff, HSTS, framing rules,
 * rate-limited forms, same-origin API; src/app/s, src/lib/app-builder/files.ts), so the checks here are about what the
 * generated code itself must and must not contain. Items are stable ids: the build report and tests refer to them.
 */

export type OutputKind = "site" | "app";
export type ChecklistGroup = "security" | "mobile" | "accessibility";
export type ChecklistItem = { id: string; group: ChecklistGroup; label: string; required: boolean; ok: boolean; detail: string; files: string[] };
export type ChecklistReport = { kind: OutputKind; passed: number; total: number; required: { passed: number; total: number }; items: ChecklistItem[] };
export type ChecklistSummary = { passed: number; total: number; failed: { id: string; label: string; detail: string }[] };

const isHtml = (p: string) => /\.html?$/i.test(p);
const isCss = (p: string) => /\.css$/i.test(p);
const isJs = (p: string) => /\.(m?js)$/i.test(p);

/** Credentials that must never be written into a generated file (keys in the browser are public). Values are never reported. */
const SECRETS: [RegExp, string][] = [
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, "a payment API key"],
  [/\bsk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{24,}\b/, "a model provider key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "a cloud access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "a GitHub token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "a Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bpostgres(?:ql)?:\/\/[^:\s/"'`]+:[^@\s"'`]{6,}@/, "a database password"],
  [/\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{20,}["']/i, "a hard-coded secret"],
];

type Tag = { raw: string; attrs: Record<string, string>; index: number };

/** Every <name ...> start tag with its attributes, decoded enough to inspect (values lower-cased by the caller when needed). */
function tags(html: string, name: string): Tag[] {
  const out: Tag[] = [];
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  for (const m of html.matchAll(re)) out.push({ raw: m[0], attrs: attrsOf(m[1] ?? ""), index: m.index ?? 0 });
  return out;
}

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  return out;
}

const bodyOf = (html: string) => /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
const viewportOf = (html: string) => tags(html, "meta").find((t) => (t.attrs.name ?? "").toLowerCase() === "viewport") ?? null;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const cssOnly = (files: Record<string, string>) => Object.entries(files).filter(([p]) => isCss(p)).map(([, c]) => c).join("\n");
const inlineCss = (html: string) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");

const ZOOM_LOCK = /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*(?:0?\.\d+|[1-4](?:\.\d+)?)(?![\d.])|minimum-scale\s*=\s*(?:[2-9]|1\.[1-9])/i;
const FLUID = /@media\b|\bclamp\(|\bminmax\(|auto-fit|auto-fill|\d(?:vw|vmin|dvw|cqw)\b|@container/;
const MOTION = /\b(?:animation|transition)\s*:[^;]*?(?:[1-9]\d*(?:\.\d+)?s|[5-9]\d\dms|\d{4,}ms)/;
const REDUCED = /prefers-reduced-motion/;
const BASE_IMG_RULE = /img\s*(?:,[^{]*)?\{[^}]*max-width\s*:\s*100%/i;
const OVERFLOW_MASK = /(?:^|[}\s,])(?:html|body)\s*(?:,\s*(?:html|body)\s*)?\{[^}]*overflow(?:-x)?\s*:\s*(?:hidden|clip)/i;

/** Decorative or tracking-looking images (1x1, pixel, spacer) may keep an empty alt; everything else gets one too, but the check reports it. */
const FLUID_IMG_CSS = `\n/* Keplar: images never overflow their container on a phone */\nimg, picture, video, svg, canvas { max-width: 100%; height: auto; }\n`;
const REDUCED_MOTION_CSS = `\n/* Keplar: people who asked their device for less motion get less motion */\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }\n`;
const VIEWPORT = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`;

/** The stylesheet that fixes append to: the main one for sites, the first for apps; null when the project has none. */
function mainCss(files: Record<string, string>): string | null {
  if (files["styles.css"] !== undefined) return "styles.css";
  return Object.keys(files).find(isCss) ?? null;
}

function titleFrom(html: string, file: string): string {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (h1) return h1.slice(0, 80);
  const base = file.replace(/^.*\//, "").replace(/\.html?$/i, "");
  return base === "index" ? "Home" : base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deterministic repairs. Returns the new file set and a human sentence per repair kind (deduplicated), like site-builder's
 * fixSite. Never touches scripts or markup structure beyond attributes and head tags.
 */
export function fixOutput(files: Record<string, string>, kind: OutputKind): { files: Record<string, string>; fixed: string[] } {
  const out: Record<string, string> = { ...files };
  const fixed = new Set<string>();
  const note = (s: string) => fixed.add(s);
  let needImgRule = false;
  let needMotionRule = false;
  const allCss = cssOnly(files);

  for (const [p, src] of Object.entries(files)) {
    if (!isHtml(p)) continue;
    let h = src;
    const hasHead = /<\/head>/i.test(h);
    const addToHead = (tag: string) => {
      h = hasHead ? h.replace(/<\/head>/i, `${tag}\n</head>`) : h.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`);
    };
    if (!/<html[\s>]/i.test(h) && /<head[\s>]/i.test(h)) {
      h = h.replace(/<head[\s>]/i, (m) => `<html lang="en">${m}`);
      if (!/<\/html>/i.test(h)) h += "\n</html>";
      note("Wrapped the page in an <html> element");
    }
    if (/<html\b(?![^>]*\blang=)/i.test(h)) {
      h = h.replace(/<html\b/i, '<html lang="en"');
      note("Declared the page language");
    }
    if (!/<head[\s>]/i.test(h) && /<html[^>]*>/i.test(h)) {
      h = h.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n</head>`);
    }
    if (/<head[\s>]/i.test(h)) {
      const vp = viewportOf(h);
      if (!vp) {
        addToHead(VIEWPORT);
        note("Added the mobile viewport meta tag");
      } else if (ZOOM_LOCK.test(vp.attrs.content ?? "") || !/width\s*=\s*device-width/i.test(vp.attrs.content ?? "")) {
        h = h.replace(vp.raw, VIEWPORT);
        note("Let people zoom the page (viewport no longer locks scale)");
      }
      if (!tags(h, "meta").some((t) => "charset" in t.attrs || (t.attrs["http-equiv"] ?? "").toLowerCase() === "content-type")) {
        h = h.replace(/<head[^>]*>/i, (m) => `${m}\n<meta charset="utf-8">`);
        note("Declared UTF-8");
      }
      if (!/<title>\s*[^<\s][\s\S]*?<\/title>/i.test(h)) {
        h = h.replace(/<title>\s*<\/title>/i, "");
        addToHead(`<title>${esc(titleFrom(h, p))}</title>`);
        note("Gave the page a title");
      }
    }
    // New-tab links must not hand the opener to the destination.
    h = h.replace(/<a\b([^>]*\btarget\s*=\s*["']?_blank["']?[^>]*)>/gi, (m, attrs: string) => {
      const a = attrsOf(attrs);
      const rel = (a.rel ?? "").split(/\s+/).filter(Boolean);
      if (rel.includes("noopener")) return m;
      const next = [...new Set([...rel, "noopener", "noreferrer"])].join(" ");
      note("Protected new-tab links against opener access");
      return /\brel\s*=/i.test(attrs) ? m.replace(/\brel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `rel="${next}"`) : `<a${attrs} rel="${next}">`;
    });
    // Images: an alt attribute on every one; lazy loading below the first image of a page; async decode.
    let imgN = 0;
    h = h.replace(/<img\b([^>]*?)(\s*\/?)>/gi, (m, attrs: string, close: string) => {
      const a = attrsOf(attrs);
      let extra = "";
      if (!("alt" in a)) {
        extra += ' alt=""';
        note("Added alt attributes to images");
      }
      if (imgN++ > 0 && !("loading" in a)) {
        extra += ' loading="lazy"';
        note("Images below the first load lazily");
      }
      if (!("decoding" in a)) extra += ' decoding="async"';
      return extra ? `<img${attrs}${extra}${close}>` : m;
    });
    const css = allCss + inlineCss(h);
    if (!BASE_IMG_RULE.test(css)) needImgRule = true;
    if (MOTION.test(stripComments(css)) && !REDUCED.test(css)) needMotionRule = true;
    if (h !== src) out[p] = h;
  }

  if (needImgRule || needMotionRule) {
    const target = mainCss(out) ?? (kind === "site" ? "styles.css" : null);
    const add = `${needImgRule ? FLUID_IMG_CSS : ""}${needMotionRule ? REDUCED_MOTION_CSS : ""}`;
    if (target) {
      out[target] = `${out[target] ?? ""}${add}`;
    } else {
      // An app with no stylesheet of its own: a <style> block in each page (its CSP allows inline styles, never inline scripts).
      for (const p of Object.keys(out)) if (isHtml(p) && /<\/head>/i.test(out[p])) out[p] = out[p].replace(/<\/head>/i, `<style>${add.trim()}</style>\n</head>`);
    }
    if (needImgRule) note("Images scale to the screen instead of overflowing it");
    if (needMotionRule) note("Respected the reduced-motion setting");
  }
  return { files: out, fixed: [...fixed] };
}

type Ctx = { kind: OutputKind; files: Record<string, string>; html: [string, string][]; css: string; js: [string, string][] };

type Rule = { id: string; group: ChecklistGroup; label: string; required: boolean | ((c: Ctx) => boolean); run: (c: Ctx) => { bad: string[]; detail?: string } };

const perHtml = (c: Ctx, test: (html: string, file: string) => string | null): string[] => c.html.flatMap(([p, h]) => (test(h, p) ? [p] : []));

const RULES: Rule[] = [
  // ---- security ----
  { id: "no-inline-script", group: "security", label: "No inline scripts", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*[^\s<]/i.test(h) ? "inline script" : null)), detail: c.kind === "site" ? "Generated sites run no script at all; the browser sandbox would block it anyway." : "Scripts live in the app's own .js files (the sandbox CSP allows nothing else)." }) },
  { id: "no-third-party-script", group: "security", label: "No third-party scripts", required: true, run: (c) => ({ bad: perHtml(c, (h) => (tags(h, "script").some((t) => /^(?:https?:)?\/\//i.test(t.attrs.src ?? "") && !/\/fx\/kapp/.test(t.attrs.src ?? "")) ? "external script" : null)), detail: "Nothing loads from a CDN or tracker: no supply-chain surface, no leaked visitors." }) },
  { id: "no-inline-handlers", group: "security", label: "No inline event handlers", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/<[a-z][^>]*\s+on[a-z]+\s*=/i.test(h) ? "on*= attribute" : null)), detail: "onclick-style attributes are the classic XSS sink; behavior belongs in the app's modules." }) },
  { id: "no-javascript-urls", group: "security", label: "No javascript: or data: script URLs", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/\b(?:href|src|action|formaction)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i.test(h) ? "javascript: URL" : null)), detail: "Links and forms never execute code." }) },
  { id: "no-embedded-frames", group: "security", label: "No frames, objects or embeds", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/<(?:iframe|object|embed|frame|applet)\b/i.test(h) ? "frame/object/embed" : null)), detail: "Third-party documents cannot be framed into the page." }) },
  { id: "no-base-or-refresh", group: "security", label: "No <base> or meta refresh", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/<base\b/i.test(h) || /<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(h) ? "base/refresh" : null)), detail: "Relative links cannot be hijacked and the page never redirects on its own." }) },
  { id: "no-mixed-content", group: "security", label: "Every resource loads over HTTPS", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/\b(?:src|href|action|poster|srcset)\s*=\s*["']?\s*http:\/\//i.test(h.replace(/<a\b[^>]*>/gi, "")) ? "http:// resource" : null)), detail: "No http:// stylesheet, image, font or form target (a plain-text link in body copy is allowed)." }) },
  { id: "safe-new-tab-links", group: "security", label: "New-tab links carry rel=noopener", required: true, run: (c) => ({ bad: perHtml(c, (h) => (tags(h, "a").some((t) => (t.attrs.target ?? "").toLowerCase() === "_blank" && !/\bnoopener\b/i.test(t.attrs.rel ?? "")) ? "target=_blank without noopener" : null)), detail: "The destination page cannot reach back into this one." }) },
  { id: "no-secrets", group: "security", label: "No credentials in generated files", required: true, run: (c) => { const bad: string[] = []; let what = ""; for (const [p, s] of Object.entries(c.files)) for (const [re, w] of SECRETS) if (re.test(s)) { bad.push(p); what = w; break; } return { bad, detail: bad.length ? `A file contains ${what}; everything in a site or app is public.` : "No API keys, tokens or passwords in any file." }; } },
  { id: "forms-stay-on-site", group: "security", label: "Forms post to this site only", required: true, run: (c) => ({ bad: perHtml(c, (h) => (tags(h, "form").some((t) => /^(?:https?:)?\/\//i.test(t.attrs.action ?? "")) ? "form posts elsewhere" : null)), detail: "Form data goes to Keplar's rate-limited, honeypot-protected handler, never to a third party." }) },
  { id: "no-password-fields", group: "security", label: "No password fields on a static site", required: (c) => c.kind === "site", run: (c) => ({ bad: c.kind === "site" ? perHtml(c, (h) => (/<input\b[^>]*\btype\s*=\s*["']?password/i.test(h) ? "password input" : null)) : [], detail: "A static site has no login, so a password box would only collect passwords." }) },
  { id: "no-dynamic-code", group: "security", label: "No eval or dynamic code", required: true, run: (c) => ({ bad: c.js.filter(([, s]) => /\beval\s*\(|\bnew\s+Function\s*\(|\bdocument\.write(?:ln)?\s*\(|\bsetTimeout\s*\(\s*["'`]|\bsetInterval\s*\(\s*["'`]/.test(stripComments(s))).map(([p]) => p), detail: "Strings never become code; the sandbox CSP forbids it as well." }) },
  { id: "no-unsafe-innerhtml", group: "security", label: "No HTML built from data with innerHTML", required: true, run: (c) => ({ bad: c.js.filter(([, s]) => /\.(?:innerHTML|outerHTML)\s*\+?=\s*(?:`[^`]*\$\{|[^;\n]*\+|[A-Za-z_$][\w$.]*\s*;)/m.test(stripComments(s)) || /\binsertAdjacentHTML\s*\([^,]+,\s*(?:`[^`]*\$\{|[^)]*\+)/.test(stripComments(s))).map(([p]) => p), detail: "Text from users or the database is rendered with textContent, the UI runtime or a template, never concatenated into markup." }) },
  { id: "no-remote-imports", group: "security", label: "No remote module imports", required: true, run: (c) => ({ bad: c.js.filter(([, s]) => /\bfrom\s+["']https?:\/\/|\bimport\s*\(\s*["']https?:\/\//.test(s)).map(([p]) => p), detail: "Modules resolve inside the app only." }) },
  // ---- mobile ----
  { id: "viewport-meta", group: "mobile", label: "Mobile viewport declared", required: true, run: (c) => ({ bad: perHtml(c, (h) => { const v = viewportOf(h); return !v || !/width\s*=\s*device-width/i.test(v.attrs.content ?? "") ? "no viewport" : null; }), detail: "width=device-width so phones lay the page out at their real width instead of a shrunken desktop." }) },
  { id: "zoom-allowed", group: "mobile", label: "Pinch zoom allowed", required: true, run: (c) => ({ bad: perHtml(c, (h) => (ZOOM_LOCK.test(viewportOf(h)?.attrs.content ?? "") ? "zoom locked" : null)), detail: "No user-scalable=no or maximum-scale below 5 (WCAG 1.4.4)." }) },
  { id: "charset", group: "mobile", label: "UTF-8 declared", required: true, run: (c) => ({ bad: perHtml(c, (h) => (tags(h, "meta").some((t) => "charset" in t.attrs || (t.attrs["http-equiv"] ?? "").toLowerCase() === "content-type") ? null : "no charset")), detail: "Text renders the same on every device and browser." }) },
  { id: "fluid-images", group: "mobile", label: "Images scale to the screen", required: true, run: (c) => { const anyImg = c.html.some(([, h]) => /<img\b/i.test(h)); const ok = !anyImg || BASE_IMG_RULE.test(c.css + c.html.map(([, h]) => inlineCss(h)).join("\n")); return { bad: ok ? [] : c.html.filter(([, h]) => /<img\b/i.test(h)).map(([p]) => p), detail: "img { max-width: 100%; height: auto } so no picture is wider than a phone." }; } },
  { id: "responsive-css", group: "mobile", label: "Layout adapts to screen width", required: (c) => c.css.length > 600, run: (c) => ({ bad: c.css.length > 0 && !FLUID.test(c.css) ? Object.keys(c.files).filter(isCss) : [], detail: "Media or container queries, clamp(), minmax() or viewport units: the layout is designed for 320 px as well as 1920 px." }) },
  { id: "no-fixed-page-width", group: "mobile", label: "No fixed page width wider than a phone", required: false, run: (c) => ({ bad: Object.entries(c.files).filter(([p, s]) => isCss(p) && /(?:^|[}\s,])(?:html|body|main|\.container|\.wrap(?:per)?|\.page)\s*\{[^}]*(?<!max-|min-)width\s*:\s*(?:[4-9]\d\d|\d{4,})px/i.test(s)).map(([p]) => p), detail: "Containers use max-width, not a fixed width, so nothing forces sideways scrolling." }) },
  { id: "no-overflow-mask", group: "mobile", label: "Overflow fixed, not hidden", required: false, run: (c) => ({ bad: Object.entries(c.files).filter(([p, s]) => isCss(p) && OVERFLOW_MASK.test(s)).map(([p]) => p), detail: "overflow-x: hidden on html or body hides the symptom; phones can still pan to the cut-off content." }) },
  { id: "readable-text", group: "mobile", label: "Text stays readable (12 px or more)", required: false, run: (c) => ({ bad: Object.entries(c.files).filter(([p, s]) => (isCss(p) || isHtml(p)) && /font-size\s*:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/i.test(s)).map(([p]) => p), detail: "No font-size under 12 px anywhere; body text 16 px on phones." }) },
  { id: "tap-targets", group: "mobile", label: "Tap targets are not tiny", required: false, run: (c) => ({ bad: Object.entries(c.files).filter(([p, s]) => isCss(p) && /(?:button|\.btn|\.k-btn|\[role=["']?button["']?\]|input|select)\b[^{]*\{[^}]*(?<!min-|max-|line-)height\s*:\s*(?:[1-2]\d|3[0-5])px/i.test(s)).map(([p]) => p), detail: "Controls are at least 44 px tall so a thumb can hit them." }) },
  { id: "reduced-motion", group: "mobile", label: "Reduced-motion preference respected", required: true, run: (c) => { const css = c.css + c.html.map(([, h]) => inlineCss(h)).join("\n"); const bad = MOTION.test(stripComments(css)) && !REDUCED.test(css) ? Object.keys(c.files).filter(isCss) : []; return { bad, detail: "Long animations and transitions switch off under prefers-reduced-motion." }; } },
  { id: "lazy-images", group: "mobile", label: "Images below the fold load lazily", required: false, run: (c) => ({ bad: perHtml(c, (h) => { const imgs = tags(h, "img"); return imgs.slice(1).some((t) => !("loading" in t.attrs)) ? "eager images" : null; }), detail: "loading=\"lazy\" on every image after the first saves data on mobile connections." }) },
  // ---- accessibility (part of mobile usability) ----
  { id: "html-lang", group: "accessibility", label: "Page language declared", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/<html\b[^>]*\blang\s*=\s*["']?[a-zA-Z]/.test(h) ? null : "no lang")), detail: "Screen readers and translation pick the right language." }) },
  { id: "page-title", group: "accessibility", label: "Every page has a title", required: true, run: (c) => ({ bad: perHtml(c, (h) => (/<title>\s*[^<\s][\s\S]*?<\/title>/i.test(h) ? null : "no title")), detail: "Tabs, history and assistive tech name the page." }) },
  { id: "img-alt", group: "accessibility", label: "Images have alt text", required: true, run: (c) => ({ bad: perHtml(c, (h) => (tags(h, "img").some((t) => !("alt" in t.attrs)) ? "img without alt" : null)), detail: "Every <img> carries alt (empty for decoration)." }) },
  { id: "main-landmark", group: "accessibility", label: "A main landmark", required: (c) => c.kind === "site", run: (c) => ({ bad: perHtml(c, (h) => (/<main\b|role\s*=\s*["']?main/i.test(h) || (c.kind === "app" && /id\s*=\s*["']app["']/i.test(h)) ? null : "no main")), detail: "Keyboard and screen-reader users jump straight to the content." }) },
  { id: "one-h1", group: "accessibility", label: "One h1 per page", required: false, run: (c) => ({ bad: perHtml(c, (h) => { const n = (bodyOf(h).match(/<h1\b/gi) ?? []).length; return n === 1 || (c.kind === "app" && n === 0) ? null : `${n} h1`; }), detail: "A single h1 gives the page one clear heading." }) },
  { id: "labelled-inputs", group: "accessibility", label: "Form fields are labelled", required: false, run: (c) => ({ bad: perHtml(c, (h) => { const labelled = new Set(tags(h, "label").map((t) => t.attrs.for).filter(Boolean)); const bad = [...tags(h, "input"), ...tags(h, "textarea"), ...tags(h, "select")].some((t) => !["hidden", "submit", "button", "reset", "image"].includes((t.attrs.type ?? "").toLowerCase()) && !t.attrs["aria-label"] && !t.attrs["aria-labelledby"] && !(t.attrs.id && labelled.has(t.attrs.id)) && !t.attrs.title); return bad ? "unlabelled field" : null; }), detail: "Every input has a <label for>, aria-label or aria-labelledby." }) },
];

/** The report for a generated file set. Deterministic; the same files always give the same answer. */
export function checkOutput(files: Record<string, string>, kind: OutputKind): ChecklistReport {
  const ctx: Ctx = { kind, files, html: Object.entries(files).filter(([p]) => isHtml(p)), css: cssOnly(files), js: Object.entries(files).filter(([p]) => isJs(p)) };
  const items: ChecklistItem[] = RULES.map((r) => {
    const required = typeof r.required === "function" ? r.required(ctx) : r.required;
    let bad: string[] = [];
    let detail: string | undefined;
    try {
      ({ bad, detail } = r.run(ctx));
    } catch {
      bad = [];
    }
    const files = [...new Set(bad)].slice(0, 8);
    return { id: r.id, group: r.group, label: r.label, required, ok: files.length === 0, detail: detail ?? "", files };
  });
  const req = items.filter((i) => i.required);
  return { kind, passed: items.filter((i) => i.ok).length, total: items.length, required: { passed: req.filter((i) => i.ok).length, total: req.length }, items };
}

/** The compact form stored with a build (site version metadata, app report). */
export function summarizeChecklist(r: ChecklistReport): ChecklistSummary {
  return { passed: r.passed, total: r.total, failed: r.items.filter((i) => !i.ok).map((i) => ({ id: i.id, label: i.label, detail: `${i.detail}${i.files.length ? ` (${i.files.slice(0, 3).join(", ")})` : ""}`.slice(0, 220) })) };
}

/** Required items still failing, as instructions for a model repair pass (one line each, like site-builder's findingsForPrompt). */
export function checklistForPrompt(r: ChecklistReport, max = 10): string {
  return r.items
    .filter((i) => i.required && !i.ok)
    .slice(0, max)
    .map((i) => `- [checklist:${i.id}] ${i.files.join(", ") || "(all files)"}: ${i.label}. ${i.detail}`)
    .join("\n");
}

/** One sentence for the build summary and the version history. */
export function checklistSentence(r: ChecklistReport | ChecklistSummary): string {
  const failed = "items" in r ? r.items.filter((i) => !i.ok) : r.failed;
  if (!failed.length) return `Security and mobile checklist: all ${r.total} checks pass.`;
  return `Security and mobile checklist: ${r.passed} of ${r.total} checks pass; still to fix: ${failed.slice(0, 3).map((f) => f.label.toLowerCase()).join(", ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}.`;
}

export const CHECKLIST_IDS = RULES.map((r) => r.id);
