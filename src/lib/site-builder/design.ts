/**
 * Keplar design system for generated sites: curated style directions (type pairing, restrained palette, radius,
 * layout character), a palette derivation that verifies contrast, and the font links.
 * The model never invents colors or fonts: the tokens are computed here and the stylesheet primitives (design-css.ts)
 * are prepended to every site's styles.css.
 */
import { contrast, ensureContrast, hueOf, mix, parseHex, readableOn, rgbToHsl, hslToRgb, toHex } from "./color";
import type { FxEffect } from "./fx/types";

export type DirectionId = "editorial" | "swiss" | "noir" | "organic" | "technical" | "raw" | "craft" | "clear";

export type Direction = {
  id: DirectionId;
  name: string;
  tagline: string;
  /** Kinds of business it suits best (brief.kind values). */
  bestFor: string[];
  mode: "light" | "dark";
  fonts: { display: string; body: string; mono: string; google: string; displayName: string; bodyName: string };
  base: { bg: string; ink: string };
  accent: string;
  /** Corner radius used by buttons, fields and figures. */
  radius: string;
  display: { weight: number; tracking: string; leading: string; transform: "none" | "uppercase" };
  /** Prose for the model: what layouts and details give this direction its character. */
  character: string;
  effect: FxEffect;
  swatch: [string, string, string];
};

