import { BufferAttribute, BufferGeometry, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderer } from "three";
import { SCENE_POINTS } from "./budget";
import { adaptDensity, adaptDpr, startDpr } from "@/lib/spatial/policy";
import { BOOM_SLOTS, BoomDirector, BoomSlots, NudgeSpring } from "./boom";
import { SCENE_FRAG, SCENE_VERT } from "./scene-glsl";
import { Blob } from "./blob";
import { blobFor } from "./blob-variants";
import { SCROLL_MOTION, buildScene, type SceneData, type SceneId, type SceneParams } from "./scenes";

/**
 * The shared renderer behind every page's particle layer: ONE canvas, ONE points mesh, scenes swapped by morphing
 * point-by-point. It touches no DOM (so it runs unchanged inside a worker on an OffscreenCanvas) and all motion is
 * computed by the vertex shader from a time uniform; the main thread never does per-point or per-keystroke work.
 */
export type SceneOptions = {
  quality: "low" | "medium" | "high";
  form: "desktop" | "mobile";
  dark: boolean;
  width: number;
  height: number;
  dpr: number;
  scene: SceneId;
  fpsCap?: number;
  /** Fraction of the tier's particles to start with (0.3..1); the governor still adapts from there. */
  density?: number;
  /** Motion multiplier. 1 = normal; reduced-motion / data-saver use a very slow ambient drift, never zero. */
  speed?: number;
  /** QA: pin the pixel ratio. */
  pinDpr?: number;
  /** Scale the particle budget (main-thread fallback builds fewer). */
  budgetScale?: number;
  /** Scene variation (onboarding: the clusters you picked). */
  params?: SceneParams;
  /** prefers-reduced-motion: no displacement effects, quick fades, a still camera. The layer itself keeps running. */
  calm?: boolean;
};

/** Particles per tier (every scene fills exactly this many points). */
export { SCENE_POINTS };

const PALETTE = {
  dark: ["#f4f4f6", "#ffffff", "#8e9097", "#d6d7db", "#e9e9ec", "#c9cacf", "#b4b6bc", "#ffffff"],
  light: ["#17171a", "#55575d", "#0b0b0d", "#2a2b30", "#3a3b41", "#46474d", "#1f2024", "#0b0b0d"],
};
const rgb = (h: string) => new Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const nextFrame: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === "function" ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const cancelFrame = (id: number) => (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id));

