/**
 * Convergence Field geometry (pure, no DOM, no three). The GLSL in glsl.ts evaluates the SAME curve on the GPU;
 * keep the two in lockstep (tests/field.test.ts compares anchors). The field is an ILLUSTRATION of how a Keplar
 * answer is formed: it never displays a measured result.
 */

export const ORIGIN_X = -5.4;
export const FOCUS_X = 4.4;
export const STREAMS = 6;

/** What each stream colour means. Colour = the kind of work a line of reasoning is doing (not a specific model). */
export const STREAM_ROLES = [
  { id: "line-a", token: "reasoning", label: "Line of reasoning" },
  { id: "line-b", token: "reasoning", label: "Line of reasoning" },
  { id: "line-c", token: "reasoning", label: "Line of reasoning" },
  { id: "line-d", token: "reasoning", label: "Line of reasoning" },
  { id: "line-e", token: "reasoning", label: "Line of reasoning" },
  { id: "dissent", token: "disagree", label: "Disagreement" },
] as const;

export const DISSENT = 5;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function amp(u: number) {
  return smooth(0.05, 0.4, u) * (1 - smooth(0.7, 0.94, u));
}

export type V3 = { x: number; y: number; z: number };

/** Centre line of stream `s` (0..5), lane offset `l` (-1..1), along `u` (0..1). Mirror of streamPos() in glsl.ts. */
export function streamPos(s: number, l: number, u: number, seed: number): V3 {
  const e = u * u * (3 - 2 * u);
  const x = ORIGIN_X + (FOCUS_X - ORIGIN_X) * e;
  const A = amp(u);
  const spread = (s - 2.5) * 0.74;
  let y = spread * A;
  let z = ((s % 3) - 1) * A + Math.sin(s * 2.3 + 1) * 0.35 * A;
  y += Math.sin(u * 9 + seed * 6.2831 + s * 1.7) * 0.14 * A + l * 0.06 * (0.25 + A);
  z += Math.cos(u * 7 + seed * 6.2831 + s) * 0.16 * A + l * 0.08;
  if (s > 4.5) {
    const k = smooth(0.36, 0.5, u) * (1 - smooth(0.6, 0.74, u));
    y += k * 1.35;
    z -= k * 0.9;
  }
  return { x, y, z };
}

export const ANCHORS = {
  origin: { x: ORIGIN_X, y: 0, z: 0 } as V3,
  focus: { x: FOCUS_X, y: 0, z: 0 } as V3,
  /** x of the verification boundary (where u = 0.69). */
  boundaryX: streamPos(0, 0, 0.69, 0).x,
  /** Where the disagreeing stream is investigated. */
  investigate: streamPos(DISSENT, 0, 0.55, 0),
};

/** Story acts over scroll progress 0..1. `tone` is the stage background the copy is designed for. */
export const ACTS = [
  { id: "hero", from: -0.1, to: 0.1, tone: "paper" },
  { id: "question", from: 0.11, to: 0.25, tone: "paper" },
  { id: "distribution", from: 0.25, to: 0.37, tone: "paper" },
  { id: "responses", from: 0.37, to: 0.5, tone: "paper" },
  { id: "disagreement", from: 0.5, to: 0.63, tone: "paper" },
  { id: "verification", from: 0.63, to: 0.78, tone: "paper" },
  { id: "convergence", from: 0.82, to: 1.2, tone: "paper" },
] as const;
export type ActId = (typeof ACTS)[number]["id"];

export const actAt = (p: number): ActId => (ACTS.find((a) => p >= a.from && p < a.to) ?? ACTS[ACTS.length - 1]).id;

/** Visibility 0..1 of an act's copy at progress p (fades in after the stage tone has settled, out before it changes). */
export function actOn(id: ActId, p: number): number {
  const a = ACTS.find((x) => x.id === id)!;
  const last = id === "convergence";
  const inn = smooth(a.from + 0.015, a.from + 0.045, p);
  const out = last ? 1 : 1 - smooth(a.to - 0.045, a.to - 0.012, p);
  return id === "hero" ? out : inn * out;
}

/** Stage tone: always paper (0); the story stays light. One definition for callers and tests. */
export function toneAt(p: number): number {
  void p;
  return 0;
}

/** 1 at the top of the page (ambient hero view behind the prompt), 0 once the story begins. */
export const ambientAt = (p: number) => 1 - smooth(0.0, 0.1, p);

/** Progress -> state strengths (shared by the GPU uniforms and the static figure). */
export function fieldState(p: number) {
  return {
    reveal: (1 - ambientAt(p)) * Math.min(1, Math.max(0.32, (p - 0.03) / 0.74)) + ambientAt(p) * 0.9,
    verify: smooth(0.58, 0.68, p),
    investigate: smooth(0.44, 0.52, p) * (1 - smooth(0.62, 0.7, p)),
    converge: smooth(0.76, 0.92, p),
    dark: toneAt(p),
    ambient: ambientAt(p),
  };
}

