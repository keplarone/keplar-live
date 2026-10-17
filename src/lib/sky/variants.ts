/**
 * The weather sky's variants and the look of each one (docs/design/space-ui.md, "The background: the weather sky").
 *
 * One list, shared by the server (which maps the visitor's current weather onto a variant, src/lib/sky/weather.ts), the live
 * WebGL renderer (src/lib/sky/renderer.ts) and the offline still renderer (scripts/sky/render-stills.mts), so the pre-rendered
 * still a visitor sees first and the live canvas that replaces it are the same picture. Time of day never matters: the theme
 * picks the look (light = the daytime version of the weather, dark = a dimmed bluish almost-night version with small stars).
 *
 * Pure data and arithmetic: no DOM, no WebGL, safe to import anywhere.
 */

export const SKY_VARIANTS = ["clear", "partly-cloudy", "cloudy", "overcast", "fog", "drizzle", "rain", "thunderstorm", "snow"] as const;
export type SkyVariant = (typeof SKY_VARIANTS)[number];
export type SkyTheme = "light" | "dark";

/** What everyone sees until (or unless) their weather is known: a calm, mostly clear sky with a few cumulus. */
export const DEFAULT_SKY: SkyVariant = "partly-cloudy";

export function isSkyVariant(v: unknown): v is SkyVariant {
  return typeof v === "string" && (SKY_VARIANTS as readonly string[]).includes(v);
}

/** Precipitation drawn by the particle layer. */
export type Precip = "none" | "drizzle" | "rain" | "snow";

/** Everything the renderer needs for one variant in one theme. Colours are display sRGB hex; the renderer linearises them. */
export interface SkyLook {
  /** Sky at the zenith and at the horizon (display colours, before clouds). */
  zenith: string;
  horizon: string;
  /** Light from the sun (day) or moon (dark): colour and strength (1 = a clear summer day). */
  sun: string;
  sunPower: number;
  /** Sun/moon direction: degrees right of the view centre, degrees above the horizon (just outside the frame, top right). */
  sunAz: number;
  sunEl: number;
  /** Diffuse light on the cloud tops and the cloud bases. */
  ambTop: string;
  ambBot: string;
  /** Cloud layer: base and top height (km), coverage 0..1, density multiplier, detail erosion 0..1, 0 = flat stratus .. 1 = cumulus. */
  base: number;
  top: number;
  coverage: number;
  density: number;
  detail: number;
  billow: number;
  /** How much the sky behind the headline (upper middle) is kept clear, 0..1. */
  clearing: number;
  /** Visibility (km) for the haze that softens distant clouds; low = fog. */
  visibility: number;
  /** 0..1: how much the sky itself is grayed (overcast, rain). */
  gray: number;
  /** Star field brightness (dark theme only), 0 = none. */
  stars: number;
  precip: Precip;
  /** Precipitation amount 0..1. */
  precipAmount: number;
  lightning: boolean;
  /** Overall exposure. */
  exposure: number;
}

type Shape = Pick<SkyLook, "base" | "top" | "coverage" | "density" | "detail" | "billow" | "clearing" | "precip" | "precipAmount" | "lightning">;