export class SceneEngine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1, 0.1, 80);
  private mat: ShaderMaterial;
  /** hero blob: noise-displaced soft body + crisp point shell, morphs per route (blob.ts) */
  private blob!: Blob;
  private geo = new BufferGeometry();
  private n: number;
  private raf = 0;
  private running = false;
  private visible = true;
  private disposed = false;
  private dpr: number;
  private cap: number;
  private locked: boolean;
  private density: number;
  private maxDensity: number;
  private w: number;
  private h: number;
  private smoothMs = 16;
  private last = 0;
  private lastRender = 0;
  private time = 0;
  private buildT = 0;
  private morphing = false;
  private morphT = 0;
  private sceneId: SceneId;
  /** Page scroll progress 0..1 (target and eased value): drives the scene's own camera move (SCROLL_MOTION). */
  private scrollTarget = 0;
  private scrollK = 0;
  private pending: { id: SceneId; params: SceneParams } | null = null;
  private params: SceneParams;
  private calm: boolean;
  private director = new BoomDirector();
  private booms = new BoomSlots();
  private nudge = new NudgeSpring();
  private boT = new Float32Array(BOOM_SLOTS * 4);
  private boP = new Float32Array(BOOM_SLOTS * 4);
  private boQ = new Float32Array(BOOM_SLOTS * 4);
  /** Counters for tests / ?fxdebug=1: a boom must never rebuild the buffers or reset a clock. */
  private fills = 0;
  private driftK = 0;
  private pers = 0;
  private persTarget = 0;
  private cam: [number, number, number, number] = [0, 0, 0, 0];
  private camTarget: [number, number, number, number] = [0, 0, 0, 0];
  private baseZ: number;
  private shift = 0;
  private cur: SceneData | null = null;
  private energy = 0;
  private energyTarget = 0;
  private askOn = 0;
  private askTarget = 0;
  private askP = 0;
  private askPTarget = 0;
  private pointer = { x: 0, y: 0, on: 0, tx: 0, ty: 0, ton: 0 };
  private speed: number;
  private firstDone = false;
  private frames = 0;
  private fpsT = 0;
  private resizeTimer = 0;
  fps = 0;
  onFirstFrame?: () => void;
  onStats?: (s: { fps: number; dpr: number; density: number; count: number }) => void;
  /** The GPU context was lost and did not come back within 2.5 s: the host should rebuild the renderer. */
  onLost?: () => void;
  private lostT = 0;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, private o: SceneOptions) {
    this.n = Math.round(SCENE_POINTS[o.quality] * (o.budgetScale ?? 1));
    this.renderer = new WebGLRenderer({ canvas: canvas as HTMLCanvasElement, alpha: true, antialias: o.quality !== "low", powerPreference: o.form === "mobile" ? "low-power" : "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    // Context loss (GPU reset, driver update, too many contexts): three restores on its own; if it does not, ask the host to rebuild.
    const cv = canvas as HTMLCanvasElement;
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lostT = setTimeout(() => this.onLost?.(), 2500) as unknown as number; });
    cv.addEventListener("webglcontextrestored", () => clearTimeout(this.lostT));
    this.cap = startDpr(o.quality, o.dpr);
    this.locked = Boolean(o.pinDpr && o.pinDpr >= 0.5 && o.pinDpr <= 2);
    if (this.locked) this.cap = o.pinDpr as number;
    this.dpr = this.cap;
    this.density = this.maxDensity = Math.min(1, Math.max(0.3, o.density ?? 1));
    this.speed = o.speed ?? 1;
    this.w = o.width;
    this.h = o.height;
    this.sceneId = o.scene;
    this.params = o.params ?? {};
    this.calm = Boolean(o.calm);
    this.booms.setCalm(this.calm);
    this.baseZ = o.form === "mobile" ? 19 : 16;
    this.camera.position.set(0, 0, this.baseZ);

    const col = (dark: boolean) => (dark ? PALETTE.dark : PALETTE.light).map(rgb);
    this.mat = new ShaderMaterial({
      vertexShader: SCENE_VERT,
      fragmentShader: SCENE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uMorph: { value: 0 }, uBuild: { value: 0 }, uEnergy: { value: 0 }, uAsk: { value: 0 }, uAskOn: { value: 0 },
        uDpr: { value: this.dpr }, uSize: { value: o.dark ? 1.55 : 1.45 }, uLoop: { value: 0 }, uHalfW: { value: 9 }, uDark: { value: o.dark ? 1 : 0 },
        uTilt: { value: [0, 0] }, uSway: { value: [0, 0] }, uPointer: { value: new Vector3(0, 0, 0) }, uPointerOn: { value: 0 },
        uCol: { value: col(o.dark) },
        uBo: { value: Array.from({ length: BOOM_SLOTS }, () => new Vector4(0, 0, 0, -1)) },
        uBp: { value: Array.from({ length: BOOM_SLOTS }, () => new Vector4()) },
        uBq: { value: Array.from({ length: BOOM_SLOTS }, () => new Vector4()) },
        uPers: { value: 0 }, uCalm: { value: o.calm ? 1 : 0 },
      },
    });
    this.applySize();
    this.fill(this.sceneId, true);
    this.geo.setDrawRange(0, Math.round(this.n * this.density));
    this.scene.add(Object.assign(new Points(this.geo, this.mat), { frustumCulled: false }));
    this.blob = new Blob(this.scene, { form: o.form === "mobile" ? "mobile" : "desktop", quality: o.quality === "low" || o.quality === "medium" ? o.quality : "high", dark: o.dark, dpr: this.dpr, variant: blobFor(o.scene) });
  }

  /** Visible half-extents at z=0 for the current aspect. */
  private view() {
    const hh = this.baseZ * Math.tan((this.camera.fov * Math.PI) / 360);
    return { hw: hh * (this.w / Math.max(1, this.h)), hh };
  }

  private applySize() {
    this.renderer.setPixelRatio(this.dpr);
    this.blob?.setDpr(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / Math.max(1, this.h);
    this.camera.clearViewOffset();
    this.shift = 0; // re-applied on the next frame
    this.camera.updateProjectionMatrix();
    (this.mat.uniforms.uDpr as { value: number }).value = this.dpr;
    (this.mat.uniforms.uHalfW as { value: number }).value = this.view().hw * 1.02;
  }

  private attrs(d: SceneData, second: boolean) {
    const sfx = second ? "2" : "";
    const set = (name: string, arr: Float32Array, size: number) => {
      const a = this.geo.getAttribute(name + sfx) as BufferAttribute | undefined;
      if (a && a.array.length === arr.length) {
        (a.array as Float32Array).set(arr);
        a.needsUpdate = true;
      } else {
        this.geo.setAttribute(name + sfx, new BufferAttribute(arr.slice(), size));
      }
    };
    set("aP", d.P, 3);
    set("aC", d.C, 4);
    set("aM", d.M, 4);
    set("aS", d.S, 1);
  }

  /** Build `id` into the A buffers (instant) or the B buffers (to morph into). */
  private fill(id: SceneId, instant: boolean) {
    this.fills++;
    const d = buildScene(id, this.n, this.view(), 7, this.params);
    const u = this.mat.uniforms;
    if (instant) {
      this.cur = d;
      this.camTarget = d.cam;
      this.attrs(d, false);
      this.attrs(d, true);
      (u.uTilt as { value: number[] }).value = [d.tilt, d.tilt];
      (u.uSway as { value: number[] }).value = [d.sway, d.sway];
      (u.uMorph as { value: number }).value = 0;
      this.morphing = false;
      this.sceneId = id;
    } else {
      this.attrs(d, true);
      this.camTarget = d.cam; // the camera starts moving toward the next scene's pose while the points morph
      const t = (u.uTilt as { value: number[] }).value;
      const s = (u.uSway as { value: number[] }).value;
      (u.uTilt as { value: number[] }).value = [t[0], d.tilt];
      (u.uSway as { value: number[] }).value = [s[0], d.sway];
      this.nextData = d;
    }
  }
  private nextData: SceneData | null = null;

  /** Swap to another scene with a smooth point-by-point morph (finishes any morph in flight first). */
  setScene(id: SceneId, params: SceneParams = {}) {
    const same = JSON.stringify(params.picks ?? []) === JSON.stringify(this.params.picks ?? []);
    if (id === this.sceneId && !this.morphing && same) return;
    if (this.morphing) {
      this.pending = { id, params };
      return;
    }
    this.params = params;
    this.fill(id, false);
    this.sceneId = id;
    this.blob.setVariant(blobFor(id), this.calm);
    this.morphT = 0;
    this.morphing = true;
    this.kick();
  }

  private finishMorph() {
    const d = this.nextData;
    if (d) {
      this.cur = d;
      this.attrs(d, false);
      const u = this.mat.uniforms;
      (u.uTilt as { value: number[] }).value = [d.tilt, d.tilt];
      (u.uSway as { value: number[] }).value = [d.sway, d.sway];
    }
    (this.mat.uniforms.uMorph as { value: number }).value = 0;
    this.morphing = false;
    this.nextData = null;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.setScene(p.id, p.params);
    }
  }

  setSize(w: number, h: number, dpr: number) {
    const aspectChanged = Math.abs(w / Math.max(1, h) - this.w / Math.max(1, this.h)) > 0.08;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    if (!this.locked) this.cap = startDpr(this.o.quality, dpr);
    if (!this.locked) this.dpr = Math.min(this.dpr, this.cap);
    this.applySize();
    if (aspectChanged && !this.morphing) {
      // the layouts are drawn in view units: rebuild for the new aspect (debounced), no morph
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => !this.disposed && this.fill(this.sceneId, true), 220) as unknown as number;
    }
    this.kick();
  }

  setPointer(x: number, y: number, on: boolean) {
    this.pointer.tx = x;
    this.pointer.ty = y;
    this.pointer.ton = on ? 1 : 0;
  }
  /**
   * Onboarding: a boom at a point on screen (NDC -1..1). A different randomized effect each time (see boom.ts). It is only
   * ADDED to the running field as an impulse: nothing is rebuilt, re-seeded, re-timed or snapped (reduced motion: a quick
   * brightness fade). Safe to call at any moment, including mid-morph and mid-boom.
   */
  boom(x: number, y: number, strength = 1) {
    this.camera.updateMatrixWorld();
    const near = new Vector3(x, y, 0.5).unproject(this.camera);
    const dir = near.sub(this.camera.position).normalize();
    const t = dir.z !== 0 ? -this.camera.position.z / dir.z : 0;
    const o = this.camera.position.clone().addScaledVector(dir, t > 0 ? t : 0);
    const spec = this.director.next(Math.max(0.2, Math.min(1.6, strength)));
    this.booms.fire(spec, [o.x + spec.jitter[0], o.y + spec.jitter[1], o.z + spec.jitter[2]]);
    if (!this.calm) this.nudge.kick(spec.nudge, Math.max(0.6, Math.min(1.4, strength)));
    this.kick();
  }
  /** Read-only snapshot for QA (?fxdebug=1) and tests. */
  diag() {
    const c = this.camera.position;
    return {
      time: this.time, buildT: this.buildT, fills: this.fills, morphing: this.morphing, scene: this.sceneId, n: this.n,
      booms: this.booms.slots.map((b) => (b ? { t: b.t, variant: b.spec.variant } : null)),
      cam: [c.x, c.y, c.z] as [number, number, number],
    };
  }
  /** Onboarding: the field turns inward while the page says "Personalizing…" (true), and unwinds (false). */
  setPersonalize(on: boolean) { this.persTarget = on ? 1 : 0; this.kick(); }
  setEnergy(e: number) { this.energyTarget = Math.max(0, Math.min(1, e)); }
  /** Answer progress 0..1 while a question runs; null when idle. */
  setAsk(p: number | null) {
    this.askTarget = p === null ? 0 : 1;
    if (p !== null) this.askPTarget = Math.max(0, Math.min(1, p));
  }
  setDark(dark: boolean) {
    const u = this.mat.uniforms;
    (u.uCol as { value: Vector3[] }).value = (dark ? PALETTE.dark : PALETTE.light).map(rgb);
    (u.uSize as { value: number }).value = dark ? 1.55 : 1.45;
    (u.uDark as { value: number }).value = dark ? 1 : 0;
    this.blob.setDark(dark);
  }
  setSpeed(s: number) { this.speed = s; }
  /** Scroll progress of the page, 0 (top) .. 1 (bottom). */
  setScroll(p: number) { this.scrollTarget = Math.max(0, Math.min(1, p)); this.kick(); }
  /** Per-page quietness: frame cap, particle share and motion speed (admin is faint, capped and slow). */
  setConfig(c: { fpsCap?: number; density?: number; speed?: number; calm?: boolean }) {
    this.o.fpsCap = c.fpsCap;
    if (c.calm !== undefined) {
      this.calm = c.calm;
      this.booms.setCalm(c.calm);
      (this.mat.uniforms.uCalm as { value: number }).value = c.calm ? 1 : 0;
    }
    if (c.density !== undefined) {
      this.maxDensity = Math.min(1, Math.max(0.3, c.density));
      this.density = Math.min(this.density, this.maxDensity);
      this.geo.setDrawRange(0, Math.round(this.n * this.density));
    }
    if (c.speed !== undefined) this.speed = c.speed;
  }
  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.kick();
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.kick();
  }

  private kick() {
    if (this.raf || !this.running || this.disposed || !this.visible) return;
    this.raf = nextFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.running || !this.visible) return;
    if (this.o.fpsCap && now - this.lastRender < 1000 / this.o.fpsCap - 2) {
      this.raf = nextFrame(this.frame);
      return;
    }
    this.lastRender = now;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.smoothMs = this.smoothMs * 0.9 + dt * 1000 * 0.1;
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0;
      this.fpsT = now;
      this.governor();
      this.onStats?.({ fps: this.fps, dpr: this.dpr, density: this.density, count: Math.round(this.n * this.density) });
    }

    const u = this.mat.uniforms;
    const ease = (v: number, t: number, k: number) => v + (t - v) * Math.min(1, dt * k);
    this.energy = ease(this.energy, this.energyTarget, 2.4);
    this.askOn = ease(this.askOn, this.askTarget, 1.8);
    this.askP = ease(this.askP, this.askPTarget, 0.9);
    this.pointer.x = ease(this.pointer.x, this.pointer.tx, 5);
    this.pointer.y = ease(this.pointer.y, this.pointer.ty, 5);
    this.pointer.on = ease(this.pointer.on, this.pointer.ton, 4);
    // motion clock: ambient motion never stops (reduced motion only slows it), focus adds a little life
    this.time += dt * this.speed * (0.55 + 0.8 * this.energy);
    this.buildT = Math.min(1, this.buildT + dt / 2.6);
    if (this.morphing) {
      this.morphT = Math.min(1, this.morphT + dt / (this.calm ? 0.5 : 1.7));
      (u.uMorph as { value: number }).value = this.morphT;
      if (this.morphT >= 1) this.finishMorph();
    }
    (u.uTime as { value: number }).value = this.time;
    (u.uBuild as { value: number }).value = this.buildT;
    (u.uEnergy as { value: number }).value = this.energy;
    (u.uAsk as { value: number }).value = this.askP;
    (u.uAskOn as { value: number }).value = this.askOn;
    (u.uLoop as { value: number }).value = ((this.time / 16) % 1) * 1.5;
    const v = this.view();
    (u.uPointer as { value: Vector3 }).value.set((this.pointer.x - 2 * this.shift) * v.hw, this.pointer.y * v.hh, 0);
    (u.uPointerOn as { value: number }).value = this.pointer.on;
    // Booms: clocks only move forward (real time); each ends on its own, faded to exactly zero.
    if (this.booms.active) {
      this.booms.advance(dt);
      this.booms.write(this.boT, this.boP, this.boQ);
      const bo = (u.uBo as { value: Vector4[] }).value, bp = (u.uBp as { value: Vector4[] }).value, bq = (u.uBq as { value: Vector4[] }).value;
      for (let i = 0; i < BOOM_SLOTS; i++) {
        const o = i * 4;
        bo[i].set(this.boT[o], this.boT[o + 1], this.boT[o + 2], this.boT[o + 3]);
        bp[i].set(this.boP[o], this.boP[o + 1], this.boP[o + 2], this.boP[o + 3]);
        bq[i].set(this.boQ[o], this.boQ[o + 1], this.boQ[o + 2], this.boQ[o + 3]);
      }
    }
    this.pers = ease(this.pers, this.persTarget, this.persTarget ? 3.4 : 2.2);
    (u.uPers as { value: number }).value = this.pers < 0.002 ? 0 : this.pers;
    // Camera: eases to the scene's pose (dolly, offset, yaw) with a slow idle drift; a still camera in reduced motion.
    const ck = this.calm ? 30 : 1.5;
    for (let i = 0; i < 4; i++) this.cam[i] = ease(this.cam[i], this.camTarget[i], ck);
    const moves = this.camTarget.some((x) => x !== 0) || this.cam.some((x) => Math.abs(x) > 0.002);
    // the idle drift fades in and out (a hard 0/1 switch would nudge the picture); a boom's camera nudge is a damped spring
    this.driftK = ease(this.driftK, moves && !this.calm ? 1 : 0, 1.2);
    const drift = this.driftK;
    this.nudge.step(dt);
    // scrolling travels through THIS scene (orbit, rise, dolly): eased so a flick of the wheel never jerks the picture; a still camera in reduced motion
    this.scrollK = ease(this.scrollK, this.calm ? 0 : this.scrollTarget, 2.6);
    const sm = SCROLL_MOTION[this.sceneId] ?? [0, 0, 0];
    const yaw = this.cam[3] + sm[0] * this.scrollK + drift * 0.035 * Math.sin(this.time * 0.23) + this.nudge.x[0];
    const dist = this.baseZ + this.cam[2] + sm[2] * this.scrollK - 1.8 * this.energy + this.nudge.x[2];
    this.camera.position.set(Math.sin(yaw) * dist, this.cam[1] + sm[1] * this.scrollK + drift * 0.16 * Math.sin(this.time * 0.17) + this.nudge.x[1], Math.cos(yaw) * dist);
    this.camera.lookAt(0, 0, 0);
    // cam[0] shifts the picture sideways on screen (a fraction of the width, wide screens only) so a card can sit beside the scene.
    const sx = this.w / Math.max(1, this.h) > 1.25 ? this.cam[0] : 0;
    if (Math.abs(sx - this.shift) > 0.0004) {
      this.shift = sx;
      if (sx === 0) this.camera.clearViewOffset();
      else this.camera.setViewOffset(this.w, this.h, -sx * this.w, 0, this.w, this.h);
      this.camera.updateProjectionMatrix();
    }
    this.blob.update(dt, this.time, this.scrollK, { x: this.pointer.x, y: this.pointer.y, on: this.pointer.on }, v, this.w / Math.max(1, this.h), this.calm);
    this.renderer.render(this.scene, this.camera);
    if (!this.firstDone) {
      this.firstDone = true;
      this.onFirstFrame?.();
    }
    this.raf = nextFrame(this.frame);
  };

  /** Frame governor: lower the pixel ratio first, then shed particles; recover slowly when there is headroom. */
  private governor() {
    if (!this.locked) {
      const next = adaptDpr(this.dpr, this.smoothMs, this.cap);
      if (next !== this.dpr) {
        this.dpr = next;
        this.applySize();
      }
    }
    const d = Math.min(this.maxDensity, adaptDensity(this.density, this.dpr <= 0.8 || this.smoothMs > 30 ? this.smoothMs : 0));
    if (d !== this.density) {
      this.density = d;
      this.geo.setDrawRange(0, Math.round(this.n * d));
    }
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    clearTimeout(this.resizeTimer);
    clearTimeout(this.lostT);
    if (this.raf) cancelFrame(this.raf);
    this.blob.dispose(this.scene);
    this.geo.dispose();
    this.mat.dispose();
    this.renderer.dispose();
  }
}
