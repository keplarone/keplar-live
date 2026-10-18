/**
 * Keplar "Monolith" scene: pure maths (no DOM, no three). A glass monolith (the question) stands over dark water, ridges behind it,
 * vertical light beams, six model nodes joined to it by light ribbons, and a camera that travels along a keyframed path as the
 * page scrolls. Every page picks a variant (its own path and mix of parts). All of it is grey/white light on black (or ink on white in Light).
 */
export type V3 = [number, number, number];

export type Key = {
  t: number;
  cam: V3;
  look: V3;
  /** monolith scale, y-rotation (rad), inner glow 0..1.5 */
  s: number;
  rot: number;
  glow: number;
  /** parts, 0..1 */
  beams: number;
  routes: number;
  nodes: number;
  net: number;
  ridge: number;
  /** nodes: 0 = spread on a ring, 1 = five agree in a cluster and one stands apart */
  agree: number;
  /** verification band sweeping the monolith */
  scan: number;
  ripple: number;
  /** space layer, 0..1: nebula clouds, star field, warp streaks, galaxy spiral, orbit rings, planets, aurora, low mist */
  neb: number;
  stars: number;
  warp: number;
  galaxy: number;
  rings: number;
  planet: number;
  aurora: number;
  mist: number;
};

export type VariantId = "home" | "ridge" | "beams" | "network" | "calm";

export type Variant = { id: VariantId; keys: Key[]; /** scroll positions where a glitch cut plays */ swaps: number[]; drift: number };

const k = (t: number, p: Partial<Key> & { cam: V3; look: V3 }): Key => ({
  t, s: 1, rot: 0, glow: 0.6, beams: 0.4, routes: 0, nodes: 0, net: 0, ridge: 1, agree: 0, scan: 0, ripple: 0.6, neb: 0.55, stars: 0.9, warp: 0, galaxy: 0, rings: 0, planet: 0.4, aurora: 0, mist: 0.5, ...p,
});

/** Home: hero, then Ask, Route, Respond, Compare, Verify, Answer (7 keys, evenly spaced). */
const HOME: Key[] = [
  k(0 / 6, { cam: [0, 2.5, 13], look: [0, 2.1, 0], glow: 0.6, beams: 0.55, nodes: 0.2, net: 0.25, neb: 0.8, stars: 1, planet: 0.6, galaxy: 0.15 }),
  k(1 / 6, { cam: [1.2, 2.3, 7.4], look: [0, 1.9, 0], s: 1.15, rot: 0.5, glow: 1, beams: 0.3, ripple: 0.8, neb: 0.5, rings: 0.7, planet: 0.3 }),
  k(2 / 6, { cam: [-5.5, 5.8, 13.5], look: [0, 3.4, -2], rot: 0.9, glow: 0.7, beams: 0.3, routes: 1, nodes: 1, net: 0.5, warp: 0.6, neb: 0.35, planet: 0.2 }),
  k(3 / 6, { cam: [6.8, 2.1, 9.5], look: [0, 2.2, -1], rot: 1.4, glow: 0.55, beams: 0.75, routes: 1, nodes: 1, net: 0.4, agree: 0.15, galaxy: 1, neb: 0.5, planet: 0.15, aurora: 0.2 }),
  k(4 / 6, { cam: [0, 6.2, 15], look: [0, 4.0, -10], rot: 1.9, glow: 0.5, beams: 0.2, routes: 0.6, nodes: 1, net: 0.7, agree: 1, aurora: 1, neb: 0.4, planet: 0.55, rings: 0.2 }),
  k(5 / 6, { cam: [-2.4, 3.4, 9.5], look: [0, 2.6, -2], rot: 3.0, glow: 0.8, beams: 0.35, routes: 0.4, nodes: 0.6, net: 0.8, agree: 1, scan: 1, rings: 1, neb: 0.3, stars: 0.7, planet: 0.3 }),
  k(6 / 6, { cam: [0, 2.9, 5.6], look: [0, 2.2, 0], s: 1.2, rot: 3.14, glow: 0.95, beams: 1, nodes: 0.2, net: 0.3, ridge: 0.7, ripple: 1, neb: 1, planet: 0.85, stars: 1, aurora: 0.4, rings: 0.3, mist: 0.6 }),
];

