/**
 * Scene generators for the page-wide particle layer. Pure (no DOM, no three): each scene turns a point budget into
 * flat typed arrays that the shared engine uploads once. Every scene is made of the same thing, tiny sharp points, in
 * glowy white (dark) or ink (light); shape is the only thing that changes from page to page.
 *
 * Per point:  P = rest position (x y z)        C = (cx cy cz, w)  centre / wave params / travel origin, + order|brightness
 *             M = (kind, speed, size, group)   S = seed
 * Kinds: 0 hold (tiny drift) · 1 orbit about C in the screen plane · 2 flow along x with a sine wave (C = k, phase, amp)
 *        3 travel from C to P (a pulse/stream along an edge) · 4 assemble from scatter, in `order` (loops) · 6 breathe.
 * Groups pick the colour/behaviour in the shader: 0 accent · 1 pale · 2 deep · 3 muted amber (waiting) · 4 muted green
 *        (done) · 5 outbound (Ask: fan-out) · 6 inbound (Ask: converge) · 7 answer core (Ask).
 */
export type SceneId = "ask" | "create" | "projects" | "memory" | "agents" | "business" | "pricing" | "download" | "converge" | "calm" | "onb-welcome" | "onb-purpose" | "onb-prefs" | "onb-connect" | "onb-ready"
  | "helix" | "sheets" | "ribbons" | "globe" | "split" | "torus" | "rain" | "gate" | "echo" | "vault" | "spiral" | "tunnel";

export const SCENE_IDS: SceneId[] = ["ask", "create", "projects", "memory", "agents", "business", "pricing", "download", "converge", "calm", "onb-welcome", "onb-purpose", "onb-prefs", "onb-connect", "onb-ready", "helix", "sheets", "ribbons", "globe", "split", "torus", "rain", "gate", "echo", "vault", "spiral", "tunnel"];

/** Scene variations the page can ask for (onboarding: which of the seven "use" clusters the person picked, 0..6). */
export type SceneParams = { picks?: number[] };

export type SceneData = {
  n: number;
  P: Float32Array;
  C: Float32Array; // vec4
  M: Float32Array; // vec4
  S: Float32Array;
  /** Whole-scene tilt about X (radians) and sway amplitude about Y (radians). */
  tilt: number;
  sway: number;
  /** Camera pose for this scene: [sideways screen shift as a fraction of the width (wide screens), y offset, dolly (+ away / - closer), yaw radians]. Zeros = the fixed default camera. */
  cam: [number, number, number, number];
};

export type View = { hw: number; hh: number };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Opt = { kind?: number; speed?: number; size?: number; group?: number; bright?: number; order?: number; jitter?: number; taper?: boolean; c?: [number, number, number]; seed?: number };

class Builder {
  P: number[] = [];
  C: number[] = [];
  M: number[] = [];
  S: number[] = [];
  constructor(public r: () => number) {}
  get count() { return this.S.length; }
  add(x: number, y: number, z: number, o: Opt, along = 0.5, c?: [number, number, number, number?]) {
    const tp = o.taper ? 0.55 + 0.6 * Math.sqrt(Math.max(0, Math.sin(Math.PI * along))) : 1;
    const j = o.jitter ?? 0;
    this.P.push(x + (this.r() - 0.5) * j, y + (this.r() - 0.5) * j, z + (this.r() - 0.5) * j);
    const cc = c ?? [o.c?.[0] ?? 0, o.c?.[1] ?? 0, o.c?.[2] ?? 0];
    this.C.push(cc[0], cc[1], cc[2], cc[3] ?? (o.kind === 4 ? (o.order ?? 0) : (o.bright ?? 1)));
    this.M.push(o.kind ?? 0, o.speed ?? 0, (o.size ?? 1) * tp, o.group ?? 0);
    this.S.push(o.seed ?? this.r());
  }
}

type Shape = (b: Builder, n: number) => void;

function line(a: [number, number, number], d: [number, number, number], o: Opt): Shape {
  return (b, n) => {
    for (let i = 0; i < n; i++) {
      const t = b.r();
      b.add(a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t, a[2] + (d[2] - a[2]) * t, { ...o, order: o.order ?? 0 }, t, o.kind === 4 ? [0, 0, 0, o.order !== undefined ? o.order + t * 0.06 : 0] : undefined);
    }
  };
}

/** Points travelling along a→b (origin in C): streams, pulses. */
function stream(a: [number, number, number], d: [number, number, number], o: Opt): Shape {
  return (b, n) => {
    for (let i = 0; i < n; i++) {
      const t = b.r();
      b.add(d[0], d[1], d[2], { ...o, kind: 3, taper: false }, t, [a[0], a[1], a[2], o.bright ?? 1]);
    }
  };
}

function rect(x0: number, y0: number, x1: number, y1: number, z: number, o: Opt): Shape {
  return (b, n) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const per = 2 * (w + h);
    for (let i = 0; i < n; i++) {
      let s = b.r() * per;
      let x: number, y: number;
      if (s < w) { x = x0 + s; y = y0; }
      else if ((s -= w) < h) { x = x1; y = y0 + s; }
      else if ((s -= h) < w) { x = x1 - s; y = y1; }
      else { s -= w; x = x0; y = y1 - s; }
      b.add(x, y, z, { ...o, order: o.order !== undefined ? o.order + (1 - (y - y0) / Math.max(h, 1e-3)) * 0.05 : undefined }, 0.5);
    }
  };
}

function fill(x0: number, y0: number, x1: number, y1: number, z: number, o: Opt): Shape {
  return (b, n) => {
    for (let i = 0; i < n; i++) b.add(x0 + b.r() * (x1 - x0), y0 + b.r() * (y1 - y0), z, o, 0.5);
  };
}

function ring(cx: number, cy: number, cz: number, rad: number, o: Opt & { arc?: [number, number]; ry?: number; plane?: "xy" | "xz" }): Shape {
  return (b, n) => {
    const [a0, a1] = o.arc ?? [0, Math.PI * 2];
    for (let i = 0; i < n; i++) {
      const a = a0 + b.r() * (a1 - a0);
      const x = cx + Math.cos(a) * rad;
      if (o.plane === "xz") b.add(x, cy, cz + Math.sin(a) * rad, o, 0.5, o.kind === 1 ? [cx, cy, cz] : undefined);
      else b.add(x, cy + Math.sin(a) * rad * (o.ry ?? 1), cz, o, 0.5, o.kind === 1 ? [cx, cy, cz] : undefined);
    }
  };
}

function cluster(cx: number, cy: number, cz: number, rad: number, o: Opt): Shape {
  return (b, n) => {
    for (let i = 0; i < n; i++) {
      // denser toward the middle: a bright core with a sparse halo, all hard points
      const u = Math.pow(b.r(), 1.7) * rad;
      const th = b.r() * Math.PI * 2;
      const ph = Math.acos(2 * b.r() - 1);
      b.add(cx + u * Math.sin(ph) * Math.cos(th), cy + u * Math.sin(ph) * Math.sin(th), cz + u * Math.cos(ph), o, 0.5, o.kind === 6 ? [cx, cy, cz] : undefined);
    }
  };
}

function disc(cx: number, cy: number, cz: number, rad: number, o: Opt): Shape {
  return (b, n) => {
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(b.r()) * rad;
      const a = b.r() * Math.PI * 2;
      b.add(cx + Math.cos(a) * rr, cy, cz + Math.sin(a) * rr, o, 0.5);
    }
  };
}

