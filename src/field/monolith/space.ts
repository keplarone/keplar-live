import {
  NormalBlending, BackSide, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, LineSegments, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, Points, Quaternion, RingGeometry, ShaderMaterial, Vector2, Vector3, Vector4, type Blending, type Object3D, type Scene, type WebGLRenderer,
} from "three";
import {
  ATMO_FRAG, ATMO_VERT, AUR_FRAG, AUR_VERT, GAL_FRAG, GAL_VERT, MIST_FRAG, MIST_VERT, NEB_FRAG, NEB_VERT, PATH_FRAG, PATH_VERT, PLANET_FRAG, PLANET_VERT,
  RING_FRAG, RING_VERT, SATRING_FRAG, SATRING_VERT, SPARK_FRAG, SPARK_VERT, STAR_FRAG, STAR_VERT, SUN_FRAG, SUN_VERT, WARP_FRAG, WARP_VERT,
} from "./space-glsl";
import { clamp, hash, type Budget, type Key } from "./math";
import { PATHS, SPARK_END, storyAt, type StoryState } from "./story";

type Uni = Record<string, { value: unknown }>;
type PDef = {
  name: string; type: number; x: number; y: number; z: number; r: number;
  color: [number, number, number]; land: [number, number, number]; atmo: [number, number, number];
  seed: number; spin: number; tilt: number; orbit: number; phase: number;
  ring?: { inner: number; outer: number; color: [number, number, number]; tilt: [number, number, number] };
};

/** Eight solar-system worlds. Relative scales are artistic (true Jupiter would dwarf the frame); positions fan behind the monolith. */
const SOLAR: PDef[] = [
  { name: "mercury", type: 0, x: -14, y: 5.5, z: -36, r: 1.15, color: [0.72, 0.70, 0.66], land: [0.48, 0.45, 0.42], atmo: [0.55, 0.52, 0.48], seed: 1.1, spin: 0.028, tilt: 0.05, orbit: 0.018, phase: 0.4 },
  { name: "venus",   type: 1, x: 18,  y: 9.0, z: -44, r: 1.9,  color: [0.92, 0.78, 0.42], land: [0.78, 0.62, 0.28], atmo: [0.95, 0.88, 0.55], seed: 2.3, spin: -0.012, tilt: 0.05, orbit: 0.014, phase: 1.2 },
  { name: "earth",   type: 2, x: -28, y: 8.0, z: -52, r: 2.15, color: [0.12, 0.32, 0.78], land: [0.22, 0.55, 0.22], atmo: [0.45, 0.72, 1.0],  seed: 3.7, spin: 0.022, tilt: 0.41, orbit: 0.011, phase: 2.1 },
  { name: "mars",    type: 3, x: 12,  y: 3.2, z: -34, r: 1.45, color: [0.86, 0.34, 0.18], land: [0.55, 0.24, 0.14], atmo: [0.9, 0.55, 0.35],   seed: 4.2, spin: 0.02, tilt: 0.44, orbit: 0.016, phase: 3.0 },
  { name: "jupiter", type: 4, x: -24, y: 14,  z: -68, r: 7.2,  color: [0.88, 0.68, 0.42], land: [0.62, 0.38, 0.2],  atmo: [0.95, 0.82, 0.6],  seed: 5.5, spin: 0.04, tilt: 0.05, orbit: 0.007, phase: 4.1 },
  { name: "saturn",  type: 5, x: 32,  y: 11,  z: -60, r: 5.8,  color: [0.92, 0.80, 0.52], land: [0.72, 0.58, 0.34], atmo: [0.95, 0.88, 0.65], seed: 6.1, spin: 0.035, tilt: 0.47, orbit: 0.006, phase: 5.0,
    ring: { inner: 1.22, outer: 2.32, color: [0.95, 0.86, 0.62], tilt: [1.25, 0.25, 0.2] } },
  { name: "uranus",  type: 6, x: -38, y: 16,  z: -78, r: 3.1,  color: [0.48, 0.86, 0.88], land: [0.32, 0.68, 0.74], atmo: [0.65, 0.95, 0.98], seed: 7.4, spin: -0.018, tilt: 1.71, orbit: 0.005, phase: 0.8 },
  { name: "neptune", type: 7, x: 40,  y: 6.5, z: -72, r: 2.95, color: [0.22, 0.38, 0.92], land: [0.12, 0.24, 0.68], atmo: [0.35, 0.55, 1.0],  seed: 8.8, spin: 0.024, tilt: 0.49, orbit: 0.0045, phase: 2.6 },
];

