/**
 * HTML + CSS sanitizer for generated and published sites. Pure (no fs, no network), allow-list based.
 *
 * Output contains only known-safe tags and attributes, re-escaped from the decoded values. There is no
 * JavaScript of any kind: <script>, event handlers, javascript:/data:text URLs, iframes, objects, embeds,
 * <base>, meta refresh, password/file inputs and form actions to other sites are all removed. The server
 * also serves every site under a CSP that forbids scripts and sandboxes the document, so this is the
 * second layer, not the only one.
 *
 * `sanitizeHtml` returns the canonical pieces (head items, body attributes, body markup);
 * `buildDocument` assembles a full document, optionally rewriting relative URLs and injecting SEO tags,
 * a lead-form action and a footer. Re-sanitizing sanitized output yields the same output.
 */
import { FEATURE_ATTRS } from "./features/catalog";
import { dropImportant, guardStyle } from "./watermark";

export const MAX_FILE_BYTES = 200_000;

const HTML_TAGS = new Set(
  "html head body title meta link style header footer main nav section article aside div span p a h1 h2 h3 h4 h5 h6 ul ol li dl dt dd strong em b i u s small mark sub sup code pre kbd samp var blockquote q cite abbr address time br hr img picture source figure figcaption table thead tbody tfoot tr th td caption colgroup col details summary form label input textarea select option optgroup button fieldset legend datalist output progress meter bdi bdo wbr del ins ruby rt rp menu hgroup search".split(" "),
);
const SVG_TAGS = new Map(
  "svg g defs path circle ellipse rect line polyline polygon text tspan linearGradient radialGradient stop clipPath symbol".split(" ").map((t) => [t.toLowerCase(), t] as const),
);
const VOID = new Set("br hr img input meta link source col wbr embed frame param track area base keygen".split(" "));
/** Elements dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set("script iframe frame frameset object embed applet noembed noframes template math foreignobject audio video canvas dialog".split(" "));
const RAW_TEXT = new Set(["style", "script", "textarea", "title", "xmp", "plaintext", "iframe", "noembed", "noframes"]);

const GLOBAL_ATTRS = new Set("class id lang dir title role tabindex hidden style translate".split(" "));
const FORM_ATTRS = new Set("name value placeholder required checked disabled selected readonly rows cols min max step maxlength minlength pattern autocomplete multiple size for label open colspan rowspan scope headers datetime span start reversed cite alt width height loading decoding rel target hreflang type".split(" "));
const SVG_ATTRS = new Map(
  "viewBox xmlns d fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-opacity fill-opacity fill-rule clip-rule cx cy r rx ry x y x1 y1 x2 y2 width height points transform opacity offset stop-color stop-opacity gradientUnits gradientTransform preserveAspectRatio text-anchor font-size font-weight dx dy clip-path".split(" ").map((a) => [a.toLowerCase(), a] as const),
);
/** The only data-* attributes that survive: declarative hooks for Keplar's own effects runtime (never script). */
const FX_DATA: Record<string, (v: string) => string | null> = {
  "data-kfx": (v) => (v === "hero" || v === "field" ? v : null),
  "data-kfx-effect": (v) => (["particles", "lattice", "shapes", "contours"].includes(v) ? v : null),
  "data-kfx-shape": (v) => (["ico", "knot", "octa", "torus", "box"].includes(v) ? v : null),
  "data-reveal": (v) => (v === "" || v === "up" || v === "fade" || v === "mask" ? v || "up" : null),
  "data-reveal-delay": (v) => (/^\d{1,4}$/.test(v) && Number(v) <= 1500 ? v : null),
  "data-parallax": (v) => (/^-?\d{1,2}(\.\d)?$/.test(v) ? v : null),
};
const INPUT_TYPES = new Set("text email tel number url date time datetime-local month week checkbox radio submit search hidden color range".split(" "));
const BUTTON_TYPES = new Set(["submit", "button", "reset"]);

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", bsol: "\\", period: ".", comma: ",", semi: ";", equals: "=", num: "#", quest: "?", excl: "!", percnt: "%" };

/** Decodes the entities a browser would, so URL checks see what the browser sees. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    const v = NAMED[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s: string) => s.replace(/&(?!(?:#x?[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ─────────────────────────────── URLs ─────────────────────────────── */