/** Camera rail keyframes (progress, position, look-at). Eased linearly between keys. */
export type Key = { p: number; pos: [number, number, number]; look: [number, number, number] };
export const RAIL: Record<"desktop" | "mobile", Key[]> = {
  desktop: [
    { p: 0, pos: [-2.7, 1.3, 16], look: [-2.7, 1.3, 0] },
    { p: 0.14, pos: [-4.4, 0.5, 8.6], look: [-3.6, 0.1, 0] },
    { p: 0.3, pos: [-1.6, 1.0, 9.0], look: [-1.0, 0.2, 0] },
    { p: 0.46, pos: [0.4, 1.8, 8.0], look: [0.7, 0.7, 0] },
    { p: 0.62, pos: [1.6, 0.8, 8.0], look: [1.9, 0.1, 0] },
    { p: 0.8, pos: [2.6, 0.5, 7.6], look: [3.0, 0, 0] },
    { p: 1, pos: [2.9, 0.5, 7.4], look: [2.9, 0, 0] },
  ],
  mobile: [
    { p: 0, pos: [-2.8, 1.2, 24], look: [-2.8, 1.2, 0] },
    { p: 0.14, pos: [-2.4, 0.4, 14.5], look: [-1.6, 0, 0] },
    { p: 0.3, pos: [0.2, 0.8, 14.5], look: [0.9, 0.1, 0] },
    { p: 0.46, pos: [2.0, 1.2, 13.5], look: [2.2, 0.5, 0] },
    { p: 0.62, pos: [3.4, 0.6, 13.5], look: [3.5, 0.1, 0] },
    { p: 0.8, pos: [4.8, 0.4, 13], look: [5.2, 0, 0] },
    { p: 1, pos: [6.8, 0.3, 13], look: [7.2, 0, 0] },
  ],
};

const ease = (t: number) => t * t * (3 - 2 * t);
/** The ambient hero view: the whole field, calm and centred behind the prompt. */
const HERO: Record<"desktop" | "mobile", { pos: [number, number, number]; look: [number, number, number] }> = {
  desktop: { pos: [0.3, 0.2, 17.5], look: [0, 0.1, 0] },
  mobile: { pos: [0, 0, 27], look: [0, 0, 0] },
};

export function railAt(form: "desktop" | "mobile", p: number): { pos: [number, number, number]; look: [number, number, number] } {
  const base = railStory(form, p);
  const a = ambientAt(p);
  if (a <= 0) return base;
  const h = HERO[form];
  const mix = (m: [number, number, number], n: [number, number, number]) => [n[0] + (m[0] - n[0]) * a, n[1] + (m[1] - n[1]) * a, n[2] + (m[2] - n[2]) * a] as [number, number, number];
  return { pos: mix(h.pos, base.pos), look: mix(h.look, base.look) };
}

function railStory(form: "desktop" | "mobile", p: number): { pos: [number, number, number]; look: [number, number, number] } {
  const k = RAIL[form];
  const c = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < k.length - 2 && c > k[i + 1].p) i++;
  const a = k[i];
  const b = k[i + 1];
  const t = ease(Math.min(1, Math.max(0, (c - a.p) / (b.p - a.p))));
  const mix = (m: [number, number, number], n: [number, number, number]) => [m[0] + (n[0] - m[0]) * t, m[1] + (n[1] - m[1]) * t, m[2] + (n[2] - m[2]) * t] as [number, number, number];
  return { pos: mix(a.pos, b.pos), look: mix(a.look, b.look) };
}

/** Stream colours for a theme: greys only: glowy white on dark, ink on light. The dissenting line is the one mid-grey; "verified" and "attention" are
 *  white/ink tints too (no blue, no orange, no green, no purple anywhere). */
export function palette(theme: "light" | "dark") {
  const light = theme === "light";
  const ramp = light ? ["#17171a", "#2a2b30", "#3a3b41", "#55575d", "#6e7077"] : ["#ffffff", "#e9e9ec", "#d6d7db", "#c9cacf", "#b4b6bc"];
  const dissent = light ? "#9a9ca3" : "#8e9097";
  const verified = light ? "#17171a" : "#ffffff";
  const attention = light ? "#3a3b41" : "#d6d7db";
  const reasoning = light ? "#17171a" : "#e9e9ec";
  return { streams: [...ramp, dissent], verified, attention, disagree: dissent, reasoning, research: reasoning };
}

/** Sample the curves into SVG path strings for the static figure (viewBox 0 0 1200 600, x right, y down). */
export function svgPaths(upTo = 1, width = 1200, height = 600) {
  const sx = (x: number) => ((x - ORIGIN_X) / (FOCUS_X - ORIGIN_X)) * (width * 0.86) + width * 0.07;
  const sy = (y: number, z: number) => height * 0.5 - (y * 0.9 + z * 0.22) * (height / 6.2);
  const out: { stream: number; lane: number; d: string }[] = [];
  for (let s = 0; s < STREAMS; s++) {
    for (const lane of [-1, 0, 1]) {
      const pts: string[] = [];
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * upTo;
        const p = streamPos(s, lane, u, s * 0.17 + 0.3);
        pts.push(`${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y, p.z).toFixed(1)}`);
      }
      out.push({ stream: s, lane, d: pts.join(" ") });
    }
  }
  return { paths: out, origin: { x: sx(ORIGIN_X), y: sy(0, 0) }, focus: { x: sx(FOCUS_X), y: sy(0, 0) }, boundaryX: sx(ANCHORS.boundaryX), investigate: { x: sx(ANCHORS.investigate.x), y: sy(ANCHORS.investigate.y, ANCHORS.investigate.z) } };
}