const gf = (families: string[]) => `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;

export const DIRECTIONS: Direction[] = [
  {
    id: "editorial",
    name: "Editorial",
    tagline: "Magazine layouts, a high-contrast serif, warm paper.",
    bestFor: ["portfolio", "studio", "restaurant", "agency", "other"],
    mode: "light",
    fonts: { displayName: "Instrument Serif", bodyName: "Hanken Grotesk", display: '"Instrument Serif", "Iowan Old Style", Georgia, serif', body: '"Hanken Grotesk", system-ui, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace', google: gf(["Instrument+Serif:ital@0;1", "Hanken+Grotesk:wght@400;500;600"]) },
    base: { bg: "#F3EEE4", ink: "#1C1A17" },
    accent: "#B2431D",
    radius: "2px",
    display: { weight: 400, tracking: "-0.02em", leading: "0.98", transform: "none" },
    character: "Very large serif headlines (clamp up to 9rem) set tight, with italic emphasis on one or two words. Asymmetric 12-column compositions, narrow text columns offset against wide figures, numbered section labels (01, 02), hairline rules instead of boxes. Generous whitespace. Pull-quotes only from content the user supplied.",
    effect: "contours",
    swatch: ["#F3EEE4", "#1C1A17", "#B2431D"],
  },
  {
    id: "swiss",
    name: "Swiss grid",
    tagline: "Strict grid, heavy grotesk, one signal color.",
    bestFor: ["saas", "agency", "studio", "other"],
    mode: "light",
    fonts: { displayName: "Schibsted Grotesk", bodyName: "Schibsted Grotesk", display: '"Schibsted Grotesk", system-ui, sans-serif', body: '"Schibsted Grotesk", system-ui, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace', google: gf(["Schibsted+Grotesk:wght@400;500;700;900"]) },
    base: { bg: "#F5F5F2", ink: "#0F0F0F" },
    accent: "#E5391A",
    radius: "0",
    display: { weight: 800, tracking: "-0.04em", leading: "0.92", transform: "none" },
    character: "Oversized, tightly tracked grotesk headlines flush left. A visible 12-column grid with hairline column rules, small uppercase labels, data shown as aligned tables or rows (never as rounded cards). The accent appears only on one element per screen. Left-aligned, ragged-right text; strong baseline alignment.",
    effect: "lattice",
    swatch: ["#F5F5F2", "#0F0F0F", "#E5391A"],
  },
  {
    id: "noir",
    name: "Noir",
    tagline: "Near-black, brass accents, didone display type.",
    bestFor: ["restaurant", "portfolio", "studio", "hospitality", "other"],
    mode: "dark",
    fonts: { displayName: "Bodoni Moda", bodyName: "Jost", display: '"Bodoni Moda", "Didot", Georgia, serif', body: '"Jost", system-ui, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace', google: gf(["Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400..500", "Jost:wght@300;400;500"]) },
    base: { bg: "#0D0C0B", ink: "#EDE6D8" },
    accent: "#C9A25A",
    radius: "0",
    display: { weight: 400, tracking: "-0.01em", leading: "1", transform: "none" },
    character: "Dark, quiet and expensive. Centered or very asymmetric compositions, thin brass hairlines, small letter-spaced uppercase labels, large didone headlines with italic accents. Imagery area dominates; text is sparse. Generous vertical rhythm. No bright colors besides the brass accent.",
    effect: "shapes",
    swatch: ["#0D0C0B", "#EDE6D8", "#C9A25A"],
  },
  {
    id: "organic",
    name: "Soft organic",
    tagline: "Rounded, earthy, calm. Soft serif and a friendly sans.",
    bestFor: ["wellness", "restaurant", "local-service", "shop", "other"],
    mode: "light",
    fonts: { displayName: "Fraunces", bodyName: "DM Sans", display: '"Fraunces", "Iowan Old Style", Georgia, serif', body: '"DM Sans", system-ui, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace', google: gf(["Fraunces:opsz,wght@9..144,300..600", "DM+Sans:wght@400;500;700"]) },
    base: { bg: "#EEEBE0", ink: "#222A21" },
    accent: "#4A6B4E",
    radius: "22px",
    display: { weight: 400, tracking: "-0.02em", leading: "1.02", transform: "none" },
    character: "Large soft serif headlines, big rounded shapes (pill tags, arched or circular figure frames made with border-radius), organic offsets between sections, generous padding. Earthy neutral surfaces layered with one muted green or clay accent. Friendly, human copy.",
    effect: "particles",
    swatch: ["#EEEBE0", "#222A21", "#4A6B4E"],
  },
  {
    id: "technical",
    name: "Technical",
    tagline: "Monospace labels, hairline grid, amber on graphite.",
    bestFor: ["saas", "devtool", "agency", "other"],
    mode: "dark",
    fonts: { displayName: "IBM Plex Sans", bodyName: "IBM Plex Sans", display: '"IBM Plex Sans", system-ui, sans-serif', body: '"IBM Plex Sans", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace', google: gf(["IBM+Plex+Sans:wght@400;500;600", "IBM+Plex+Mono:wght@400;500"]) },
    base: { bg: "#0B0E12", ink: "#E4EAF0" },
    accent: "#FFB000",
    radius: "4px",
    display: { weight: 600, tracking: "-0.035em", leading: "0.98", transform: "none" },
    character: "Graphite background with a 1px hairline grid, monospace for labels, numbers and metadata, tabular specimens (spec tables, key/value rows, code-like blocks written by hand), asymmetric split hero with a precise diagram built from inline SVG lines. Single amber accent used sparingly. Dense but orderly.",
    effect: "lattice",
    swatch: ["#0B0E12", "#E4EAF0", "#FFB000"],
  },
  {
    id: "raw",
    name: "Raw",
    tagline: "Brutalist: huge type, hard borders, no polish on purpose.",
    bestFor: ["studio", "portfolio", "agency", "shop", "other"],
    mode: "light",
    fonts: { displayName: "Archivo", bodyName: "Space Mono", display: '"Archivo", system-ui, sans-serif', body: '"Space Mono", ui-monospace, monospace', mono: '"Space Mono", ui-monospace, monospace', google: gf(["Archivo:wdth,wght@62..125,100..900", "Space+Mono:wght@400;700"]) },
    base: { bg: "#EFEFEA", ink: "#0A0A0A" },
    accent: "#FF4A00",
    radius: "0",
    display: { weight: 900, tracking: "-0.03em", leading: "0.88", transform: "uppercase" },
    character: "Uppercase condensed-feeling display type at enormous size, 2px black borders, stacked blocks that touch, a scrolling text strip, monospace body copy. Deliberately blunt and confident. One loud accent color block per page. Still perfectly readable and aligned.",
    effect: "particles",
    swatch: ["#EFEFEA", "#0A0A0A", "#FF4A00"],
  },
  {
    id: "craft",
    name: "Warm craft",
    tagline: "Cream, ink green and tomato. Made-by-hand warmth.",
    bestFor: ["restaurant", "shop", "local-service", "wellness", "other"],
    mode: "light",
    fonts: { displayName: "Young Serif", bodyName: "Karla", display: '"Young Serif", "Iowan Old Style", Georgia, serif', body: '"Karla", system-ui, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace', google: gf(["Young+Serif", "Karla:wght@400;500;700"]) },
    base: { bg: "#F6EFDD", ink: "#1F2D24" },
    accent: "#C8402A",
    radius: "10px",
    display: { weight: 400, tracking: "-0.015em", leading: "1.02", transform: "none" },
    character: "Warm cream paper, deep green-black ink, one tomato accent. A bold serif headline, hand-drawn feeling inline SVG marks (circles, underlines, arrows, simple sun/leaf/utensil line art made from paths), ticket-like bordered blocks, menu-style leader lines. Friendly and local.",
    effect: "particles",
    swatch: ["#F6EFDD", "#1F2D24", "#C8402A"],
  },
  {
    id: "clear",
    name: "Clear & trusted",
    tagline: "Calm, legible, reassuring. For services people rely on.",
    bestFor: ["local-service", "health", "legal", "finance", "saas", "other"],
    mode: "light",
    fonts: { displayName: "Source Serif 4", bodyName: "Public Sans", display: '"Source Serif 4", "Iowan Old Style", Georgia, serif', body: '"Public Sans", system-ui, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace', google: gf(["Source+Serif+4:opsz,wght@8..60,400;8..60,600", "Public+Sans:wght@400;500;600"]) },
    base: { bg: "#FAFAF7", ink: "#13201C" },
    accent: "#0E6B5E",
    radius: "8px",
    display: { weight: 600, tracking: "-0.02em", leading: "1.04", transform: "none" },
    character: "Clean white-space-led layouts, a confident serif headline, a prominent phone/inquiry action above the fold, plain-spoken copy, service lists as clear rows with a short description, opening hours and area served as structured blocks. Calm teal-green accent. No decoration for its own sake.",
    effect: "contours",
    swatch: ["#FAFAF7", "#13201C", "#0E6B5E"],
  },
];

export const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);
export const getDirection = (id: string | undefined | null): Direction => DIRECTIONS.find((d) => d.id === id) ?? DIRECTIONS[0];

/** Suggests directions for a business kind, best matches first (always returns at least 4 so there is real choice). */
export function suggestDirections(kind: string): Direction[] {
  const scored = DIRECTIONS.map((d, i) => ({ d, score: (d.bestFor.includes(kind) ? 10 : 0) + (d.bestFor.indexOf(kind) >= 0 ? 3 - Math.min(2, d.bestFor.indexOf(kind)) : 0) - i * 0.01 }));
  return scored.sort((a, b) => b.score - a.score).map((x) => x.d);
}

export type Palette = {
  bg: string; bg2: string; ink: string; ink2: string; line: string;
  accent: string; accentText: string; onAccent: string; accentSoft: string;
  mode: "light" | "dark";
};

/** Palette from a direction and an optional brand accent. Every text pair is verified (ink 12:1, muted 5:1, accent text 4.5:1). */
export function derivePalette(dir: Direction, opts: { accent?: string | null; mode?: "light" | "dark" | null } = {}): Palette {
  const mode = opts.mode ?? dir.mode;
  let bg = dir.base.bg;
  let ink = dir.base.ink;
  if (mode !== dir.mode) {
    // Flip: take the direction's hue and build a dark/light surface from it.
    const [h, s] = rgbToHsl(parseHex(dir.base.bg) ?? [200, 200, 200]);
    bg = mode === "dark" ? toHex(hslToRgb(h, Math.min(0.2, s), 0.07)) : toHex(hslToRgb(h, Math.min(0.28, s), 0.94));
    ink = mode === "dark" ? toHex(hslToRgb(h, Math.min(0.2, s), 0.9)) : toHex(hslToRgb(h, 0.2, 0.1));
  }
  const accentIn = opts.accent && parseHex(opts.accent) ? (opts.accent.startsWith("#") ? opts.accent : `#${opts.accent}`) : mode === dir.mode ? dir.accent : mode === "dark" ? "#E0B766" : dir.accent;
  const accent = toHex(parseHex(accentIn)!);
  const line = mix(bg, ink, mode === "dark" ? 0.2 : 0.16);
  const bg2 = mix(bg, ink, mode === "dark" ? 0.06 : 0.045);
  const ink2 = ensureContrast(ensureContrast(mix(ink, bg, mode === "dark" ? 0.32 : 0.36), bg, 5.2), bg2, 5);
  const onAccent = readableOn(accent);
  const accentSoft = mix(bg, accent, mode === "dark" ? 0.16 : 0.12);
  const accentText = ensureContrast(ensureContrast(accent, bg, 4.6), accentSoft, 4.6);
  return { bg, bg2, ink: ensureContrast(ink, bg, 12), ink2, line, accent, accentText, onAccent, accentSoft, mode };
}

