import {
  NormalBlending, BoxGeometry, BufferAttribute, BufferGeometry, CubicBezierCurve3, DoubleSide, EdgesGeometry, Group, IcosahedronGeometry, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Points, Scene, ShaderMaterial, TubeGeometry, Vector3,
  WebGLRenderer, WebGLRenderTarget, Float32BufferAttribute,
} from "three";
import {
  CORE_FRAG, CORE_VERT, DUST_VERT, FLOOR_FRAG, FLOOR_VERT, HALO_FRAG, HALO_VERT, LINE_FRAG, LINE_VERT, ORBIT_VERT, POINT_FRAG, POST_FRAG, POST_VERT,
  RIBBON_FRAG, RIBBON_VERT, TILE_FRAG, TILE_VERT,
} from "./glsl";
import { agitate, budget, clamp, convergence, lerp, lineControls, NODE_COUNT, place, scrollPhase, smooth, type OrbBudget, type Placement, type Stage } from "./math";

export type OrbFrame = {
  /** CSS px relative to the canvas */
  orb: { x: number; y: number; r: number };
  nodes: { x: number; y: number; size: number; glow: number }[];
  copy: number;
  flood: number;
  converge: number;
};

export type OrbOptions = {
  canvas: HTMLCanvasElement;
  quality: "low" | "medium" | "high";
  mobile: boolean;
  /** reduced motion: render still frames only (no loop, no glitch) */
  still: boolean;
  getStage: () => Stage;
  onFrame?: (f: OrbFrame) => void;
  onLost?: () => void;
  onFirstFrame?: () => void;
};

const FOV = 36;
const DIST = 14;

const rnd = (() => {
  let s = 1234567;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
})();

function ridgeGeometry(halfW: number, base: number, peak: number, z: number, step: number, seed: number) {
  const pts: number[] = [];
  const lines: number[] = [];
  const tri: number[] = [];
  let px = -halfW;
  const py = base;
  let k = seed;
  const hh = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const top: [number, number][] = [];
  while (px <= halfW) {
    const env = 0.25 + 0.75 * smooth(0.0, 0.55, Math.abs(px) / halfW); // valley in the middle, peaks to the sides
    const h = base + peak * env * (0.15 + 0.85 * hh());
    top.push([px, h]);
    px += step * (0.6 + 0.8 * hh());
  }
  for (let i = 0; i < top.length - 1; i++) {
    const [x0, y0] = top[i];
    const [x1, y1] = top[i + 1];
    lines.push(x0, y0, z, x1, y1, z);
    // crystalline facet from the peak down to the base at a slant
    if (y0 > base + peak * 0.2) lines.push(x0, y0, z, x0 + (hh() - 0.3) * step * 1.4, base, z);
    tri.push(x0, y0, z, x1, y1, z, x0, base - peak, z, x1, y1, z, x1, base - peak, z, x0, base - peak, z);
  }
  void pts; void py;
  const lg = new BufferGeometry();
  lg.setAttribute("position", new Float32BufferAttribute(lines, 3));
  const fg = new BufferGeometry();
  fg.setAttribute("position", new Float32BufferAttribute(tri, 3));
  return { lg, fg };
}