/**
 * Space layer: nebula, parallax stars, warp, galaxy, eight chromatic planets (physically-inspired shading), a warm sun, orbit rings,
 * aurora, mist — plus the scroll-driven story (question spark, light paths to each mind, diverge / verify / converge near Earth).
 * UI chrome stays flat B/W; only planets and a faint planet-tint on the path tips carry color. Each part draws only while its weight
 * is above zero, so unused pages pay nothing.
 */
export class SpaceLayer {
  readonly mats: ShaderMaterial[] = [];
  private geos: BufferGeometry[] = [];
  private nebM: ShaderMaterial;
  private nebMesh: Mesh;
  private starM: ShaderMaterial;
  private starPts: Points;
  private warpM: ShaderMaterial;
  private warpLines: LineSegments;
  private galM: ShaderMaterial;
  private galPts: Points;
  private planetBodyM: ShaderMaterial[] = [];
  private planetAtmoM: ShaderMaterial[] = [];
  private planetRingM: ShaderMaterial[] = [];
  private planets: { name: string; group: Group; body: Mesh; atmo: Mesh; ring: Mesh | null; base: Vector3; r: number; spin: number; orbit: number; phase: number; type: number }[] = [];
  private byName = new Map<string, (typeof this.planets)[0]>();
  private ringM: ShaderMaterial[] = [];
  private ringMesh: Mesh[] = [];
  private ringGroup = new Group();
  private aurM: ShaderMaterial[] = [];
  private aurMesh: Mesh[] = [];
  private mistM: ShaderMaterial;
  private mistMesh: Mesh;
  private sunM: ShaderMaterial;
  private sunMesh: Mesh;
  private sparkM: ShaderMaterial;
  private sparkPts: Points;
  private pathM: ShaderMaterial;
  private pathMesh: Mesh;
  private pathA: Vector3[] = [];
  private pathB: Vector3[] = [];
  private pathC: Vector3[] = [];
  private sunPos = new Vector3(-95, 48, 70);
  private sunDir = new Vector3();
  private ringN = new Vector3(0, 1, 0);
  private qTmp = new Quaternion();
  private tmp = new Vector3();
  private earthAns = new Vector3();
  private sparkPos = new Vector3();
  private pathOrigin = new Vector3();
  private focus = 0;
  private focusIdx = -1;
  private warpAcc = 0;
  private scrollAcc = 0;
  private spin = 0;
  private chromatic = new Set<ShaderMaterial>();
  private lastStory: StoryState | null = null;