/** Other pages: shorter paths, one idea each. t is the page's scroll position 0..1. */
const RIDGE: Key[] = [
  k(0, { cam: [-2.5, 2.2, 14], look: [0, 2.3, 0], s: 0.9, glow: 0.5, beams: 0.25, ridge: 1 , aurora: 0.8, planet: 0.75, neb: 0.5 }),
  k(0.5, { cam: [3, 3.4, 10], look: [0, 2.1, -4], s: 0.9, rot: 0.8, glow: 0.7, beams: 0.35, ridge: 1 , aurora: 0.8, planet: 0.75, neb: 0.5 }),
  k(1, { cam: [0, 2.0, 7], look: [0, 2.4, -8], s: 0.9, rot: 1.6, glow: 0.6, beams: 0.3, ridge: 1 , aurora: 0.8, planet: 0.75, neb: 0.5 }),
];
const BEAMS: Key[] = [
  k(0, { cam: [0, 1.6, 12], look: [0, 4, 0], s: 0.8, glow: 0.5, beams: 1, ridge: 0.5 , warp: 0.45, stars: 1, neb: 0.3, planet: 0.25 }),
  k(0.5, { cam: [-3, 2.4, 8], look: [0, 4.4, 0], s: 0.8, rot: 1, glow: 0.7, beams: 1, routes: 0.6, nodes: 0.6, ridge: 0.4 , warp: 0.45, stars: 1, neb: 0.3, planet: 0.25 }),
  k(1, { cam: [2, 3.6, 10.5], look: [0, 3, 0], s: 0.8, rot: 2, glow: 0.8, beams: 0.9, routes: 1, nodes: 1, ridge: 0.4 , warp: 0.45, stars: 1, neb: 0.3, planet: 0.25 }),
];
const NETWORK: Key[] = [
  k(0, { cam: [0, 4.8, 15], look: [0, 2.4, 0], s: 0.75, glow: 0.5, beams: 0.1, routes: 0.8, nodes: 1, net: 1, ridge: 0.3 , galaxy: 1, neb: 0.5, rings: 0.5, planet: 0.2 }),
  k(0.5, { cam: [5.5, 4, 11], look: [0, 2.4, 0], s: 0.75, rot: 1, glow: 0.6, beams: 0.1, routes: 1, nodes: 1, net: 1, agree: 0.7, ridge: 0.3 , galaxy: 1, neb: 0.5, rings: 0.5, planet: 0.2 }),
  k(1, { cam: [-1, 7.5, 10.5], look: [0, 2, 0], s: 0.75, rot: 2, glow: 0.7, beams: 0.1, routes: 0.7, nodes: 1, net: 1, agree: 1, ridge: 0.3 , galaxy: 1, neb: 0.5, rings: 0.5, planet: 0.2 }),
];
const CALM: Key[] = [
  k(0, { cam: [0, 2.6, 16], look: [0, 2.4, 0], s: 0.7, glow: 0.35, beams: 0.2, ridge: 0.8, ripple: 0.4 , neb: 0.8, stars: 1, planet: 0.3, mist: 0.6 }),
  k(1, { cam: [1.5, 2.9, 13], look: [0, 2.4, 0], s: 0.7, rot: 0.7, glow: 0.4, beams: 0.25, ridge: 0.8, ripple: 0.4 , neb: 0.8, stars: 1, planet: 0.3, mist: 0.6 }),
];

export const VARIANTS: Record<VariantId, Variant> = {
  home: { id: "home", keys: HOME, swaps: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map((v) => v / 6), drift: 1 },
  ridge: { id: "ridge", keys: RIDGE, swaps: [], drift: 0.8 },
  beams: { id: "beams", keys: BEAMS, swaps: [], drift: 0.8 },
  network: { id: "network", keys: NETWORK, swaps: [], drift: 0.8 },
  calm: { id: "calm", keys: CALM, swaps: [], drift: 0.5 },
};