function dust(v: View, o: Opt = {}): Shape {
  return (b, n) => {
    for (let i = 0; i < n; i++) b.add((b.r() * 2 - 1) * v.hw * 1.05, (b.r() * 2 - 1) * v.hh * 1.05, (b.r() - 0.5) * 7, { kind: 0, group: 1, size: 0.7 + b.r() * 0.5, bright: 0.25 + b.r() * 0.5, ...o }, 0.5);
  };
}

function weighted(b: Builder, total: number, parts: [number, Shape][]) {
  const sum = parts.reduce((a, p) => a + p[0], 0);
  let left = total;
  parts.forEach(([w, f], i) => {
    const n = i === parts.length - 1 ? left : Math.min(left, Math.round((total * w) / sum));
    left -= n;
    if (n > 0) f(b, n);
  });
}

function finish(b: Builder, n: number, tilt: number, sway: number, cam: SceneData["cam"] = [0, 0, 0, 0]): SceneData {
  // Shuffle so any prefix of the buffer is a fair sample of the whole scene: the density governor just draws fewer points.
  const N = b.count;
  const idx = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(b.r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const P = new Float32Array(n * 3);
  const C = new Float32Array(n * 4);
  const M = new Float32Array(n * 4);
  const S = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = idx[k % N];
    P.set(b.P.slice(i * 3, i * 3 + 3), k * 3);
    C.set(b.C.slice(i * 4, i * 4 + 4), k * 4);
    M.set(b.M.slice(i * 4, i * 4 + 4), k * 4);
    S[k] = b.S[i];
  }
  return { n, P, C, M, S, tilt, sway, cam };
}

/* ───────────────────────────── the scenes ───────────────────────────── */

type Gen = (b: Builder, n: number, v: View, W: number, H: number, prm: SceneParams) => { tilt: number; sway: number; cam?: SceneData["cam"] };

