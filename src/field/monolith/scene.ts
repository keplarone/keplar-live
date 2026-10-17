import {
  NormalBlending, BufferAttribute, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, LineSegments,
  Mesh, PerspectiveCamera, PlaneGeometry, Points, Scene, ShaderMaterial, Vector3, WebGLRenderer, WebGLRenderTarget, Vector2, type Blending,
} from "three";
import {
  BEAM_FRAG, BEAM_VERT, DUST_FRAG, DUST_VERT, LOGO_FRAG, LOGO_VERT, NET_FRAG, NET_VERT,
  NODE_FRAG, NODE_VERT, POST_FRAG, POST_VERT, RIDGE_FRAG, RIDGE_VERT, ROUTE_FRAG, ROUTE_VERT, WATER_FRAG, WATER_VERT,
} from "./glsl";
import { ChapterLayer } from "./chapter-layer";
import { SPECTRAL, isChapter, type ChapterId } from "./chapters";
import { logoGeometry } from "./logo";
import { SpaceLayer } from "./space";
import { budget, clamp, glitchAt, hash, NODE_COUNT, nodePos, sample, smooth, VARIANTS, type Budget, type VariantId } from "./math";

export type MonolithFrame = { glitch: number; flash: number };

export type MonolithOptions = {
  canvas: HTMLCanvasElement;
  variant: VariantId;
  quality: "low" | "medium" | "high";
  mobile: boolean;
  /** reduced motion: draw still frames only (no loop, no glitch) */
  still: boolean;
  theme: "dark" | "light";
  /** true: paint an opaque black background (the home stage); false: transparent canvas over the page */
  opaque: boolean;
  /** Home hero: where the monolith should appear on screen (canvas CSS px). */
  getStage?: () => { cx: number; cy: number } | null;
  onFrame?: (f: MonolithFrame) => void;
  onLost?: () => void;
  onFirstFrame?: () => void;
};

/** Star colour families (SPECTRAL, from chapters.ts): hot blue, white, yellow, orange — weighted toward white/yellow like a real sky. */
export { SPECTRAL, watchChapters, CHAPTER_IDS, type ChapterId } from "./chapters";
const spectral = (h: number) => SPECTRAL[h < 0.24 ? 0 : h < 0.58 ? 1 : h < 0.8 ? 2 : 3];

const FOV = 38;
/** Height band the centrepiece occupies (the camera keys frame it); the logo is centred in it. */
const BOX_H = 3.4;
const LOGO_W = 2.5;
/* Light ink is a warm brown, not near-black, so the mark reads on the warm canvas. Dark stays a soft white. */
const INK = { dark: [0.95, 0.95, 0.95], light: [0.28, 0.16, 0.1] } as const;