/** Contrast table for the palette, used by tests and the lint report. */
export function paletteChecks(p: Palette) {
  return [
    { pair: "ink on bg", ratio: contrast(p.ink, p.bg), min: 12 },
    { pair: "muted on bg", ratio: contrast(p.ink2, p.bg), min: 4.5 },
    { pair: "muted on raised", ratio: contrast(p.ink2, p.bg2), min: 4.5 },
    { pair: "accent text on bg", ratio: contrast(p.accentText, p.bg), min: 4.5 },
    { pair: "on-accent on accent", ratio: contrast(p.onAccent, p.accent), min: 4.5 },
  ];
}

export function tokenBlock(dir: Direction, p: Palette): string {
  const accentHue = Math.round(hueOf(p.accent));
  return `:root{
--bg:${p.bg};--bg-2:${p.bg2};--ink:${p.ink};--ink-2:${p.ink2};--line:${p.line};
--accent:${p.accent};--accent-text:${p.accentText};--on-accent:${p.onAccent};--accent-soft:${p.accentSoft};
--accent-hue:${accentHue};
--f-display:${dir.fonts.display};--f-body:${dir.fonts.body};--f-mono:${dir.fonts.mono};
--d-weight:${dir.display.weight};--d-track:${dir.display.tracking};--d-lead:${dir.display.leading};--d-case:${dir.display.transform};
--radius:${dir.radius};
color-scheme:${p.mode};
}`;
}

/** The `<link>` tags that load the direction's fonts (googleapis/gstatic are the only hosts the sanitizer and CSP allow). */
export function fontLinks(dir: Direction, display: "swap" | "optional" | "fallback" = "swap"): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${dir.fonts.google.replace(/display=swap/, `display=${display}`)}">`;
}