const GEN: Record<SceneId, Gen> = {
  /** Ask: the question fans out to the models, their answers converge on one point. */
  ask(b, n, v, W, H) {
    const src: [number, number, number] = [-0.8 * W, 0, 0];
    const ans: [number, number, number] = [0.78 * W, 0, 0];
    const models: [number, number, number][] = [];
    const K = 6;
    for (let i = 0; i < K; i++) {
      const a = ((i / (K - 1)) * 2 - 1) * 1.0;
      models.push([-0.02 * W + Math.cos(a) * 0.1 * W, Math.sin(a) * 0.78 * H, ((i % 2) - 0.5) * 0.8]);
    }
    const parts: [number, Shape][] = [
      [0.18, dust(v)],
      [0.05, cluster(src[0], src[1], 0, 0.22 * H, { group: 0, kind: 6, speed: 1.2, size: 1.1 })],
      [0.03, ring(src[0], src[1], 0, 0.34 * H, { group: 1, kind: 1, speed: 0.35, size: 0.9, bright: 0.7 })],
    ];
    models.forEach((m) => {
      parts.push([0.022, line(src, m, { group: 5, kind: 0, taper: true, size: 0.85, bright: 0.55 })]);
      parts.push([0.02, stream(src, m, { group: 5, speed: 0.22, size: 1.2 })]);
      parts.push([0.022, cluster(m[0], m[1], m[2], 0.2 * H, { group: 0, kind: 6, speed: 0.9, size: 1 })]);
      parts.push([0.022, line(m, ans, { group: 6, kind: 0, taper: true, size: 0.85, bright: 0.5 })]);
      parts.push([0.022, stream(m, ans, { group: 6, speed: 0.2, size: 1.2 })]);
    });
    parts.push([0.06, ring(ans[0], ans[1], 0, 0.16 * H, { group: 7, kind: 1, speed: -0.5, size: 1.1 })]);
    parts.push([0.05, ring(ans[0], ans[1], 0, 0.3 * H, { group: 7, kind: 1, speed: 0.3, size: 0.9, bright: 0.8 })]);
    parts.push([0.04, cluster(ans[0], ans[1], 0, 0.1 * H, { group: 7, kind: 6, speed: 1.4, size: 1.25 })]);
    weighted(b, n, parts);
    return { tilt: 0.04, sway: 0.1 };
  },

  /** Create: a website drawn in points, built top to bottom, then dissolved and built again. */
  create(b, n, v, W, H) {
    const fw = Math.min(0.62 * W, 1.45 * H * 1.15);
    const x0 = -fw * 0.62;
    const x1 = fw * 0.62;
    const y1 = 0.86 * H;
    const y0 = -0.86 * H;
    const o = (order: number, g = 0, extra: Opt = {}): Opt => ({ kind: 4, group: g, order, size: 1, ...extra });
    const lineH = (y: number, xa: number, xb: number, order: number, g = 0): [number, Shape] => [0.03 + (xb - xa) * 0.02, line([xa, y, 0], [xb, y, 0], o(order, g, { taper: true }))];
    const bw = x1 - x0;
    const cardTop = y0 + 0.62 * (y1 - y0) * 0.5;
    const parts: [number, Shape][] = [
      [0.14, dust(v)],
      [0.1, rect(x0, y0, x1, y1, 0, o(0.0))],
      [0.04, line([x0, y1 - 0.14 * H, 0], [x1, y1 - 0.14 * H, 0], o(0.06))],
      [0.015, ring(x0 + 0.05 * bw, y1 - 0.07 * H, 0, 0.022 * H, o(0.08, 4))],
      [0.015, ring(x0 + 0.09 * bw, y1 - 0.07 * H, 0, 0.022 * H, o(0.09, 3))],
      [0.015, ring(x0 + 0.13 * bw, y1 - 0.07 * H, 0, 0.022 * H, o(0.1, 0))],
      lineH(y1 - 0.07 * H, x1 - 0.45 * bw, x1 - 0.05 * bw, 0.12, 1),
      lineH(y1 - 0.3 * H, x0 + 0.08 * bw, x0 + 0.62 * bw, 0.22),
      lineH(y1 - 0.4 * H, x0 + 0.08 * bw, x0 + 0.5 * bw, 0.26),
      lineH(y1 - 0.5 * H, x0 + 0.08 * bw, x0 + 0.56 * bw, 0.3, 1),
      [0.05, rect(x0 + 0.08 * bw, y1 - 0.72 * H, x0 + 0.3 * bw, y1 - 0.6 * H, 0, o(0.34, 7))],
      [0.07, rect(x0 + 0.66 * bw, y1 - 0.74 * H, x1 - 0.06 * bw, y1 - 0.26 * H, 0, o(0.28))],
      [0.06, fill(x0 + 0.66 * bw, y1 - 0.74 * H, x1 - 0.06 * bw, y1 - 0.26 * H, 0, o(0.3, 2, { size: 0.8 }))],
    ];
    for (let i = 0; i < 3; i++) {
      const cx0 = x0 + (0.08 + i * 0.3) * bw;
      parts.push([0.05, rect(cx0, y0 + 0.08 * H, cx0 + 0.26 * bw, y0 + 0.6 * H, 0, o(0.48 + i * 0.06))]);
      parts.push([0.03, line([cx0 + 0.03 * bw, y0 + 0.48 * H, 0], [cx0 + 0.2 * bw, y0 + 0.48 * H, 0], o(0.52 + i * 0.06, 1, { taper: true }))]);
      parts.push([0.025, line([cx0 + 0.03 * bw, y0 + 0.38 * H, 0], [cx0 + 0.16 * bw, y0 + 0.38 * H, 0], o(0.54 + i * 0.06, 1, { taper: true }))]);
    }
    void cardTop;
    weighted(b, n, parts);
    return { tilt: 0.08, sway: 0.16 };
  },

  /** Projects: a timeline with artifacts hanging off it, newest brightest. */
  projects(b, n, v, W, H) {
    const ax = (t: number) => (-0.92 + 1.84 * t) * W;
    const ay = -0.05 * H;
    const parts: [number, Shape][] = [
      [0.16, dust(v)],
      [0.08, line([ax(0), ay, 0], [ax(1), ay, 0], { group: 2, kind: 0, size: 0.9, bright: 0.8, taper: true })],
      [0.06, { f: 0 } as unknown as Shape],
    ];
    parts.pop();
    // sparks travelling along the axis (time moves left to right)
    parts.push([0.06, (bb, nn) => { for (let i = 0; i < nn; i++) { const t = bb.r(); bb.add(ax(t), ay, 0, { kind: 3, group: 1, speed: 0.1, size: 1.1 }, t, [ax(0), ay, 0, 0.9]); } }]);
    const cards = 9;
    for (let i = 0; i < cards; i++) {
      const t = (i + 0.5) / cards;
      const up = i % 2 === 0;
      const cw = (0.07 + ((i * 37) % 5) * 0.012) * W;
      const ch = (0.22 + ((i * 53) % 4) * 0.07) * H;
      const gap = (0.16 + ((i * 29) % 3) * 0.06) * H;
      const cx = ax(t);
      const yTop = up ? ay + gap + ch : ay - gap;
      const yBot = up ? ay + gap : ay - gap - ch;
      const latest = i >= cards - 2;
      const g = latest ? 0 : 1;
      parts.push([0.05, rect(cx - cw / 2, yBot, cx + cw / 2, yTop, 0, { group: g, kind: 6, speed: 0.5, size: 1, bright: latest ? 1 : 0.75 })]);
      parts.push([0.03, line([cx - cw / 2 + cw * 0.14, (yTop + yBot) / 2 + ch * 0.18, 0], [cx + cw / 2 - cw * 0.14, (yTop + yBot) / 2 + ch * 0.18, 0], { group: 1, taper: true, size: 0.85, bright: 0.6 })]);
      parts.push([0.025, line([cx - cw / 2 + cw * 0.14, (yTop + yBot) / 2 - ch * 0.05, 0], [cx + cw * 0.1, (yTop + yBot) / 2 - ch * 0.05, 0], { group: 1, taper: true, size: 0.85, bright: 0.5 })]);
      parts.push([0.03, line([cx, ay, 0], [cx, up ? yBot : yTop, 0], { group: 2, size: 0.8, bright: 0.7, taper: true })]);
      parts.push([0.02, cluster(cx, ay, 0, 0.05 * H, { group: latest ? 0 : 1, kind: 6, speed: 1.1, size: 1.15 })]);
    }
    for (let k = 0; k <= 12; k++) parts.push([0.008, line([ax(k / 12), ay - 0.03 * H, 0], [ax(k / 12), ay + 0.03 * H, 0], { group: 2, size: 0.8, bright: 0.7 })]);
    weighted(b, n, parts);
    return { tilt: 0.06, sway: 0.08 };
  },

  /** Memory: a constellation, pulses travelling along its edges. */
  memory(b, n, v, W, H) {
    const r = b.r;
    const nodes: [number, number, number, number][] = [];
    let guard = 0;
    while (nodes.length < 26 && guard++ < 2000) {
      const x = (r() * 2 - 1) * 0.9 * W;
      const y = (r() * 2 - 1) * 0.82 * H;
      const z = (r() - 0.5) * 3.2;
      if ((x / (0.9 * W)) ** 2 + (y / (0.82 * H)) ** 2 > 1) continue;
      if (nodes.some((q) => Math.hypot(q[0] - x, (q[1] - y) * 1.4) < 0.17 * W)) continue;
      nodes.push([x, y, z, 0.05 + r() * 0.1]);
    }
    const parts: [number, Shape][] = [[0.14, dust(v)]];
    const seen = new Set<string>();
    nodes.forEach((p, i) => {
      const near = nodes.map((q, j) => ({ j, d: Math.hypot(q[0] - p[0], (q[1] - p[1]) * 1.4, q[2] - p[2]) })).filter((e) => e.j !== i).sort((a, c) => a.d - c.d).slice(0, 2 + (i % 2));
      for (const { j } of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const q = nodes[j];
        parts.push([0.016, line([p[0], p[1], p[2]], [q[0], q[1], q[2]], { group: 2, size: 0.8, bright: 0.65, taper: true })]);
        if ((i + j) % 3 !== 0) parts.push([0.01, stream([p[0], p[1], p[2]], [q[0], q[1], q[2]], { group: 1, speed: 0.12 + ((i * j) % 5) * 0.03, size: 1.1 })]);
      }
      const hub = i % 7 === 0;
      parts.push([hub ? 0.05 : 0.026, cluster(p[0], p[1], p[2], p[3] * (hub ? 2.1 : 1.3) * H * 0.9, { group: hub ? 0 : 1, kind: 6, speed: 0.7 + (i % 4) * 0.2, size: hub ? 1.2 : 1 })]);
    });
    weighted(b, n, parts);
    return { tilt: 0.1, sway: 0.5 };
  },

  /** Agents: nodes orbiting a core on tilted rings; approval pulses (amber waiting, green approved) travel out from the core. */
  agents(b, n, v, W, H) {
    const R = [0.3 * H, 0.54 * H, 0.8 * H];
    const parts: [number, Shape][] = [
      [0.12, dust(v)],
      [0.06, cluster(0, 0, 0, 0.12 * H, { group: 0, kind: 6, speed: 1.3, size: 1.2 })],
      [0.03, ring(0, 0, 0, 0.19 * H, { group: 7, kind: 1, speed: 0.6, size: 1 })],
    ];
    R.forEach((rad, ri) => {
      const rr = rad * (v.hw / v.hh > 1 ? 1 : 1);
      parts.push([0.07, ring(0, 0, 0, rr * 1.9, { group: 2, kind: 0, size: 0.8, bright: 0.55, ry: 0.5, plane: "xy" })]);
      const agents = 3 + ri * 2;
      for (let a = 0; a < agents; a++) {
        const ang = (a / agents) * Math.PI * 2 + ri;
        const cx = Math.cos(ang) * rr * 1.9;
        const cy = Math.sin(ang) * rr * 1.9 * 0.5;
        // an orbiting node: a small cluster that circles the core (kind 1 about the origin; the ellipse is the scene tilt)
        parts.push([0.012, (bb, nn) => { for (let i = 0; i < nn; i++) { const u = Math.pow(bb.r(), 1.6) * 0.075 * H; const th = bb.r() * 6.283; const ph = Math.acos(2 * bb.r() - 1); bb.add(cx + u * Math.sin(ph) * Math.cos(th), cy + u * Math.sin(ph) * Math.sin(th) * 0.6, u * Math.cos(ph) * 0.6, { kind: 1, speed: (ri % 2 ? -1 : 1) * (0.2 - ri * 0.04), group: a % 3 === 0 ? 3 : a % 3 === 1 ? 4 : 0, size: 1.1 }, 0.5, [0, 0, 0, 1]); } }]);
      }
      // approval pulse: a ring of points leaving the core together
      parts.push([0.05, (bb, nn) => { for (let i = 0; i < nn; i++) { const a = bb.r() * 6.283; bb.add(Math.cos(a) * rr * 1.9, Math.sin(a) * rr * 1.9 * 0.5, 0, { kind: 3, speed: 0.12, group: ri === 1 ? 3 : 4, size: 1.05, seed: ri * 0.31 + bb.r() * 0.012 }, 0.5, [0, 0, 0, 0.9]); } }]);
    });
    weighted(b, n, parts);
    return { tilt: 0.0, sway: 0.18 };
  },

  /** Business: data streams flowing through gates into a column chart. */
  business(b, n, v, W, H) {
    const parts: [number, Shape][] = [[0.1, dust(v)]];
    const lanes = 13;
    for (let l = 0; l < lanes; l++) {
      const y = ((l / (lanes - 1)) * 2 - 1) * 0.78 * H;
      const sp = 0.1 + ((l * 7) % 5) * 0.035;
      parts.push([0.05, (bb, nn) => {
        for (let i = 0; i < nn; i++) {
          const x = (bb.r() * 2 - 1) * 0.95 * W;
          bb.add(x, y, (bb.r() - 0.5) * 0.8, { kind: 2, speed: sp * W * 0.1, group: l % 4 === 0 ? 0 : l % 3 === 0 ? 1 : 2, size: 0.9 + bb.r() * 0.35, bright: 0.55 + bb.r() * 0.45 }, 0.5, [1.1 + (l % 3) * 0.35, l * 0.9, 0.26 * H * (0.4 + (l % 4) * 0.2), 0.55 + bb.r() * 0.45]);
        }
      }]);
    }
    for (const gx of [-0.35, 0.15, 0.62]) parts.push([0.035, line([gx * W, -0.86 * H, 0], [gx * W, 0.86 * H, 0], { group: 2, size: 0.8, bright: 0.6, taper: true })]);
    // the structure the streams feed: a staircase of towers that builds up left to right (each one assembles after the last)
    const cols = 8;
    const top = (k: number) => -0.8 * H + (0.18 + (k / (cols - 1)) * 0.95) * H * 0.9;
    for (let k = 0; k < cols; k++) {
      const cx = (0.46 + (k / cols) * 0.46) * W;
      parts.push([0.03, rect(cx, -0.8 * H, cx + 0.028 * W, top(k), 0, { kind: 4, order: 0.05 + k * 0.09, group: k === cols - 1 ? 0 : 1, size: 1 })]);
    }
    // a trend line climbing across the towers, ending in a bright node that keeps pulsing: the business growing
    parts.push([0.04, line([0.42 * W, top(0) - 0.05 * H, 0], [0.9 * W, top(cols - 1) + 0.08 * H, 0], { kind: 4, order: 0.7, group: 0, size: 1, bright: 0.9, taper: true })]);
    parts.push([0.02, cluster(0.92 * W, top(cols - 1) + 0.1 * H, 0, 0.05 * H, { group: 0, kind: 6, speed: 1, size: 1.25 })]);
    weighted(b, n, parts);
    return { tilt: 0.0, sway: 0.1 };
  },

  /** Pricing: tiered formations, one per plan, each taller and denser than the last. */
  pricing(b, n, v, W, H) {
    const plans = 4;
    const parts: [number, Shape][] = [[0.1, dust(v)]];
    for (let p = 0; p < plans; p++) {
      const cx = ((p + 0.5) / plans * 2 - 1) * 0.86 * W;
      const tiers = p + 1;
      const base = -0.55 * H;
      for (let t = 0; t < tiers; t++) {
        const rad = (0.2 + 0.035 * p) * H * (1 - t * 0.12);
        const y = base + t * 0.3 * H;
        parts.push([0.035 + 0.01 * p, disc(cx, y, 0, rad * 1.5, { kind: 0, group: t === tiers - 1 ? 0 : 1, size: 0.95, bright: 0.6 + 0.4 * (t / tiers) })]);
        parts.push([0.02 + 0.004 * p, ring(cx, y, 0, rad * 1.5, { plane: "xz", kind: 0, group: 0, size: 1.1 })]);
      }
      parts.push([0.02, line([cx, base, 0], [cx, base + (tiers - 1) * 0.3 * H + 0.12 * H, 0], { group: 2, size: 0.85, taper: true })]);
      parts.push([0.012 + 0.01 * p, cluster(cx, base + (tiers - 1) * 0.3 * H + 0.14 * H, 0, 0.06 * H + p * 0.015 * H, { group: 0, kind: 6, speed: 1, size: 1.2 })]);
    }
    weighted(b, n, parts);
    return { tilt: 0.55, sway: 0.28 };
  },

  /** Download: a package assembling, with a stream of points leaving it for the device. */
  download(b, n, v, W, H) {
    const bx = 0.36 * W;
    const s = 0.34 * H;
    const cube: [number, number, number][] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cube.push([bx + x * s, y * s, z * s]);
    const parts: [number, Shape][] = [[0.12, dust(v)]];
    const edge = (i: number, j: number, ord: number): [number, Shape] => [0.045, line(cube[i], cube[j], { kind: 4, order: ord, group: 0, size: 1.05, taper: true })];
    [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, c], k) => parts.push(edge(a, c, 0.05 + k * 0.06)));
    parts.push([0.05, (bb, nn) => { for (let i = 0; i < nn; i++) bb.add(bx + (bb.r() * 2 - 1) * s, (bb.r() * 2 - 1) * s, -s, { kind: 4, order: 0.7 + bb.r() * 0.2, group: 1, size: 0.8, bright: 0.7 }, 0.5); }]);
    // the device: a phone outline with a screen
    const dx = -0.5 * W;
    const dw = 0.11 * W;
    const dh = 0.42 * H;
    parts.push([0.07, rect(dx - dw, -dh, dx + dw, dh, 0, { kind: 4, order: 0.4, group: 0, size: 1 })]);
    parts.push([0.04, rect(dx - dw * 0.8, -dh * 0.82, dx + dw * 0.8, dh * 0.75, 0, { kind: 4, order: 0.5, group: 2, size: 0.85 })]);
    parts.push([0.03, ring(dx, -dh * 0.9, 0, 0.025 * H, { kind: 4, order: 0.55, group: 1 })]);
    parts.push([0.08, stream([bx - s, 0, 0], [dx + dw, 0, 0], { group: 0, speed: 0.16, size: 1.15 })]);
    parts.push([0.04, stream([bx - s, 0.1 * H, 0], [dx + dw, 0.12 * H, 0], { group: 1, speed: 0.12, size: 1 })]);
    parts.push([0.04, stream([bx - s, -0.1 * H, 0], [dx + dw, -0.12 * H, 0], { group: 1, speed: 0.14, size: 1 })]);
    weighted(b, n, parts);
    return { tilt: 0.14, sway: 0.5 };
  },

  /** Converge: lines of points leaving the left in a fan and gathering at one focus on the right (the Keplar idea, quietly). */
  converge(b, n, v, W, H) {
    const f: [number, number, number] = [0.62 * W, 0, 0];
    const parts: [number, Shape][] = [[0.14, dust(v)]];
    const K = 7;
    for (let k = 0; k < K; k++) {
      const y = ((k / (K - 1)) * 2 - 1) * 0.8 * H;
      parts.push([0.05, line([-0.92 * W, y, 0], f, { group: k % 3 === 0 ? 0 : 2, size: 0.9, bright: 0.6, taper: true })]);
      parts.push([0.035, stream([-0.92 * W, y, 0], f, { group: k % 2 ? 1 : 0, speed: 0.1 + (k % 3) * 0.03, size: 1.15 })]);
    }
    parts.push([0.07, cluster(f[0], 0, 0, 0.17 * H, { group: 0, kind: 6, speed: 1.1, size: 1.2 })]);
    parts.push([0.04, ring(f[0], 0, 0, 0.3 * H, { group: 1, kind: 1, speed: 0.3, size: 1 })]);
    weighted(b, n, parts);
    return { tilt: 0.06, sway: 0.12 };
  },


  /* ───── onboarding: dense swarms, richer than the calm field. Same sharp points, one blue accent, depth from tilt + camera. ───── */

  /** Welcome: a spiral swarm orbiting a bright core while streams fall in from every direction. */
  "onb-welcome"(b, n, v, W, H) {
    const Rg = Math.min(W * 0.92, H * 1.7);
    const arm = (k: number): Shape => (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const u = Math.pow(bb.r(), 0.72);
        const r = Rg * (0.06 + 0.94 * u);
        const th = (Math.floor(bb.r() * 3) * 2 * Math.PI) / 3 + u * 3.4 + (bb.r() - 0.5) * (0.5 - 0.3 * u) + k;
        bb.add(Math.cos(th) * r, Math.sin(th) * r, (bb.r() - 0.5) * 0.9 * (1.2 - u), { kind: 1, speed: 0.62 / Math.sqrt(r + 0.5), group: u < 0.35 ? 0 : bb.r() < 0.3 ? 1 : 2, size: 0.8 + bb.r() * 0.55, bright: 0.45 + 0.55 * (1 - u) }, 0.5, [0, 0, 0, 0.45 + 0.55 * (1 - u)]);
      }
    };
    const parts: [number, Shape][] = [
      [0.1, dust(v)],
      [0.5, arm(0)],
      [0.07, cluster(0, 0, 0, 0.1 * Rg, { group: 7, kind: 6, speed: 1.5, size: 1.25 })],
      [0.03, ring(0, 0, 0, 1.12 * Rg, { group: 2, kind: 1, speed: 0.1, size: 0.85, bright: 0.55, plane: "xy" })],
    ];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.3;
      const rr = Rg * (1.5 + (i % 3) * 0.25);
      parts.push([0.012, stream([Math.cos(a) * rr * 1.2, Math.sin(a) * rr * 0.8, (i % 2 ? 1 : -1) * 2.4], [0, 0, 0], { group: i % 4 === 0 ? 1 : 0, speed: 0.1 + (i % 5) * 0.03, size: 1.15 })]);
    }
    weighted(b, n, parts);
    return { tilt: 0.95, sway: 0.34, cam: [0.2, 0.3, 2.5, -0.22] };
  },

  /** Purpose: seven clusters (one per kind of use) around a core; the ones you chose burn brighter and draw streams in. */
  "onb-purpose"(b, n, v, W, H, prm) {
    const picks = new Set(prm.picks ?? []);
    const any = picks.size > 0;
    const parts: [number, Shape][] = [[0.08, dust(v)], [0.07, cluster(0, 0, 0, 0.13 * H, { group: 7, kind: 6, speed: 1.4, size: 1.2 })], [0.04, ring(0, 0, 0, 0.24 * H, { group: 7, kind: 1, speed: -0.5, size: 1 })]];
    const rx = Math.min(0.78 * W, 2.4 * H);
    const ry = 0.66 * H;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 7) * Math.PI * 2;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      const pz = (i % 2 ? 1 : -1) * 1.1;
      const on = picks.has(i);
      const g = on ? 0 : any ? 2 : i % 2 ? 1 : 0;
      const wgt = on ? 2.4 : 1;
      const rad = Math.min(0.2 * H, 0.1 * W + 0.04 * H) * (on ? 1.25 : 1);
      parts.push([0.06 * wgt, cluster(px, py, pz, rad, { group: g, kind: 6, speed: 0.8 + (i % 3) * 0.2, size: on ? 1.2 : 1, bright: on ? 1 : any ? 0.55 : 0.85 })]);
      parts.push([0.03 * wgt, ring(px, py, pz, rad * 1.7, { group: on ? 1 : 2, kind: 1, speed: (i % 2 ? -1 : 1) * (0.35 + (i % 3) * 0.12), size: 0.9, bright: on ? 0.95 : 0.6 })]);
      parts.push([0.02, line([px, py, pz], [0, 0, 0], { group: 2, size: 0.8, bright: on ? 0.8 : 0.4, taper: true })]);
      parts.push([on ? 0.05 : 0.012, stream([px, py, pz], [0, 0, 0], { group: on ? 6 : 1, speed: on ? 0.28 : 0.12, size: 1.2 })]);
    }
    weighted(b, n, parts);
    return { tilt: 0.28, sway: 0.5, cam: [0.2, 0, 0.5, 0.18] };
  },

  /** Preferences: your picks become orbits around the core (one orbit per pick), with slow waves running through. */
  "onb-prefs"(b, n, v, W, H, prm) {
    const k = Math.max(1, Math.min(7, prm.picks?.length ?? 3));
    const R = Math.min(W * 0.85, H * 1.55);
    const parts: [number, Shape][] = [[0.08, dust(v)], [0.07, cluster(0, 0, 0, 0.11 * R, { group: 7, kind: 6, speed: 1.3, size: 1.2 })]];
    for (let j = 0; j < k; j++) {
      const rad = R * (0.3 + (0.7 * (j + 1)) / k);
      const dir = j % 2 ? -1 : 1;
      parts.push([0.05, ring(0, 0, 0, rad, { group: j % 3 === 0 ? 0 : 1, kind: 1, speed: dir * (0.5 / Math.sqrt(rad)), size: 0.9, bright: 0.7 })]);
      const ang = j * 2.4;
      parts.push([0.03, (bb, nn) => {
        for (let i = 0; i < nn; i++) {
          const u = Math.pow(bb.r(), 1.6) * 0.16 * R;
          const th = bb.r() * 6.283;
          const ph = Math.acos(2 * bb.r() - 1);
          bb.add(Math.cos(ang) * rad + u * Math.sin(ph) * Math.cos(th), Math.sin(ang) * rad + u * Math.sin(ph) * Math.sin(th), u * Math.cos(ph), { kind: 1, speed: dir * (0.5 / Math.sqrt(rad)), group: 0, size: 1.15, bright: 1 }, 0.5, [0, 0, 0, 1]);
        }
      }]);
    }
    for (let l = 0; l < 7; l++) {
      const y = ((l / 6) * 2 - 1) * 0.85 * H;
      parts.push([0.03, (bb, nn) => {
        for (let i = 0; i < nn; i++) bb.add((bb.r() * 2 - 1) * 0.95 * W, y, -1.5 - bb.r() * 2, { kind: 2, speed: (0.35 + (l % 3) * 0.12) * W * 0.1, group: 2, size: 0.8 + bb.r() * 0.3, bright: 0.35 + bb.r() * 0.4 }, 0.5, [0.9 + (l % 3) * 0.3, l * 1.1, 0.28 * H, 0.4 + bb.r() * 0.4]);
      }]);
    }
    weighted(b, n, parts);
    return { tilt: 0.7, sway: 0.3, cam: [0.2, -0.3, -0.5, 0.26] };
  },

  /** Connect: a hub with satellites at different depths, data travelling both ways along every edge. */
  "onb-connect"(b, n, v, W, H) {
    const parts: [number, Shape][] = [[0.08, dust(v)], [0.08, cluster(0, 0, 0, 0.14 * H, { group: 7, kind: 6, speed: 1.4, size: 1.25 })], [0.04, ring(0, 0, 0, 0.28 * H, { group: 1, kind: 1, speed: 0.45, size: 1 })]];
    const K = 6;
    const rx = Math.min(0.7 * W, 2.1 * H);
    for (let i = 0; i < K; i++) {
      const a = (i / K) * Math.PI * 2 + 0.4;
      const p: [number, number, number] = [Math.cos(a) * rx, Math.sin(a) * 0.7 * H, Math.sin(a * 2.0) * 2.2];
      parts.push([0.05, cluster(p[0], p[1], p[2], 0.11 * H, { group: i % 3 === 0 ? 0 : 1, kind: 6, speed: 0.9, size: 1.05 })]);
      parts.push([0.025, ring(p[0], p[1], p[2], 0.2 * H, { group: 2, kind: 1, speed: (i % 2 ? -1 : 1) * 0.4, size: 0.9, bright: 0.7 })]);
      parts.push([0.03, line([0, 0, 0], p, { group: 2, size: 0.8, bright: 0.55, taper: true })]);
      parts.push([0.03, stream([0, 0, 0], p, { group: 5, speed: 0.2, size: 1.15 })]);
      parts.push([0.03, stream(p, [0, 0, 0], { group: 6, speed: 0.16, size: 1.15 })]);
    }
    weighted(b, n, parts);
    return { tilt: 0.4, sway: 0.42, cam: [0.2, 0.2, 1, -0.3] };
  },

  /** Ready: everything pulled into one tight core, shells turning around it, a beam leaving toward the app. */
  "onb-ready"(b, n, v, W, H) {
    const R = Math.min(W * 0.8, H * 1.5);
    const parts: [number, Shape][] = [[0.06, dust(v)], [0.1, cluster(0, 0, 0, 0.09 * R, { group: 7, kind: 6, speed: 1.6, size: 1.3 })]];
    [0.3, 0.52, 0.78, 1].forEach((f, i) => {
      parts.push([0.07, ring(0, 0, 0, R * f, { group: i % 2 ? 1 : 0, kind: 1, speed: (i % 2 ? -1 : 1) * (0.7 / Math.sqrt(R * f + 0.4)), size: 0.95, bright: 0.9 - i * 0.1, plane: "xz" })]);
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = R * (1.4 + (i % 4) * 0.2);
      parts.push([0.009, stream([Math.cos(a) * rr * 1.3, Math.sin(a) * rr * 0.7, ((i % 3) - 1) * 2], [0, 0, 0], { group: 0, speed: 0.22 + (i % 4) * 0.05, size: 1.15 })]);
    }
    parts.push([0.07, stream([0, 0, 0], [W * 1.15, 0.05 * H, 0], { group: 1, speed: 0.34, size: 1.2 })]);
    weighted(b, n, parts);
    return { tilt: 0.5, sway: 0.5, cam: [0.2, 0, -5, 0.1] };
  },

  /* ───── marketing families: one distinct formation each (see profile.ts for which pages use which) ───── */

  /** About: a slow double helix with rungs. Two strands wind along the page; the camera orbits it as you scroll. */
  helix(b, n, v, W, H) {
    const turns = 3.2;
    const R = H * 0.42;
    const strand = (off: number, grp: number): Shape => (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const t = bb.r();
        const a = t * turns * Math.PI * 2 + off;
        bb.add((t * 2 - 1) * W * 0.95, Math.cos(a) * R, Math.sin(a) * R * 1.6, { kind: 6, speed: 0.6, group: grp, size: 1 + bb.r() * 0.25, bright: 0.75 + bb.r() * 0.25 }, 0.5, [(t * 2 - 1) * W * 0.95, Math.cos(a) * R, Math.sin(a) * R * 1.6, 0.85]);
      }
    };
    const rungs: Shape = (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const k = Math.floor(bb.r() * 26);
        const t = (k + 0.5) / 26;
        const a = t * turns * Math.PI * 2;
        const u = bb.r() * 2 - 1;
        bb.add((t * 2 - 1) * W * 0.95, Math.cos(a) * R * u, Math.sin(a) * R * 1.6 * u, { kind: 0, group: 2, size: 0.75, bright: 0.45 }, 0.5);
      }
    };
    weighted(b, n, [[0.06, dust(v, { bright: 0.2 })], [0.36, strand(0, 1)], [0.36, strand(Math.PI, 0)], [0.22, rungs]]);
    return { tilt: 0.35, sway: 0.5, cam: [0, 0, 0, 0] };
  },

  /** Docs: stacked pages with ruled text lines, a bright scan line travelling down the front sheet. */
  sheets(b, n, v, W, H) {
    const parts: [number, Shape][] = [[0.05, dust(v, { bright: 0.2 })]];
    const sw = Math.min(W * 0.34, H * 0.9);
    for (let k = 0; k < 6; k++) {
      const z = -3.2 + k * 0.9;
      const x0 = -sw + k * 0.12 * sw;
      const front = k === 5;
      parts.push([front ? 0.08 : 0.04, rect(x0, -H * 0.8, x0 + sw * 1.6, H * 0.8, z, { kind: 0, group: front ? 0 : 2, size: 0.85, bright: front ? 0.9 : 0.4 })]);
      parts.push([front ? 0.12 : 0.07, (bb, nn) => {
        for (let i = 0; i < nn; i++) {
          const row = Math.floor(bb.r() * 14);
          const len = (0.45 + ((row * 7) % 5) * 0.11) * sw * 1.4;
          bb.add(x0 + sw * 0.1 + bb.r() * len, H * 0.62 - row * H * 0.1, z, { kind: 0, group: front ? 1 : 2, size: 0.75, bright: front ? 0.8 : 0.35 }, 0.5);
        }
      }]);
    }
    parts.push([0.08, stream([-sw * 0.9, H * 0.7, -0.5], [-sw * 0.9, -H * 0.7, -0.5], { group: 1, speed: 0.12, size: 1.15 })]);
    weighted(b, n, parts);
    return { tilt: 0.45, sway: 0.28, cam: [0, 0, 0, 0] };
  },

  /** Blog: layered ribbons drifting across the page like long sentences. */
  ribbons(b, n, v, W, H) {
    const parts: [number, Shape][] = [[0.05, dust(v, { bright: 0.2 })]];
    for (let l = 0; l < 9; l++) {
      const y = ((l / 8) * 2 - 1) * 0.75 * H;
      parts.push([0.1, (bb, nn) => {
        for (let i = 0; i < nn; i++) bb.add((bb.r() * 2 - 1) * 1.05 * W, y, -2.5 + (l % 3) * 1.2 + bb.r() * 0.3, { kind: 2, speed: (0.3 + (l % 4) * 0.1) * W * 0.1, group: l % 3 === 0 ? 0 : 1, size: 0.8 + bb.r() * 0.4, bright: 0.45 + bb.r() * 0.5 }, 0.5, [0.7 + (l % 4) * 0.25, l * 0.9, 0.22 * H + (l % 3) * 0.06 * H, 0.5 + bb.r() * 0.4]);
      }]);
    }
    weighted(b, n, parts);
    return { tilt: 0.6, sway: 0.3, cam: [0, 0, 0, 0] };
  },

  /** Models: a globe of dots with latitude rings and a few bright nodes, turning slowly. */
  globe(b, n, v, W, H) {
    const R = Math.min(W * 0.55, H * 1.0);
    const shell: Shape = (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const y = 1 - 2 * ((i + 0.5) / nn);
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * 2.399963;
        bb.add(Math.cos(a) * rr * R, y * R, Math.sin(a) * rr * R, { kind: 0, group: 1, size: 0.85 + bb.r() * 0.3, bright: 0.4 + bb.r() * 0.4 }, 0.5);
      }
    };
    const parts: [number, Shape][] = [[0.04, dust(v, { bright: 0.2 })], [0.5, shell]];
    for (const f of [-0.6, -0.25, 0.1, 0.45, 0.78]) {
      const rr = Math.sqrt(1 - f * f);
      parts.push([0.05, ring(0, f * R, 0, rr * R, { kind: 0, group: 2, size: 0.8, bright: 0.55, plane: "xz" })]);
    }
    for (let k = 0; k < 14; k++) {
      const y = 1 - 2 * ((k + 0.5) / 14);
      const rr = Math.sqrt(1 - y * y);
      const a = k * 2.399963 * 3;
      parts.push([0.012, cluster(Math.cos(a) * rr * R, y * R, Math.sin(a) * rr * R, 0.08 * R, { kind: 6, group: 0, speed: 1, size: 1.15 })]);
    }
    weighted(b, n, parts);
    return { tilt: 0.3, sway: 0.9, cam: [0, 0, 0, 0] };
  },

  /** Compare / versus: two mirrored clouds, a fault line between them, streams crossing it both ways. */
  split(b, n, v, W, H) {
    const cx = W * 0.5;
    const parts: [number, Shape][] = [
      [0.04, dust(v, { bright: 0.2 })],
      [0.22, cluster(-cx, 0, 0, 0.55 * H, { kind: 6, group: 0, speed: 0.8, size: 1.1 })],
      [0.22, cluster(cx, 0, 0, 0.55 * H, { kind: 6, group: 2, speed: 0.8, size: 1.1 })],
      [0.12, line([0, -H * 0.95, 0], [0, H * 0.95, 0], { group: 1, size: 0.85, bright: 0.6, taper: true })],
      [0.1, stream([-cx, 0, 0], [cx, 0, 0], { group: 5, speed: 0.18, size: 1.15 })],
      [0.1, stream([cx, 0, 0], [-cx, 0, 0], { group: 6, speed: 0.15, size: 1.15 })],
      [0.08, ring(-cx, 0, 0, 0.8 * H, { kind: 1, group: 1, speed: 0.3, size: 0.9, bright: 0.6 })],
      [0.08, ring(cx, 0, 0, 0.8 * H, { kind: 1, group: 1, speed: -0.3, size: 0.9, bright: 0.6 })],
    ];
    weighted(b, n, parts);
    return { tilt: 0.2, sway: 0.25, cam: [0, 0, 0, 0] };
  },

  /** Superintelligence: a torus that breathes, with one huge slow ring around it. */
  torus(b, n, v, W, H) {
    const R = Math.min(W * 0.4, H * 0.9);
    const r = R * 0.38;
    const body: Shape = (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const u = bb.r() * Math.PI * 2;
        const w = bb.r() * Math.PI * 2;
        const x = (R + r * Math.cos(w)) * Math.cos(u);
        const y = r * Math.sin(w) * 1.15;
        const z = (R + r * Math.cos(w)) * Math.sin(u);
        bb.add(x, y, z, { kind: 6, speed: 0.7, group: bb.r() < 0.2 ? 0 : 1, size: 0.9 + bb.r() * 0.3, bright: 0.45 + bb.r() * 0.5 }, 0.5, [x, y, z, 0.8]);
      }
    };
    weighted(b, n, [[0.05, dust(v, { bright: 0.2 })], [0.7, body], [0.15, ring(0, 0, 0, R * 1.9, { kind: 1, group: 2, speed: 0.12, size: 0.9, bright: 0.55, plane: "xz" })], [0.1, cluster(0, 0, 0, 0.18 * R, { kind: 6, group: 7, speed: 1.2, size: 1.2 })]]);
    return { tilt: 0.6, sway: 0.35, cam: [0, 0, 0, 0] };
  },

  /** Glossary / prompts: columns of points falling like a slow rain of words. */
  rain(b, n, v, W, H) {
    const parts: [number, Shape][] = [[0.04, dust(v, { bright: 0.2 })]];
    const cols = 16;
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols * 2 - 1) * W;
      const top = H * (0.9 + (c % 3) * 0.1);
      parts.push([0.06, stream([x, top, -1 - (c % 4) * 0.5], [x, -top, -1 - (c % 4) * 0.5], { group: c % 4 === 0 ? 0 : 1, speed: 0.07 + (c % 5) * 0.025, size: 0.95 + (c % 3) * 0.12 })]);
    }
    weighted(b, n, parts);
    return { tilt: 0.1, sway: 0.15, cam: [0, 0, 0, 0] };
  },

  /** Sign in / checkout: a portal. Concentric rings face you, a stream passes through the middle. */
  gate(b, n, v, W, H) {
    const R = Math.min(W * 0.5, H * 1.05);
    const parts: [number, Shape][] = [[0.05, dust(v, { bright: 0.2 })]];
    [0.35, 0.55, 0.78, 1].forEach((f, i) => parts.push([0.1, ring(0, 0, -i * 0.4, R * f, { kind: 1, group: i % 2 ? 1 : 0, speed: (i % 2 ? -1 : 1) * 0.18, size: 0.9, bright: 0.85 - i * 0.12 })]));
    parts.push([0.2, stream([0, 0, -9], [0, 0, 3], { group: 1, speed: 0.35, size: 1.15 })]);
    parts.push([0.08, cluster(0, 0, 0, 0.1 * R, { kind: 6, group: 7, speed: 1.2, size: 1.2 })]);
    weighted(b, n, parts);
    return { tilt: 0.12, sway: 0.2, cam: [0, 0, 0, 0] };
  },

  /** Feedback / inquiries: pulses spreading outward from a point, like a message being heard. */
  echo(b, n, v, W, H) {
    const R = Math.min(W * 0.9, H * 1.7);
    const parts: [number, Shape][] = [[0.04, dust(v, { bright: 0.2 })], [0.08, cluster(0, 0, 0, 0.07 * R, { kind: 6, group: 7, speed: 1.4, size: 1.25 })]];
    for (let k = 1; k <= 7; k++) parts.push([0.1, ring(0, 0, -k * 0.15, R * (k / 7), { kind: 1, group: k % 3 === 0 ? 0 : 1, speed: (k % 2 ? 1 : -1) * 0.08, size: 0.85, bright: 0.95 - k * 0.1, ry: 0.62 })]);
    weighted(b, n, parts);
    return { tilt: 0.55, sway: 0.2, cam: [0, 0, 0, 0] };
  },

  /** Privacy / terms: nested cubes in outline: a vault. */
  vault(b, n, v, W, H) {
    const edges = (s: number, grp: number, br: number): Shape => (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const axis = Math.floor(bb.r() * 3);
        const t = (bb.r() * 2 - 1) * s;
        const a = (bb.r() < 0.5 ? -1 : 1) * s;
        const c = (bb.r() < 0.5 ? -1 : 1) * s;
        const p: [number, number, number] = axis === 0 ? [t, a, c] : axis === 1 ? [a, t, c] : [a, c, t];
        bb.add(p[0], p[1], p[2], { kind: 0, group: grp, size: 0.9, bright: br }, 0.5);
      }
    };
    const R = Math.min(W * 0.32, H * 0.78);
    weighted(b, n, [[0.04, dust(v, { bright: 0.2 })], [0.4, edges(R, 1, 0.8)], [0.28, edges(R * 0.62, 0, 0.9)], [0.18, edges(R * 0.3, 2, 0.7)], [0.1, cluster(0, 0, 0, 0.1 * R, { kind: 6, group: 7, speed: 1.3, size: 1.2 })]]);
    return { tilt: 0.5, sway: 0.7, cam: [0, 0, 0, 0] };
  },

  /** Use cases / for you: a spiral galaxy, arms orbiting a bright core. */
  spiral(b, n, v, W, H) {
    const R = Math.min(W * 0.75, H * 1.5);
    const arm: Shape = (bb, nn) => {
      for (let i = 0; i < nn; i++) {
        const t = Math.pow(bb.r(), 0.8);
        const k = Math.floor(bb.r() * 3);
        const a = t * 5.2 + (k * Math.PI * 2) / 3 + (bb.r() - 0.5) * 0.35;
        const rr = (0.08 + t * 0.92) * R;
        bb.add(Math.cos(a) * rr, Math.sin(a) * rr * 0.55, (bb.r() - 0.5) * 0.8, { kind: 1, speed: 0.55 / Math.sqrt(rr + 0.5), group: t < 0.3 ? 0 : 1, size: 0.85 + (1 - t) * 0.4, bright: 0.45 + (1 - t) * 0.5 }, 0.5, [0, 0, 0, 0.9]);
      }
    };
    weighted(b, n, [[0.04, dust(v, { bright: 0.2 })], [0.8, arm], [0.1, cluster(0, 0, 0, 0.1 * R, { kind: 6, group: 7, speed: 1.3, size: 1.25 })]]);
    return { tilt: 0.8, sway: 0.15, cam: [0, 0, 0, 0] };
  },

  /** For developers: a tunnel of square frames receding into depth, data racing down the middle. */
  tunnel(b, n, v, W, H) {
    const parts: [number, Shape][] = [[0.04, dust(v, { bright: 0.2 })]];
    const S = Math.min(W * 0.45, H * 0.95);
    for (let k = 0; k < 9; k++) {
      const z = -k * 1.5;
      const s = S * (1 - k * 0.07);
      parts.push([0.07, rect(-s, -s * 0.7, s, s * 0.7, z, { kind: 0, group: k % 3 === 0 ? 0 : 1, size: 0.85, bright: 0.9 - k * 0.08 })]);
    }
    parts.push([0.2, stream([0, 0, -13], [0, 0, 2], { group: 1, speed: 0.4, size: 1.15 })]);
    parts.push([0.08, stream([S * 0.4, S * 0.3, -13], [S * 0.4, S * 0.3, 2], { group: 0, speed: 0.3, size: 1 })]);
    parts.push([0.08, stream([-S * 0.4, -S * 0.3, -13], [-S * 0.4, -S * 0.3, 2], { group: 0, speed: 0.27, size: 1 })]);
    weighted(b, n, parts);
    return { tilt: 0.1, sway: 0.25, cam: [0, 0, 0, 0] };
  },

  /** Calm: a faint breathing lattice and slow dust. Settings, admin, sign-in, legal. */
  calm(b, n, v, W, H) {
    const parts: [number, Shape][] = [
      [0.55, dust(v, { bright: 0.2 })],
      [0.45, (bb, nn) => {
        const cols = 22;
        const rows = 11;
        for (let i = 0; i < nn; i++) {
          const gx = Math.floor(bb.r() * cols);
          const gy = Math.floor(bb.r() * rows);
          bb.add((gx / (cols - 1) * 2 - 1) * W, (gy / (rows - 1) * 2 - 1) * H * 0.9, -1.5, { kind: 6, speed: 0.4, group: 2, size: 0.9, bright: 0.5 }, 0.5, [(gx / (cols - 1) * 2 - 1) * W, (gy / (rows - 1) * 2 - 1) * H * 0.9, -1.5, 0.5]);
        }
      }],
    ];
    weighted(b, n, parts);
    return { tilt: 0.25, sway: 0.06 };
  },
};