export class MonolithScene {
  private r: WebGLRenderer;
  private scene = new Scene();
  private cam = new PerspectiveCamera(FOV, 1, 0.1, 400);
  private b: Budget;
  private v = VARIANTS[this.o.variant];
  private rt: WebGLRenderTarget | null = null;
  private post: { scene: Scene; cam: PerspectiveCamera; mat: ShaderMaterial; geo: PlaneGeometry; mesh: Mesh } | null = null;
  private mats: ShaderMaterial[] = [];
  private geos: BufferGeometry[] = [];
  private w = 1;
  private h = 1;
  private dpr = 1;
  private dprCap = 1;
  private raf = 0;
  private running = false;
  private visible = false;
  private disposed = false;
  private last = 0;
  private t = 0;
  private p = 0;
  private pd = 0;
  private prevPd = 0;
  private agit = 0;
  private focus = 0;
  private focusT = 0;
  private conv = 0;
  private convOn = false;
  private convRes: (() => void)[] = [];
  private ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false };
  private slow = 0;
  private fast = 0;
  private first = false;
  private calmUntil = 0;
  private lastDraw = 0;
  private theme: "dark" | "light";

  // parts
  private mono = new Group();
  private logoM!: ShaderMaterial;
  private logo!: Mesh;
  private spinA = 0;
  private chapters!: ChapterLayer;
  private chapterId: ChapterId | null = null;
  private recede = 0;
  private chap = 0;
  private water!: ShaderMaterial;
  private ridges: { mat: ShaderMaterial; mesh: Mesh }[] = [];
  private beams!: ShaderMaterial;
  private beamData: { x: number; z: number; w: number; seed: number }[] = [];
  private nodeM!: ShaderMaterial;
  private nodePts!: Points;
  private routeM!: ShaderMaterial;
  private routeMesh!: Mesh;
  private netPts!: ShaderMaterial;
  private netLines!: ShaderMaterial;
  private netGroup = new Group();
  private dust!: ShaderMaterial;
  private space!: SpaceLayer;
  private uNodes = Array.from({ length: NODE_COUNT }, () => new Vector3());
  private uBX = Array.from({ length: 8 }, () => new Vector3());
  private cube = new Vector3();

  constructor(private o: MonolithOptions) {
    this.theme = o.theme;
    this.b = budget(o.quality, o.mobile);
    this.dprCap = this.b.dpr;
    this.r = new WebGLRenderer({ canvas: o.canvas, antialias: !o.mobile, alpha: !o.opaque, powerPreference: o.mobile ? "low-power" : "high-performance" });
    if (o.opaque) this.r.setClearColor(0x0b0b0d, 1);
    else this.r.setClearColor(0x000000, 0);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    o.canvas.addEventListener("webglcontextlost", this.onLostEv as EventListener, false);
    document.addEventListener("visibilitychange", this.onVis);
    this.build();
    this.setTheme(o.theme);
    this.resize();
  }

  private onLostEv = (e: Event) => { e.preventDefault(); this.o.onLost?.(); };
  private onVis = () => this.sync();

  private mat(vert: string, frag: string, u: Record<string, { value: unknown }> = {}, extra: Partial<ConstructorParameters<typeof ShaderMaterial>[0]> = {}) {
    const m = new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uInk: { value: new Vector3(...INK.dark) }, uAlpha: { value: 1 }, uTime: { value: 0 }, uDpr: { value: 1 }, ...u }, ...extra,
    });
    this.mats.push(m);
    return m;
  }

  private build() {
    const sc = this.scene;
    const b = this.b;
    this.space = new SpaceLayer(sc, this.cam, b);
    // site chapters: a camera-locked constellation plane (the camera joins the scene graph so its children render)
    this.chapters = new ChapterLayer(this.cam, this.o.mobile, this.o.still);
    sc.add(this.cam);
    // water
    this.water = this.mat(WATER_VERT, WATER_FRAG, {
      uRipple: { value: 0.6 }, uGlow: { value: 0.6 }, uScale: { value: 1 }, uCam: { value: this.cam.position }, uCube: { value: this.cube }, uBX: { value: this.uBX },
    });
    const wg = new PlaneGeometry(300, 300, 1, 1); wg.rotateX(-Math.PI / 2);
    this.geos.push(wg);
    const water = new Mesh(wg, this.water); water.frustumCulled = false; water.renderOrder = 0; sc.add(water);

    // ridges (two layers)
    [[-46, 11, 3.1, 0.5], [-34, 7, 1.7, 1]].forEach(([z, height, seed, strength], i) => {
      const g = new PlaneGeometry(1, 1, b.ridgeSeg, 1); this.geos.push(g);
      const m = this.mat(RIDGE_VERT, RIDGE_FRAG, { uSeed: { value: seed }, uHeight: { value: height }, uBase: { value: -0.5 + i * 0.3 }, uZ: { value: z }, uRidge: { value: strength } });
      const mesh = new Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1 + i; sc.add(mesh);
      this.ridges.push({ mat: m, mesh });
    });

    // beams
    const n = b.beams;
    const pos: number[] = [], seed: number[] = [], pdat: number[] = [], idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n;
      let x = (hash(i * 3 + 1) - 0.5) * 34; if (Math.abs(x) < 2.4) x += Math.sign(x || 1) * 2.8;
      const z = -3 - hash(i * 7 + 2) * 15, wdt = 0.07 + hash(i * 5 + 3) * 0.22;
      this.beamData.push({ x, z, w: wdt, seed: s });
      const o = i * 4;
      pos.push(-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0);
      for (let k = 0; k < 4; k++) { seed.push(s); pdat.push(x, z, wdt); }
      idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
    }
    const bg = new BufferGeometry();
    bg.setAttribute("position", new Float32BufferAttribute(pos, 3));
    bg.setAttribute("aSeed", new Float32BufferAttribute(seed, 1));
    bg.setAttribute("aPos", new Float32BufferAttribute(pdat, 3));
    bg.setIndex(idx); this.geos.push(bg);
    this.beams = this.mat(BEAM_VERT, BEAM_FRAG, { uH: { value: 16 }, uBeams: { value: 0.5 } }, { side: DoubleSide });
    const beams = new Mesh(bg, this.beams); beams.frustumCulled = false; beams.renderOrder = 3; sc.add(beams);

    // net (cloud points + lines to the two nearest)
    const cn = b.cloud;
    const cp: number[] = [];
    for (let i = 0; i < cn; i++) {
      const a = hash(i * 11 + 5) * Math.PI * 2, rr = 6 + hash(i * 13 + 7) * 5.5, y = 0.8 + hash(i * 17 + 9) * 6.5;
      cp.push(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.8 - 1);
    }
    const lp: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < cn; i++) {
      const d = [] as [number, number][];
      for (let j = 0; j < cn; j++) if (j !== i) d.push([(cp[i * 3] - cp[j * 3]) ** 2 + (cp[i * 3 + 1] - cp[j * 3 + 1]) ** 2 + (cp[i * 3 + 2] - cp[j * 3 + 2]) ** 2, j]);
      d.sort((x, y) => x[0] - y[0]);
      for (const [, j] of d.slice(0, 2)) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lp.push(cp[i * 3], cp[i * 3 + 1], cp[i * 3 + 2], cp[j * 3], cp[j * 3 + 1], cp[j * 3 + 2]);
      }
    }
    // constellation star colours: four spectral families (hot, white, yellow, orange); lines take their endpoints' colours
    const pc: number[] = [];
    for (let i = 0; i < cn; i++) { const c = spectral(hash(i * 19 + 3)); pc.push(c[0], c[1], c[2]); }
    const lc: number[] = [];
    for (let q = 0; q < lp.length; q += 3) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < cn; i++) { const d = (cp[i * 3] - lp[q]) ** 2 + (cp[i * 3 + 1] - lp[q + 1]) ** 2 + (cp[i * 3 + 2] - lp[q + 2]) ** 2; if (d < bd) { bd = d; best = i; } }
      lc.push(pc[best * 3], pc[best * 3 + 1], pc[best * 3 + 2]);
    }
    const pg = new BufferGeometry(); pg.setAttribute("position", new Float32BufferAttribute(cp, 3)); pg.setAttribute("aCol", new Float32BufferAttribute(pc, 3));
    const lg = new BufferGeometry(); lg.setAttribute("position", new Float32BufferAttribute(lp, 3)); lg.setAttribute("aCol", new Float32BufferAttribute(lc, 3));
    this.geos.push(pg, lg);
    const nu = { uNet: { value: 0.3 }, uPoint: { value: 11 }, uLine: { value: 0 }, uChroma: { value: 1 } };
    this.netPts = this.mat(NET_VERT, NET_FRAG, { ...nu });
    this.netLines = this.mat(NET_VERT, NET_FRAG, { ...nu, uLine: { value: 1 } });
    const np = new Points(pg, this.netPts), nl = new LineSegments(lg, this.netLines);
    np.frustumCulled = false; nl.frustumCulled = false;
    this.netGroup.add(nl, np); this.netGroup.renderOrder = 4; sc.add(this.netGroup);

    // dust
    const dn = b.dust;
    const ds: number[] = [], dz: number[] = [];
    for (let i = 0; i < dn; i++) { ds.push(hash(i * 3 + 11), hash(i * 5 + 13), hash(i * 7 + 17), hash(i * 11 + 19)); dz.push(0, 0, 0); }
    const dg = new BufferGeometry();
    dg.setAttribute("position", new Float32BufferAttribute(dz, 3));
    dg.setAttribute("aSeed", new Float32BufferAttribute(ds, 4)); this.geos.push(dg);
    this.dust = this.mat(DUST_VERT, DUST_FRAG);
    const dust = new Points(dg, this.dust); dust.frustumCulled = false; dust.renderOrder = 5; sc.add(dust);

    // centrepiece: the real Keplar mark, extruded and bevelled, one draw call, brushed silver (opaque, depth-tested)
    const lg2 = logoGeometry(LOGO_W, this.o.mobile || this.o.quality === "low" ? "low" : "high"); this.geos.push(lg2);
    this.logoM = new ShaderMaterial({
      vertexShader: LOGO_VERT, fragmentShader: LOGO_FRAG, transparent: true, blending: NormalBlending, depthTest: true, depthWrite: true,
      uniforms: { uInk: { value: new Vector3(...INK.dark) }, uAlpha: { value: 1 }, uTime: { value: 0 }, uGlow: { value: 0.6 }, uConv: { value: 0 }, uDark: { value: 1 } },
    });
    this.logo = new Mesh(lg2, this.logoM); this.logo.renderOrder = 9;
    this.mono.add(this.logo);
    sc.add(this.mono);

    // model nodes + light ribbons into the monolith
    const ng = new BufferGeometry(); ng.setAttribute("position", new BufferAttribute(new Float32Array(NODE_COUNT * 3), 3)); this.geos.push(ng);
    this.nodeM = this.mat(NODE_VERT, NODE_FRAG, { uSize: { value: 30 }, uOn: { value: 0 } });
    this.nodePts = new Points(ng, this.nodeM); this.nodePts.frustumCulled = false; this.nodePts.renderOrder = 10; sc.add(this.nodePts);
    const SEG = 44;
    const rp: number[] = [], rt: number[] = [], rs: number[] = [], ri: number[] = [], rix: number[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = 0; j <= SEG; j++) {
        const t = j / SEG;
        for (const s of [-1, 1]) { rp.push(0, 0, 0); rt.push(t); rs.push(s); ri.push(i); }
        if (j < SEG) { const o = (i * (SEG + 1) + j) * 2; rix.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
      }
    }
    const rg = new BufferGeometry();
    rg.setAttribute("position", new Float32BufferAttribute(rp, 3));
    rg.setAttribute("aT", new Float32BufferAttribute(rt, 1));
    rg.setAttribute("aS", new Float32BufferAttribute(rs, 1));
    rg.setAttribute("aI", new Float32BufferAttribute(ri, 1));
    rg.setIndex(rix); this.geos.push(rg);
    this.routeM = this.mat(ROUTE_VERT, ROUTE_FRAG, { uNodes: { value: this.uNodes }, uC: { value: this.cube }, uAspect: { value: 1 }, uWidth: { value: 0.0045 }, uRoutes: { value: 0 }, uFlash: { value: 0 } }, { side: DoubleSide });
    this.routeMesh = new Mesh(rg, this.routeM); this.routeMesh.frustumCulled = false; this.routeMesh.renderOrder = 11; sc.add(this.routeMesh);

    // post
    if (b.post) {
      const geo = new PlaneGeometry(2, 2);
      const mat = new ShaderMaterial({
        vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
        uniforms: { tDiffuse: { value: null }, uGlitch: { value: 0 }, uTime: { value: 0 }, uCA: { value: 0.0015 }, uRes: { value: new Vector2(1, 1) } },
      });
      const ps = new Scene(); const mesh = new Mesh(geo, mat); mesh.frustumCulled = false; ps.add(mesh);
      this.post = { scene: ps, cam: new PerspectiveCamera(), mat, geo, mesh };
    }
  }

  setTheme(t: "dark" | "light") {
    this.theme = t;
    const ink = INK[t];
    const blending: Blending = t === "dark" ? NormalBlending : NormalBlending;
    for (const m of this.mats) {
      (m.uniforms.uInk.value as Vector3).set(ink[0], ink[1], ink[2]);
      m.blending = blending;
      m.needsUpdate = true;
    }
    this.logoM.uniforms.uDark.value = t === "dark" ? 1 : 0;
    this.chapters.setTheme(t === "dark");
    for (const m of [this.netPts, this.netLines]) m.uniforms.uChroma.value = 1;
    if (this.o.opaque) this.r.setClearColor(0x0b0b0d, 1);
    this.space.setInk(ink, t === "dark", t === "light");
    this.draw(0);
  }

  setProgress(p: number) { this.p = clamp(p); if (this.o.still) { this.pd = this.p; this.draw(0); } }
  /**
   * Show a site chapter's constellation (see CHAPTERS.md). `null` returns to the hero story.
   * `progress` (0..1) is the visitor's position through that section; omit it and the chapter plays on a clock.
   */
  setChapter(id: ChapterId | null, progress: number | null = null) {
    const next = isChapter(id) ? id : null;
    const changed = next !== this.chapterId;
    this.chapterId = next;
    this.chapters.set(next, typeof progress === "number" && Number.isFinite(progress) ? clamp(progress) : null);
    // reduced motion: each chapter is one still frame, so only redraw when the chapter itself changes (not on every scroll step)
    if (this.o.still && changed) this.draw(0);
  }
  /** The chapter currently requested (null = hero story). */
  get chapter(): ChapterId | null { return this.chapterId; }
  setPointer(x: number, y: number, on: boolean) { this.ptr.tx = x; this.ptr.ty = y; this.ptr.on = on; }
  agitate(a: number) { this.agit = Math.min(1.5, this.agit + a); this.typing(); }
  /** The visitor is typing: for ~1.4 s draw at 20 fps with the heavy space parts off, so keystrokes never wait on the GPU. */
  typing() { this.calmUntil = performance.now() + 1400; }
  setFocus(on: boolean) { this.focusT = on ? 1 : 0; }
  setVisible(v: boolean) { this.visible = v; this.sync(); }
  start() { this.running = true; this.sync(); }
  /** Pull the nodes into the monolith and flash; resolves when the question has landed. */
  converge(): Promise<void> {
    if (this.o.still) return Promise.resolve();
    this.convOn = true;
    return new Promise((res) => { this.convRes.push(res); });
  }

  resize() {
    const c = this.o.canvas;
    this.w = Math.max(2, c.clientWidth); this.h = Math.max(2, c.clientHeight);
    this.applySize();
    this.draw(0);
  }

  private applySize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.r.setPixelRatio(1);
    const W = Math.floor(this.w * this.dpr), H = Math.floor(this.h * this.dpr);
    this.r.setSize(W, H, false);
    this.cam.aspect = this.w / this.h;
    this.cam.updateProjectionMatrix();
    if (this.rt) { this.rt.dispose(); this.rt = null; }
    for (const m of this.mats) if (m.uniforms.uDpr) m.uniforms.uDpr.value = this.dpr;
    this.space?.setDpr(this.dpr);
    this.chapters?.resize(this.h, this.dpr);
  }

  private sync() {
    const go = this.running && this.visible && !document.hidden && !this.disposed && !this.o.still;
    if (go && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
    else if (!go && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    if (now < this.calmUntil && now - this.lastDraw < 48) {
      if (this.running && this.visible && !document.hidden && !this.disposed) this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.lastDraw = now;
    this.draw(dt);
    // adaptive resolution: back off when frames are slow, creep back when there is headroom
    if (dt > 0.024) { this.slow++; this.fast = 0; } else if (dt < 0.0145) { this.fast++; this.slow = Math.max(0, this.slow - 1); }
    if (this.slow > 30 && this.dprCap > 0.8) { this.dprCap = Math.max(0.8, this.dprCap - 0.15); this.slow = 0; this.applySize(); }
    else if (this.fast > 240 && this.dprCap < this.b.dpr) { this.dprCap = Math.min(this.b.dpr, this.dprCap + 0.1); this.fast = 0; this.applySize(); }
    if (this.running && this.visible && !document.hidden && !this.disposed) this.raf = requestAnimationFrame(this.loop);
  };

  private draw(dt: number) {
    if (this.disposed) return;
    const v = this.v;
    this.t += dt;
    const t = this.t;
    // damped scroll: the page scrolls normally, the camera follows a touch behind
    this.prevPd = this.pd;
    if (dt > 0) this.pd += (this.p - this.pd) * (1 - Math.exp(-dt * 4.8));
    this.agit *= Math.exp(-dt * 1.8);
    this.focus += (this.focusT - this.focus) * (1 - Math.exp(-dt * 4));
    this.ptr.x += ((this.ptr.on ? this.ptr.tx : 0) - this.ptr.x) * (1 - Math.exp(-dt * 4.2));
    this.ptr.y += ((this.ptr.on ? this.ptr.ty : 0) - this.ptr.y) * (1 - Math.exp(-dt * 4.2));
    let flash = 0;
    if (this.convOn) {
      this.conv = Math.min(1, this.conv + dt / 1.25);
      flash = Math.exp(-Math.pow((this.conv - 0.85) / 0.12, 2));
      if (this.conv >= 0.92 && this.convRes.length) { const rs = this.convRes; this.convRes = []; rs.forEach((f) => f()); }
    }
    const key = sample(v.keys, this.pd);
    const k = key;
    // site chapters: ease the camera back to a calm wide frame, quiet the story parts, and (beyond Ask) let the logo recede
    const cT = this.chapterId ? 1 : 0, rT = this.chapterId && this.chapterId !== "ask" ? 1 : 0;
    const ce = this.o.still ? 1 : 1 - Math.exp(-dt * 2.6);
    this.chap += (cT - this.chap) * ce; this.recede += (rT - this.recede) * ce;
    if (this.chap > 0.001) {
      const c = this.chap, CAM = [0, 2.7, 14.5], LOOK = [0, 2.3, 0];
      for (let i = 0; i < 3; i++) { k.cam[i] += (CAM[i] - k.cam[i]) * c; k.look[i] += (LOOK[i] - k.look[i]) * c; }
      k.s += (1 - k.s) * c;
      k.planet *= 1 - 0.4 * c; k.warp *= 1 - c; k.ridge *= 1 - c;
      // clear deep space behind the chapter copy: the haze layers fall back so the constellations read crisply
      k.neb *= 1 - 0.65 * c; k.mist *= 1 - c; k.aurora *= 1 - c; k.rings *= 1 - 0.7 * c; k.beams *= 1 - 0.6 * c; k.routes *= 1 - c; k.nodes *= 1 - c; k.scan *= 1 - c;
    }
    const drift = v.drift;
    // camera
    const sway = this.o.still ? 0 : 1;
    this.cam.position.set(
      k.cam[0] + Math.sin(t * 0.17) * 0.35 * drift * sway + this.ptr.x * 0.95,
      k.cam[1] + Math.sin(t * 0.13) * 0.16 * sway + this.ptr.y * 0.45,
      k.cam[2] + this.conv * -2.2 + this.focus * -0.8,
    );
    this.cam.lookAt(k.look[0] + this.ptr.x * 0.15, k.look[1] + this.ptr.y * 0.1, k.look[2]);
    const st = this.o.getStage?.();
    if (st && v.id === "home") {
      // the hero aligns the logo with its stage element; in a site chapter the stage is far off screen, so the frame recentres
      const hw = (1 - smooth(0.0, 0.07, this.pd)) * (1 - this.chap);
      this.cam.setViewOffset(this.w, this.h, (this.w / 2 - st.cx) * hw, (this.h / 2 - st.cy) * hw, this.w, this.h);
    } else if (this.cam.view?.enabled) this.cam.clearViewOffset();
    this.cam.updateMatrixWorld();

    // monolith
    const s = k.s * (1 + this.conv * 0.12) * (1 - (this.o.mobile ? 0.5 : 0.32) * this.recede);
    this.mono.scale.setScalar(s);
    this.mono.position.set(0, 0.28 + (BOX_H / 2 + 0.3) * s, 0);
    // the mark turns on its Y axis with a gentle ease (speed breathes), leans toward the pointer; still mode holds a 3/4 view
    if (!this.o.still) this.spinA += dt * (0.42 + 0.22 * Math.sin(t * 0.37));
    this.mono.rotation.set(-this.ptr.y * 0.16 + Math.sin(t * 0.29) * 0.035, k.rot * 0.5 + this.spinA + this.ptr.x * 0.35 + (this.o.still ? -0.5 : 0), this.ptr.x * -0.05);
    this.cube.set(0, this.mono.position.y, 0);
    const glow = clamp(k.glow + this.agit * 0.4 + this.focus * 0.25 + this.conv * 0.8, 0, 1.6);
    this.logoM.uniforms.uGlow.value = glow; this.logoM.uniforms.uConv.value = this.conv; this.logoM.uniforms.uTime.value = t;

    // water + ridges + beams (in site chapters the ground falls away and the scene is space only)
    this.water.uniforms.uAlpha.value = 1 - this.chap;
    for (const r of this.ridges) r.mat.uniforms.uAlpha.value = 1 - this.chap;
    this.water.uniforms.uRipple.value = k.ripple * (1 + this.agit * 0.6);
    this.water.uniforms.uGlow.value = 0.35 + glow * 0.65;
    this.water.uniforms.uScale.value = s;
    this.beams.uniforms.uBeams.value = k.beams * (1 + this.conv * 0.3);
    for (let i = 0; i < 8; i++) {
      const bd = this.beamData[i * Math.max(1, Math.floor(this.beamData.length / 8))];
      if (!bd) { this.uBX[i].set(0, 0, 0); continue; }
      const on = bd.seed <= k.beams ? (0.25 + 0.55 * bd.seed) * (0.7 + 0.3 * Math.sin(t * (0.4 + bd.seed) + bd.seed * 40)) : 0;
      this.uBX[i].set(bd.x, bd.z, on);
    }
    this.ridges.forEach((r, i) => { r.mat.uniforms.uRidge.value = k.ridge * (i === 0 ? 0.5 : 1); });

    // nodes + routes + net
    for (let i = 0; i < NODE_COUNT; i++) {
      const p = nodePos(i, k.agree, this.conv, t);
      this.uNodes[i].set(p[0], p[1], p[2]);
    }
    const pa = this.nodePts.geometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < NODE_COUNT; i++) pa.setXYZ(i, this.uNodes[i].x, this.uNodes[i].y, this.uNodes[i].z);
    pa.needsUpdate = true;
    this.nodeM.uniforms.uOn.value = k.nodes * (1 - this.conv * 0.7);
    this.routeM.uniforms.uRoutes.value = k.routes * (1 + this.conv * 0.4);
    this.routeM.uniforms.uFlash.value = flash;
    this.routeM.uniforms.uAspect.value = this.cam.aspect;
    this.chapters.update(dt, t, this.cube);
    const net = k.net * (1 - 0.6 * this.chapters.presence);
    this.netPts.uniforms.uNet.value = net; this.netLines.uniforms.uNet.value = net;

    // time uniforms
    for (const m of this.mats) m.uniforms.uTime.value = t;
    const svel = dt > 0 ? Math.abs(this.pd - this.prevPd) / dt : 0;
    this.space.update(k, t, dt, this.ptr, this.o.still ? 0 : svel, this.agit, this.cube, this.cam.aspect, performance.now() < this.calmUntil, this.pd * 6);

    // glitch: a short cut at each scene swap and a flash on submit; never from scroll speed alone (that fired at random mid-scroll)
    const gl = this.o.still ? 0 : Math.max(glitchAt(v.swaps, this.pd), flash * 0.9);
    this.o.onFrame?.({ glitch: gl, flash });

    if (gl > 0.02 && this.post && !this.o.still) {
      // multisampled like the canvas, so the logo keeps its smooth edges through a cut instead of turning jagged
      if (!this.rt) this.rt = new WebGLRenderTarget(Math.floor(this.w * this.dpr), Math.floor(this.h * this.dpr), { samples: this.o.mobile ? 0 : 4 });
      this.r.setRenderTarget(this.rt);
      this.r.clear();
      this.r.render(this.scene, this.cam);
      this.r.setRenderTarget(null);
      const u = this.post.mat.uniforms;
      u.tDiffuse.value = this.rt.texture; u.uGlitch.value = gl; u.uTime.value = t;
      u.uRes.value.set(this.w * this.dpr, this.h * this.dpr);
      this.r.render(this.post.scene, this.post.cam);
    } else {
      this.r.setRenderTarget(null);
      this.r.render(this.scene, this.cam);
    }
    if (!this.first) { this.first = true; this.space.warm(this.r); this.o.onFirstFrame?.(); }
  }

  /** QA: draw one frame now and return it as a PNG data URL. */
  debugShot(frames = 1): string { for (let i = 0; i < Math.max(1, Math.min(600, frames)); i++) this.draw(0.016); return this.o.canvas.toDataURL("image/png"); }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener("visibilitychange", this.onVis);
    this.o.canvas.removeEventListener("webglcontextlost", this.onLostEv as EventListener);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.logoM.dispose();
    this.chapters.dispose();
    this.space.dispose();
    this.post?.mat.dispose(); this.post?.geo.dispose();
    this.rt?.dispose();
    this.r.dispose();
    this.r.forceContextLoss();
    this.convRes.forEach((f) => f());
    this.convRes = [];
  }
}
