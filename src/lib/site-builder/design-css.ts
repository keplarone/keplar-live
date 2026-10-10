/**
 * The Keplar site stylesheet primitives (v1): tokens come from design.ts, layout/type/components live here.
 * Prepended to every generated site's styles.css between the DS markers, so every site has the same accessible,
 * responsive baseline (focus, reduced motion, fluid type, 8-step spacing) and the model only writes the composition.
 * Must survive sanitizeCss: no url(), no @import/@property, no "<".
 */
import { derivePalette, getDirection, tokenBlock, type Direction, type Palette } from "./design";
import { ensureContrast } from "./color";

export const DS_VERSION = 1;
/** Sentinel rules (comments do not survive the sanitizer, rules do). */
export const DS_START = ".k-ds-start{--ks:1}";
export const DS_END = ".k-ds-end{--ks:0}";
const DS_RE = /\.k-ds-start\{--ks:1\}[\s\S]*?\.k-ds-end\{--ks:0\}/;

export const PRIMITIVES = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:5rem}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:var(--step-0);line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:clip}
:root{
--step--1:clamp(.8125rem,.79rem + .12vw,.9rem);
--step-0:clamp(1rem,.97rem + .2vw,1.1875rem);
--step-1:clamp(1.2rem,1.12rem + .45vw,1.5rem);
--step-2:clamp(1.5rem,1.3rem + 1vw,2.25rem);
--step-3:clamp(1.9rem,1.5rem + 2vw,3.25rem);
--step-4:clamp(2.4rem,1.7rem + 3.6vw,5rem);
--step-5:clamp(3rem,1.8rem + 6vw,7.5rem);
--step-6:clamp(3.6rem,1.6rem + 10vw,12rem);
--sp-1:.25rem;--sp-2:.5rem;--sp-3:.75rem;--sp-4:1rem;--sp-5:1.5rem;--sp-6:2rem;--sp-7:3rem;--sp-8:4.5rem;
--sec:clamp(4.5rem,9vw,9.5rem);--gutter:clamp(1.25rem,4vw,3rem);--max:78rem;--measure:62ch;
--ease:cubic-bezier(.2,.7,.2,1);
}
img,svg,video{max-width:100%;display:block}
img{height:auto}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:.2em}
a:hover{text-decoration-thickness:2px}
::selection{background:var(--accent);color:var(--on-accent)}
:focus-visible{outline:2px solid var(--accent-text);outline-offset:3px;border-radius:2px}
h1,h2,h3,h4,p,ul,ol,figure,blockquote,dl,dd{margin:0}
h1,h2,h3,h4{font-family:var(--f-display);font-weight:var(--d-weight);letter-spacing:var(--d-track);line-height:var(--d-lead);text-transform:var(--d-case);text-wrap:balance;overflow-wrap:break-word}
p,li,dd{text-wrap:pretty;max-width:var(--measure)}
.k-skip{position:absolute;left:var(--gutter);top:-4rem;background:var(--ink);color:var(--bg);padding:.6rem 1rem;z-index:100;transition:top .15s}
.k-skip:focus{top:.75rem}
.k-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

.k-wrap{width:100%;max-width:calc(var(--max) + var(--gutter)*2);margin-inline:auto;padding-inline:var(--gutter)}
.k-wrap--narrow{max-width:calc(46rem + var(--gutter)*2)}
.k-wrap--bleed{max-width:none}
.k-section{padding-block:var(--sec)}
.k-section--tight{padding-block:calc(var(--sec)*.55)}
.k-section--band{background:var(--bg-2)}
.k-invert{background:var(--ink);color:var(--bg);--ink-2:color-mix(in srgb,var(--bg) 74%,var(--ink));--line:color-mix(in srgb,var(--bg) 24%,transparent);--accent-text:var(--accent-inv);--bg-2:color-mix(in srgb,var(--ink) 88%,var(--bg))}
.k-invert .k-btn{background:var(--bg);color:var(--ink)}
.k-invert .k-btn--ghost{background:transparent;color:var(--bg);box-shadow:inset 0 0 0 1px var(--bg)}
.k-accent-band{background:var(--accent);color:var(--on-accent);--ink-2:var(--on-accent);--line:color-mix(in srgb,var(--on-accent) 30%,transparent);--accent-text:var(--on-accent)}
.k-accent-band .k-btn{background:var(--on-accent);color:var(--accent)}

