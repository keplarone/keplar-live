/**
 * Keplar design tokens — the single TypeScript source for values that JS needs
 * (WebGL colours, motion curves, breakpoints, z-order). Every value here has a
 * CSS custom-property twin in src/styles/tokens.css; keep the two in lockstep.
 */

export const color = {
  canvas: "#FFFFFF",
  surface1: "#F7F8FA",
  surface2: "#F1F3F6",
  ink: "#09090B",
  inkSecondary: "#62646A",
  inkTertiary: "#8C8E94",
  border: "rgba(0, 0, 0, 0.08)",
  borderStrong: "rgba(0, 0, 0, 0.14)",
  glass: "rgba(255, 255, 255, 0.55)",
  glassBorder: "rgba(255, 255, 255, 0.7)",
  /** Spectral accents: used through light, particles and active states only. */
  spectral: {
    ice: "#c5e6ec",
    cyan: "#00C0E0",
    lavender: "#d4cfc4", /* warm sand mist — not purple */
    blush: "#e8cfc4",
    warm: "#e0b888",
  },
  /**
   * Particle stream inks. Deeper than the spectral accents because particles
   * are alpha-blended over white and must hold contrast. Order = intelligence id.
   */
  streams: ["#0a6f7c", "#12a3b5", "#8a4f24", "#d4894a", "#8a4550", "#D9795B"],
  question: "#0B0B0F",
} as const;

export const font = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
  weight: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

/** Fluid type scale: [min px, preferred vw, max px, line-height, tracking em]. */
export const type = {
  display: { min: 54, vw: 8.2, max: 136, lh: 0.94, tracking: -0.048 },
  headline: { min: 40, vw: 5.6, max: 92, lh: 0.98, tracking: -0.042 },
  title: { min: 28, vw: 2.9, max: 44, lh: 1.06, tracking: -0.03 },
  lead: { min: 18, vw: 1.45, max: 22, lh: 1.42, tracking: -0.012 },
  body: { min: 15, vw: 1.05, max: 16, lh: 1.55, tracking: -0.006 },
  small: { min: 13, vw: 0.9, max: 14, lh: 1.45, tracking: 0 },
  label: { min: 11, vw: 0.76, max: 12, lh: 1.3, tracking: 0.06 },
} as const;

/** 4px base spacing scale. */
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
  16: 64, 20: 80, 24: 96, 32: 128, 40: 160, 48: 192,
} as const;

export const radius = { xs: 10, sm: 14, md: 18, card: 24, cardLg: 28, input: 22, pill: 999, shapeControl: 14, shapeCard: 22 } as const;

export const border = { hairline: 1, focus: 2 } as const;

export const shadow = {
  none: "none",
  hairline: "0 0 0 1px rgba(0,0,0,0.06)",
  float: "0 1px 1px rgba(0,0,0,0.03), 0 8px 24px -12px rgba(9,9,11,0.12)",
  window: "0 1px 0 rgba(255,255,255,0.8) inset, 0 30px 80px -40px rgba(9,9,11,0.28), 0 2px 6px rgba(9,9,11,0.04)",
} as const;

export const blur = { glass: 20, glassStrong: 28, glassNavRest: 12, glassNavScrolled: 24 } as const;

export const motion = {
  /** GSAP-compatible cubic-bezier strings and their CSS twins. */
  ease: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    glide: "cubic-bezier(0.65, 0, 0.35, 1)",
  },
  duration: { instant: 90, fast: 160, base: 240, slow: 420, scene: 900 },
  /** Scroll scrub damping (seconds of lag behind the scrollbar). */
  scrub: 1.1,
  magnet: { strength: 0.22, maxOffset: 7, lerp: 0.16 },
  tiltMaxDeg: 3,
} as const;

export const z = {
  canvas: 0,
  content: 10,
  stage: 20,
  window: 30,
  nav: 100,
  overlay: 200,
  skipLink: 300,
} as const;

export const layout = {
  maxWidth: 1360,
  gutter: { mobile: 20, desktop: 40 },
  navHeight: 56,
  navOffset: 16,
  breakpoints: { sm: 640, md: 900, lg: 1200, xl: 1520 },
} as const;

/** Sitewide UI density (1 = 16px rem root). Keep in lockstep with --ui-scale in tokens.css. */
export const uiScale = 1 as const;

export const tokens = { color, font, type, space, radius, border, shadow, blur, motion, z, layout, uiScale } as const;
export type Tokens = typeof tokens;

/**
 * Semantic colour: each hue has exactly one meaning. CSS twins: --c-reasoning etc. in src/styles/tokens.css.
 * Both themes are text-safe (>= 4.5:1) on their canvas; tests/semantic-colour.test.ts enforces it.
 */
export const semantic = {
  light: { reasoning: "#0a6f7c", research: "#0b5f70", creation: "#8a4f24", verified: "#1f7a4a", attention: "#8a5a00", disagree: "#a94f36", destructive: "#b42318", canvas: "#ffffff" },
  dark: { reasoning: "#5ecad8", research: "#7ab8c8", creation: "#e0a86a", verified: "#6fd3a0", attention: "#f0c060", disagree: "#f0a88f", destructive: "#ff8c7e", canvas: "#0b0b0d" },
} as const;

/** Vivid hues for fills, strokes, glows and WebGL. `on` is the ink for text on that fill (>= 4.5:1). Teal/cyan + warm earth; no purple. Primary buttons stay graphite. */
export const vivid = {
  light: {
    reasoning: { v: "#00c0e0", on: "#09090b" }, research: { v: "#12a3b5", on: "#09090b" }, creation: { v: "#d4894a", on: "#09090b" }, memory: { v: "#d4848e", on: "#09090b" },
    disagree: { v: "#e0715a", on: "#09090b" }, attention: { v: "#e2a73b", on: "#09090b" }, verified: { v: "#34a56f", on: "#09090b" }, destructive: { v: "#d92d20", on: "#ffffff" },
  },
  dark: {
    reasoning: { v: "#5ecad8", on: "#09090b" }, research: { v: "#7ab8c8", on: "#09090b" }, creation: { v: "#e0a86a", on: "#09090b" }, memory: { v: "#e09aa4", on: "#09090b" },
    disagree: { v: "#e5805e", on: "#09090b" }, attention: { v: "#e2a73b", on: "#09090b" }, verified: { v: "#34a56f", on: "#09090b" }, destructive: { v: "#ff6b5c", on: "#09090b" },
  },
} as const;

/** What each semantic colour means. Never use one for a different meaning. */
export const semanticMeaning = {
  reasoning: "Keplar's own work: teal/cyan accent, links, highlights (primary buttons stay graphite)",
  research: "looking things up: deeper ocean teal",
  creation: "making things: warm earth / terracotta",
  verified: "checked, confirmed, healthy, live",
  attention: "needs a decision or a look, warnings, unpublished changes",
  disagree: "models disagree, dissent",
  destructive: "delete, revoke, stop, irreversible",
  memory: "personal / remembered: dusty rose (never purple)",
} as const;
