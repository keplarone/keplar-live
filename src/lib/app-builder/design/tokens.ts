/**
 * Design choice -> design tokens -> the base stylesheet every generated app starts from (kapp.css), plus the art-direction text
 * the generator works from. Colors are always contrast-checked here: body text >= 7:1 on the background, muted >= 4.5:1,
 * accent text >= 4.5:1, text on the accent >= 4.5:1. The owner's colors are kept as close to what they picked as possible.
 */
import { contrast, ensureContrast, mix, parseHex, readableOn, luminance } from "@/lib/site-builder/color";
import { STYLE_IDS, type DesignChoice, type DesignTokens, type Palette, type StyleId } from "../types";
import { FONT_PAIRINGS, fontsById, styleById } from "./presets";

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  const rgb = parseHex(s);
  if (!rgb) return null;
  return "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
};

export function normalizePalette(v: unknown): Palette | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const bg = hex(o.bg);
  const accent = hex(o.accent);
  if (!bg || !accent) return null;
  const dark = luminance(parseHex(bg)!) < 0.2;
  const ink = hex(o.ink) ?? (dark ? "#F2F2F0" : "#121212");
  return {
    bg,
    surface: hex(o.surface) ?? mix(bg, dark ? "#ffffff" : "#ffffff", dark ? 0.05 : 0.5),
    ink,
    muted: hex(o.muted) ?? mix(ink, bg, 0.4),
    accent,
    accent2: hex(o.accent2) ?? ink,
  };
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const clean = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[<>]/g, "").trim().slice(0, n);

export const DEFAULT_DESIGN: DesignChoice = { style: "editorial", mode: "light", palette: null, paletteSource: "style", fonts: "fraunces-hanken", density: "balanced", shape: "sharp", motion: "subtle", notes: "" };

/** Validates a design choice from the client. Unknown values fall back to the style's defaults. */
export function normalizeDesign(v: unknown): DesignChoice {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const style = oneOf(o.style, STYLE_IDS, "editorial");
  const p = styleById(style);
  const fonts = FONT_PAIRINGS.some((f) => f.id === o.fonts) ? String(o.fonts) : p.fonts;
  return {
    style,
    mode: oneOf(o.mode, ["light", "dark"] as const, "light"),
    palette: normalizePalette(o.palette),
    paletteSource: oneOf(o.paletteSource, ["style", "picked", "description", "image", "brand", "surprise"] as const, "style"),
    fonts,
    density: oneOf(o.density, ["airy", "balanced", "dense"] as const, p.density),
    shape: oneOf(o.shape, ["sharp", "soft", "round", "pill"] as const, p.shape),
    motion: oneOf(o.motion, ["none", "subtle", "expressive"] as const, p.motion),
    notes: clean(o.notes, 600),
    ...(o.direction ? { direction: clean(o.direction, 900) } : {}),
  };
}

export function tokensFor(d: DesignChoice): DesignTokens {
  const preset = styleById(d.style);
  const base = d.palette ?? (d.mode === "dark" ? preset.dark : preset.light);
  const bg = base.bg;
  const dark = luminance(parseHex(bg)!) < 0.2;
  const ink = ensureContrast(base.ink, bg, 7);
  const muted = ensureContrast(base.muted, bg, 4.6);
  const surface = contrast(base.surface, bg) > 1.6 && !dark ? mix(base.surface, bg, 0.5) : base.surface;
  const accent = base.accent;
  const onAccent = readableOn(accent);
  const accentText = ensureContrast(accent, bg, 4.6);
  const accent2 = HEX.test(base.accent2) ? base.accent2 : ink;
  const f = fontsById(d.fonts);
  const radius = d.shape === "sharp" ? { sm: "0px", md: "0px", lg: "2px", pill: "0px" } : d.shape === "soft" ? { sm: "6px", md: "10px", lg: "16px", pill: "999px" } : d.shape === "round" ? { sm: "10px", md: "18px", lg: "28px", pill: "999px" } : { sm: "999px", md: "22px", lg: "32px", pill: "999px" };
  return {
    palette: {
      bg, surface, ink, muted, accent, accent2,
      surface2: mix(surface, ink, dark ? 0.08 : 0.04),
      line: mix(bg, ink, dark ? 0.18 : 0.14),
      onAccent: contrast(onAccent, accent) >= 4.5 ? onAccent : ensureContrast(onAccent, accent, 4.5),
      accentText,
    },
    fonts: { display: f.display, body: f.body, mono: f.mono, google: f.google, displayName: f.displayName, bodyName: f.bodyName },
    radius,
    space: d.density === "airy" ? 1.25 : d.density === "dense" ? 0.8 : 1,
    motion: d.motion,
    style: d.style,
    mode: dark ? "dark" : "light",
  };
}

