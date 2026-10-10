/**
 * What the test browser measures on a rendered page, and how those measurements become issues.
 * `PROBE_JS` runs inside the page (a string, so no bundler helper can leak into it); `issuesFromProbe` is pure and unit-tested.
 */
export type Viewport = { id: "mobile" | "tablet" | "desktop"; label: string; width: number; height: number };
export const VIEWPORTS: Viewport[] = [
  { id: "mobile", label: "phone, 390 px", width: 390, height: 844 },
  { id: "tablet", label: "tablet, 820 px", width: 820, height: 1100 },
  { id: "desktop", label: "desktop, 1440 px", width: 1440, height: 900 },
];

export type Probe = {
  docW: number;
  winW: number;
  overflow: { sel: string; right: number }[];
  h1: number;
  h1InFirstScreen: boolean;
  textLen: number;
  imgs: { src: string; alt: string | null; broken: boolean; w: number }[];
  tiny: number;
  tinySample: string;
  taps: { n: number; small: number; sample: string };
  contrast: { sel: string; ratio: number; text: string }[];
  title: string;
  hasMain: boolean;
  viewportMeta: boolean;
  fonts: string[];
  links: { href: string; text: string }[];
  forms: number;
  height: number;
};

export const PROBE_JS = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.'); return s.slice(0, 60); };
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = (el) => { let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0.95) return c; e = e.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const docW = document.documentElement.scrollWidth;
  const overflow = [];
  if (docW > vw + 1) { for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') { overflow.push({ sel: sel(el), right: Math.round(r.right) }); if (overflow.length >= 4) break; } } }
  const h1s = [...document.querySelectorAll('h1')];
  const h1InFirstScreen = h1s.some((h) => { const r = h.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.width > 0; });
  const main = document.querySelector('main') || document.body;
  const imgs = [...document.images].slice(0, 40).map((i) => ({ src: (i.currentSrc || i.src || '').slice(0, 120), alt: i.getAttribute('alt'), broken: i.complete && i.naturalWidth === 0, w: Math.round(i.getBoundingClientRect().width) }));
  let tiny = 0, tinySample = '';
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const contrast = []; let seen = 0;
  while (walker.nextNode()) {
    const n = walker.currentNode; const t = (n.textContent || '').trim(); if (t.length < 3) continue;
    const el = n.parentElement; if (!el) continue; const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const fs = parseFloat(cs.fontSize); if (fs < 12 && t.length > 12) { tiny++; if (!tinySample) tinySample = sel(el) + ' ' + fs + 'px'; }
    if (seen++ < 120) { const fg = parse(cs.color); const bg = bgOf(el); if (fg && bg) { const a = lum(fg.r, fg.g, fg.b), b = lum(bg.r, bg.g, bg.b); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); const big = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700); if (ratio < (big ? 3 : 4.5)) contrast.push({ sel: sel(el), ratio: Math.round(ratio * 100) / 100, text: t.slice(0, 40) }); } }
  }
  const taps = { n: 0, small: 0, sample: '' };
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary')) { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue; taps.n++; if (r.height < 32 && r.width < 44 + 40 && (el.textContent || '').trim().length < 40) { taps.small++; if (!taps.sample) taps.sample = sel(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); } }
  const links = [...document.querySelectorAll('header a[href], nav a[href]')].map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim().slice(0, 40) })).filter((l) => l.href && !/^(https?:|mailto:|tel:|#)/i.test(l.href));
  const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')).slice(0, 8);
  return { docW, winW: vw, overflow, h1: h1s.length, h1InFirstScreen, textLen: (main.innerText || '').length, imgs, tiny, tinySample, taps, contrast: contrast.slice(0, 6), title: document.title, hasMain: !!document.querySelector('main'), viewportMeta: !!document.querySelector('meta[name=viewport]'), fonts: [...new Set(fonts)], links, forms: document.forms.length, height: document.documentElement.scrollHeight };
})()`;

export type QaIssue = { code: string; severity: "error" | "warn"; page: string; viewport: Viewport["id"] | "all"; message: string };

export function issuesFromProbe(p: Probe, page: string, vp: Viewport): QaIssue[] {
  const out: QaIssue[] = [];
  const add = (code: string, severity: QaIssue["severity"], message: string) => out.push({ code, severity, page, viewport: vp.id, message });
  if (p.docW > p.winW + 1) add("overflow-x", "error", `Content is wider than the screen on a ${vp.label} (page ${p.docW}px, screen ${p.winW}px). Widest: ${p.overflow.map((o) => `${o.sel} to ${o.right}px`).join(", ") || "unknown"}. Make it wrap or fit.`);
  const broken = p.imgs.filter((i) => i.broken);
  if (broken.length) add("broken-image", "error", `${broken.length} image${broken.length === 1 ? "" : "s"} failed to load (${broken.slice(0, 2).map((b) => b.src.slice(0, 60)).join(", ")}).`);
  const noAlt = p.imgs.filter((i) => i.alt === null && i.w > 24);
  if (noAlt.length) add("missing-alt", "warn", `${noAlt.length} image${noAlt.length === 1 ? " has" : "s have"} no alt attribute.`);
  if (p.h1 !== 1) add("h1-count", "warn", `The page has ${p.h1} <h1> elements (needs exactly one).`);
  else if (!p.h1InFirstScreen) add("h1-below-fold", "warn", `The main heading is not visible in the first screen on a ${vp.label}.`);
  if (page === "index.html" && p.textLen < 120) add("thin-content", "warn", "The home page has very little text.");
  if (!p.viewportMeta) add("no-viewport", "error", "No viewport meta tag, so phones render it zoomed out.");
  if (!p.hasMain) add("no-main", "warn", "No <main> landmark.");
  if (p.tiny >= 3) add("tiny-text", "warn", `${p.tiny} text blocks are under 12px (${p.tinySample}).`);
  if (vp.id === "mobile" && p.taps.small >= 4) add("small-tap-targets", "warn", `${p.taps.small} of ${p.taps.n} controls are small touch targets (${p.taps.sample}). Aim for 44px.`);
  const bad = p.contrast.filter((c) => c.ratio < 3);
  if (bad.length) add("low-contrast", "error", `Text is hard to read (contrast ${bad[0].ratio}:1) in ${bad.slice(0, 2).map((c) => `${c.sel} "${c.text}"`).join(", ")}.`);
  else if (p.contrast.length) add("low-contrast", "warn", `Some text is below the 4.5:1 contrast target (${p.contrast[0].ratio}:1 in ${p.contrast[0].sel}).`);
  return out;
}

/** Console and network problems, deduplicated; third-party noise is not the site's fault. */
export function issuesFromConsole(msgs: { kind: "console" | "pageerror" | "request"; text: string }[], page: string, vp: Viewport["id"]): QaIssue[] {
  const seen = new Set<string>();
  const out: QaIssue[] = [];
  for (const m of msgs) {
    const text = m.text.replace(/\s+/g, " ").slice(0, 200);
    if (/favicon|googletagmanager|google-analytics|doubleclick/i.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    const font = /fonts\.(googleapis|gstatic)/i.test(text);
    out.push({ code: m.kind === "pageerror" ? "page-error" : m.kind === "request" ? (font ? "font-load" : "request-failed") : "console-error", severity: font ? "warn" : "error", page, viewport: vp, message: `${m.kind === "pageerror" ? "Script error" : m.kind === "request" ? "Request failed" : "Console error"}: ${text}` });
    if (out.length >= 6) break;
  }
  return out;
}

export const issueLine = (i: QaIssue) => `- [${i.code}] ${i.page}${i.viewport === "all" ? "" : ` @${i.viewport}`}: ${i.message}`;
