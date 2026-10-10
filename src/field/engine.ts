import {
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { adaptDensity, adaptDpr, startDpr, type Quality } from "@/lib/spatial/policy";
import { softwareRenderer } from "./caps";
import { ANCHORS, FOCUS_X, ORIGIN_X, STREAMS, fieldState, palette, railAt, type V3 } from "./path";
import { CORE_FRAG, CORE_VERT, DUST_FRAG, DUST_VERT, LATTICE_FRAG, LATTICE_VERT, MOTE_FRAG, MOTE_VERT, ORBIT_FRAG, ORBIT_VERT, STRAND_FRAG, STRAND_VERT } from "./glsl";

export type FieldOptions = {
  canvas: HTMLCanvasElement;
  quality: Exclude<Quality, "off" | "static">;
  form: "desktop" | "mobile";
  theme: "light" | "dark";
  /** Called with projected screen anchors (px, relative to the canvas) when they change. */
  onAnchors?: (a: { ox: number; oy: number; fx: number; fy: number; bx: number; by: number; ix: number; iy: number }) => void;
  onFirstFrame?: () => void;
  /** Cap the render rate (admin and other quiet surfaces). */
  fpsCap?: number;
  /** Fraction of the tier's particles to start with (0.3..1); the governor still adapts from there. */
  density?: number;
  /** Flow speed multiplier (1 = the home hero). */
  speed?: number;
  /** Draw one finished frame and stop (reduced motion / weak devices). Nothing animates. */
  still?: boolean;
  /** Reported once a second: fps, pixel ratio, particle count. */
  onStats?: (s: { fps: number; dpr: number; count: number }) => void;
  /** The GPU context was lost and did not return within 2.5 s: rebuild the field. */
  onLost?: () => void;
};

/** Particle budget per tier. `strand` = points per lane along each stream (the lines are built from these). */
const BUDGET = {
  low: { dust: 3600, orbit: 1000, motes: 1500, lanes: 2, strand: 420 },
  medium: { dust: 9000, orbit: 2600, motes: 4200, lanes: 3, strand: 800 },
  high: { dust: 18000, orbit: 4800, motes: 9000, lanes: 3, strand: 1400 },
} as const;

const rnd = (() => {
  let s = 1234567;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
})();

export class ConvergenceField {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1, 0.1, 80);
  private raf = 0;
  private visible = true;
  private disposed = false;
  private target = 0;
  private current = 0;
  private t0 = performance.now();
  private last = performance.now();
  private lostT = 0;
  private smoothMs = 16;
  private dpr: number;
  private cap: number;
  private first = true;
  private locked = false;
  private pointer = new Vector3(0, 0, 0);
  private pointerOn = 0;
  private pointerTarget = { x: 0, y: 0, on: 0 };
  private mats: ShaderMaterial[] = [];
  private geos: BufferGeometry[] = [];
  private uni: Record<string, { value: unknown }>;
  private lastAnchors = "";
  private dk = 0;
  private density = 1;
  private counts: { geo: BufferGeometry; n: number }[] = [];
  private frames = 0;
  private fpsT = performance.now();
  private buildT0 = -1;
  private energy = 0;
  private energyTarget = 0;
  private askP: number | null = null;
  private lastRender = 0;
  fps = 0;

  constructor(private o: FieldOptions) {
    // CPU-rendered WebGL would stall the main thread; the caller (FieldHome) catches this and shows the static composition.
    if (softwareRenderer()) throw new Error("software renderer");
    const b = BUDGET[o.quality];
    this.renderer = new WebGLRenderer({ canvas: o.canvas, alpha: true, antialias: o.quality !== "low", powerPreference: o.form === "mobile" ? "low-power" : "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.cap = startDpr(o.quality, window.devicePixelRatio || 1);
    // QA hook: ?fdpr=1.5 pins the pixel ratio (screenshots on software GL, perf comparisons).
    const pin = Number(new URLSearchParams(window.location.search).get("fdpr"));
    this.locked = Number.isFinite(pin) && pin >= 0.5 && pin <= 2;
    if (this.locked) this.cap = pin;
    this.dpr = this.cap;
    if (o.form === "mobile") this.camera.up.set(-1, 0, 0); // flow runs top to bottom on a portrait screen

    const pal = palette("light");
    const palD = palette("dark");
    // Shader output is written as-is (display space), so pass plain sRGB channel values, not three's linear Color.
    const c3 = (h: string) => new Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    const resA = c3("#17171a");
    const resB = c3("#ffffff");
    this.uni = {
      uTime: { value: 0 }, uBuild: { value: o.still ? 1 : 0 }, uEnergy: { value: 0 }, uReveal: { value: 0.3 }, uVerify: { value: 0 }, uInvest: { value: 0 }, uConverge: { value: 0 }, uDark: { value: 0 }, uAmb: { value: 1 },
      uColA: { value: pal.streams.map(c3) }, uColB: { value: palD.streams.map(c3) },
      uGreenA: { value: c3(pal.verified) }, uGreenB: { value: c3(palD.verified) },
      uAmberA: { value: c3(pal.attention) }, uAmberB: { value: c3(palD.attention) },
      uResA: { value: resA }, uResB: { value: resB },
      uFocal: { value: 1000 }, uDpr: { value: 1 }, uSpeed: { value: 0.5 * (o.speed ?? 1) }, uWidth: { value: 0.05 }, uPointer: { value: this.pointer },
    };

    this.density = Math.min(1, Math.max(0.3, o.density ?? 1));
    this.buildStrands(b.lanes, b.strand);
    this.buildDust(b.dust);
    this.buildOrbit(b.orbit);
    this.buildMotes(b.motes);
    // Context loss (GPU reset / driver update / too many contexts): three restores itself; if it does not, ask the host to rebuild.
    o.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lostT = window.setTimeout(() => this.o.onLost?.(), 2500); });
    o.canvas.addEventListener("webglcontextrestored", () => window.clearTimeout(this.lostT));
    this.buildCore();
    this.buildLattice();
    for (const c of this.counts) c.geo.setDrawRange(0, Math.round(c.n * this.density));
    this.resize();
  }

  private mat(vert: string, frag: string, extra: Partial<ConstructorParameters<typeof ShaderMaterial>[0]> = {}) {
    const m = new ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uni, transparent: true, depthWrite: false, ...extra });
    this.mats.push(m);
    return m;
  }

  /** The streams: points laid along each path (u evenly spaced with a little jitter), several lanes per stream. */
  private buildStrands(lanes: number, perLane: number) {
    const count = STREAMS * lanes * perLane;
    const g = new BufferGeometry();
    const u = new Float32Array(count);
    const stream = new Float32Array(count);
    const lane = new Float32Array(count);
    const seed = new Float32Array(count);
    let k = 0;
    for (let st = 0; st < STREAMS; st++) {
      for (let l = 0; l < lanes; l++) {
        const ln = lanes === 1 ? 0 : (l / (lanes - 1)) * 2 - 1;
        for (let i = 0; i < perLane; i++) {
          u[k] = Math.min(1, (i + rnd() * 0.8) / perLane);
          stream[k] = st;
          lane[k] = ln;
          seed[k] = (st * 0.17 + 0.3 + l * 0.03 + rnd() * 0.9) % 1;
          k++;
        }
      }
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aU", new BufferAttribute(u, 1));
    g.setAttribute("aStream", new BufferAttribute(stream, 1));
    g.setAttribute("aLane", new BufferAttribute(lane, 1));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    this.geos.push(g);
    this.counts.push({ geo: g, n: count });
    const pts = new Points(g, this.mat(STRAND_VERT, STRAND_FRAG));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private buildDust(count: number) {
    const g = new BufferGeometry();
    const stream = new Float32Array(count);
    const u0 = new Float32Array(count);
    const lane = new Float32Array(count);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      stream[i] = i % STREAMS;
      u0[i] = rnd();
      lane[i] = rnd() * 2 - 1;
      seed[i] = rnd();
      size[i] = 1.2 + rnd() * 2.6;
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aStream", new BufferAttribute(stream, 1));
    g.setAttribute("aU0", new BufferAttribute(u0, 1));
    g.setAttribute("aLane", new BufferAttribute(lane, 1));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    g.setAttribute("aSize", new BufferAttribute(size, 1));
    this.geos.push(g);
    this.counts.push({ geo: g, n: count });
    const pts = new Points(g, this.mat(DUST_VERT, DUST_FRAG));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private buildOrbit(count: number) {
    const g = new BufferGeometry();
    const ang = new Float32Array(count);
    const rad = new Float32Array(count);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      ang[i] = (i / count) * Math.PI * 2 + rnd() * 0.05;
      rad[i] = rnd();
      seed[i] = rnd();
      size[i] = 1.6 + rnd() * 2.8;
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aAng", new BufferAttribute(ang, 1));
    g.setAttribute("aRad", new BufferAttribute(rad, 1));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    g.setAttribute("aSize", new BufferAttribute(size, 1));
    this.geos.push(g);
    this.counts.push({ geo: g, n: count });
    const pts = new Points(g, this.mat(ORBIT_VERT, ORBIT_FRAG));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private buildMotes(count: number) {
    const g = new BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -8 + rnd() * 15;
      pos[i * 3 + 1] = (rnd() - 0.5) * 8;
      pos[i * 3 + 2] = -4 + rnd() * 6;
      seed[i] = rnd();
      size[i] = 1 + rnd() * 2.2;
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aPos", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    g.setAttribute("aSize", new BufferAttribute(size, 1));
    this.geos.push(g);
    this.counts.push({ geo: g, n: count });
    const pts = new Points(g, this.mat(MOTE_VERT, MOTE_FRAG));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  /** The answer core: concentric rings + a centre, all hard points. */
  private buildCore() {
    const rings = [0, 0.34, 0.52, 0.7];
    const per = [1, 48, 72, 96];
    const n = per.reduce((x, y) => x + y, 0);
    const ring = new Float32Array(n);
    const ang = new Float32Array(n);
    const seed = new Float32Array(n);
    let k = 0;
    rings.forEach((r, ri) => {
      for (let i = 0; i < per[ri]; i++) {
        ring[k] = r;
        ang[k] = (i / per[ri]) * Math.PI * 2;
        seed[k] = rnd();
        k++;
      }
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aRing", new BufferAttribute(ring, 1));
    g.setAttribute("aAng", new BufferAttribute(ang, 1));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    this.geos.push(g);
    const pts = new Points(g, this.mat(CORE_VERT, CORE_FRAG));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  /** The verification boundary: a lattice of tiny points across the field. */
  private buildLattice() {
    const nx = 34;
    const nz = 18;
    const n = nx * nz;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    let k = 0;
    for (let j = 0; j < nx; j++) {
      for (let i = 0; i < nz; i++) {
        pos[k * 3] = ANCHORS.boundaryX;
        pos[k * 3 + 1] = (j / (nx - 1) - 0.5) * 7;
        pos[k * 3 + 2] = (i / (nz - 1) - 0.5) * 4.6;
        seed[k] = rnd();
        k++;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aPos", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    this.geos.push(g);
    const pts = new Points(g, this.mat(LATTICE_VERT, LATTICE_FRAG));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  /** Scroll progress 0..1 (the field eases toward it). */
  setProgress(p: number) {
    this.target = Math.min(1, Math.max(0, p));
    this.kick();
  }

  setPointer(x: number, y: number, on: boolean) {
    this.pointerTarget = { x, y, on: on ? 1 : 0 };
    this.kick();
  }

  /** 0..1: the visitor is focused on the question box. Brighter, slightly nearer, a little livelier. */
  setEnergy(e: number) {
    this.energyTarget = Math.min(1, Math.max(0, e));
    this.kick();
  }

  /** Real answer progress 0..1 while a question is being answered (models fan out, then converge); null returns to calm. */
  setAsk(p: number | null) {
    this.askP = p === null ? null : Math.min(1, Math.max(0, p));
    this.kick();
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.kick();
  }

  resize() {
    const c = this.o.canvas;
    const r = c.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole field in frame on narrow screens.
    this.camera.fov = this.o.form === "mobile" ? 44 : w / h < 1.3 ? 44 : 36;
    this.camera.updateProjectionMatrix();
    this.uni.uFocal.value = (this.dpr * h) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.uni.uDpr.value = this.dpr;
    this.kick();
  }

  start() {
    this.kick();
  }

  private kick() {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private project(p: V3): [number, number] {
    const v = new Vector3(p.x, p.y, p.z).project(this.camera);
    const r = this.o.canvas.getBoundingClientRect();
    return [(v.x * 0.5 + 0.5) * r.width, (1 - (v.y * 0.5 + 0.5)) * r.height];
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    if (!this.visible || document.hidden) return; // resumed by setVisible / setProgress
    if (this.o.fpsCap && now - this.lastRender < 1000 / this.o.fpsCap - 2) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.lastRender = now;
    if (this.buildT0 < 0) this.buildT0 = now;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.smoothMs = this.smoothMs * 0.9 + dt * 1000 * 0.1;
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.o.canvas.dataset.fps = String(this.fps);
      this.o.canvas.dataset.dpr = String(this.dpr);
      this.o.onStats?.({ fps: this.fps, dpr: this.dpr, count: this.counts.reduce((a, c) => a + Math.round(c.n * this.density), 0) });
      this.frames = 0;
      this.fpsT = now;
      // Frame budget: lower the pixel ratio first, then shed particles; regain both when there is headroom.
      if (!this.locked) {
        const d = adaptDensity(this.density, this.dpr <= 0.8 || this.smoothMs > 30 ? this.smoothMs : 0);
        if (d !== this.density) {
          this.density = d;
          for (const c of this.counts) c.geo.setDrawRange(0, Math.round(c.n * d));
        }
      }
      const next = this.locked ? this.dpr : adaptDpr(this.dpr, this.smoothMs, this.cap);
      if (next !== this.dpr) {
        this.dpr = next;
        this.resize();
      }
    }
    // assemble-on-load (ease in-out over ~2.8 s), focus energy, and the ask-driven story
    const bt = Math.min(1, (now - this.buildT0) / 2800);
    this.uni.uBuild.value = this.o.still ? 1 : bt * bt * (3 - 2 * bt);
    this.energy += (this.energyTarget - this.energy) * (1 - Math.exp(-dt * 3.5));
    this.uni.uEnergy.value = this.energy;
    this.uni.uSpeed.value = 0.5 * (this.o.speed ?? 1) * (1 + 0.5 * this.energy);
    const want = this.askP === null ? this.target : 0.1 + this.askP * 0.82;
    this.current += (want - this.current) * (1 - Math.exp(-dt * (this.askP === null ? 6 : 1.6)));
    if (Math.abs(want - this.current) < 0.0004) this.current = want;
    this.pointerOn += (this.pointerTarget.on - this.pointerOn) * (1 - Math.exp(-dt * 6));

    const st = fieldState(this.current);
    const u = this.uni;
    u.uTime.value = (now - this.t0) / 1000;
    u.uReveal.value = st.reveal;
    u.uVerify.value = st.verify;
    u.uInvest.value = st.investigate * (0.75 + 0.25 * Math.sin((now - this.t0) / 260));
    u.uConverge.value = st.converge;
    u.uAmb.value = st.ambient;
    const wantDark = document.documentElement.getAttribute("data-theme") === "dark" ? 1 : 0;
    this.dk += (wantDark - this.dk) * (1 - Math.exp(-dt * 8));
    u.uDark.value = Math.max(st.dark, this.dk);

    const rail = railAt(this.o.form, this.current);
    const px = this.pointerTarget.x * 0.35;
    const py = this.pointerTarget.y * 0.2;
    this.camera.position.set(rail.pos[0], rail.pos[1] + py * this.pointerOn, rail.pos[2] - 0.9 * this.energy);
    this.camera.position.x += (this.o.form === "mobile" ? py : px) * this.pointerOn;
    this.camera.lookAt(rail.look[0], rail.look[1], rail.look[2]);
    this.camera.updateMatrixWorld();

    // pointer in world space on the z=0 plane
    const ray = new Vector3(this.pointerTarget.x, this.pointerTarget.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const k = -this.camera.position.z / (ray.z || -1);
    this.pointer.set(this.camera.position.x + ray.x * k, this.camera.position.y + ray.y * k, this.pointerOn);

    this.renderer.render(this.scene, this.camera);

    if (this.o.onAnchors) {
      const [ox, oy] = this.project(ANCHORS.origin);
      const [fx, fy] = this.project({ x: FOCUS_X, y: 0, z: 0 });
      const [bx, by] = this.project({ x: ANCHORS.boundaryX, y: 0, z: 0 });
      const [ix, iy] = this.project(ANCHORS.investigate);
      const key = [ox, oy, fx, fy, bx, by, ix, iy].map((n) => Math.round(n)).join(",");
      if (key !== this.lastAnchors) {
        this.lastAnchors = key;
        this.o.onAnchors({ ox, oy, fx, fy, bx, by, ix, iy });
      }
    }
    void ORIGIN_X;
    if (this.first) {
      this.first = false;
      this.o.onFirstFrame?.();
    }
    // Idle streams keep flowing while on screen; the loop is the only animation. A `still` field draws once and stops.
    if (this.o.still) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.lostT);
    cancelAnimationFrame(this.raf);
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