/** Style-specific texture the base sheet adds (kept small; the model composes the rest from tokens). */
function styleCss(s: StyleId): string {
  switch (s) {
    case "brutalist":
      return `.k-card,.k-panel{border:2px solid var(--ink);box-shadow:6px 6px 0 var(--ink)}.k-btn,.k-btn.k-ghost{border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink);text-transform:uppercase;letter-spacing:.04em}.k-btn:active{transform:translate(3px,3px);box-shadow:none}`;
    case "glassy":
      return `.k-card,.k-panel{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(20px) saturate(130%);-webkit-backdrop-filter:blur(20px) saturate(130%);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}`;
    case "retro":
      return `body{background-image:radial-gradient(color-mix(in srgb,var(--ink) 7%,transparent) 1px,transparent 1px);background-size:3px 3px}.k-card,.k-panel{border:2px solid var(--ink)}`;
    case "dimensional":
      return `.k-card,.k-panel{box-shadow:0 1px 0 color-mix(in srgb,#fff 40%,transparent) inset,0 2px 4px rgb(0 0 0/.08),0 12px 32px -12px rgb(0 0 0/.25)}`;
    case "terminal":
      return `body{font-family:var(--f-mono)}.k-card,.k-panel{border:1px dashed var(--line)}`;
    case "y2k":
      return `.k-btn:not(.k-ghost):not(.k-quiet){background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 70%,#fff),var(--accent) 55%,color-mix(in srgb,var(--accent) 80%,#000))}`;
    case "luxury":
      return `.k-label{letter-spacing:.22em}`;
    default:
      return "";
  }
}

/**
 * The base stylesheet: tokens as CSS variables, a small reset, type scale, focus, reduced motion and a handful of neutral
 * primitives (.k-btn, .k-input, .k-card, .k-label, .k-wrap). It is deliberately not a template: no hero, no card grid.
 */
