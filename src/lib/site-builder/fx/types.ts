/** Shared types for the Keplar site effects (three.js scenes, reveal, parallax). Pure; used by the server and the builder UI. */

export const FX_EFFECTS = ["particles", "lattice", "shapes", "contours"] as const;
export type FxEffect = (typeof FX_EFFECTS)[number];

export const FX_EFFECT_INFO: Record<FxEffect, { label: string; blurb: string }> = {
  particles: { label: "Particle field", blurb: "Small, sharp points drifting in depth; they lean away from the cursor." },
  lattice: { label: "Dot lattice", blurb: "A fine grid of points that ripples under the cursor and breathes slowly." },
  shapes: { label: "Wire form", blurb: "A fine wireframe object that turns as you scroll and resolves into view." },
  contours: { label: "Contour lines", blurb: "Stacked hairlines forming a slow ridge, like a survey map." },
};

/** Per-site effects setting (stored on the site). */
export type SiteFx = {
  /** Master switch. When off, no script is added to the site. */
  enabled: boolean;
  /** 0 to 100. 0 = still pictures only (reveals and parallax stay off), 100 = richest. */
  intensity: number;
  /** "auto" follows the style direction. */
  effect: FxEffect | "auto";
};

export const DEFAULT_FX: SiteFx = { enabled: false, intensity: 55, effect: "auto" };

export function normalizeFx(input: unknown, base: SiteFx = DEFAULT_FX): SiteFx {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const eff = typeof o.effect === "string" && ((FX_EFFECTS as readonly string[]).includes(o.effect) || o.effect === "auto") ? (o.effect as SiteFx["effect"]) : base.effect;
  const n = Number(o.intensity);
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    intensity: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : base.intensity,
    effect: eff,
  };
}

/** Versioned file names of the vendored runtime (public/fx). Bump when the runtime changes. */
export const FX_VERSION = "1";
export const FX_LOADER_PATH = `/fx/kfx.${FX_VERSION}.js`;
export const FX_GL_PATH = `/fx/kfx-gl.${FX_VERSION}.js`;