.k-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:var(--gutter);row-gap:var(--sp-6)}
.k-grid>*{grid-column:1/-1;min-width:0}
.k-grid--ruled>*{border-top:1px solid var(--line);padding-top:var(--sp-4)}
.k-stack>*+*{margin-top:var(--sp-4)}
.k-stack--lg>*+*{margin-top:var(--sp-6)}
.k-cluster{display:flex;flex-wrap:wrap;gap:var(--sp-3) var(--sp-5);align-items:center}
.k-split{display:grid;gap:var(--sp-7) var(--gutter);align-items:start}
.k-align-end{align-self:end}
.k-sticky{position:sticky;top:6rem}
@media (min-width:900px){
.k-grid>.k-s-2{grid-column:var(--start,auto)/span 2}.k-grid>.k-s-3{grid-column:var(--start,auto)/span 3}.k-grid>.k-s-4{grid-column:var(--start,auto)/span 4}.k-grid>.k-s-5{grid-column:var(--start,auto)/span 5}.k-grid>.k-s-6{grid-column:var(--start,auto)/span 6}.k-grid>.k-s-7{grid-column:var(--start,auto)/span 7}.k-grid>.k-s-8{grid-column:var(--start,auto)/span 8}.k-grid>.k-s-9{grid-column:var(--start,auto)/span 9}.k-grid>.k-s-10{grid-column:var(--start,auto)/span 10}.k-grid>.k-s-12{grid-column:1/-1}
.k-grid>.k-at-2{--start:2}.k-grid>.k-at-3{--start:3}.k-grid>.k-at-4{--start:4}.k-grid>.k-at-5{--start:5}.k-grid>.k-at-6{--start:6}.k-grid>.k-at-7{--start:7}.k-grid>.k-at-8{--start:8}.k-grid>.k-at-9{--start:9}
.k-grid>.k-row-2{grid-row:span 2}
.k-split{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.k-split--flip{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
.k-split--even{grid-template-columns:repeat(2,minmax(0,1fr))}
}

.k-display{font-size:var(--step-6);line-height:var(--d-lead)}
.k-h1{font-size:var(--step-5)}
.k-h2{font-size:var(--step-4)}
.k-h3{font-size:var(--step-2)}
@media (min-width:900px){.k-split>*,.k-grid>*{container-type:inline-size}.k-split .k-display,.k-grid .k-display{font-size:clamp(2.6rem,12cqi,var(--step-6))}.k-split .k-h1,.k-grid .k-h1{font-size:clamp(2.2rem,10cqi,var(--step-5))}}
.k-h4{font-size:var(--step-1)}
.k-display em,.k-h1 em,.k-h2 em,.k-h3 em{font-style:italic;color:var(--accent-text)}
.k-lede{font-size:var(--step-1);line-height:1.45;color:var(--ink-2);max-width:44ch}
.k-kicker{font-family:var(--f-mono);font-size:var(--step--1);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)}
.k-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.k-muted{color:var(--ink-2)}
.k-prose>*+*{margin-top:1em}
.k-prose h2{font-size:var(--step-3);margin-top:1.6em}
.k-prose h3{font-size:var(--step-2);margin-top:1.4em}
.k-prose ul,.k-prose ol{padding-left:1.2em}
.k-prose li+li{margin-top:.4em}
.k-todo{background:var(--accent-soft);box-shadow:inset 0 -1px 0 var(--accent-text);padding:0 .25em;border-radius:2px;font-style:normal}

.k-header{position:relative;z-index:20;border-bottom:1px solid var(--line)}
.k-header--sticky{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 94%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.k-header__in{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--sp-3) var(--sp-6);min-height:4.5rem;padding-block:var(--sp-3)}
.k-brand{font-family:var(--f-display);font-weight:var(--d-weight);font-size:var(--step-1);letter-spacing:var(--d-track);text-decoration:none;text-transform:var(--d-case)}
.k-nav{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2) var(--sp-5);font-size:var(--step--1)}
.k-nav a{text-decoration:none;padding-block:.35rem;border-bottom:1px solid transparent}
.k-nav a:hover,.k-nav a[aria-current=page]{border-bottom-color:currentColor}
.k-nav a.k-btn{border-bottom:0;padding:.7rem 1.25rem}

