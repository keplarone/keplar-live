/**
 * A tolerant HTML scanner with source offsets, for plain .html files and for htm tagged templates inside .js files
 * (html`<img src=${x} />`): template expressions are masked to same-length placeholders so every offset still points into
 * the real file, and an attribute whose value is an expression counts as "present, dynamic".
 */
export const MASK = "\u0001";
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);

export type Attr = { value: string | null; dynamic: boolean; start: number; end: number; valueStart: number; valueEnd: number };
export type El = {
  tag: string;
  attrs: Record<string, Attr>;
  /** Absolute offsets in the file: `<` of the open tag, just after its `>`. */
  start: number;
  openEnd: number;
  /** Offset of `<` of the closing tag, when there is one. */
  closeStart: number | null;
  selfClosing: boolean;
  parent: El | null;
  children: El[];
  /** Visible text inside (tags removed, masked expressions count as text). */
  text: string;
  /** Text an assistive technology would announce from the content: text, inner img alt, inner aria-label, svg <title>. */
  name: string;
  raw: string;
  inTemplate: boolean;
};

export type HtmlDoc = { els: El[]; roots: El[]; src: string; base: number };

function scanAttrs(s: string, from: number, to: number, base: number): Record<string, Attr> {
  const attrs: Record<string, Attr> = {};
  let i = from;
  while (i < to) {
    while (i < to && /[\s/]/.test(s[i])) i++;
    if (i >= to) break;
    const nStart = i;
    while (i < to && !/[\s=/>]/.test(s[i])) i++;
    const name = s.slice(nStart, i).toLowerCase();
    if (!name) { i++; continue; }
    let j = i;
    while (j < to && /\s/.test(s[j])) j++;
    if (s[j] !== "=") {
      attrs[name] = { value: null, dynamic: name.includes(MASK), start: base + nStart, end: base + i, valueStart: base + i, valueEnd: base + i };
      continue;
    }
    j++;
    while (j < to && /\s/.test(s[j])) j++;
    let vStart = j;
    let vEnd: number;
    let next: number;
    if (s[j] === '"' || s[j] === "'") {
      const q = s[j];
      vStart = j + 1;
      vEnd = s.indexOf(q, vStart);
      if (vEnd < 0 || vEnd > to) vEnd = to;
      next = vEnd + 1;
    } else {
      vEnd = j;
      while (vEnd < to && !/[\s>]/.test(s[vEnd]) && !(s[vEnd] === "/" && s[vEnd + 1] === ">")) vEnd++;
      next = vEnd;
    }
    const value = s.slice(vStart, vEnd);
    attrs[name] = { value, dynamic: value.includes(MASK), start: base + nStart, end: base + next, valueStart: base + vStart, valueEnd: base + vEnd };
    i = next;
  }
  return attrs;
}

/** Parses `src` (already masked if it came from a template). `base` is the offset of src[0] in the file. */
export function parseHtml(src: string, base = 0, inTemplate = false): HtmlDoc {
  const els: El[] = [];
  const roots: El[] = [];
  const stack: El[] = [];
  let i = 0;
  const n = src.length;
  const textParts = new Map<El, string[]>();
  const pushText = (t: string) => { for (const e of stack) textParts.get(e)!.push(t); };
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { pushText(src.slice(i)); break; }
    if (lt > i) pushText(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src[lt + 1] === "!" || src[lt + 1] === "?") {
      const e = src.indexOf(">", lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    const closing = src[lt + 1] === "/";
    const m = /^<\/?([a-zA-Z][\w:-]*|\u0001+)?/.exec(src.slice(lt, lt + 80));
    const tagName = (m?.[1] ?? "").toLowerCase();
    if (!m || (!tagName && !(closing && src[lt + 2] === "/"))) {
      pushText("<");
      i = lt + 1;
      continue;
    }
    // find the end of the tag, honoring quotes
    let j = lt + m[0].length;
    let q: string | null = null;
    while (j < n) {
      const c = src[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === ">") break;
      j++;
    }
    const end = Math.min(n, j + 1);
    if (closing) {
      // htm's generic closer <//> closes the innermost element
      const idx = !tagName || tagName.includes(MASK) ? stack.length - 1 : (() => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tagName) return k; return -1; })();
      if (idx >= 0) {
        while (stack.length > idx) {
          const e = stack.pop()!;
          e.closeStart = base + lt;
          finish(e, textParts);
        }
      }
      i = end;
      continue;
    }
    const selfClosing = src[j - 1] === "/";
    const el: El = { tag: tagName, attrs: scanAttrs(src, lt + m[0].length, selfClosing ? j - 1 : j, base), start: base + lt, openEnd: base + end, closeStart: null, selfClosing, parent: stack[stack.length - 1] ?? null, children: [], text: "", name: "", raw: src.slice(lt, end), inTemplate };
    els.push(el);
    if (el.parent) el.parent.children.push(el);
    else roots.push(el);
    if (tagName === "img" || tagName === "input" || tagName === "area") {
      const alt = el.attrs.alt?.value ?? el.attrs["aria-label"]?.value ?? (el.attrs.alt?.dynamic ? MASK : "");
      if (alt) pushText(` ${alt} `);
    }
    if (VOID.has(tagName) || selfClosing) { i = end; continue; }
    if (RAW.has(tagName) && !inTemplate) {
      const close = src.toLowerCase().indexOf(`</${tagName}`, end);
      const stop = close < 0 ? n : close;
      el.text = src.slice(end, stop);
      el.name = tagName === "title" ? el.text.trim() : "";
      el.closeStart = base + stop;
      if (tagName === "title") for (const e of stack) textParts.get(e)!.push(` ${el.text} `);
      const gt = close < 0 ? n : src.indexOf(">", close);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    textParts.set(el, []);
    stack.push(el);
    i = end;
  }
  while (stack.length) finish(stack.pop()!, textParts);
  return { els, roots, src, base };
}