/** Which variant each page uses (one per family of pages). */
export function variantFor(path: string): VariantId | null {
  const p = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (/^\/(sites|s|i|api|embed|app|create|admin|account|checkout|desktop|r|docs)(\/|$)/.test(p) || /-preview(\/|$)/.test(p)) return null;
  if (/^\/(about|product|enterprise|keplar-one|superintelligence|si-vs-ai|ai-vs-agi-vs-superintelligence|for-researchers)/.test(p)) return "ridge";
  if (/^\/(how-it-works|guides|use-cases|for-you|for-students|for-developers|for-founders|for-small-business|ai-answer-engine|ai-fact-check|ai-study-tool|ai-slideshow-maker|agents)/.test(p)) return "beams";
  if (/^\/(models|compare|vs|compare-ai-models|chatgpt-alternative|multi-model-ai|pricing|download)/.test(p)) return "network";
  return "calm";
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Interpolated state at path position p (0..1): smooth between neighbouring keys, so the camera eases through every key. */
export function sample(keys: Key[], p: number): Key {
  const t = clamp(p);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
  const u = b.t === a.t ? 0 : smooth(0, 1, clamp((t - a.t) / (b.t - a.t)));
  return {
    t,
    cam: lerp3(a.cam, b.cam, u), look: lerp3(a.look, b.look, u),
    s: lerp(a.s, b.s, u), rot: lerp(a.rot, b.rot, u), glow: lerp(a.glow, b.glow, u),
    beams: lerp(a.beams, b.beams, u), routes: lerp(a.routes, b.routes, u), nodes: lerp(a.nodes, b.nodes, u), net: lerp(a.net, b.net, u),
    ridge: lerp(a.ridge, b.ridge, u), agree: lerp(a.agree, b.agree, u), scan: lerp(a.scan, b.scan, u), ripple: lerp(a.ripple, b.ripple, u),
    neb: lerp(a.neb, b.neb, u), stars: lerp(a.stars, b.stars, u), warp: lerp(a.warp, b.warp, u), galaxy: lerp(a.galaxy, b.galaxy, u),
    rings: lerp(a.rings, b.rings, u), planet: lerp(a.planet, b.planet, u), aurora: lerp(a.aurora, b.aurora, u), mist: lerp(a.mist, b.mist, u),
  };
}

/** Glitch strength 0..1 at p: a short burst around each swap position. */
export function glitchAt(swaps: number[], p: number, width = 0.014): number {
  let g = 0;
  for (const s of swaps) { const d = (p - s) / width; g = Math.max(g, Math.exp(-d * d)); }
  return g;
}

/** Where model node i (0..5) sits. `agree` pulls five into a cluster and leaves one apart; `conv` (0..1) pulls all into the monolith. */
export function nodePos(i: number, agree: number, conv: number, time: number): V3 {
  const th = Math.PI * (0.08 + (0.84 * i) / 5);
  const ring: V3 = [Math.cos(th) * 7.2, 3 + Math.sin(i * 1.7) * 0.7, -Math.sin(th) * 4.4 - 1.2];
  const cl: V3 = i < 5 ? [5.4 + Math.cos(i * 1.256) * 0.9, 3.1 + Math.sin(i * 1.256) * 0.7, -2.4 + Math.sin(i * 2.1) * 0.6] : [-6.6, 4.1, -3.2];
  const bob = Math.sin(time * 0.6 + i * 1.3) * 0.18;
  const p: V3 = [lerp(ring[0], cl[0], agree), lerp(ring[1], cl[1], agree) + bob, lerp(ring[2], cl[2], agree)];
  return [lerp(p[0], 0, conv), lerp(p[1], 2, conv), lerp(p[2], 0, conv)];
}

/** Home scene layout: how far scene `i` (0 = hero) is from the camera at act position a. */
export function scenePose(d: number): { opacity: number; scale: number; y: number } {
  const ad = Math.abs(d);
  return { opacity: clamp(1.75 - ad * 2.4, 0, 1), scale: d > 0 ? 1 - Math.min(d, 1) * 0.2 : 1 + Math.min(-d, 1) * 0.45, y: clamp(d, -1, 1) * 40 };
}

/** planetOct: noise octaves in planet shading; planetFx: 0 = base shading, 1 = + moon and sun glow, 2 = + city lights; pathSeg: story path segments */
export type Budget = { dpr: number; beams: number; dust: number; cloud: number; ridgeSeg: number; post: boolean; stars: number; galaxy: number; streaks: number; oct: number; aurSeg: number; planetDetail: number; planetOct: number; planetFx: number; pathSeg: number };
export function budget(quality: "low" | "medium" | "high", mobile: boolean): Budget {
  const b: Record<string, Budget> = {
    high: { dpr: 1.6, beams: 22, dust: 520, cloud: 60, ridgeSeg: 220, post: true, stars: 2400, galaxy: 3600, streaks: 520, oct: 5, aurSeg: 70, planetDetail: 5, planetOct: 5, planetFx: 2, pathSeg: 72 },
    medium: { dpr: 1.35, beams: 14, dust: 300, cloud: 40, ridgeSeg: 160, post: true, stars: 1500, galaxy: 2200, streaks: 340, oct: 4, aurSeg: 48, planetDetail: 4, planetOct: 4, planetFx: 1, pathSeg: 52 },
    low: { dpr: 1.0, beams: 8, dust: 140, cloud: 22, ridgeSeg: 90, post: true, stars: 800, galaxy: 1100, streaks: 200, oct: 3, aurSeg: 28, planetDetail: 3, planetOct: 3, planetFx: 0, pathSeg: 32 },
  };
  const x = { ...b[quality] };
  if (mobile) { x.dpr = Math.min(x.dpr, 1.2); x.beams = Math.round(x.beams * 0.7); x.dust = Math.round(x.dust * 0.6); x.cloud = Math.round(x.cloud * 0.7); x.stars = Math.round(x.stars * 0.6); x.galaxy = Math.round(x.galaxy * 0.5); x.streaks = Math.round(x.streaks * 0.6); x.oct = Math.max(3, x.oct - 1); x.planetDetail = Math.min(x.planetDetail, 4); x.planetOct = Math.max(2, x.planetOct - 1); x.planetFx = Math.min(x.planetFx, 1); x.pathSeg = Math.min(x.pathSeg, 40); }
  return x;
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const NODE_COUNT = 6;
export const NODE_NAMES = ["OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral"] as const;
