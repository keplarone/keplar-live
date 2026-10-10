/**
 * Pure math for the "working hard" animation (src/components/loader/WorkingHard.tsx). No DOM, no three.js, so it is unit-tested.
 * The picture is driven by REAL progress only: `progress` (0..1, or undefined when the amount is unknown) and `pulses`
 * (a counter the caller increments on every real progress event: a stage finished, a model answered, a file written).
 * Nothing here fakes progress: with no progress the ring keeps breathing, it never creeps toward "done".
 */
export type WorkingInput = {
  /** 0..1 real progress, or undefined/NaN when unknown */
  progress?: number;
  /** seconds since mount */
  t: number;
  /** seconds since the last real progress event (Infinity before the first) */
  sincePulse: number;
  /** finished: the swarm settles into a calm ring and glows once */
  done?: boolean;
  /** error: the swarm slows and dims; colour stays neutral (status colour is the caller's job) */
  failed?: boolean;
};

export type WorkingState = {
  /** ring radius in scene units: the swarm tightens as work completes */
  radius: number;
  /** tube thickness (spread of the swarm around the ring) */
  spread: number;
  /** angular speed (rad/s) */
  spin: number;
  /** 0..1 brightness */
  glow: number;
  /** 0..1 energy of the last event (decays fast) */
  pulse: number;
  /** how far the points are pushed outward by the last event */
  burst: number;
};

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** One real event: a quick attack, a soft exponential tail (about 1.4 s). */
export function pulseEnvelope(since: number): number {
  if (!Number.isFinite(since) || since < 0) return 0;
  const attack = Math.min(1, since / 0.08);
  return attack * Math.exp(-since / 0.45);
}

export function workingState(i: WorkingInput): WorkingState {
  const known = i.progress !== undefined && Number.isFinite(i.progress);
  const p = known ? clamp01(i.progress as number) : 0;
  const pulse = pulseEnvelope(i.sincePulse);
  // unknown amount: a slow breath between two radii, never a creeping bar
  const breath = 0.5 + 0.5 * Math.sin(i.t * 1.4);
  const base = known ? 3.1 - 1.5 * p : 2.7 - 0.5 * breath;
  const done = !!i.done && !i.failed;
  const radius = done ? 1.55 : base - 0.18 * pulse;
  const spread = done ? 0.1 : (known ? 1.15 - 0.7 * p : 0.95) + 0.25 * pulse;
  const spin = i.failed ? 0.12 : done ? 0.35 : 0.5 + 1.4 * (known ? p : 0.35) + 1.1 * pulse;
  const glow = i.failed ? 0.28 : done ? 1 : Math.min(1, 0.45 + 0.35 * (known ? p : 0.4) + 0.3 * pulse);
  return { radius, spread, spin, glow, pulse, burst: 0.9 * pulse };
}

/** Deterministic pseudo-random in [0,1) from an integer (stable swarm, no Math.random in render paths). */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Initial swarm: points on a thick ring. Returns [angle, tubeA, tubeB, speedJitter] per point. */
export function swarmSeeds(count: number): Float32Array {
  const a = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    a[k * 4] = hash01(k + 1) * Math.PI * 2;
    const r = Math.sqrt(hash01(k * 3 + 7));
    const th = hash01(k * 5 + 11) * Math.PI * 2;
    a[k * 4 + 1] = Math.cos(th) * r;
    a[k * 4 + 2] = Math.sin(th) * r;
    a[k * 4 + 3] = 0.6 + 0.8 * hash01(k * 7 + 3);
  }
  return a;
}

export type WorkingEnv = { reducedMotion: boolean; saveData: boolean; lowMemory: boolean; cores: number; webgl: boolean };
/** "three" = animate with WebGL; "css" = the CSS loader (still shows progress and pulses via attributes). */
export function workingPath(e: WorkingEnv): "three" | "css" {
  if (!e.webgl || e.reducedMotion || e.saveData || e.lowMemory || e.cores < 2) return "css";
  return "three";
}

/** Point count for the device: small on phones, capped everywhere. */
export function workingPoints(width: number, dpr: number): number {
  const base = width < 520 ? 900 : 1800;
  return Math.round(base * (dpr > 2 ? 0.8 : 1));
}

/** Pixel ratio cap: never more than 1.75, lower for large canvases. */
export function workingDpr(devicePixelRatio: number, w: number, h: number): number {
  const cap = w * h > 600 * 400 ? 1.5 : 1.75;
  return Math.max(1, Math.min(cap, devicePixelRatio || 1));
}
