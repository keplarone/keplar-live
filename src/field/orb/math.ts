/**
 * Front-page orb hero: pure math (no DOM, no three). The scene in scene.ts uses these so the layout, the pulse timing and
 * the convergence curve can be unit-tested. It is an ILLUSTRATION of how Keplar fans a question out and brings it back together;
 * it never shows a measured result.
 */

export const NODE_COUNT = 6;
/** Fan angles in degrees from straight up: three each side, a gap above the orb. */
export const FAN_DEG = [-62, -38, -13, 13, 38, 62] as const;

/** Plain-text names of model families in Keplar's catalogue (src/lib/orchestration/catalog.json). Text only, no logos. */
export const NODE_NAMES = ["OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral"] as const;

export type Vec3 = { x: number; y: number; z: number };
export type Stage = { cx: number; cy: number; w: number; h: number };
export type Placement = { orb: Vec3; orbR: number; nodes: Vec3[]; tile: number; wpp: number };

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** World units per CSS pixel on the z = 0 plane for a perspective camera. */
export function worldPerPx(fovDeg: number, dist: number, viewH: number): number {
  return (2 * Math.tan((fovDeg * Math.PI) / 360) * dist) / Math.max(1, viewH);
}

/**
 * Where the orb and the six tiles sit, in world units, for a "stage" rectangle (CSS px, relative to the canvas).
 * The orb sits at the bottom centre of the stage; the tiles ride an ellipse above it.
 */
export function place(stage: Stage, viewW: number, viewH: number, fovDeg = 36, dist = 14): Placement {
  const wpp = worldPerPx(fovDeg, dist, viewH);
  const narrow = viewW < 760;
  const orbRpx = clamp(stage.h * (narrow ? 0.17 : 0.2), narrow ? 34 : 44, narrow ? 56 : 92);
  const tilePx = clamp(Math.min(stage.w / (narrow ? 7.4 : 10.5), stage.h * 0.3), narrow ? 34 : 46, narrow ? 50 : 84);
  const ocx = stage.cx;
  const ocy = stage.cy + stage.h / 2 - orbRpx * 0.9;
  const rx = Math.max(60, Math.min(stage.w * (narrow ? 0.44 : 0.42), stage.w / 2 - tilePx));
  const ry = Math.max(50, ocy - (stage.cy - stage.h / 2) - tilePx * 0.7);
  const toWorld = (px: number, py: number, z = 0): Vec3 => ({ x: (px - viewW / 2) * wpp, y: (viewH / 2 - py) * wpp, z });
  const nodes = FAN_DEG.map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    // the outer tiles sit lower and nearer the sides: an arc, not a row
    const px = ocx + Math.sin(a) * rx;
    const py = ocy - Math.cos(a) * ry * (0.62 + 0.38 * Math.cos(a));
    return toWorld(px, py, Math.sin(i * 2.1 + 0.6) * 0.55);
  });
  return { orb: toWorld(ocx, ocy, 0), orbR: orbRpx * wpp, nodes, tile: tilePx * wpp, wpp };
}

/** Control points of the cubic that carries line `i` from the orb top to its tile (S-shaped, rises first). */
export function lineControls(orb: Vec3, orbR: number, node: Vec3, i: number): [Vec3, Vec3, Vec3, Vec3] {
  const side = Math.sign(node.x - orb.x) || 1;
  const reach = Math.abs(node.x - orb.x) / Math.max(1e-3, Math.abs(node.x - orb.x) + Math.abs(node.y - orb.y));
  const p0 = { x: orb.x + side * orbR * 0.28 * (1 - Math.abs(Math.cos(i))) , y: orb.y + orbR * 0.92, z: 0 };
  const dy = node.y - p0.y;
  const dx = node.x - p0.x;
  const p1 = { x: p0.x + dx * 0.04, y: p0.y + dy * (0.62 + 0.1 * reach), z: node.z * 0.4 + 0.2 * Math.sin(i * 1.7) };
  const p2 = { x: node.x - dx * 0.28, y: node.y - dy * 0.22, z: node.z * 0.9 };
  return [p0, p1, p2, { x: node.x, y: node.y - 0, z: node.z }];
}

export function bezier(p: [Vec3, Vec3, Vec3, Vec3], t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y, z: a * p[0].z + b * p[1].z + c * p[2].z + d * p[3].z };
}

/** Typing agitation: each keystroke adds a little, it decays on its own. Returns the next value. */
export function agitate(cur: number, dt: number, kick = 0): number {
  return clamp(cur + kick - 1.7 * dt * (0.4 + cur));
}

/** Convergence progress for a submit: 0 → 1 over `dur` seconds (ease-in so the pull accelerates). */
export function convergence(elapsed: number, dur = 0.8): number {
  const t = clamp(elapsed / dur);
  return t * t * (3 - 2 * t) * (0.4 + 0.6 * t);
}

/** Scroll phases for the pinned hero: p 0..1. */
export function scrollPhase(p: number) {
  return {
    /** hero copy opacity */
    copy: 1 - smooth(0.04, 0.34, p),
    /** camera dolly toward the orb, 0..1 */
    dolly: smooth(0, 0.9, p),
    /** lines + tiles fade out as the camera passes */
    lines: 1 - smooth(0.35, 0.7, p),
    /** flood to the next section's colour */
    flood: smooth(0.82, 0.99, p),
  };
}

export type OrbBudget = { segs: number; radial: number; detail: number; orbit: number; stars: number; dprCap: number };
export function budget(q: "low" | "medium" | "high", mobile: boolean): OrbBudget {
  const b: Record<string, OrbBudget> = {
    high: { segs: 96, radial: 6, detail: 5, orbit: 2600, stars: 1100, dprCap: 1.75 },
    medium: { segs: 64, radial: 5, detail: 4, orbit: 1500, stars: 650, dprCap: 1.5 },
    low: { segs: 40, radial: 4, detail: 3, orbit: 700, stars: 300, dprCap: 1.1 },
  };
  const x = { ...b[q] };
  if (mobile) { x.orbit = Math.round(x.orbit * 0.6); x.stars = Math.round(x.stars * 0.6); x.dprCap = Math.min(x.dprCap, 1.35); }
  return x;
}