/** View → design box: wide screens use the space, portrait keeps shapes legible instead of squashing them. */
export function buildScene(id: SceneId, n: number, v: View, seed = 7, prm: SceneParams = {}): SceneData {
  const b = new Builder(rng(seed * 2654435761 + SCENE_IDS.indexOf(id) * 97));
  const portrait = v.hw < v.hh;
  const W = portrait ? v.hw * 0.95 : Math.min(v.hw * 0.92, v.hh * 2.1);
  const H = v.hh * (portrait ? 0.8 : 0.82);
  const { tilt, sway, cam } = GEN[id](b, n, v, W, H, prm);
  return finish(b, n, tilt, sway, cam);
}

/**
 * Scroll-driven camera: how far the camera moves when the person scrolls the whole page top to bottom. [yaw radians, rise,
 * dolly (+ away / - closer)]. Every scene moves differently (a helix is orbited, a tunnel is flown into, a globe is pushed
 * in on), so scrolling feels like travelling through THIS page's scene rather than one shared effect. Pure; the engine eases to it.
 */
export const SCROLL_MOTION: Record<SceneId, [number, number, number]> = {
  ask: [0.18, 0, -0.6], create: [0.3, 0.2, -1], projects: [0.2, -0.3, 0.6], memory: [0.5, 0, -0.8], agents: [-0.4, 0.2, -0.6], business: [0.25, 0.3, 0.8],
  pricing: [0, 0.5, -1.2], download: [-0.3, 0, -1.6], converge: [0.12, 0, -2.2], calm: [0.05, 0, 0],
  "onb-welcome": [0, 0, 0], "onb-purpose": [0, 0, 0], "onb-prefs": [0, 0, 0], "onb-connect": [0, 0, 0], "onb-ready": [0, 0, 0],
  helix: [1.2, 0, -0.8], sheets: [0.1, -0.6, -1.4], ribbons: [0.15, 0.7, 0.4], globe: [0.9, 0, -2.4], split: [0, 0, -1.8], torus: [-0.7, 0.4, -1.2],
  rain: [0, -0.8, 0], gate: [0, 0, -3.4], echo: [0.25, 0.3, -1.5], vault: [0.8, 0, -1.8], spiral: [0.2, 0.5, 1.4], tunnel: [0, 0, -4.5],
};