function finish(e: El, parts: Map<El, string[]>) {
  const t = (parts.get(e) ?? []).join("");
  parts.delete(e);
  e.text = t.replace(/\s+/g, " ").trim();
  const labelled = e.children.map((c) => c.attrs["aria-label"]?.value ?? "").filter(Boolean).join(" ");
  const svgTitle = e.children.filter((c) => c.tag === "svg").flatMap((c) => c.children.filter((x) => x.tag === "title").map((x) => x.text)).join(" ");
  e.name = [e.text, labelled, svgTitle].join(" ").replace(/\s+/g, " ").trim();
}

/** Masks `${…}` expressions (keeping newlines) and returns the template bodies of every html`…` / svg`…` in a JS file. */
export function htmTemplates(js: string): { body: string; base: number }[] {
  const out: { body: string; base: number }[] = [];
  const re = /\b(?:html|htm|svg)\s*`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const start = m.index + m[0].length;
    const r = readTemplate(js, start);
    if (!r) continue;
    out.push({ body: r.masked, base: start });
    re.lastIndex = start; // keep scanning inside: nested html`…` in ${…} are templates of their own
  }
  return out;
}

/** Reads a template literal body starting just after the opening backtick. */
function readTemplate(s: string, from: number): { masked: string; end: number } | null {
  let i = from;
  let out = "";
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") { out += s.slice(i, i + 2); i += 2; continue; }
    if (c === "`") return { masked: out, end: i + 1 };
    if (c === "$" && s[i + 1] === "{") {
      const e = skipExpr(s, i + 2);
      if (e < 0) return null;
      out += s.slice(i, e + 1).replace(/[^\n]/g, MASK);
      i = e + 1;
      continue;
    }
    out += c;
    i++;
  }
  return null;
}

/** Returns the index of the `}` closing an expression that starts at `from`. */
function skipExpr(s: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      i++;
      while (i < s.length && s[i] !== c) { if (s[i] === "\\") i++; i++; }
    } else if (c === "`") {
      const r = readTemplate(s, i + 1);
      if (!r) return -1;
      i = r.end - 1;
    } else if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
    } else if (c === "/" && s[i + 1] === "*") {
      const e = s.indexOf("*/", i + 2);
      i = e < 0 ? s.length : e + 1;
    } else if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) return i; }
    i++;
  }
  return -1;
}

/** Every element across a file: the document itself for .html, the htm templates for .js. */
export function elementsOf(path: string, src: string): HtmlDoc[] {
  if (/\.html?$/i.test(path)) return [parseHtml(src, 0, false)];
  if (/\.m?jsx?$/i.test(path)) return htmTemplates(src).map((t) => parseHtml(t.body, t.base, true));
  return [];
}

export const attrVal = (e: El, name: string) => e.attrs[name]?.value ?? null;
export const hasAttr = (e: El, name: string) => name in e.attrs;
export const isDynamicAttr = (e: El, name: string) => Boolean(e.attrs[name]?.dynamic);
