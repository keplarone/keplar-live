import type { SceneId } from "./scenes";

/**
 * The hero blob: one noise-displaced, shader-driven soft body that morphs between shapes per route family. Pure data + math (no three).
 * Parameters (all lerped when the route changes, so the blob flows from one form to the next):
 *   amp    noise displacement (fraction of radius)         freq   noise frequency            speed  noise drift per second
 *   twist  twist about the vertical axis (radians per unit) sx sy sz  stretch of the body     lobes  lobe depth, lobeK lobe count
 *   x y    placement as a fraction of the half view (x is used on wide screens, phones centre it)   size  radius as a fraction of the view
 *   pts    share of the crisp point shell that is drawn (0..1)
 */
export const BLOB_KEYS = ["amp", "freq", "speed", "twist", "sx", "sy", "sz", "lobes", "lobeK", "x", "y", "size", "pts"] as const;
export type BlobKey = (typeof BLOB_KEYS)[number];
export type BlobParams = Record<BlobKey, number>;

const P = (o: Partial<BlobParams>): BlobParams => ({ amp: 0.2, freq: 1.2, speed: 0.22, twist: 0, sx: 1, sy: 1, sz: 1, lobes: 0, lobeK: 3, x: 0.5, y: 0, size: 0.52, pts: 1, ...o });

export type BlobVariant = "orb" | "lobed" | "sheet" | "egg" | "knot" | "pebble" | "tall" | "wide" | "ridge" | "ring" | "seed" | "quiet";

export const BLOB_VARIANTS: Record<BlobVariant, BlobParams> = {
  orb: P({ amp: 0.2, freq: 1.25, speed: 0.22, x: 0.5, size: 0.55 }),
  lobed: P({ amp: 0.14, freq: 0.9, speed: 0.18, lobes: 0.26, lobeK: 4, x: 0.52, size: 0.56 }),
  sheet: P({ amp: 0.16, freq: 1.6, speed: 0.26, sy: 0.28, sx: 1.25, sz: 1.05, x: 0.48, y: 0.04, size: 0.62 }),
  egg: P({ amp: 0.12, freq: 0.8, speed: 0.16, sy: 1.28, sx: 0.88, sz: 0.9, x: 0.55, size: 0.5 }),
  knot: P({ amp: 0.26, freq: 1.0, speed: 0.3, twist: 2.2, lobes: 0.2, lobeK: 3, sy: 1.2, sx: 0.9, x: 0.5, size: 0.5 }),
  pebble: P({ amp: 0.09, freq: 1.5, speed: 0.14, sx: 1.18, sy: 0.82, sz: 1.0, x: 0.5, y: -0.04, size: 0.54 }),
  tall: P({ amp: 0.22, freq: 1.9, speed: 0.34, sy: 1.5, sx: 0.62, sz: 0.62, x: 0.56, size: 0.46 }),
  wide: P({ amp: 0.18, freq: 1.1, speed: 0.2, sx: 1.55, sy: 0.7, sz: 0.85, lobes: 0.12, lobeK: 2, x: 0.34, size: 0.5 }),
  ridge: P({ amp: 0.3, freq: 2.3, speed: 0.28, lobes: 0.1, lobeK: 7, x: 0.5, size: 0.52 }),
  ring: P({ amp: 0.1, freq: 0.7, speed: 0.2, sy: 0.55, sx: 1.2, sz: 1.2, twist: 0.8, lobes: 0.3, lobeK: 2, x: 0.5, size: 0.5 }),
  seed: P({ amp: 0.07, freq: 0.6, speed: 0.12, sx: 0.85, sy: 1.1, sz: 0.85, x: 0.5, size: 0.4 }),
  quiet: P({ amp: 0.11, freq: 0.9, speed: 0.14, x: 0.86, y: -0.5, size: 0.2, pts: 0.5 }),
};

/** Every scene gets a form; route families that share a point scene still differ because the form is chosen here. */
export const BLOB_FOR_SCENE: Record<SceneId, BlobVariant> = {
  converge: "orb", ask: "quiet", create: "quiet", projects: "quiet", memory: "seed", agents: "knot", business: "wide", pricing: "pebble", download: "egg", calm: "quiet",
  "onb-welcome": "orb", "onb-purpose": "lobed", "onb-prefs": "ridge", "onb-connect": "ring", "onb-ready": "orb",
  helix: "knot", sheets: "sheet", ribbons: "ridge", globe: "orb", split: "wide", torus: "ring", rain: "tall", gate: "egg", echo: "lobed", vault: "pebble", spiral: "knot", tunnel: "tall",
};

export function blobFor(scene: SceneId): BlobVariant { return BLOB_FOR_SCENE[scene] ?? "orb"; }

/** Blend two parameter sets (t 0..1, smoothstep'd so the morph eases in and out). */
export function mixBlob(a: BlobParams, b: BlobParams, t: number, out: BlobParams = { ...a }): BlobParams {
  const k = Math.max(0, Math.min(1, t)), e = k * k * (3 - 2 * k);
  for (const key of BLOB_KEYS) out[key] = a[key] + (b[key] - a[key]) * e;
  return out;
}

/** Mesh/point detail for the device: smaller on phones and low tier, never zero. */
export function blobDetail(form: "mobile" | "desktop", quality: "low" | "medium" | "high"): { mesh: number; points: number } {
  const base = quality === "high" ? { mesh: 40, points: 14 } : quality === "medium" ? { mesh: 30, points: 11 } : { mesh: 20, points: 8 };
  return form === "mobile" ? { mesh: Math.round(base.mesh * 0.6), points: Math.round(base.points * 0.7) } : base;
}

/** Where the blob sits: centred above the copy on phones, beside it on wide screens; scroll carries it down and turns it. */
export function blobPlacement(p: BlobParams, hw: number, hh: number, aspect: number, scroll: number): { x: number; y: number; r: number; turn: number } {
  const wide = aspect > 1.25;
  const r = p.size * Math.min(hh, wide ? hw * 0.8 : hw * 1.15) * (1 - 0.22 * scroll);
  const x = wide ? p.x * hw : 0;
  const y = (wide ? p.y * hh : Math.max(p.y, 0.1) * hh + (p.size > 0.3 ? hh * 0.32 : 0)) - scroll * hh * 0.5;
  return { x, y, r, turn: scroll * Math.PI * 1.2 };
}