.k-btn{display:inline-flex;align-items:center;gap:.6em;min-height:2.9rem;padding:.8rem 1.5rem;background:var(--ink);color:var(--bg);font:inherit;font-weight:600;font-size:var(--step--1);letter-spacing:.02em;text-decoration:none;border:0;border-radius:var(--radius);cursor:pointer;transition:transform .2s var(--ease),background-color .2s,box-shadow .2s}
.k-btn::after{content:"→";transition:transform .2s var(--ease)}
.k-btn:hover{transform:translateY(-1px);text-decoration:none}
.k-btn:hover::after{transform:translateX(3px)}
.k-btn--accent{background:var(--accent);color:var(--on-accent)}
.k-btn--ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.k-btn--plain::after{content:none}
.k-link{display:inline-flex;align-items:center;gap:.5em;font-weight:600;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:.1em}
.k-link::after{content:"→";transition:transform .2s var(--ease)}
.k-link:hover::after{transform:translateX(3px)}
.k-pill{display:inline-block;padding:.2rem .7rem;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);font-family:var(--f-mono);font-size:var(--step--1);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.k-rule{border:0;border-top:1px solid var(--line);margin:0}

.k-hero{padding-block:clamp(3.5rem,8vw,7rem) clamp(3rem,6vw,5.5rem);min-height:min(88svh,56rem);display:flex;flex-direction:column;justify-content:flex-end;gap:var(--sp-7)}
.k-hero--top{justify-content:flex-start}
.k-hero__foot{display:flex;flex-wrap:wrap;gap:var(--sp-3) var(--sp-7);align-items:end;justify-content:space-between;border-top:1px solid var(--line);padding-top:var(--sp-4)}
.k-hero__meta{display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-6)}

.k-rows>*{display:grid;gap:var(--sp-2) var(--gutter);padding-block:var(--sp-5);border-top:1px solid var(--line)}
.k-rows>*:last-child{border-bottom:1px solid var(--line)}
@media (min-width:760px){.k-rows>*{grid-template-columns:minmax(0,4fr) minmax(0,8fr);align-items:baseline}.k-rows--3>*{grid-template-columns:minmax(0,1fr) minmax(0,4fr) minmax(0,7fr)}}
.k-index{list-style:none;padding:0;counter-reset:k}
.k-index>li{counter-increment:k;display:grid;grid-template-columns:3.2rem minmax(0,1fr);gap:var(--sp-2) var(--sp-5);padding-block:var(--sp-5);border-top:1px solid var(--line);max-width:none}
.k-index>li::before{content:counter(k,decimal-leading-zero);font-family:var(--f-mono);font-size:var(--step--1);color:var(--ink-2);padding-top:.4em}
.k-index>li:last-child{border-bottom:1px solid var(--line)}
@media (min-width:900px){.k-index>li{grid-template-columns:4rem minmax(0,5fr) minmax(0,6fr)}}
.k-stat{display:grid;gap:var(--sp-2)}
.k-stat strong{font-family:var(--f-display);font-weight:var(--d-weight);font-size:var(--step-4);line-height:1;letter-spacing:var(--d-track)}

.k-menu{list-style:none;padding:0}
.k-menu>li{display:grid;grid-template-columns:auto 1fr auto;column-gap:var(--sp-3);align-items:baseline;padding-block:var(--sp-3);max-width:none}
.k-menu .k-menu__name{font-family:var(--f-display);font-size:var(--step-1);font-weight:var(--d-weight)}
.k-menu .k-menu__dots{border-bottom:1px dotted var(--ink-2);transform:translateY(-.25em);min-width:1.5rem}
.k-menu .k-menu__price{font-variant-numeric:tabular-nums;font-weight:600}
.k-menu .k-menu__desc{grid-column:1/-1;color:var(--ink-2);font-size:var(--step--1);margin-top:calc(var(--sp-1)*-1)}