export class OrbScene {
  private r: WebGLRenderer;
  private scene = new Scene();
  private cam = new PerspectiveCamera(FOV, 1, 0.1, 80);
  private rt: WebGLRenderTarget | null = null;
  private post: { scene: Scene; cam: PerspectiveCamera; mat: ShaderMaterial } | null = null;
  private b: OrbBudget;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private t = 0;
  private last = 0;
  private raf = 0;
  private visible = true;
  private started = false;
  private first = false;
  private lost = false;
  private disposed = false;
  private place!: Placement;
  private ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false };
  private scrollTarget = 0;
  private scroll = 0;
  private scrollVel = 0;
  private agit = 0;
  private focus = 0;
  private focusT = 0;
  private conv = 0;
  private convT0 = -1;
  private convDone: (() => void) | null = null;
  private flash = 0;
  private glitch = 0;
  private ema = 16;
  private slow = 0;

  private core!: Mesh;
  private cube!: Group;
  private orbit!: Points;
  private dust!: Points;
  private halo!: Mesh;
  private haloMat!: ShaderMaterial;
  private floor!: Mesh;
  private floorMat!: ShaderMaterial;
  private ribbons!: LineSegments;
  private ribbonMat!: ShaderMaterial;
  private ridges = new Group();
  private lineGroup = new Group();
  private lineMats: ShaderMaterial[] = [];
  private tiles: { g: Group; mats: ShaderMaterial[]; base: Vector3; tx: number; ty: number; hover: number }[] = [];
  private curves: CubicBezierCurve3[] = [];
  private uTime = { value: 0 };
  private uAgit = { value: 0 };
  private uConv = { value: 0 };
  private uFlash = { value: 0 };
  private uDpr = { value: 1 };
  private uFade = { value: 1 };
  private uFocus = { value: 0 };
  private uOrb = { value: new Vector3() };

  constructor(private o: OrbOptions) {
    this.b = budget(o.quality, o.mobile);
    this.r = new WebGLRenderer({ canvas: o.canvas, antialias: !o.mobile, alpha: false, powerPreference: o.mobile ? "low-power" : "high-performance" });
    this.r.setClearColor(0x000000, 1);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.b.dprCap);
    this.uDpr.value = this.dpr;
    o.canvas.addEventListener("webglcontextlost", this.onLost as EventListener, false);
    this.build();
    this.resize();
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.raf);
    this.o.onLost?.();
  };

  private build() {
    const sc = this.scene;
    // dust / embers (a box of points in front of and behind the orb)
    {
      const n = this.b.stars;
      const seed = new Float32Array(n * 4);
      const size = new Float32Array(n);
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        seed[i * 4] = (rnd() - 0.5) * 34;
        seed[i * 4 + 1] = (rnd() - 0.5) * 22;
        seed[i * 4 + 2] = -9 + rnd() * 14;
        seed[i * 4 + 3] = rnd();
        size[i] = 0.5 + rnd() * rnd() * 2.2;
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(pos, 3));
      g.setAttribute("aSeed", new BufferAttribute(seed, 4));
      g.setAttribute("aSize", new BufferAttribute(size, 1));
      const m = new ShaderMaterial({
        vertexShader: DUST_VERT, fragmentShader: POINT_FRAG.replace("vA;", "vA;").replace("edge * vA", "edge * vA"),
        uniforms: { uTime: this.uTime, uDpr: this.uDpr, uScale: { value: 20 }, uHeight: { value: 22 }, uFlood: { value: 0 } },
        transparent: true, depthWrite: false, blending: NormalBlending,
      });
      this.dust = new Points(g, m);
      this.dust.frustumCulled = false;
      sc.add(this.dust);
    }
    // ribbons
    {
      const lines = this.b.orbit > 1000 ? 150 : 80;
      const seg = 6;
      const info: number[] = [];
      for (let i = 0; i < lines; i++) {
        const x = rnd();
        const s = rnd();
        for (let j = 0; j < seg; j++) info.push(x, s, j / seg, x, s, (j + 1) / seg);
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(new Float32Array((info.length / 3) * 3), 3));
      g.setAttribute("aInfo", new Float32BufferAttribute(info, 3));
      this.ribbonMat = new ShaderMaterial({
        vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
        uniforms: { uTime: this.uTime, uWidth: { value: 30 }, uHeight: { value: 20 }, uSweepX: { value: 0 }, uFade: this.uFade },
        transparent: true, depthWrite: false, blending: NormalBlending,
      });
      this.ribbons = new LineSegments(g, this.ribbonMat);
      this.ribbons.frustumCulled = false;
      sc.add(this.ribbons);
    }
    // ridges (rim-lit crystalline silhouettes) are built in layout() because they depend on the width
    sc.add(this.ridges);
    // floor reflection
    {
      this.floorMat = new ShaderMaterial({
        vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
        uniforms: { uTime: this.uTime, uHorizon: { value: 0 }, uOx: { value: 0 }, uR: { value: 1 }, uStrength: { value: 1 }, uFlash: this.uFlash },
        transparent: true, depthWrite: false, blending: NormalBlending,
      });
      this.floor = new Mesh(new PlaneGeometry(1, 1), this.floorMat);
      this.floor.position.z = -1.2;
      sc.add(this.floor);
    }
    // halo + streak
    {
      this.haloMat = new ShaderMaterial({
        vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
        uniforms: { uStrength: { value: 1 }, uStreak: { value: 0.6 }, uFlash: this.uFlash, uTime: this.uTime },
        transparent: true, depthWrite: false, blending: NormalBlending,
      });
      this.halo = new Mesh(new PlaneGeometry(1, 1), this.haloMat);
      this.halo.position.z = -0.6;
      sc.add(this.halo);
    }
    // core orb
    this.core = new Mesh(
      new IcosahedronGeometry(1, this.b.detail),
      new ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: { uTime: this.uTime, uAgit: this.uAgit, uConv: this.uConv, uFlash: this.uFlash } }),
    );
    sc.add(this.core);
    // glass cube around the core: edges + very faint faces
    {
      this.cube = new Group();
      const box = new BoxGeometry(1, 1, 1);
      this.cube.add(new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: NormalBlending, depthWrite: false })));
      this.cube.add(new Mesh(box, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, side: DoubleSide, blending: NormalBlending, depthWrite: false })));
      sc.add(this.cube);
    }
    // orbiting sharp points
    {
      const n = this.b.orbit;
      const seed = new Float32Array(n * 4);
      const size = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        seed[i * 4] = 1.28 + Math.pow(rnd(), 1.6) * 1.35;
        seed[i * 4 + 1] = rnd() * 3.1416;
        seed[i * 4 + 2] = (0.18 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1);
        seed[i * 4 + 3] = rnd();
        size[i] = 0.7 + rnd() * rnd() * 2.4;
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aSeed", new BufferAttribute(seed, 4));
      g.setAttribute("aSize", new BufferAttribute(size, 1));
      this.orbit = new Points(
        g,
        new ShaderMaterial({
          vertexShader: ORBIT_VERT, fragmentShader: POINT_FRAG,
          uniforms: { uTime: this.uTime, uAgit: this.uAgit, uConv: this.uConv, uDpr: this.uDpr, uScale: { value: 20 }, uR: { value: 1 } },
          transparent: true, depthWrite: false, blending: NormalBlending,
        }),
      );
      this.orbit.frustumCulled = false;
      sc.add(this.orbit);
    }
    sc.add(this.lineGroup);
    // tiles
    for (let i = 0; i < NODE_COUNT; i++) {
      const g = new Group();
      const mats: ShaderMaterial[] = [];
      for (let layer = 0; layer < 3; layer++) {
        const m = new ShaderMaterial({
          vertexShader: TILE_VERT, fragmentShader: TILE_FRAG,
          uniforms: { uTime: this.uTime, uLayer: { value: layer }, uGlyph: { value: i }, uHover: { value: 0 }, uGlow: { value: 0 }, uFade: this.uFade, uSeed: { value: i }, uTilt: { value: [0, 0] } },
          transparent: true, depthWrite: false, blending: layer === 0 ? NormalBlending : NormalBlending, side: DoubleSide,
        });
        mats.push(m);
        const pl = new Mesh(new PlaneGeometry(layer === 2 ? 2.6 : 1, layer === 2 ? 2.6 : 1), m);
        pl.position.z = -layer * 0.09;
        pl.renderOrder = 10 - layer;
        g.add(pl);
      }
      this.scene.add(g);
      this.tiles.push({ g, mats, base: new Vector3(), tx: 0, ty: 0, hover: 0 });
    }
    // post
    const mat = new ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: { tDiffuse: { value: null }, uGlitch: { value: 0 }, uTime: this.uTime, uFlood: { value: 0 }, uRes: { value: [1, 1] } },
      depthTest: false, depthWrite: false,
    });
    const ps = new Scene();
    const tri = new Mesh(new PlaneGeometry(2, 2), mat);
    tri.frustumCulled = false;
    ps.add(tri);
    this.post = { scene: ps, cam: new PerspectiveCamera(), mat };
  }

  /** Re-measure the canvas and the stage, rebuild everything that depends on the layout. */
  resize() {
    if (this.disposed) return;
    const c = this.o.canvas;
    this.w = Math.max(1, c.clientWidth);
    this.h = Math.max(1, c.clientHeight);
    this.r.setPixelRatio(this.dpr);
    this.r.setSize(this.w, this.h, false);
    this.cam.aspect = this.w / this.h;
    this.cam.updateProjectionMatrix();
    this.rt?.dispose();
    this.rt = null;
    this.layout();
    if (!this.started || this.o.still) this.draw(0);
  }

  private layout() {
    const p = place(this.o.getStage(), this.w, this.h, FOV, DIST);
    this.place = p;
    const R = p.orbR;
    this.core.scale.setScalar(R);
    this.core.position.copy(new Vector3(p.orb.x, p.orb.y, p.orb.z));
    this.cube.position.copy(this.core.position);
    this.cube.scale.setScalar(R * 2.15);
    this.orbit.position.copy(this.core.position);
    (this.orbit.material as ShaderMaterial).uniforms.uR.value = R;
    this.uOrb.value.copy(this.core.position);
    this.halo.position.set(p.orb.x, p.orb.y, -0.6);
    this.halo.scale.setScalar(R * 7.5);
    const worldW = this.w * p.wpp;
    const worldH = this.h * p.wpp;
    // the horizon streak is a separate wide quad drawn by the same shader at a wide scale: stretch x
    this.halo.scale.set(Math.max(R * 7.5, worldW * 1.4), R * 7.5, 1);
    this.haloMat.uniforms.uStreak.value = 0.55;
    // floor reflection: from the horizon down to the bottom of the view
    const horizon = p.orb.y - R * 0.95;
    const fh = Math.max(0.1, horizon + worldH / 2 + 1);
    this.floor.scale.set(worldW * 1.6, fh, 1);
    this.floor.position.set(0, horizon - fh / 2, -1.2);
    this.floorMat.uniforms.uHorizon.value = horizon;
    this.floorMat.uniforms.uOx.value = p.orb.x;
    this.floorMat.uniforms.uR.value = R;
    this.ribbonMat.uniforms.uWidth.value = worldW * 1.1;
    this.ribbonMat.uniforms.uHeight.value = worldH * 1.2;
    this.dust.material = this.dust.material as ShaderMaterial;
    (this.dust.material as ShaderMaterial).uniforms.uHeight.value = worldH * 1.2;
    (this.dust.material as ShaderMaterial).uniforms.uScale.value = clamp(this.h / 900, 0.6, 1.6) * 20;
    (this.orbit.material as ShaderMaterial).uniforms.uScale.value = clamp(this.h / 900, 0.6, 1.6) * 20;
    // ridges
    for (const ch of [...this.ridges.children]) {
      this.ridges.remove(ch);
      (ch as Mesh).geometry?.dispose();
    }
    const layers = [
      { z: -3, peak: 0.9, a: 0.5, step: 0.9 },
      { z: -7, peak: 1.25, a: 0.32, step: 1.4 },
      { z: -12, peak: 1.7, a: 0.2, step: 2.1 },
    ];
    layers.forEach((l, i) => {
      const halfW = (worldW / 2) * (1 + (-l.z) / DIST) * 1.15;
      const { lg, fg } = ridgeGeometry(halfW, horizon, R * l.peak * (this.o.mobile ? 0.75 : 1), l.z, l.step * R * 0.55, 7 + i * 13);
      const fill = new Mesh(fg, new MeshBasicMaterial({ color: 0x000000 }));
      fill.renderOrder = -5 + i;
      const line = new LineSegments(lg, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: l.a, blending: NormalBlending, depthWrite: false }));
      line.renderOrder = -4 + i;
      this.ridges.add(fill, line);
    });
    // tiles + curves
    const ts = p.tile;
    this.tiles.forEach((t, i) => {
      t.base.set(p.nodes[i].x, p.nodes[i].y, p.nodes[i].z);
      t.g.scale.set(ts, ts, 1);
    });
    for (const m of [...this.lineGroup.children]) {
      this.lineGroup.remove(m);
      (m as Mesh).geometry?.dispose();
    }
    this.lineMats.forEach((m) => m.dispose());
    this.lineMats = [];
    this.curves = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const [a, b2, c, d] = lineControls(p.orb, R, p.nodes[i], i);
      const target = new Vector3(d.x, d.y - ts * 0.5, d.z);
      const curve = new CubicBezierCurve3(new Vector3(a.x, a.y, a.z), new Vector3(b2.x, b2.y, b2.z), new Vector3(c.x, c.y, c.z), target);
      this.curves.push(curve);
      for (const glow of [0, 1]) {
        const mat = new ShaderMaterial({
          vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
          uniforms: {
            uTime: this.uTime, uAgit: this.uAgit, uConv: this.uConv, uSeed: { value: i * 0.17 + 0.05 }, uFade: this.uFade, uGlow: { value: glow }, uSpeed: { value: 0.16 + (i % 3) * 0.03 },
            uOrb: this.uOrb, uFocus: this.uFocus,
          },
          transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide,
        });
        this.lineMats.push(mat);
        const geo = new TubeGeometry(curve, this.b.segs, glow ? ts * 0.16 : ts * 0.022, glow ? 5 : this.b.radial, false);
        const mesh = new Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        this.lineGroup.add(mesh);
      }
    }
  }

  setPointer(x: number, y: number, on: boolean) {
    this.ptr.tx = x;
    this.ptr.ty = y;
    this.ptr.on = on;
  }
  setScroll(p: number) {
    this.scrollTarget = clamp(p);
  }
  /** one keystroke: the field stirs (zero work beyond a number) */
  agitate(kick = 0.1) {
    this.agit = clamp(this.agit + kick);
  }
  setFocus(v: boolean) {
    this.focusT = v ? 1 : 0;
  }
  /** Lines pull back into the orb, the core flashes; resolves when the burst has landed. */
  converge(): Promise<void> {
    if (this.o.still || this.lost) return Promise.resolve();
    this.convT0 = this.t;
    return new Promise((res) => {
      this.convDone = res;
    });
  }
  setVisible(v: boolean) {
    this.visible = v;
    if (v && this.started && !this.raf && !this.o.still) this.raf = requestAnimationFrame(this.loop);
  }
  start() {
    if (this.started) return;
    this.started = true;
    document.addEventListener("visibilitychange", this.onVis);
    if (this.o.still) {
      this.draw(0);
      return;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }
  private onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (this.visible && !this.raf && !this.o.still && !this.lost) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private loop = (now: number) => {
    this.raf = 0;
    if (this.disposed || this.lost || !this.visible || document.hidden) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.draw(dt);
    // adaptive pixel ratio: steps down when frames stay slow
    this.ema = lerp(this.ema, dt * 1000, 0.05);
    this.slow = this.ema > 26 ? this.slow + dt : Math.max(0, this.slow - dt);
    if (this.slow > 1.4 && this.dpr > 0.85) {
      this.dpr = Math.max(0.85, +(this.dpr - 0.25).toFixed(2));
      this.uDpr.value = this.dpr;
      this.slow = 0;
      this.resize();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(dt: number) {
    if (this.lost || this.disposed) return;
    const still = this.o.still;
    this.t += dt;
    const t = still ? 2.4 : this.t;
    this.uTime.value = t;
    // pointer, scroll, agitation, focus, convergence
    const k = 1 - Math.exp(-dt * 5);
    this.ptr.x = lerp(this.ptr.x, this.ptr.on ? this.ptr.tx : 0, k);
    this.ptr.y = lerp(this.ptr.y, this.ptr.on ? this.ptr.ty : 0, k);
    const prev = this.scroll;
    this.scroll = lerp(this.scroll, this.scrollTarget, 1 - Math.exp(-dt * 4));
    this.scrollVel = lerp(this.scrollVel, dt > 0 ? Math.abs(this.scroll - prev) / dt : 0, 0.2);
    this.agit = agitate(this.agit, dt);
    this.focus = lerp(this.focus, this.focusT, 1 - Math.exp(-dt * 4));
    if (this.convT0 >= 0) {
      const el = t - this.convT0;
      this.conv = convergence(el, 0.8);
      this.flash = el > 0.62 ? clamp((el - 0.62) / 0.12) * (1 - clamp((el - 0.8) / 0.5)) + (el > 0.74 ? 0.0 : 0) : 0;
      if (el > 0.8 && this.convDone) {
        const d = this.convDone;
        this.convDone = null;
        d();
      }
      if (el > 1.5) {
        this.convT0 = -1;
        this.conv = 0;
        this.flash = 0;
      }
    }
    this.uAgit.value = this.agit;
    this.uConv.value = this.conv;
    this.uFlash.value = this.flash;
    this.uFocus.value = this.focus;
    const ph = scrollPhase(this.scroll);
    this.uFade.value = ph.lines;
    // glitch: scroll speed, the submit burst, never in still mode
    const target = still ? 0 : clamp(this.scrollVel * 5.5 - 0.15) * 0.9 + (this.convT0 >= 0 ? clamp(this.conv * 1.3) * 0.8 : 0);
    this.glitch = lerp(this.glitch, target, 1 - Math.exp(-dt * (target > this.glitch ? 14 : 6)));

    const p = this.place;
    // camera: pointer parallax, dolly into the orb on scroll
    const d = DIST * (1 - 0.82 * ph.dolly) - this.conv * 1.2 - this.agit * 0.25;
    const cx = lerp(0, p.orb.x, ph.dolly) + this.ptr.x * 0.55;
    const cy = lerp(0, p.orb.y, ph.dolly) + this.ptr.y * 0.32;
    this.cam.position.set(cx, cy, d);
    this.cam.lookAt(lerp(0, p.orb.x, ph.dolly), lerp(0, p.orb.y, ph.dolly), 0);

    // objects
    const R = p.orbR;
    const sp = still ? 0 : 1;
    this.core.rotation.y = t * 0.12 * sp;
    this.cube.rotation.set(t * 0.17 * sp + 0.5, t * 0.23 * sp + 0.3, t * 0.09 * sp);
    this.cube.scale.setScalar(R * (2.15 - this.conv * 0.9 + this.agit * 0.15));
    this.orbit.rotation.y = t * 0.05 * sp;
    this.haloMat.uniforms.uStrength.value = 0.85 + this.agit * 0.4 + this.flash * 0.6 + this.conv * 0.4;
    this.floorMat.uniforms.uStrength.value = 0.9 + this.agit * 0.3;
    this.ribbonMat.uniforms.uSweepX.value = (((t * 0.11) % 1) - 0.5) * this.ribbonMat.uniforms.uWidth.value * 1.3;
    this.ribbonMat.uniforms.uFade.value = ph.lines;
    (this.dust.material as ShaderMaterial).uniforms.uFlood.value = ph.flood;
    this.ridges.visible = ph.lines > 0.02;

    // tiles
    const nodesOut: OrbFrame["nodes"] = [];
    this.tiles.forEach((tl, i) => {
      const bob = Math.sin(t * 0.7 + i * 1.3) * 0.06 * sp;
      const pull = clamp(this.conv * 1.1);
      const x = lerp(tl.base.x, p.orb.x, pull * 0.86);
      const y = lerp(tl.base.y + bob, p.orb.y, pull * 0.86);
      tl.g.position.set(x, y, tl.base.z);
      // tilt toward the pointer (world pointer ≈ ndc * half extents at z=0)
      const wx = this.ptr.x * (this.w * p.wpp) * 0.5;
      const wy = this.ptr.y * (this.h * p.wpp) * 0.5;
      const dx = wx - x, dy = wy - y;
      const dist = Math.hypot(dx, dy);
      const near = this.ptr.on ? Math.exp(-dist * dist / (p.tile * p.tile * 14)) : 0;
      const ty = clamp(dx / (p.tile * 6), -1, 1) * 0.65;
      const tx = -clamp(dy / (p.tile * 6), -1, 1) * 0.5;
      const kk = 1 - Math.exp(-dt * 7);
      tl.ty = lerp(tl.ty, ty + Math.sin(t * 0.5 + i) * 0.08 * sp, kk);
      tl.tx = lerp(tl.tx, tx + Math.cos(t * 0.43 + i * 1.7) * 0.06 * sp, kk);
      tl.hover = lerp(tl.hover, near, kk);
      tl.g.rotation.set(tl.tx, tl.ty, 0);
      const s = p.tile * (1 + tl.hover * 0.14) * (1 - pull * 0.5);
      tl.g.scale.set(s, s, 1);
      // glow when a pulse arrives (same phase formula as the line shader's first pulse)
      const sd = i * 0.17 + 0.05;
      const spd = (0.16 + (i % 3) * 0.03) * (1 + this.agit * 1.4 + this.conv * 2.5);
      const phase = ((t * spd + sd) % 1 + 1) % 1;
      const arrive = Math.exp(-Math.pow((1 - phase) * 8, 2));
      for (const m of tl.mats) {
        m.uniforms.uHover.value = tl.hover;
        m.uniforms.uGlow.value = arrive * (1 - this.conv);
        m.uniforms.uTilt.value = [tl.ty, tl.tx];
      }
      const v = new Vector3(x, y, tl.base.z).project(this.cam);
      nodesOut.push({ x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, size: s / p.wpp, glow: arrive });
    });
    const ov = new Vector3(p.orb.x, p.orb.y, 0).project(this.cam);
    // orb radius on screen (perspective)
    const camDist = this.cam.position.distanceTo(new Vector3(p.orb.x, p.orb.y, 0));
    const orbPx = (R / (2 * Math.tan((FOV * Math.PI) / 360) * camDist)) * this.h;

    // render
    const gl = this.glitch;
    if (gl > 0.02 && this.post) {
      if (!this.rt) this.rt = new WebGLRenderTarget(Math.floor(this.w * this.dpr), Math.floor(this.h * this.dpr));
      this.r.setRenderTarget(this.rt);
      this.r.render(this.scene, this.cam);
      this.r.setRenderTarget(null);
      const u = this.post.mat.uniforms;
      u.tDiffuse.value = this.rt.texture;
      u.uGlitch.value = gl;
      u.uRes.value = [this.w * this.dpr, this.h * this.dpr];
      this.r.render(this.post.scene, this.post.cam);
    } else {
      this.r.render(this.scene, this.cam);
    }
    this.o.onFrame?.({
      orb: { x: (ov.x * 0.5 + 0.5) * this.w, y: (-ov.y * 0.5 + 0.5) * this.h, r: orbPx },
      nodes: nodesOut,
      copy: ph.copy,
      flood: ph.flood,
      converge: this.conv,
    });
    if (!this.first) {
      this.first = true;
      this.o.onFirstFrame?.();
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVis);
    this.o.canvas.removeEventListener("webglcontextlost", this.onLost as EventListener);
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as ShaderMaterial | ShaderMaterial[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.post?.mat.dispose();
    this.rt?.dispose();
    this.r.dispose();
    this.r.forceContextLoss();
  }
}