/** Cloud geometry per variant (the same in both themes, so a theme switch keeps the clouds where they are). */
const SHAPE: Record<SkyVariant, Shape> = {
  clear: { base: 1.6, top: 2.5, coverage: 0.16, density: 0.9, detail: 0.55, billow: 1, clearing: 0.9, precip: "none", precipAmount: 0, lightning: false },
  "partly-cloudy": { base: 1.5, top: 3.3, coverage: 0.5, density: 1, detail: 0.55, billow: 1, clearing: 0.6, precip: "none", precipAmount: 0, lightning: false },
  cloudy: { base: 1.3, top: 3.9, coverage: 0.62, density: 1.1, detail: 0.45, billow: 0.85, clearing: 0.55, precip: "none", precipAmount: 0, lightning: false },
  overcast: { base: 1.0, top: 2.4, coverage: 0.86, density: 0.7, detail: 0.45, billow: 0.25, clearing: 0.1, precip: "none", precipAmount: 0, lightning: false },
  fog: { base: 0.45, top: 1.6, coverage: 0.9, density: 0.5, detail: 0.25, billow: 0.1, clearing: 0, precip: "none", precipAmount: 0, lightning: false },
  drizzle: { base: 0.9, top: 2.3, coverage: 0.95, density: 0.8, detail: 0.3, billow: 0.2, clearing: 0.05, precip: "drizzle", precipAmount: 0.45, lightning: false },
  rain: { base: 0.8, top: 3.2, coverage: 0.97, density: 1.0, detail: 0.35, billow: 0.35, clearing: 0.05, precip: "rain", precipAmount: 0.75, lightning: false },
  thunderstorm: { base: 0.8, top: 4.6, coverage: 0.9, density: 1.3, detail: 0.5, billow: 0.55, clearing: 0, precip: "rain", precipAmount: 0.9, lightning: true },
  snow: { base: 0.8, top: 2.6, coverage: 0.94, density: 0.6, detail: 0.3, billow: 0.2, clearing: 0.05, precip: "snow", precipAmount: 0.6, lightning: false },
};

type Light = Omit<SkyLook, keyof Shape>;

/** Daytime light per variant (light theme). */
const DAY: Record<SkyVariant, Light> = {
  clear: { zenith: "#3f86d8", horizon: "#d6e7f5", sun: "#fff4e2", sunPower: 1, sunAz: 52, sunEl: 44, ambTop: "#b9d4f0", ambBot: "#7d93ae", visibility: 70, gray: 0, stars: 0, exposure: 1 },
  "partly-cloudy": { zenith: "#3c82d4", horizon: "#d3e5f4", sun: "#fff3df", sunPower: 1, sunAz: 52, sunEl: 44, ambTop: "#a9c4e2", ambBot: "#6a7f97", visibility: 40, gray: 0.03, stars: 0, exposure: 1 },
  cloudy: { zenith: "#5b8fc8", horizon: "#d5e1ec", sun: "#fff1dc", sunPower: 0.85, sunAz: 52, sunEl: 44, ambTop: "#a9bdd3", ambBot: "#66788c", visibility: 35, gray: 0.2, stars: 0, exposure: 1 },
  overcast: { zenith: "#a9b3bf", horizon: "#d2d7dd", sun: "#f3f1ee", sunPower: 0.35, sunAz: 40, sunEl: 50, ambTop: "#c9cfd6", ambBot: "#98a1ac", visibility: 25, gray: 0.85, stars: 0, exposure: 1 },
  fog: { zenith: "#c3c9cf", horizon: "#e1e4e7", sun: "#f6f4ef", sunPower: 0.3, sunAz: 40, sunEl: 40, ambTop: "#d5d9de", ambBot: "#b4bac1", visibility: 3.5, gray: 0.9, stars: 0, exposure: 1 },
  drizzle: { zenith: "#9aa5b1", horizon: "#c8ced5", sun: "#eceae6", sunPower: 0.28, sunAz: 40, sunEl: 50, ambTop: "#b8c0c9", ambBot: "#87919c", visibility: 14, gray: 0.85, stars: 0, exposure: 1 },
  rain: { zenith: "#8f99a5", horizon: "#bcc3cb", sun: "#e6e5e2", sunPower: 0.22, sunAz: 40, sunEl: 50, ambTop: "#aab3bd", ambBot: "#77818c", visibility: 9, gray: 0.9, stars: 0, exposure: 1 },
  thunderstorm: { zenith: "#6f7c8c", horizon: "#b9bdbd", sun: "#fff0d8", sunPower: 0.3, sunAz: 58, sunEl: 40, ambTop: "#97a3b1", ambBot: "#56606c", visibility: 22, gray: 0.6, stars: 0, exposure: 1 },
  snow: { zenith: "#b9c2cc", horizon: "#e6e9ec", sun: "#f8f7f4", sunPower: 0.3, sunAz: 40, sunEl: 45, ambTop: "#dde2e7", ambBot: "#b2bac3", visibility: 8, gray: 0.9, stars: 0, exposure: 1 },
};