.k-tiers{display:grid;gap:0;border-block:1px solid var(--line)}
.k-tier{padding:var(--sp-6) var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-4);border-top:1px solid var(--line)}
.k-tier:first-child{border-top:0}
.k-tier--lead{background:var(--accent-soft)}
.k-tier__price{font-family:var(--f-display);font-weight:var(--d-weight);font-size:var(--step-4);line-height:1;letter-spacing:var(--d-track)}
.k-tier ul{list-style:none;padding:0;display:grid;gap:var(--sp-2);font-size:var(--step--1)}
.k-tier li{padding-left:1.4em;position:relative}
.k-tier li::before{content:"";position:absolute;left:0;top:.65em;width:.7em;height:1px;background:var(--accent-text)}
@media (min-width:900px){.k-tiers{grid-template-columns:repeat(var(--cols,3),minmax(0,1fr))}.k-tier{border-top:0;border-left:1px solid var(--line)}.k-tier:first-child{border-left:0}}

.k-table{width:100%;border-collapse:collapse;font-size:var(--step--1)}
.k-table th,.k-table td{text-align:left;padding:var(--sp-3) var(--sp-4) var(--sp-3) 0;border-bottom:1px solid var(--line);vertical-align:top}
.k-table th{font-family:var(--f-mono);font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}
.k-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}

.k-faq details{border-top:1px solid var(--line);padding-block:var(--sp-4)}
.k-faq details:last-child{border-bottom:1px solid var(--line)}
.k-faq summary{cursor:pointer;font-family:var(--f-display);font-size:var(--step-1);font-weight:var(--d-weight);list-style:none;display:flex;justify-content:space-between;gap:var(--sp-4)}
.k-faq summary::-webkit-details-marker{display:none}
.k-faq summary::after{content:"+";font-family:var(--f-mono);transition:transform .25s var(--ease)}
.k-faq details[open] summary::after{transform:rotate(45deg)}
.k-faq details p{margin-top:var(--sp-3);color:var(--ink-2)}

