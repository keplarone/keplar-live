/**
 * Onboarding "boom": a different burst every time, layered onto the running field.
 *
 * The field is never touched by a boom: no re-seeding, no rebuilt buffers, no reset clock. A boom is a short-lived
 * IMPULSE that the vertex shader adds on top of wherever each point already is (ambient motion, a morph in flight,
 * the personalizing turn). Every effect starts at zero displacement, gets a velocity kick, overshoots and eases back to
 * zero along a damped response, so the point flows straight back into its ambient path. Several booms can overlap
 * (one slot each), so a fast second click never cuts the first one off.
 *
 * Pure TypeScript, no three.js: the director, the slots and the response curve are unit-tested; the shader mirrors
 * `BOOM_RESPONSE_GLSL` / `BOOM_LIFE` exactly.
 */

export const BOOM_VARIANTS = ["rings", "spiral", "radial", "vortex", "fracture", "ripple", "pulse", "turbulence"] as const;
export type BoomVariant = (typeof BOOM_VARIANTS)[number];

/** Palette slots a boom may tint toward (indices into the field palette: accent blue, pale blues, near white). */
export const BOOM_TINTS = [0, 1, 3, 4, 7] as const;

export const BOOM_SLOTS = 4;
/** A boom lives this many time-constants; its tail is faded to exactly zero over the last two. */
export const BOOM_LIFE = 7;
export const BOOM_FADE_FROM = 5;

export type BoomSpec = {
  variant: number; // index into BOOM_VARIANTS
  intensity: number; // 0.35..2.1
  rot: number; // radians, orients spirals, shards, ripples
  frac: number; // share of points that take the full effect (0.35..0.95)
  tau: number; // seconds: the time-constant (peak of the response)
  jitter: [number, number, number]; // world units added to the origin
  nudge: [number, number, number]; // camera impulse: yaw (rad), height, distance (spring velocity)
  tint: number; // palette index
};

/** The same curve as the shader's `bResp`: 0 at t=0, peak 1 at t=tau, then an exponential tail back to 0. */
export const boomResponse = (t: number, tau: number): number => {
  if (t <= 0) return 0;
  const x = t / tau;
  return x * Math.exp(1 - x);
};
/** The same fade as the shader's `bLife`: 1 until 5 tau, smoothly 0 by 7 tau (so nothing is ever cut off). */
export const boomLife = (t: number, tau: number): number => {
  const a = BOOM_FADE_FROM * tau;
  const b = BOOM_LIFE * tau;
  if (t <= a) return 1;
  if (t >= b) return 0;
  const u = (t - a) / (b - a);
  return 1 - u * u * (3 - 2 * u);
};
/** Total displacement envelope applied by the shader. */
export const boomEnvelope = (t: number, tau: number) => boomResponse(t, tau) * boomLife(t, tau);

/** GLSL for the same two functions (kept next to the TS so the test can compare them). */
export const BOOM_RESPONSE_GLSL = /* glsl */ `
float bResp(float t, float tau) { float x = max(t, 0.0) / tau; return x * exp(1.0 - x); }
float bLife(float t, float tau) { return 1.0 - smoothstep(${BOOM_FADE_FROM}.0 * tau, ${BOOM_LIFE}.0 * tau, t); }
`;

type Rng = () => number;

/**
 * Picks the next variant. A shuffled bag guarantees variety (every effect shows up before any repeats) and the
 * first draw of a new bag is never the variant just played, so the same effect never plays twice in a row.
 */
export class BoomDirector {
  private bag: number[] = [];
  private lastV = -1;
  constructor(private rng: Rng = Math.random, private count = BOOM_VARIANTS.length) {}

