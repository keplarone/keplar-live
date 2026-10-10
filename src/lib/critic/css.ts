/** A small CSS reader with source offsets (rules, declarations, at-rule context), plus color math (WCAG 2.x contrast). */
export type Decl = { prop: string; value: string; start: number; end: number; valueStart: number; valueEnd: number; important: boolean };
export type Rule = { selector: string; decls: Decl[]; start: number; media: string | null };
export type Sheet = { rules: Rule[]; imports: { url: string; start: number; end: number }[]; keyframes: number; media: string[]; fontFaces: number };

/** Parses CSS at `base` offset in its file (a .css file, a <style> block, or a style="" attribute body with `inline`). */
export function parseCss(src: string, base = 0, inline = false): Sheet {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const sheet: Sheet = { rules: [], imports: [], keyframes: 0, media: [], fontFaces: 0 };
  if (inline) {
    sheet.rules.push({ selector: "[style]", decls: decls(s, 0, s.length, base), start: base, media: null });
    return sheet;
  }
  walk(s, 0, s.length, base, null, sheet);
  return sheet;
}

function walk(s: string, from: number, to: number, base: number, media: string | null, sheet: Sheet) {
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(s[i])) i++;
    if (i >= to) break;
    if (s[i] === "}") { i++; continue; }
    if (s[i] === "@") {
      const semi = s.indexOf(";", i);
      const brace = s.indexOf("{", i);
      if (semi >= 0 && (brace < 0 || semi < brace) && semi < to) {
        const stmt = s.slice(i, semi);
        const im = /^@import\s+(?:url\()?\s*["']?([^"')\s]+)/i.exec(stmt);
        if (im) sheet.imports.push({ url: im[1], start: base + i, end: base + semi + 1 });
        i = semi + 1;
        continue;
      }
      if (brace < 0 || brace >= to) break;
      const head = s.slice(i, brace).trim();
      const close = matchBrace(s, brace, to);
      if (/^@(media|supports|layer|container)/i.test(head)) {
        if (/^@media/i.test(head)) sheet.media.push(head);
        walk(s, brace + 1, close, base, head, sheet);
      } else if (/^@(-webkit-)?keyframes/i.test(head)) sheet.keyframes++;
      else if (/^@font-face/i.test(head)) sheet.fontFaces++;
      i = close + 1;
      continue;
    }
    const brace = s.indexOf("{", i);
    if (brace < 0 || brace >= to) break;
    const close = matchBrace(s, brace, to);
    const selector = s.slice(i, brace).trim();
    sheet.rules.push({ selector, decls: decls(s, brace + 1, close, base), start: base + i, media });
    i = close + 1;
  }
}

function matchBrace(s: string, open: number, to: number) {
  let d = 0;
  for (let i = open; i < to; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}") { d--; if (!d) return i; }
  }
  return to;
}

function decls(s: string, from: number, to: number, base: number): Decl[] {
  const out: Decl[] = [];
  let i = from;
  while (i < to) {
    let j = i;
    let paren = 0;
    let q: string | null = null;
    while (j < to) {
      const c = s[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (c === ";" && paren <= 0) break;
      else if (c === "{") { j = matchBrace(s, j, to); }
      j++;
    }
    const chunk = s.slice(i, j);
    const colon = chunk.indexOf(":");
    if (colon > 0 && !chunk.includes("{")) {
      const lead = chunk.length - chunk.trimStart().length;
      const prop = chunk.slice(0, colon).trim().toLowerCase();
      let raw = chunk.slice(colon + 1);
      const vLead = raw.length - raw.trimStart().length;
      raw = raw.trim();
      const important = /!important\s*$/i.test(raw);
      const value = raw.replace(/\s*!important\s*$/i, "");
      if (/^-{0,2}[a-z][\w-]*$/.test(prop)) {
        const vs = i + colon + 1 + vLead;
        out.push({ prop, value, start: base + i + lead, end: base + i + chunk.trimEnd().length, valueStart: base + vs, valueEnd: base + vs + value.length, important });
      }
    }
    i = j + 1;
  }
  return out;
}

/* ── color ── */
export type RGBA = { r: number; g: number; b: number; a: number };
// CSS named colors as RGB triplets (only the ones generated pages actually use).
const NAMED: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192], navy: [0, 0, 128], purple: [128, 0, 128], orange: [255, 165, 0], yellow: [255, 255, 0], teal: [0, 128, 128], maroon: [128, 0, 0], lightgray: [211, 211, 211], lightgrey: [211, 211, 211], darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105], whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220], indigo: [75, 0, 130], violet: [238, 130, 238], blueviolet: [138, 43, 226], slateblue: [106, 90, 205], royalblue: [65, 105, 225], cornflowerblue: [100, 149, 237] };

export function parseColor(v: string): RGBA | null {
  const t = v.trim().toLowerCase();
  if (t === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[t]) { const [r, g, b] = NAMED[t]; return { r, g, b, a: 1 }; }
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1 };
    if (h.length === 6 || h.length === 8) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    return null;
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const ch = (x: string) => (x.endsWith("%") ? (parseFloat(x) * 255) / 100 : parseFloat(x));
    const al = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a: al };
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const [r, g, b] = hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
    const al = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r, g, b, a: al };
  }
  return null;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function rgbToHsl({ r, g, b }: RGBA): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

export const toHex = ({ r, g, b }: RGBA) => `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;

export function luminance({ r, g, b }: RGBA) {
  const c = [r, g, b].map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Composites a translucent color over an opaque one. */
export const over = (fg: RGBA, bg: RGBA): RGBA => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });

export function contrast(fg: RGBA, bg: RGBA): number {
  const f = fg.a < 1 ? over(fg, bg) : fg;
  const L1 = luminance(f);
  const L2 = luminance(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/**
 * The nearest color to `fg` (same hue and saturation, lightness moved away from `bg`) that reaches `target` against `bg`.
 * Keeps the brand look while passing WCAG. Null when no lightness of that hue can reach it.
 */
export function fixContrast(fg: RGBA, bg: RGBA, target: number): string | null {
  const [h, s, l] = rgbToHsl(fg.a < 1 ? over(fg, bg) : fg);
  const bgL = luminance(bg);
  const dirs = bgL > 0.4 ? [-1, 1] : [1, -1];
  for (const dir of dirs) {
    for (let step = 1; step <= 100; step++) {
      const nl = l + dir * step * 0.01;
      if (nl < 0 || nl > 1) break;
      const [r, g, b] = hslToRgb(h, s, nl);
      const c = { r, g, b, a: 1 };
      if (contrast(c, bg) >= target + 0.05) return toHex(c);
    }
  }
  return null;
}

/** First color literal in a value (for `background: url(x) #fff no-repeat`, `border: 1px solid red`). */
export function firstColor(v: string): string | null {
  const m = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:black|white|transparent|red|green|blue|gray|grey|silver|navy|purple|orange|yellow|teal|maroon|lightgray|lightgrey|darkgray|darkgrey|dimgray|whitesmoke|gainsboro|indigo|violet|blueviolet|slateblue|royalblue|cornflowerblue)\b)/i.exec(v);
  return m ? m[1] : null;
}

/** Resolves var(--x, fallback) chains against a token map (max depth 6). */
export function resolveVars(v: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 6 || !v.includes("var(")) return v;
  return resolveVars(v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name: string, fb?: string) => tokens.get(name) ?? fb?.trim() ?? ""), tokens, depth + 1);
}