export type UrlKind = "href" | "src" | "stylesheet";
const SAFE_DATA_IMG = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/** Returns a safe URL (maybe relative) or null. */
export function safeUrl(raw: string, kind: UrlKind): string | null {
  const v = decodeEntities(raw).trim();
  if (!v || v.length > 2000) return null;
  const probe = v.replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme === "https" || (scheme === "http" && kind === "href")) {
      if (kind === "stylesheet") {
        try {
          return FONT_HOSTS.has(new URL(probe).hostname) ? probe : null;
        } catch {
          return null;
        }
      }
      return v.replace(/\s+/g, "");
    }
    if (kind === "href" && (scheme === "mailto" || scheme === "tel")) return v.replace(/\s+/g, "");
    if (kind === "src" && scheme === "data") return SAFE_DATA_IMG.test(v) ? v.replace(/\s+/g, "") : null;
    return null;
  }
  if (probe.startsWith("//")) return kind === "stylesheet" ? null : `https:${probe}`;
  if (kind === "stylesheet" && /^https?:/i.test(probe)) return null;
  if (probe.includes("\\")) return null;
  return v;
}

const isRelative = (u: string) => !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith("//") && !u.startsWith("#");

/* ─────────────────────────────── CSS ─────────────────────────────── */

/** Decodes CSS escapes (\75 rl) so keyword checks see the real text; keeps escapes that would break out of a string. */
function decodeCssEscapes(css: string): string {
  return css.replace(/\\([0-9a-f]{1,6})\s?|\\([^\n0-9a-f])/gi, (m, hex?: string, ch?: string) => {
    if (hex) {
      const n = parseInt(hex, 16);
      if (!n || n > 0x10ffff) return "";
      const c = String.fromCodePoint(n);
      return c === '"' || c === "'" || c === "\\" || c === "\n" ? m : c;
    }
    return ch === '"' || ch === "'" || ch === "\\" ? m : (ch as string);
  });
}

const CSS_BAD = /expression\s*\(|(?<![-\w])behavior\s*:|-moz-binding|javascript\s*:|vbscript\s*:|@import|@charset|@namespace|@-moz-document|@property|-webkit-image-set|image-set\s*\(|\bsrc\s*:\s*local\s*\(/gi;

export function sanitizeCss(input: string, opts: { rewriteUrl?: (u: string) => string } = {}): string {
  let css = decodeCssEscapes(input.replace(/<\/?style[^>]*>/gi, "")).replace(/\/\*[\s\S]*?\*\//g, "");
  css = css.replace(CSS_BAD, "/*removed*/");
  css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_m, a?: string, b?: string, c?: string) => {
    const raw = (a ?? b ?? c ?? "").trim();
    if (raw.startsWith("#")) return `url(${raw})`;
    const u = safeUrl(raw, "src");
    if (!u) return "url(about:blank)";
    const out = isRelative(u) && opts.rewriteUrl ? opts.rewriteUrl(u) : u;
    return `url("${out.replace(/["\\\n]/g, "")}")`;
  });
  // Any "<" is never needed in CSS; it cannot be allowed to reopen markup.
  return css.replace(/</g, "\\3c ").trim();
}

function sanitizeStyleAttr(v: string): string {
  return sanitizeCss(decodeEntities(v)).replace(/[\r\n]+/g, " ").slice(0, 2000);
}

/* ─────────────────────────────── HTML ─────────────────────────────── */

export type SanitizeOptions = {
  /** Rewrites a safe relative URL (resolved by the caller). */
  rewriteUrl?: (url: string, kind: UrlKind) => string;
  /** Forms are rebuilt with this action (POST). Without it a form has no action. */
  formAction?: string;
  /** Extra hidden fields added to every form (name -> value). */
  formFields?: Record<string, string>;
  /** Add a hidden honeypot field to forms. */
  honeypot?: boolean;
  /** Keep only the first N forms' worth of anything? (unused) */
  maxLinks?: number;
};

export type Sanitized = {
  lang: string;
  bodyAttrs: string;
  head: { title: string | null; description: string | null; themeColor: string | null; links: string[]; styles: string[] };
  body: string;
  /** What was removed, for the publish scanner and the user ("2 scripts removed"). */
  removed: string[];
  links: string[];
  forms: number;
};

type Attr = { name: string; value: string };
type Tok = { kind: "text"; text: string } | { kind: "open"; name: string; attrs: Attr[]; selfClose: boolean } | { kind: "close"; name: string };

function parseAttrs(src: string): Attr[] {
  const attrs: Attr[] = [];
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && attrs.length < 40) attrs.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? "" });
  return attrs;
}