/** The dark theme: the same weather as a dimmed, bluish almost-night sky, moonlit, with small stars where it is clear. */
const NIGHT: Record<SkyVariant, Light> = {
  clear: { zenith: "#0b1531", horizon: "#2a3b66", sun: "#c7d6ff", sunPower: 0.16, sunAz: 50, sunEl: 38, ambTop: "#1c2a4c", ambBot: "#0e1630", visibility: 70, gray: 0, stars: 1, exposure: 1 },
  "partly-cloudy": { zenith: "#0b1531", horizon: "#283963", sun: "#c7d6ff", sunPower: 0.16, sunAz: 50, sunEl: 38, ambTop: "#1c2a4c", ambBot: "#0d152d", visibility: 60, gray: 0, stars: 0.9, exposure: 1 },
  cloudy: { zenith: "#0d1630", horizon: "#29365a", sun: "#c4d1f5", sunPower: 0.12, sunAz: 50, sunEl: 38, ambTop: "#1d2945", ambBot: "#0e152b", visibility: 45, gray: 0.15, stars: 0.6, exposure: 1 },
  overcast: { zenith: "#121a2c", horizon: "#283247", sun: "#b8c3dd", sunPower: 0.05, sunAz: 40, sunEl: 50, ambTop: "#262f45", ambBot: "#161d2f", visibility: 25, gray: 0.7, stars: 0, exposure: 1 },
  fog: { zenith: "#1a2234", horizon: "#2f384c", sun: "#b8c3dd", sunPower: 0.04, sunAz: 40, sunEl: 40, ambTop: "#2c3549", ambBot: "#222a3c", visibility: 3.5, gray: 0.8, stars: 0, exposure: 1 },
  drizzle: { zenith: "#111829", horizon: "#252e43", sun: "#b8c3dd", sunPower: 0.04, sunAz: 40, sunEl: 50, ambTop: "#232c41", ambBot: "#141a2b", visibility: 14, gray: 0.7, stars: 0, exposure: 1 },
  rain: { zenith: "#121a2e", horizon: "#283249", sun: "#b8c3dd", sunPower: 0.04, sunAz: 40, sunEl: 50, ambTop: "#252f45", ambBot: "#161d30", visibility: 9, gray: 0.75, stars: 0, exposure: 1 },
  thunderstorm: { zenith: "#0e1528", horizon: "#263049", sun: "#c4d1f5", sunPower: 0.05, sunAz: 58, sunEl: 34, ambTop: "#1d2740", ambBot: "#0c1222", visibility: 22, gray: 0.5, stars: 0, exposure: 1 },
  snow: { zenith: "#18213a", horizon: "#36405a", sun: "#c4d1f5", sunPower: 0.05, sunAz: 40, sunEl: 45, ambTop: "#323c56", ambBot: "#252e45", visibility: 8, gray: 0.75, stars: 0, exposure: 1 },
};

export function skyLook(variant: SkyVariant, theme: SkyTheme): SkyLook {
  return { ...SHAPE[variant], ...(theme === "dark" ? NIGHT : DAY)[variant] };
}

/**
 * Drift speed multiplier from the surface wind (km/h, Open-Meteo `wind_speed_10m`): a calm day drifts slowly, a windy one
 * faster, never frantic.
 */
export function windFactor(kmh: number | null | undefined): number {
  if (typeof kmh !== "number" || !Number.isFinite(kmh) || kmh < 0) return 1;
  return Math.min(2.5, Math.max(0.5, 0.6 + kmh / 25));
}

/** File stem of a pre-rendered still in public/sky (`-sm` is the 800px portrait one for phones). */
export function stillName(variant: SkyVariant, theme: SkyTheme, small = false): string {
  return `${variant}-${theme === "dark" ? "night" : "day"}${small ? "-sm" : ""}`;
}

/** The still frames' framing: the live canvas reproduces this camera so the cross-fade lines up (background-size: cover). */
export const STILL_LARGE = { width: 1600, height: 1000 } as const;
export const STILL_SMALL = { width: 800, height: 1000 } as const;