.k-figure{position:relative;overflow:hidden;border-radius:var(--radius);background:var(--bg-2)}
.k-figure>img{width:100%;height:100%;object-fit:cover}
.k-figure figcaption{font-size:var(--step--1);color:var(--ink-2);padding-top:var(--sp-2)}
.k-ratio-4x5{aspect-ratio:4/5}.k-ratio-3x2{aspect-ratio:3/2}.k-ratio-1x1{aspect-ratio:1}.k-ratio-16x9{aspect-ratio:16/9}.k-ratio-21x9{aspect-ratio:21/9}
.k-ph{display:grid;place-items:center;text-align:center;padding:var(--sp-5);color:var(--ink-2);font-family:var(--f-mono);font-size:var(--step--1);letter-spacing:.06em;text-transform:uppercase;background:repeating-linear-gradient(135deg,transparent 0 11px,var(--line) 11px 12px),var(--bg-2);box-shadow:inset 0 0 0 1px var(--line);border-radius:var(--radius)}
.k-art{position:relative;overflow:hidden;border-radius:var(--radius);background:var(--bg-2);box-shadow:inset 0 0 0 1px var(--line)}
.k-art--arcs{background:radial-gradient(circle at 100% 100%,transparent 0 22%,var(--accent) 22% 23%,transparent 23% 36%,var(--ink) 36% 36.6%,transparent 36.6% 52%,var(--accent) 52% 52.6%,transparent 52.6% 70%,var(--ink) 70% 70.6%,transparent 70.6%),var(--bg-2)}
.k-art--bars{background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 14px),linear-gradient(90deg,var(--accent) 0 18%,transparent 18%),var(--bg-2);background-blend-mode:normal}
.k-art--grid{background:linear-gradient(var(--line) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/32px 32px,radial-gradient(circle at 70% 40%,var(--accent) 0 14%,transparent 14.4%),var(--bg-2)}
.k-art--dots{background:radial-gradient(var(--ink) 1.2px,transparent 1.6px) 0 0/18px 18px,radial-gradient(circle at 30% 70%,var(--accent) 0 20%,transparent 20.4%),var(--bg-2)}
.k-art--half{background:linear-gradient(90deg,var(--ink) 0 50%,var(--accent) 50%)}

.k-strip{overflow:hidden;border-block:1px solid var(--line);padding-block:var(--sp-4);font-family:var(--f-display);font-size:var(--step-3);text-transform:var(--d-case);white-space:nowrap}
.k-strip__track{display:inline-flex;gap:var(--sp-7);padding-right:var(--sp-7);animation:k-strip 38s linear infinite}
@keyframes k-strip{to{transform:translateX(-50%)}}

.k-form{display:grid;gap:var(--sp-5);max-width:34rem}
.k-field{display:grid;gap:var(--sp-2);font-size:var(--step--1);font-weight:600}
.k-field input,.k-field textarea,.k-field select{font:inherit;font-weight:400;font-size:var(--step-0);color:var(--ink);background:var(--bg-2);border:0;border-bottom:1px solid var(--ink-2);border-radius:var(--radius) var(--radius) 0 0;padding:.85rem 1rem;width:100%}
.k-field input:focus,.k-field textarea:focus,.k-field select:focus{outline:2px solid var(--accent-text);outline-offset:0;border-bottom-color:transparent}
.k-field textarea{min-height:9rem;resize:vertical}

.k-footer{border-top:1px solid var(--line);padding-block:var(--sp-7) var(--sp-6);font-size:var(--step--1);color:var(--ink-2)}
.k-footer a{color:var(--ink)}
.k-footer__in{display:grid;gap:var(--sp-6) var(--gutter)}
@media (min-width:760px){.k-footer__in{grid-template-columns:2fr 1fr 1fr}}
.k-footer h3{font-family:var(--f-mono);font-size:var(--step--1);letter-spacing:.1em;text-transform:uppercase;font-weight:500;color:var(--ink-2);margin-bottom:var(--sp-3)}
.k-footer ul{list-style:none;padding:0;display:grid;gap:var(--sp-2)}

[data-kfx]{position:relative;isolation:isolate}
.kfx-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity .9s var(--ease)}
.kfx-canvas[data-ready]{opacity:1}

@media (pointer:coarse){.k-brand{display:inline-flex;align-items:center;min-height:44px}.k-nav a:not(.k-btn){display:inline-flex;align-items:center;min-height:44px}}
@media (max-width:759px){.k-hide-sm{display:none!important}.k-btn{width:auto}.k-strip{font-size:var(--step-2)}.k-brand{display:inline-flex;align-items:center;min-height:44px}.k-nav a:not(.k-btn){display:inline-flex;align-items:center;min-height:44px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.k-strip__track{animation:none}}
@media print{.kfx-canvas{display:none}}
`.trim();

/** Palette + primitives for a direction. */
export function designSystemCss(dirId: string, opts: { accent?: string | null; mode?: "light" | "dark" | null } = {}): { css: string; palette: Palette; direction: Direction } {
  const direction = getDirection(dirId);
  const palette = derivePalette(direction, opts);
  const accentInv = ensureContrast(palette.accent, palette.ink, 4.6);
  const tokens = tokenBlock(direction, palette).replace(/\n}$/, `\n--accent-inv:${accentInv};\n}`);
  return { css: `${DS_START}\n${tokens}\n${PRIMITIVES}\n${DS_END}`, palette, direction };
}

/** Puts the design-system block at the top of a stylesheet, replacing an earlier copy. */
export function applyDesignSystem(styles: string, dirId: string, opts: { accent?: string | null; mode?: "light" | "dark" | null } = {}): string {
  const { css } = designSystemCss(dirId, opts);
  const rest = styles.replace(DS_RE, "").trim();
  return `${css}\n${rest}\n`;
}

/** The part of a stylesheet that the model wrote (everything but the DS block). */
export const stripDesignSystem = (styles: string) => styles.replace(DS_RE, "").trim();
export const hasDesignSystem = (styles: string) => DS_RE.test(styles);