function tokenize(html: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = html.length;
  const text = (t: string) => t && out.push({ kind: "text", text: t });
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      text(html.slice(i));
      break;
    }
    if (lt > i) text(html.slice(i, lt));
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    const c = html[i + 1];
    if (c === "!" || c === "?") {
      const end = html.indexOf(">", i + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === "/" && /[a-z]/i.test(html[i + 2] ?? "")) {
      const m = /^<\/([a-z][a-z0-9:-]*)[^>]*>?/i.exec(html.slice(i, i + 300));
      if (m) {
        out.push({ kind: "close", name: m[1].toLowerCase() });
        i += m[0].length;
        continue;
      }
    }
    if (c && /[a-z]/i.test(c)) {
      const nm = /^<([a-z][a-z0-9:-]*)/i.exec(html.slice(i, i + 80))!;
      let j = i + nm[0].length;
      let q: string | null = null;
      const start = j;
      for (; j < n; j++) {
        const ch = html[j];
        if (q) {
          if (ch === q) q = null;
        } else if (ch === '"' || ch === "'") q = ch;
        else if (ch === ">") break;
      }
      const raw = html.slice(start, j);
      const selfClose = /\/\s*$/.test(raw);
      const name = nm[1].toLowerCase();
      out.push({ kind: "open", name, attrs: parseAttrs(raw), selfClose });
      i = Math.min(n, j + 1);
      if (RAW_TEXT.has(name) && !selfClose) {
        const closeRe = new RegExp(`</${name}[\\s>/]`, "i");
        const rest = html.slice(i);
        const cm = closeRe.exec(rest);
        const body = cm ? rest.slice(0, cm.index) : rest;
        out.push({ kind: "text", text: body });
        i += body.length;
        if (cm) {
          const gt = html.indexOf(">", i);
          out.push({ kind: "close", name });
          i = gt === -1 ? n : gt + 1;
        }
      }
      continue;
    }
    text("&lt;");
    i += 1;
  }
  return out;
}