  constructor(private scene: Scene, private cam: PerspectiveCamera, private b: Budget) {
    const mat = (vert: string, frag: string, u: Uni = {}, extra: Partial<ConstructorParameters<typeof ShaderMaterial>[0]> = {}, chroma = false) => {
      const m = new ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
        uniforms: { uInk: { value: new Vector3(0.95, 0.95, 0.95) }, uAlpha: { value: 1 }, uTime: { value: 0 }, uDpr: { value: 1 }, ...u }, ...extra,
      });
      this.mats.push(m);
      if (chroma) this.chromatic.add(m);
      return m;
    };
    const add = (o: Object3D, order: number) => { o.renderOrder = order; (o as Mesh).frustumCulled = false; this.scene.add(o); return o; };

    // nebula
    const ng = new PlaneGeometry(2, 2); this.geos.push(ng);
    this.nebM = mat(NEB_VERT, NEB_FRAG, { uCamWorld: { value: new Matrix4() }, uTanY: { value: 1 }, uAspect: { value: 1 }, uNeb: { value: 0.6 }, uOct: { value: b.oct }, uScroll: { value: 0 }, uPtr: { value: new Vector2() }, uAgit: { value: 0 }, uHole: { value: new Vector2() } });
    this.nebMesh = add(new Mesh(ng, this.nebM), -3) as Mesh;

    // stars
    const sp: number[] = [], ss: number[] = [];
    for (let i = 0; i < b.stars; i++) { sp.push(0, 0, 0); ss.push(hash(i * 3 + 1), hash(i * 5 + 2), hash(i * 7 + 3), hash(i * 11 + 4)); }
    const sg = new BufferGeometry(); sg.setAttribute("position", new Float32BufferAttribute(sp, 3)); sg.setAttribute("aSeed", new Float32BufferAttribute(ss, 4)); this.geos.push(sg);
    this.starM = mat(STAR_VERT, STAR_FRAG, { uStars: { value: 0.9 }, uWarp: { value: 0 }, uPtr: { value: new Vector2() }, uChroma: { value: 1 } });
    this.starPts = add(new Points(sg, this.starM), -2) as Points;

    // warp
    const wn = b.streaks, wp: number[] = [], ws: number[] = [], we: number[] = [];
    for (let i = 0; i < wn; i++) { for (let e = 0; e < 2; e++) { wp.push(0, 0, 0); ws.push(hash(i * 3 + 21), hash(i * 5 + 22), hash(i * 7 + 23), hash(i * 11 + 24)); we.push(e); } }
    const wg = new BufferGeometry(); wg.setAttribute("position", new Float32BufferAttribute(wp, 3)); wg.setAttribute("aSeed", new Float32BufferAttribute(ws, 4)); wg.setAttribute("aEnd", new Float32BufferAttribute(we, 1)); this.geos.push(wg);
    this.warpM = mat(WARP_VERT, WARP_FRAG, { uWarp: { value: 0 }, uSpeed: { value: 0 } });
    this.warpLines = add(new LineSegments(wg, this.warpM), -1) as LineSegments;

    // galaxy
    const gn = b.galaxy, gp: number[] = [], gs: number[] = [];
    for (let i = 0; i < gn; i++) { gp.push(0, 0, 0); gs.push(hash(i * 3 + 31), hash(i * 5 + 32), hash(i * 7 + 33), hash(i * 11 + 34)); }
    const gg = new BufferGeometry(); gg.setAttribute("position", new Float32BufferAttribute(gp, 3)); gg.setAttribute("aSeed", new Float32BufferAttribute(gs, 4)); this.geos.push(gg);
    this.galM = mat(GAL_VERT, GAL_FRAG, { uGal: { value: 0 }, uRad: { value: 1 }, uChroma: { value: 1 } });
    this.galPts = add(new Points(gg, this.galM), -2) as Points;
    this.galPts.position.set(-9, 17, -84); this.galPts.rotation.set(1.05, 0.25, 0.3); this.galPts.scale.setScalar(36);

    // sun (a small disc, off frame)
    const sug = new PlaneGeometry(2, 2); this.geos.push(sug);
    this.sunM = mat(SUN_VERT, SUN_FRAG, { uSun: { value: this.sunPos }, uSize: { value: 22 }, uSunOn: { value: 0.55 } }, {}, true);
    this.sunMesh = add(new Mesh(sug, this.sunM), -2.5) as Mesh;

    // planets
    const pgeo = new IcosahedronGeometry(1, b.planetDetail); this.geos.push(pgeo);
    for (const p of SOLAR) {
      const bodyM = mat(PLANET_VERT, PLANET_FRAG, {
        uPlanet: { value: 0 }, uColor: { value: new Vector3(...p.color) }, uLand: { value: new Vector3(...p.land) }, uAtmo: { value: new Vector3(...p.atmo) },
        uSunDir: { value: new Vector3() }, uCenter: { value: new Vector3() }, uRingN: { value: this.ringN.clone() },
        uSeed: { value: p.seed }, uType: { value: p.type }, uOct: { value: b.planetOct }, uFocus: { value: 0 }, uFx: { value: b.planetFx },
        uRadius: { value: p.r }, uRing: { value: p.ring ? 1 : 0 },
      }, { depthTest: true, depthWrite: true, blending: NormalBlending }, true);
      const atmoM = mat(ATMO_VERT, ATMO_FRAG, {
        uPlanet: { value: 0 }, uAtmo: { value: new Vector3(...p.atmo) }, uSunDir: { value: new Vector3() }, uShell: { value: 1.14 },
      }, { side: BackSide, depthTest: true, depthWrite: false, blending: NormalBlending }, true);
      this.planetBodyM.push(bodyM); this.planetAtmoM.push(atmoM);
      const group = new Group();
      const body = new Mesh(pgeo, bodyM); body.renderOrder = 0;
      const atmo = new Mesh(pgeo, atmoM); atmo.scale.setScalar(1.14); atmo.renderOrder = 1;
      group.add(body, atmo);
      body.rotation.z = p.tilt;
      let rm: Mesh | null = null;
      if (p.ring) {
        const rg = new RingGeometry(p.ring.inner, p.ring.outer, b.planetDetail >= 5 ? 192 : 96, 1); this.geos.push(rg);
        const m = mat(SATRING_VERT, SATRING_FRAG, {
          uColor: { value: new Vector3(...p.ring.color) }, uSunDir: { value: new Vector3() }, uCenter: { value: new Vector3() },
          uRingN: { value: this.ringN.clone() }, uRadius: { value: 1 }, uRings: { value: 0 },
        }, { side: DoubleSide, depthTest: true, depthWrite: false, blending: NormalBlending }, true);
        this.planetRingM.push(m);
        rm = new Mesh(rg, m); rm.rotation.set(...p.ring.tilt); rm.renderOrder = 2; group.add(rm);
      }
      group.position.set(p.x, p.y, p.z); group.scale.setScalar(p.r);
      group.renderOrder = -1; this.scene.add(group);
      const entry = { name: p.name, group, body, atmo, ring: rm, base: group.position.clone(), r: p.r, spin: p.spin, orbit: p.orbit, phase: p.phase, type: p.type };
      this.planets.push(entry); this.byName.set(p.name, entry);
    }

    // story light paths (6 intelligences → planets)
    const SEG = b.pathSeg;
    const pp: number[] = [], pt: number[] = [], ps: number[] = [], pi: number[] = [], pix: number[] = [];
    for (let i = 0; i < PATHS.length; i++) {
      for (let j = 0; j <= SEG; j++) {
        const t = j / SEG;
        for (const s of [-1, 1]) { pp.push(0, 0, 0); pt.push(t); ps.push(s); pi.push(i); }
        if (j < SEG) { const o = (i * (SEG + 1) + j) * 2; pix.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
      }
    }
    const pathG = new BufferGeometry();
    pathG.setAttribute("position", new Float32BufferAttribute(pp, 3));
    pathG.setAttribute("aT", new Float32BufferAttribute(pt, 1));
    pathG.setAttribute("aS", new Float32BufferAttribute(ps, 1));
    pathG.setAttribute("aI", new Float32BufferAttribute(pi, 1));
    pathG.setIndex(pix); this.geos.push(pathG);
    this.pathA = PATHS.map(() => new Vector3());
    this.pathB = PATHS.map(() => new Vector3());
    this.pathC = PATHS.map(() => new Vector3());
    const pathHues = PATHS.map((pr) => {
      const pl = SOLAR.find((x) => x.name === pr.planet)!;
      return new Vector3(...pl.color);
    });
    // uP as Vector4-like via four floats packed — Three.js ShaderMaterial wants Vector4; use plain objects with x,y,z,w
    const pathP = PATHS.map(() => new Vector4(0, 0, 0, 0));
    this.pathM = mat(PATH_VERT, PATH_FRAG, {
      uA: { value: this.pathA }, uB: { value: this.pathB }, uC: { value: this.pathC }, uP: { value: pathP },
      uHue: { value: pathHues }, uAspect: { value: 1 }, uWidth: { value: 0.004 }, uFlow: { value: 0 }, uScan: { value: 0 }, uPathOn: { value: 0 },
    }, { side: DoubleSide, blending: NormalBlending, depthTest: false });
    this.pathMesh = add(new Mesh(pathG, this.pathM), 5) as Mesh;

    // spark (question) + answer point
    const spkG = new BufferGeometry();
    spkG.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    spkG.setAttribute("aI", new Float32BufferAttribute([0, 1], 1)); this.geos.push(spkG);
    this.sparkM = mat(SPARK_VERT, SPARK_FRAG, {
      uS: { value: new Vector4(0, 0, 0, 0) },
      uQ: { value: new Vector4(0, 0, 0, 0) },
      uSize: { value: 18 },
    }, { blending: NormalBlending, depthTest: false });
    this.sparkPts = add(new Points(spkG, this.sparkM), 12) as Points;

    // orbit rings around the monolith
    [[3.4, 3.65, 1.1, 0.2, 0.0, 0.7], [4.6, 4.8, 1.9, -0.35, 1.7, -0.5], [6.1, 6.3, 0.5, 0.6, 3.1, 0.35]].forEach(([i, o, rx, rz, seed, spin]) => {
      const rg = new RingGeometry(i, o, 192, 1); this.geos.push(rg);
      const m = mat(RING_VERT, RING_FRAG, { uInner: { value: i }, uOuter: { value: o }, uRings: { value: 0 }, uSeed: { value: seed }, uSpin: { value: spin }, uColor: { value: new Vector3(0.95, 0.95, 0.95) }, uChromatic: { value: 0 } }, { side: DoubleSide });
      const mesh = new Mesh(rg, m); mesh.rotation.set(rx as number, 0, rz as number); mesh.renderOrder = 6;
      this.ringGroup.add(mesh); this.ringM.push(m); this.ringMesh.push(mesh);
    });
    this.ringGroup.frustumCulled = false; this.scene.add(this.ringGroup);

    // aurora
    [[-30, 9, -38, 0.0, 0.2], [26, 11, -30, 2.2, -0.35]].forEach(([x, y, z, seed, ry]) => {
      const ag = new PlaneGeometry(62, 15, b.aurSeg, 1); ag.translate(0, 7.5, 0); this.geos.push(ag);
      const m = mat(AUR_VERT, AUR_FRAG, { uAurora: { value: 0 }, uSeed: { value: seed } }, { side: DoubleSide });
      const mesh = new Mesh(ag, m); mesh.position.set((x as number) * 0.5, (y as number) - 9, z as number); mesh.rotation.y = ry as number; mesh.renderOrder = -1;
      this.scene.add(mesh); this.aurM.push(m); this.aurMesh.push(mesh); mesh.frustumCulled = false;
    });

    // mist
    const mg = new PlaneGeometry(180, 180, 1, 1); mg.rotateX(-Math.PI / 2); this.geos.push(mg);
    this.mistM = mat(MIST_VERT, MIST_FRAG, { uMist: { value: 0.5 }, uCam: { value: this.cam.position }, uAgit: { value: 0 } });
    this.mistMesh = add(new Mesh(mg, this.mistM), 2) as Mesh; this.mistMesh.position.y = 0.7;
  }

  setInk(ink: readonly number[], additive: boolean, light: boolean) {
    const blending: Blending = additive ? NormalBlending : NormalBlending;
    for (const m of this.mats) {
      if (!this.chromatic.has(m)) {
        (m.uniforms.uInk.value as Vector3).set(ink[0], ink[1], ink[2]);
        m.blending = blending;
      }
      m.needsUpdate = true;
    }
    this.mats.forEach((m) => { if (!this.chromatic.has(m)) m.uniforms.uAlpha.value = light ? 0.88 : 1; });
    for (const m of [this.starM, this.galM]) m.uniforms.uChroma.value = 1;
    // chromatic planets use NormalBlending so albedo reads true; keep that
    for (const m of this.chromatic) {
      if (m.uniforms.uAlpha) m.uniforms.uAlpha.value = 1;
    }
  }

  warm(r: WebGLRenderer) {
    const all: Object3D[] = [this.nebMesh, this.starPts, this.warpLines, this.galPts, this.ringGroup, this.mistMesh, this.sunMesh, this.pathMesh, this.sparkPts, ...this.planets.map((p) => p.group), ...this.aurMesh];
    const was = all.map((o) => o.visible);
    all.forEach((o) => { o.visible = true; });
    try { r.compile(this.scene, this.cam); } catch { /* ignore */ }
    all.forEach((o, i) => { o.visible = was[i]; });
  }

  setDpr(d: number) { for (const m of this.mats) m.uniforms.uDpr.value = d; }

  /**
   * dt/t seconds; ptr -1..1; vel = scroll speed; agit 0..1.5; mono = monolith centre; act = damped progress × 6 (story timeline).
   */
  update(k: Key, t: number, dt: number, ptr: { x: number; y: number }, vel: number, agit: number, mono: Vector3, aspect: number, lite = false, act = 0) {
    this.mats.forEach((m) => { m.uniforms.uTime.value = t; });
    const burst = clamp(vel * 2.4 - 0.1, 0, 1);
    this.warpAcc += (clamp(Math.max(k.warp, burst * 0.9), 0, 1) - this.warpAcc) * (1 - Math.exp(-dt * 3.5));
    this.scrollAcc += vel * dt * 0.6;
    this.spin += dt;

    // the sun sits off frame, front-left and high: planets read as bright gibbous discs with a soft terminator
    this.sunM.uniforms.uSunOn.value = (0.35 + 0.45 * k.stars) * (lite ? 0.4 : 1);
    this.sunMesh.visible = k.stars > 0.05 && !lite;

    const nu = this.nebM.uniforms;
    nu.uCamWorld.value.copy(this.cam.matrixWorld);
    nu.uTanY.value = Math.tan((this.cam.fov * Math.PI) / 360); nu.uAspect.value = aspect;
    nu.uNeb.value = k.neb; nu.uScroll.value = this.scrollAcc + k.t * 0.8; nu.uPtr.value.set(ptr.x, ptr.y); nu.uAgit.value = agit;
    this.nebMesh.visible = k.neb > 0.01 && !lite;

    this.starM.uniforms.uStars.value = k.stars; this.starM.uniforms.uWarp.value = this.warpAcc; (this.starM.uniforms.uPtr.value as Vector2).set(ptr.x, ptr.y);
    this.starPts.visible = k.stars > 0.01;
    this.warpM.uniforms.uWarp.value = this.warpAcc; this.warpM.uniforms.uSpeed.value = burst;
    this.warpLines.visible = this.warpAcc > 0.02 && !lite;

    this.galM.uniforms.uGal.value = k.galaxy; this.galPts.visible = k.galaxy > 0.01 && !lite;
    this.galPts.rotation.y = 0.25 + ptr.x * 0.08; this.galPts.rotation.x = 1.05 - ptr.y * 0.05;

    // story state (depths from current planet bases)
    const depths = PATHS.map((pr) => this.byName.get(pr.planet)?.base.z ?? -50);
    const st = storyAt(act, depths);
    this.lastStory = st;

    // No hover effects on planets: they never grow, zoom or move toward the pointer. The only emphasis is the story's own
    // final beat, where Earth brightens (light only, never size).
    const earthIdx = this.planets.findIndex((p) => p.name === "earth");
    const want = st.earth > 0.4 ? earthIdx : -1;
    if (want !== this.focusIdx) this.focusIdx = want;
    this.focus += ((want >= 0 ? 1 : 0) - this.focus) * (1 - Math.exp(-dt * 3.5));

    // planets: orbit, spin, parallax, story darken; size is constant
    const planetVis = k.planet > 0.01;
    this.planets.forEach((p, i) => {
      p.group.visible = planetVis;
      const ang = p.phase + t * p.orbit;
      const ox = Math.cos(ang) * 1.6, oz = Math.sin(ang) * 0.9;
      const parallax = 0.55 + (i % 4) * 0.35;
      const focused = this.focusIdx === i ? this.focus : 0;
      const scale = p.r;
      p.group.position.set(
        p.base.x + ox + ptr.x * -1.6 * parallax,
        p.base.y + Math.sin(t * 0.07 + i) * 0.35 + ptr.y * -0.8,
        p.base.z + oz,
      );
      p.group.scale.setScalar(scale);
      p.body.rotation.y = t * p.spin;
      const bodyM = this.planetBodyM[i], atmoM = this.planetAtmoM[i];
      // Planets stay readable as "minds" even when keyframe planet weight dips mid-story.
      const base = Math.max(k.planet, 0.55) * (0.7 + st.dark * 0.55);
      const bright = clamp(base * (1 + focused * 0.4 + (p.name === "earth" ? st.earth * 0.55 : 0)), 0, 1.55);
      bodyM.uniforms.uPlanet.value = bright;
      atmoM.uniforms.uPlanet.value = bright;
      bodyM.uniforms.uFocus.value = focused;
      this.sunDir.copy(this.sunPos).sub(p.group.position).normalize();
      (bodyM.uniforms.uSunDir.value as Vector3).copy(this.sunDir);
      (atmoM.uniforms.uSunDir.value as Vector3).copy(this.sunDir);
      (bodyM.uniforms.uCenter.value as Vector3).copy(p.group.position);
      if (p.ring) {
        p.ring.rotation.z = 0.2 + Math.sin(t * 0.05) * 0.04;
        // ring plane normal in world space (approx from ring local up)
        this.ringN.set(0, 1, 0).applyQuaternion(p.ring.getWorldQuaternion(this.qTmp)).normalize();
        const rm = p.ring.material as ShaderMaterial;
        rm.uniforms.uRings.value = bright * 0.95;
        (rm.uniforms.uSunDir.value as Vector3).copy(this.sunDir);
        (rm.uniforms.uCenter.value as Vector3).copy(p.group.position);
        (rm.uniforms.uRingN.value as Vector3).copy(this.ringN);
        rm.uniforms.uRadius.value = scale;
        (bodyM.uniforms.uRingN.value as Vector3).copy(this.ringN);
      }
    });

    // spark travel: core → SPARK_END
    this.sparkPos.set(
      mono.x + (SPARK_END[0] - mono.x) * st.travel,
      mono.y + (SPARK_END[1] - mono.y) * st.travel,
      mono.z + (SPARK_END[2] - mono.z) * st.travel,
    );
    (this.sparkM.uniforms.uS.value as Vector4).set(this.sparkPos.x, this.sparkPos.y, this.sparkPos.z, st.spark);

    // answer point: gentle orbit near Earth
    const earth = this.byName.get("earth");
    if (earth) {
      const er = earth.group.position;
      this.earthAns.set(er.x + Math.cos(t * 0.35) * earth.group.scale.x * 1.8, er.y + Math.sin(t * 0.35) * earth.group.scale.x * 0.5, er.z);
    } else {
      this.earthAns.set(SPARK_END[0], SPARK_END[1], SPARK_END[2]);
    }
    (this.sparkM.uniforms.uQ.value as Vector4).set(this.earthAns.x, this.earthAns.y, this.earthAns.z, st.answer);
    this.sparkPts.visible = (st.spark > 0.02 || st.answer > 0.02) && !lite;

    // light paths: origin slides from monolith → answer; ends at each intelligence planet
    this.pathOrigin.lerpVectors(mono, this.earthAns, st.converge);
    let pathOn = 0;
    PATHS.forEach((pr, i) => {
      const pl = this.byName.get(pr.planet);
      const end = pl ? pl.group.position : this.pathB[i];
      const ps = st.paths[i];
      this.pathA[i].copy(this.pathOrigin);
      this.pathB[i].copy(end);
      // control point: mid + bend (dissent pulls hard away)
      this.pathC[i].set(
        (this.pathOrigin.x + end.x) * 0.5 + pr.bend[0] * 8 * ps.bend,
        (this.pathOrigin.y + end.y) * 0.5 + pr.bend[1] * 6 * ps.bend + 2.5,
        (this.pathOrigin.z + end.z) * 0.5 + pr.bend[2] * 5 * ps.bend,
      );
      (this.pathM.uniforms.uP.value as Vector4[])[i].set(ps.draw, ps.alpha * (1 - ps.collapse * 0.15), ps.collapse, ps.boost);
      pathOn = Math.max(pathOn, ps.draw * ps.alpha);
    });
    this.pathM.uniforms.uPathOn.value = pathOn > 0.01 ? 1 : 0;
    this.pathM.uniforms.uFlow.value = st.paths[0]?.pulse ?? 0;
    this.pathM.uniforms.uScan.value = st.paths[0]?.scan ?? 0;
    this.pathM.uniforms.uAspect.value = aspect;
    this.pathM.uniforms.uWidth.value = 0.0035 + 0.0015 * (this.b.planetFx > 0 ? 1 : 0);
    this.pathMesh.visible = pathOn > 0.01 && !lite;

    this.ringGroup.visible = k.rings > 0.01;
    this.ringGroup.position.copy(mono);
    this.ringMesh.forEach((r, i) => {
      r.rotation.y = this.spin * (0.07 + i * 0.045) * (i % 2 ? -1 : 1) + ptr.x * 0.25;
      r.rotation.x = [1.1, 1.9, 0.5][i] + Math.sin(t * 0.09 + i) * 0.1 + ptr.y * 0.15;
    });
    this.ringM.forEach((m, i) => { m.uniforms.uRings.value = k.rings * (1 - i * 0.18); });

    this.aurM.forEach((m, i) => { m.uniforms.uAurora.value = k.aurora; this.aurMesh[i].visible = k.aurora > 0.01 && !lite; });
    this.mistM.uniforms.uMist.value = k.mist; this.mistM.uniforms.uAgit.value = agit; this.mistMesh.visible = k.mist > 0.01 && !lite;
  }

  dispose() { for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); }
}