export function designCss(t: DesignTokens): string {
  const p = t.palette;
  const sp = (n: number) => `${(n * t.space).toFixed(3).replace(/\.?0+$/, "")}rem`;
  const dur = t.motion === "none" ? "0ms" : t.motion === "subtle" ? "180ms" : "320ms";
  return `/* kapp design system (generated by Keplar from the owner's design choices; edit the theme in Keplar, not here) */
:root{--bg:${p.bg};--surface:${p.surface};--surface-2:${p.surface2};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--accent:${p.accent};--accent-2:${p.accent2};--accent-text:${p.accentText};--on-accent:${p.onAccent};
--f-display:${t.fonts.display};--f-body:${t.fonts.body};--f-mono:${t.fonts.mono};
--r-sm:${t.radius.sm};--r-md:${t.radius.md};--r-lg:${t.radius.lg};--r-pill:${t.radius.pill};
--s-1:${sp(0.25)};--s-2:${sp(0.5)};--s-3:${sp(0.75)};--s-4:${sp(1)};--s-5:${sp(1.5)};--s-6:${sp(2)};--s-7:${sp(3)};--s-8:${sp(4.5)};--s-9:${sp(7)};
--t--1:clamp(.78rem,.76rem + .1vw,.84rem);--t-0:clamp(.95rem,.92rem + .15vw,1.05rem);--t-1:clamp(1.15rem,1.08rem + .35vw,1.35rem);--t-2:clamp(1.4rem,1.25rem + .7vw,1.85rem);--t-3:clamp(1.8rem,1.5rem + 1.4vw,2.7rem);--t-4:clamp(2.3rem,1.8rem + 2.6vw,4rem);--t-5:clamp(3rem,2rem + 4.8vw,6.2rem);--t-6:clamp(3.6rem,2.2rem + 7.5vw,9.5rem);
--dur:${dur};--ease:cubic-bezier(.2,.7,.2,1);--max:1240px;--shadow:${t.mode === "dark" ? "0 18px 40px -18px rgb(0 0 0/.7)" : "0 18px 40px -20px rgb(20 20 30/.28)"};color-scheme:${t.mode}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:var(--t-0);line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h1,h2,h3,h4{font-family:var(--f-display);line-height:1.05;letter-spacing:-.02em;margin:0;font-weight:700;text-wrap:balance}
p{margin:0;text-wrap:pretty}
img,svg,video,canvas{display:block;max-width:100%}
img{height:auto}
a{color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
::selection{background:color-mix(in srgb,var(--accent) 30%,transparent)}
.k-wrap{width:min(100% - 2*var(--s-5),var(--max));margin-inline:auto}
.k-label{font-family:var(--f-mono);font-size:var(--t--1);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.k-muted{color:var(--muted)}
.k-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:0 1.15em;border-radius:var(--r-pill);border:1px solid transparent;background:var(--accent);color:var(--on-accent);font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap;transition:transform var(--dur) var(--ease),background var(--dur) var(--ease),border-color var(--dur) var(--ease),opacity var(--dur) var(--ease)}
.k-btn:hover{filter:brightness(1.06)}
.k-btn:active{transform:translateY(1px)}
.k-btn:disabled,.k-btn[aria-disabled="true"]{opacity:.5;cursor:not-allowed;filter:none}
.k-btn.k-ghost,.k-btn--ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.k-btn.k-ghost:hover,.k-btn--ghost:hover{border-color:var(--ink);filter:none}
.k-btn.k-quiet{background:transparent;color:var(--ink);border-color:transparent;padding:0 .6em}
.k-btn.k-quiet:hover{background:var(--surface-2);filter:none}
.k-btn.k-danger{background:#b42318;color:#fff}
.k-btn.k-sm{min-height:34px;padding:0 .8em;font-size:var(--t--1)}
.k-btn--accent{background:var(--accent);color:var(--on-accent)}
.k-input,.k-select,.k-textarea{width:100%;min-height:44px;padding:.6em .8em;border-radius:var(--r-md);border:1px solid var(--line);background:var(--surface);color:var(--ink)}
.k-textarea{min-height:110px;resize:vertical}
.k-input:focus,.k-select:focus,.k-textarea:focus{border-color:var(--accent-text);outline:none}
.k-card,.k-panel{background:var(--surface);border-radius:var(--r-lg);border:1px solid var(--line)}
.k-field{display:grid;gap:var(--s-1)}
.k-field small{color:var(--muted);font-size:var(--t--1)}
.k-chip{display:inline-flex;align-items:center;gap:.4em;min-height:30px;padding:0 .75em;border-radius:var(--r-pill);border:1px solid var(--line);background:transparent;color:var(--ink);font-size:var(--t--1);cursor:pointer}
.k-chip[aria-pressed="true"],.k-chip.is-on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.k-badge{display:inline-flex;align-items:center;padding:.15em .55em;border-radius:var(--r-pill);background:var(--surface-2);color:var(--ink);font-size:var(--t--1);font-weight:600}
.k-avatar{width:40px;height:40px;border-radius:var(--r-pill);object-fit:cover;background:var(--surface-2);display:inline-grid;place-items:center;font-weight:700;color:var(--muted);flex:none;overflow:hidden}
.k-skeleton{background:linear-gradient(90deg,var(--surface-2),color-mix(in srgb,var(--surface-2) 55%,var(--bg)),var(--surface-2));background-size:200% 100%;animation:k-shimmer 1.4s linear infinite;border-radius:var(--r-sm);min-height:1em}
@keyframes k-shimmer{to{background-position:-200% 0}}
.k-empty{display:grid;justify-items:start;gap:var(--s-3);padding:var(--s-7) var(--s-5);border:1px dashed var(--line);border-radius:var(--r-lg);color:var(--muted)}
.k-spinner{width:18px;height:18px;border-radius:50%;border:2px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:currentColor;animation:k-spin .7s linear infinite;display:inline-block}
@keyframes k-spin{to{transform:rotate(360deg)}}
.k-stack{display:flex;flex-direction:column;gap:var(--s-4)}
.k-row{display:flex;align-items:center;gap:var(--s-3);flex-wrap:wrap}
.k-grid{display:grid;gap:var(--s-5);grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}
.k-display{font-family:var(--f-display);font-size:var(--t-5);line-height:.95;letter-spacing:-.03em}
.k-eyebrow{font-family:var(--f-mono);font-size:var(--t--1);letter-spacing:.12em;text-transform:uppercase;color:var(--accent-text)}
.k-mono{font-family:var(--f-mono)}
.k-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.k-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:.7em 1.1em;border-radius:var(--r-md);font-size:var(--t--1);z-index:1000}
${styleCss(t.style)}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
}

/** Plain-language art direction for the planner and generator. */
export function designBrief(d: DesignChoice, t: DesignTokens): string {
  const s = styleById(d.style);
  const p = t.palette;
  const lines = [
    `Style direction: ${s.name}. ${s.character}`,
    d.direction ? `Art direction for this project: ${d.direction}` : "",
    d.notes ? `The owner's own words about the look (follow them): ${d.notes}` : "",
    `Mode: ${t.mode}. Palette (already defined as CSS variables): background ${p.bg} (--bg), surface ${p.surface} (--surface, --surface-2), text ${p.ink} (--ink), secondary text ${p.muted} (--muted), hairlines ${p.line} (--line), accent ${p.accent} (--accent, text on it --on-accent, accent-colored text --accent-text), second accent ${p.accent2} (--accent-2).`,
    `Typography: display ${t.fonts.displayName} (--f-display), body ${t.fonts.bodyName} (--f-body), mono (--f-mono). Fluid sizes --t--1 .. --t-6 (t-6 is huge display).`,
    `Shape: ${d.shape} corners (--r-sm, --r-md, --r-lg, --r-pill). Density: ${d.density} (spacing --s-1 .. --s-9). Motion: ${d.motion}${d.motion === "none" ? " (no animation)" : d.motion === "subtle" ? " (short, purposeful transitions with --dur and --ease)" : " (confident motion: staged entrances, springy interactions, scroll-linked moments; always honor prefers-reduced-motion)"}.`,
  ];
  return lines.filter(Boolean).join("\n");
}