const pathOf = (u: string) => u.split(/[?#]/)[0];

export function sanitizeHtml(input: string, opts: SanitizeOptions = {}): Sanitized {
  const toks = tokenize(input.slice(0, MAX_FILE_BYTES * 2));
  const removed: string[] = [];
  const note = (s: string) => removed.length < 50 && removed.push(s);
  const res: Sanitized = { lang: "en", bodyAttrs: "", head: { title: null, description: null, themeColor: null, links: [], styles: [] }, body: "", removed, links: [], forms: 0 };
  const body: string[] = [];
  const stack: string[] = [];
  let skipDepth = 0; // inside a dropped element
  let skipName = "";
  let rawFor: string | null = null;
  let inSvg = 0;
  let formDepth = 0;

  const rewrite = (u: string, kind: UrlKind) => (isRelative(u) && opts.rewriteUrl ? opts.rewriteUrl(u, kind) : u);

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (skipDepth > 0) {
      if (t.kind === "open" && t.name === skipName && !t.selfClose && !VOID.has(t.name)) skipDepth++;
      else if (t.kind === "close" && t.name === skipName) skipDepth--;
      continue;
    }
    if (t.kind === "text") {
      if (rawFor === "style") res.head.styles.push(t.text);
      else if (rawFor === "title") res.head.title = decodeEntities(t.text).replace(/\s+/g, " ").trim().slice(0, 200);
      else if (rawFor === "textarea") body.push(escText(decodeEntities(t.text)));
      else if (!rawFor) body.push(escText(t.text));
      continue;
    }
    if (t.kind === "close") {
      if (t.name === "style" || t.name === "title" || t.name === "textarea") {
        if (rawFor === t.name || (t.name === "title" && rawFor === "svgtitle")) {
          rawFor = null;
          if (t.name === "textarea") {
            body.push("</textarea>");
            const at = stack.lastIndexOf("textarea");
            if (at >= 0) stack.splice(at, 1);
          }
        }
        continue;
      }
      const lower = t.name;
      const svgName = SVG_TAGS.get(lower);
      const known = (inSvg > 0 && svgName) || HTML_TAGS.has(lower) || lower === "svg";
      if (!known || ["html", "head", "body", "meta", "link", "title"].includes(lower)) continue;
      const canon = svgName && (inSvg > 0 || lower === "svg") ? svgName : lower;
      const at = stack.lastIndexOf(canon);
      if (at === -1) continue;
      while (stack.length > at) {
        const top = stack.pop()!;
        body.push(`</${top}>`);
        if (top === "svg") inSvg = Math.max(0, inSvg - 1);
        if (top === "form") formDepth = Math.max(0, formDepth - 1);
      }
      continue;
    }

    // open tag
    const name = t.name;
    const attrs = new Map(t.attrs.map((a) => [a.name, a.value] as const));
    if (DROP_WITH_CONTENT.has(name)) {
      note(`<${name}> removed`);
      if (!t.selfClose && !VOID.has(name)) {
        skipDepth = 1;
        skipName = name;
      }
      continue;
    }
    if (name === "html") {
      const l = attrs.get("lang");
      if (l && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(l.trim())) res.lang = l.trim();
      continue;
    }
    if (name === "head") continue;
    if (name === "body") {
      const bits: string[] = [];
      const cls = decodeEntities(attrs.get("class") ?? "");
      if (cls) bits.push(`class="${escAttr(cls.slice(0, 200))}"`);
      const st = attrs.get("style");
      if (st) bits.push(`style="${escAttr(sanitizeStyleAttr(st))}"`);
      res.bodyAttrs = bits.join(" ");
      continue;
    }
    if (name === "title") {
      rawFor = inSvg > 0 ? "svgtitle" : "title";
      continue;
    }
    if (name === "style") {
      rawFor = "style";
      continue;
    }
    if (name === "meta") {
      const nm = (attrs.get("name") ?? "").toLowerCase();
      const content = decodeEntities(attrs.get("content") ?? "").slice(0, 400);
      if (nm === "description") res.head.description = content;
      else if (nm === "theme-color" && /^#[0-9a-f]{3,8}$/i.test(content)) res.head.themeColor = content;
      else if (nm !== "viewport" && !attrs.has("charset")) note("<meta> removed");
      continue;
    }
    if (name === "link") {
      const rel = (attrs.get("rel") ?? "").toLowerCase();
      const href = attrs.get("href");
      if (rel.split(/\s+/).includes("stylesheet") && href) {
        const u = safeUrl(href, "stylesheet");
        if (u) {
          const out = rewrite(u, "stylesheet");
          res.head.links.push(`<link rel="stylesheet" href="${escAttr(out)}">`);
        } else note("<link> removed");
      } else if (rel === "preconnect" && href) {
        const u = safeUrl(href, "stylesheet");
        if (u) res.head.links.push(`<link rel="preconnect" href="${escAttr(u)}"${attrs.has("crossorigin") ? " crossorigin" : ""}>`);
      } else note("<link> removed");
      continue;
    }

    const svgCanon = SVG_TAGS.get(name);
    const isSvgEl = name === "svg" || (inSvg > 0 && svgCanon !== undefined);
    if (!isSvgEl && !HTML_TAGS.has(name)) {
      note(`<${name}> unwrapped`);
      continue; // unknown tag: drop the tag, keep its children
    }
    const tag = isSvgEl ? (name === "svg" ? "svg" : (svgCanon as string)) : name;

    const parts: string[] = [];
    const put = (k: string, v: string) => parts.push(`${k}="${escAttr(v)}"`);

    if (tag === "form") {
      // Rebuilt: only our action, always POST.
      res.forms++;
      formDepth++;
      for (const a of ["class", "id"]) {
        const v = decodeEntities(attrs.get(a) ?? "");
        if (v) put(a, v.slice(0, 200));
      }
      put("method", "post");
      if (opts.formAction) put("action", opts.formAction);
      body.push(`<form ${parts.join(" ")}>`);
      for (const [fk, fv] of Object.entries(opts.formFields ?? {})) body.push(`<input type="hidden" name="${escAttr(fk)}" value="${escAttr(fv)}">`);
      if (opts.honeypot) body.push(`<input type="text" name="_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">`);
      stack.push("form");
      continue;
    }

    if (tag === "input") {
      const type = (attrs.get("type") ?? "text").toLowerCase().trim();
      if (!INPUT_TYPES.has(type)) {
        note(`input type=${type} removed`);
        continue;
      }
      if (type === "hidden" && formDepth === 0) continue;
    }
    if (tag === "textarea" || tag === "select" || tag === "button" || tag === "input" || tag === "option" || tag === "label") {
      if (formDepth === 0 && tag !== "label" && tag !== "button") {
        // Controls outside a form are harmless but useless; keep them.
      }
    }

    for (const [an, avRaw] of attrs) {
      const av = decodeEntities(avRaw);
      if (an.startsWith("on") || an === "formaction" || an === "srcdoc" || an === "action" || an === "method" || an === "xmlns:xlink" || an === "xlink:href") continue;
      if (isSvgEl) {
        const canon = SVG_ATTRS.get(an);
        if (canon) {
          const v = av;
          if (/url\(/i.test(v) && !/^url\(\s*#[\w-]+\s*\)$/i.test(v.trim())) continue;
          if (/javascript|data:|expression/i.test(v)) continue;
          put(canon, v.slice(0, 2000));
        } else if (GLOBAL_ATTRS.has(an) && an !== "style") put(an, av.slice(0, 200));
        else if (an.startsWith("aria-")) put(an, av.slice(0, 200));
        continue;
      }
      if (an === "style") {
        const v = sanitizeStyleAttr(avRaw);
        if (v) put("style", v);
        continue;
      }
      if (an.startsWith("data-")) {
        // data-k-*: feature placeholders (validated choices only), allowed on a plain div
        const ok = FX_DATA[an]?.(av.trim()) ?? (tag === "div" ? FEATURE_ATTRS[an]?.(av.trim()) : null);
        if (ok !== null && ok !== undefined) put(an, ok);
        continue;
      }
      if (an === "href" && (tag === "a")) {
        const u = safeUrl(avRaw, "href");
        if (!u) {
          note("link removed");
          continue;
        }
        if (!isRelative(u) && !u.startsWith("#")) res.links.push(u);
        put("href", rewrite(u, "href"));
        continue;
      }
      if (an === "src" && (tag === "img" || tag === "source")) {
        const u = safeUrl(avRaw, "src");
        if (!u) {
          note("image removed");
          continue;
        }
        put("src", rewrite(u, "src"));
        continue;
      }
      if (an === "srcset" || an === "src" || an === "href" || an === "data") continue;
      if (an === "type") {
        const v = av.toLowerCase().trim();
        if (tag === "input") put("type", v);
        else if (tag === "button") put("type", BUTTON_TYPES.has(v) ? v : "submit");
        continue;
      }
      if (an === "target") {
        if (tag === "a" && av === "_blank") put("target", "_blank");
        continue;
      }
      if (an === "rel") continue; // set below for links
      if (an.startsWith("aria-") || GLOBAL_ATTRS.has(an)) {
        put(an, av.slice(0, 300));
        continue;
      }
      if (FORM_ATTRS.has(an)) {
        if (an === "name" && !/^[\w .-]{1,60}$/.test(av)) continue;
        if (an === "name" && /^_/.test(av)) continue; // reserved for Keplar's own fields
        put(an, av.slice(0, 500));
      }
    }
    if (tag === "a" && attrs.get("target") === "_blank") put("rel", "noopener noreferrer nofollow ugc");
    else if (tag === "a" && parts.some((p) => p.startsWith("href=\"http"))) put("rel", "nofollow ugc");
    if (tag === "img" && !attrs.has("alt")) put("alt", "");
    if (tag === "button" && !attrs.has("type")) put("type", "submit");

    if (tag === "textarea") {
      body.push(`<textarea${parts.length ? " " + parts.join(" ") : ""}>`);
      rawFor = "textarea";
      stack.push("textarea");
      continue;
    }
    const isVoid = VOID.has(tag) || (isSvgEl && t.selfClose);
    if (tag === "svg") inSvg++;
    if (isVoid && !isSvgEl) {
      body.push(`<${tag}${parts.length ? " " + parts.join(" ") : ""}>`);
    } else if (isSvgEl && t.selfClose) {
      body.push(`<${tag}${parts.length ? " " + parts.join(" ") : ""}></${tag}>`);
      if (tag === "svg") inSvg = Math.max(0, inSvg - 1);
    } else {
      body.push(`<${tag}${parts.length ? " " + parts.join(" ") : ""}>`);
      stack.push(tag);
    }
  }
  while (stack.length) body.push(`</${stack.pop()}>`);
  res.body = body.join("").trim();
  const sheet = (css: string) => sanitizeCss(css, { rewriteUrl: opts.rewriteUrl ? (u) => opts.rewriteUrl!(u, "src") : undefined });
  res.head.styles = res.head.styles.map(sheet).filter(Boolean);
  return res;
}

/* ─────────────────────────────── documents ─────────────────────────────── */

export type DocOptions = {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  robots?: string | null;
  ogImage?: string | null;
  ogSiteName?: string | null;
  themeColor?: string | null;
  /** Trusted markup appended before </body> (Keplar's footer). Built by us, never by users. */
  footerHtml?: string;
  /** Trusted markup (Keplar's own effects loader tag) appended after the footer. Built by us, never by users. */
  scriptHtml?: string;
  /**
   * Free/Lite pages: harden the page against its own CSS hiding the footer strip. Adds the first-in-head `@layer` guard and
   * removes `!important` from <body style>. `pageCss` is the CSS of the site's stylesheet files (for the body-display check).
   */
  guard?: { pageCss?: string };
};

const esc = escAttr;

export function buildDocument(s: Sanitized, o: DocOptions = {}): string {
  const title = (o.title ?? s.head.title ?? "").trim();
  const description = (o.description ?? s.head.description ?? "").trim();
  const head: string[] = ['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">'];
  if (title) head.push(`<title>${escText(title)}</title>`);
  if (description) head.push(`<meta name="description" content="${esc(description)}">`);
  const theme = o.themeColor ?? s.head.themeColor;
  if (theme && /^#[0-9a-f]{3,8}$/i.test(theme)) head.push(`<meta name="theme-color" content="${theme}">`);
  if (o.robots) head.push(`<meta name="robots" content="${esc(o.robots)}">`);
  if (o.canonical) head.push(`<link rel="canonical" href="${esc(o.canonical)}">`);
  if (title) head.push(`<meta property="og:title" content="${esc(title)}">`);
  if (description) head.push(`<meta property="og:description" content="${esc(description)}">`);
  head.push('<meta property="og:type" content="website">');
  if (o.canonical) head.push(`<meta property="og:url" content="${esc(o.canonical)}">`);
  if (o.ogSiteName) head.push(`<meta property="og:site_name" content="${esc(o.ogSiteName)}">`);
  if (o.ogImage) {
    head.push(`<meta property="og:image" content="${esc(o.ogImage)}">`, '<meta name="twitter:card" content="summary_large_image">');
  }
  head.push(...s.head.links);
  for (const css of s.head.styles) head.push(`<style>${css}</style>`);
  let bodyAttrs = s.bodyAttrs;
  if (o.guard) {
    bodyAttrs = dropImportant(bodyAttrs);
    const bodyStyle = /style="([^"]*)"/.exec(bodyAttrs)?.[1] ?? "";
    // First in <head> (after the two meta tags), so its @layer is the earliest layer in the document.
    head.splice(2, 0, guardStyle(`${s.head.styles.join("\n")}\n${o.guard.pageCss ?? ""}\nbody{${bodyStyle}}`));
  }
  return `<!doctype html>\n<html lang="${esc(s.lang)}">\n<head>\n${head.join("\n")}\n</head>\n<body${bodyAttrs ? " " + bodyAttrs : ""}>\n${s.body}${o.footerHtml ?? ""}${o.scriptHtml ?? ""}\n</body>\n</html>\n`;
}

/** Canonical stored form of an HTML file. */
export function canonicalHtml(input: string): { html: string; removed: string[]; links: string[]; forms: number } {
  const s = sanitizeHtml(input);
  return { html: buildDocument(s), removed: s.removed, links: s.links, forms: s.forms };
}

/** Plain `.css` files: same CSS rules as <style>. */
export function canonicalCss(input: string): string {
  return sanitizeCss(input.slice(0, MAX_FILE_BYTES));
}

export { pathOf };