  private refill() {
    const a = Array.from({ length: this.count }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // never open a new bag with the variant that closed the last one
    if (a.length > 1 && a[a.length - 1] === this.lastV) {
      const k = Math.floor(this.rng() * (a.length - 1));
      [a[a.length - 1], a[k]] = [a[k], a[a.length - 1]];
    }
    this.bag = a; // pop() takes from the end
  }

  variant(): number {
    if (!this.bag.length) this.refill();
    const v = this.bag.pop() as number;
    this.lastV = v;
    return v;
  }

  /** A full random spec for a boom of nominal `strength` (the page passes 0.55..1). */
  next(strength = 1): BoomSpec {
    const r = this.rng;
    const between = (a: number, b: number) => a + (b - a) * r();
    const sign = () => (r() < 0.5 ? -1 : 1);
    return {
      variant: this.variant(),
      intensity: Math.max(0.35, Math.min(2.1, strength * between(0.7, 1.4))),
      rot: between(0, Math.PI * 2),
      frac: between(0.35, 0.95),
      tau: between(0.3, 0.56),
      jitter: [between(-1.4, 1.4), between(-1.1, 1.1), between(-0.8, 0.8)],
      nudge: [sign() * between(0.012, 0.045), between(-0.3, 0.3), between(-0.5, 0.35)],
      tint: BOOM_TINTS[Math.floor(r() * BOOM_TINTS.length) % BOOM_TINTS.length],
    };
  }
}

export type BoomSlot = { t: number; spec: BoomSpec; origin: [number, number, number] };

/**
 * The shader's boom slots. `fire` takes a free slot (or the one that is furthest through its life); the others are
 * left exactly as they were. `advance` only moves clocks forward, so nothing here can reset the field.
 */
export class BoomSlots {
  readonly slots: (BoomSlot | null)[] = Array.from({ length: BOOM_SLOTS }, () => null);
  /** Seconds a boom lasts for the current motion setting (reduced motion: a quick fade). */
  constructor(private calm = false) {}
  setCalm(c: boolean) { this.calm = c; }
  life(spec: BoomSpec) { return this.calm ? 0.9 : spec.tau * BOOM_LIFE; }

  fire(spec: BoomSpec, origin: [number, number, number]): number {
    let idx = this.slots.findIndex((s) => s === null);
    if (idx < 0) {
      let best = -1;
      this.slots.forEach((s, i) => {
        const age = s ? s.t / this.life(s.spec) : 1;
        if (age > best) { best = age; idx = i; }
      });
    }
    this.slots[idx] = { t: 0, spec, origin };
    return idx;
  }

  advance(dt: number) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      s.t += dt;
      if (s.t >= this.life(s.spec)) this.slots[i] = null;
    }
  }

  get active() { return this.slots.filter(Boolean).length; }

  /** Write the shader uniform arrays (length BOOM_SLOTS x 4 floats each). Inactive slots have t = -1. */
  write(bo: Float32Array, bp: Float32Array, bq: Float32Array) {
    this.slots.forEach((s, i) => {
      const o = i * 4;
      if (!s) { bo[o] = bo[o + 1] = bo[o + 2] = 0; bo[o + 3] = -1; return; }
      bo[o] = s.origin[0]; bo[o + 1] = s.origin[1]; bo[o + 2] = s.origin[2]; bo[o + 3] = s.t;
      bp[o] = s.spec.variant; bp[o + 1] = s.spec.intensity; bp[o + 2] = s.spec.rot; bp[o + 3] = s.spec.tau;
      bq[o] = s.spec.tint; bq[o + 1] = s.spec.frac; bq[o + 2] = 0; bq[o + 3] = 0;
    });
  }
}

/**
 * A damped spring for the camera nudge: an impulse changes its VELOCITY, never its position, so the camera glides out
 * and back (critically damped-ish) with no jump. State carries across booms.
 */
export class NudgeSpring {
  x = [0, 0, 0];
  v = [0, 0, 0];
  constructor(private k = 38, private c = 9.5) {}
  kick(n: [number, number, number], gain = 1) { for (let i = 0; i < 3; i++) this.v[i] += n[i] * gain * 5; }
  step(dt: number) {
    const h = Math.min(dt, 1 / 30);
    for (let i = 0; i < 3; i++) {
      this.v[i] += (-this.k * this.x[i] - this.c * this.v[i]) * h;
      this.x[i] += this.v[i] * h;
    }
  }
}
