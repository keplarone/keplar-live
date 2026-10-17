import { NormalBlending, BufferAttribute, DynamicDrawUsage, BufferGeometry, Group, LineSegments, Points, ShaderMaterial, Vector3, type PerspectiveCamera } from "three";
import { along, chapterState, lightU, MOTIFS, SPECTRAL, type ChapterId, type Motif } from "./chapters";

const MAX_P = 72;
const MAX_S = 72;
const MAX_L = 10;
/** distance of the motif plane from the camera: behind the logo, in front of the planets */
const DEPTH = 22;

const PT_VERT = /* glsl */ `
attribute vec3 aCol; attribute float aSize, aA;
uniform float uPx, uDpr, uAlpha, uTime, uTw;
varying vec3 vCol; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 1.0 - uTw * 0.18 * (0.5 + 0.5 * sin(uTime * 2.1 + position.x * 7.3 + position.y * 4.1));
  gl_PointSize = aSize * uPx * uDpr * tw;
  vCol = aCol; vA = aA * uAlpha;
}`;
const PT_FRAG = /* glsl */ `
precision mediump float;
uniform float uLight;
varying vec3 vCol; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.32, 0.0, d), halo = exp(-d * d * 6.0) * 0.6;
  vec3 col = mix(vCol, vec3(1.0), core * 0.75 * (1.0 - uLight));
  col = mix(col, vCol * 0.55, uLight);
  gl_FragColor = vec4(col, (core + halo) * vA);
}`;
const LN_VERT = /* glsl */ `
attribute vec3 aCol; attribute float aA;
uniform float uAlpha;
varying vec3 vCol; varying float vA;
void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vCol = aCol; vA = aA * uAlpha; }`;
const LN_FRAG = /* glsl */ `
precision mediump float;
uniform float uLight;
varying vec3 vCol; varying float vA;
void main(){ gl_FragColor = vec4(mix(vCol, vCol * 0.5, uLight), vA); }`;

const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function attr(g: BufferGeometry, name: string, n: number, size: number) { const a = new BufferAttribute(new Float32Array(n * size), size); a.setUsage(DynamicDrawUsage); g.setAttribute(name, a); return a; }

/**
 * Draws the active chapter's constellation in a camera-locked plane so it reads the same at every camera key.
 * Three draw calls (stars, lines, moving lights); all buffers are fixed-size and rewritten on the CPU (tens of vertices).
 */
export class ChapterLayer {
  readonly group = new Group();
  private ptM: ShaderMaterial;
  private lnM: ShaderMaterial;
  private ltM: ShaderMaterial;
  private pg = new BufferGeometry();
  private lg = new BufferGeometry();
  private tg = new BufferGeometry();
  private want: ChapterId | null = null;
  private cur: ChapterId | null = null;
  private progress: number | null = null;
  private alpha = 0;
  private elapsed = 0;
  private scale = 1;
  private pin: [number, number] = [0, 0];
  private tmp = new Vector3();
  private xy: [number, number] = [0, 0];
  private xy2: [number, number] = [0, 0];
  /** 0..1, how present the chapter layer is (the scene dims competing parts by this) */
  presence = 0;

  constructor(private cam: PerspectiveCamera, private mobile: boolean, private still: boolean) {
    const u = () => ({ uAlpha: { value: 0 }, uLight: { value: 0 }, uDpr: { value: 1 }, uPx: { value: 9 }, uTime: { value: 0 }, uTw: { value: 1 } });
    const mk = (v: string, f: string) => new ShaderMaterial({ vertexShader: v, fragmentShader: f, uniforms: u(), transparent: true, depthTest: true, depthWrite: false, blending: NormalBlending });
    this.ptM = mk(PT_VERT, PT_FRAG); this.lnM = mk(LN_VERT, LN_FRAG); this.ltM = mk(PT_VERT, PT_FRAG);
    this.ltM.uniforms.uTw.value = 0;
    attr(this.pg, "position", MAX_P, 3); attr(this.pg, "aCol", MAX_P, 3); attr(this.pg, "aSize", MAX_P, 1); attr(this.pg, "aA", MAX_P, 1);
    attr(this.lg, "position", MAX_S * 2, 3); attr(this.lg, "aCol", MAX_S * 2, 3); attr(this.lg, "aA", MAX_S * 2, 1);
    attr(this.tg, "position", MAX_L, 3); attr(this.tg, "aCol", MAX_L, 3); attr(this.tg, "aSize", MAX_L, 1); attr(this.tg, "aA", MAX_L, 1);
    const pts = new Points(this.pg, this.ptM), lines = new LineSegments(this.lg, this.lnM), lights = new Points(this.tg, this.ltM);
    pts.renderOrder = 13; lines.renderOrder = 12; lights.renderOrder = 14;
    for (const o of [pts, lines, lights]) { o.frustumCulled = false; this.group.add(o); }
    this.group.position.z = -DEPTH;
    this.group.visible = false;
    cam.add(this.group);
  }

  set(id: ChapterId | null, progress: number | null) {
    this.progress = progress;
    if (id !== this.want) { this.want = id; if (this.mobile || this.still || this.alpha < 0.02) this.swap(); }
  }

  /** the active motif with its logo star re-pinned every frame (one copy per chapter switch, no per-frame allocation) */
  private mp: Motif | null = null;
  private swap() { this.cur = this.want; this.elapsed = 0; this.mp = this.cur ? { ...MOTIFS[this.cur], pts: MOTIFS[this.cur].pts.map((p) => [...p] as [number, number, number, number]) } : null; }

  setTheme(dark: boolean) {
    for (const m of [this.ptM, this.lnM, this.ltM]) { m.blending = dark ? NormalBlending : NormalBlending; m.uniforms.uLight.value = dark ? 0 : 1; m.needsUpdate = true; }
  }

  resize(h: number, dpr: number) {
    const hh = Math.tan(((this.cam.fov / 2) * Math.PI) / 180) * DEPTH, hw = hh * this.cam.aspect;
    // portrait phones: let the plane use nearly the full width (the motifs are wider than tall)
    this.scale = Math.min((hh * 0.72) / 2.6, (hw * (this.cam.aspect < 0.8 ? 0.97 : 0.86)) / 4);
    this.group.scale.setScalar(this.scale);
    const px = Math.min(18, Math.max(8, h / 60));
    for (const m of [this.ptM, this.ltM]) { m.uniforms.uDpr.value = dpr; m.uniforms.uPx.value = m === this.ltM ? px * 1.9 : px; }
  }

  /** Call once per frame with the logo's world position (to pin the motif's centre star to it). */
  update(dt: number, t: number, logoWorld: Vector3) {
    // crossfade: dip out, swap, draw back on (mobile and still swap instantly)
    if (this.want !== this.cur) { this.alpha = Math.max(0, this.alpha - dt * 4); if (this.alpha <= 0.001) this.swap(); }
    else this.alpha = this.cur ? Math.min(1, this.alpha + dt * (this.still ? 99 : 2.5)) : Math.max(0, this.alpha - dt * 2.5);
    if (this.still) this.alpha = this.cur ? 1 : 0;
    this.presence = this.alpha;
    this.group.visible = !!this.cur && this.alpha > 0.001;
    if (!this.group.visible || !this.cur) return;
    this.elapsed += dt;
    if (!this.mp) this.swap();
    const m = this.mp as Motif;
    const st = chapterState(this.cur, this.progress, this.elapsed, this.still);
    const tt = this.still ? 0 : t;
    for (const mt of [this.ptM, this.lnM, this.ltM]) { mt.uniforms.uAlpha.value = this.alpha; mt.uniforms.uTime.value = tt; }
    // logo pin: camera-local logo position projected onto the motif plane
    this.tmp.copy(logoWorld); this.cam.worldToLocal(this.tmp);
    const zf = this.tmp.z < -0.1 ? -DEPTH / this.tmp.z : 0;
    this.pin[0] = (this.tmp.x * zf) / this.scale; this.pin[1] = (this.tmp.y * zf) / this.scale;
    if (m.logo != null) { m.pts[m.logo][0] = this.pin[0]; m.pts[m.logo][1] = this.pin[1]; }
    this.writePoints(m, st);
    this.writeLines(m, st);
    this.writeLights(m, st, tt);
  }

  private pt(m: Motif, i: number, out: [number, number]) { out[0] = m.pts[i][0]; out[1] = m.pts[i][1]; return out; }

  private writePoints(m: Motif, st: ReturnType<typeof chapterState>) {
    const P = this.pg.getAttribute("position") as BufferAttribute, Cc = this.pg.getAttribute("aCol") as BufferAttribute;
    const S = this.pg.getAttribute("aSize") as BufferAttribute, A = this.pg.getAttribute("aA") as BufferAttribute;
    const n = Math.min(MAX_P, m.pts.length);
    for (let i = 0; i < MAX_P; i++) {
      if (i >= n) { A.setX(i, 0); continue; }
      const [, , c, s] = m.pts[i];
      this.pt(m, i, this.xy);
      P.setXYZ(i, this.xy[0], this.xy[1], 0);
      const col = SPECTRAL[c]; Cc.setXYZ(i, col[0], col[1], col[2]);
      let size = s, a = sm((i / n) * 0.8, (i / n) * 0.8 + 0.2, st.draw);
      if (m.logo === i) a *= 0.35; // the 3D logo is the real centre; its star only marks the spot
      if (m.launch && i === m.launch.to) size *= 1 + st.arrive * 0.9;
      if (m.fix && i === m.fix.wrong) a *= 1 - st.correct * 0.75;
      if (m.fix && i === m.fix.critic) size *= 1 + 0.25 * Math.sin(this.elapsed * 3.0) * (1 - st.correct);
      if (m.resolves) size *= 0.8 + 0.2 * st.resolve;
      S.setX(i, size); A.setX(i, Math.min(1, a * (0.7 + 0.3 * s)));
    }
    P.needsUpdate = Cc.needsUpdate = S.needsUpdate = A.needsUpdate = true;
  }

  private writeLines(m: Motif, st: ReturnType<typeof chapterState>) {
    const P = this.lg.getAttribute("position") as BufferAttribute, Cc = this.lg.getAttribute("aCol") as BufferAttribute, A = this.lg.getAttribute("aA") as BufferAttribute;
    const n = Math.min(MAX_S, m.lines.length);
    const trail = m.lines.filter((l) => l[2] & 2).length;
    let ti = 0;
    for (let j = 0; j < MAX_S; j++) {
      const v0 = j * 2, v1 = v0 + 1;
      if (j >= n) { A.setX(v0, 0); A.setX(v1, 0); continue; }
      const [ia, ib, f] = m.lines[j];
      let frac = sm((j / n) * 0.85, (j / n) * 0.85 + 0.15, st.draw);
      let alpha = 0.5;
      if (f & 1) { if (this.mobile) frac = 0; alpha = 0.24; }
      if (f & 2) { frac = Math.min(1, Math.max(0, st.launch * trail - ti)); ti++; alpha = 0.45; }
      this.pt(m, ia, this.xy); this.pt(m, ib, this.xy2);
      let ca = SPECTRAL[m.pts[ia][2]], cb = SPECTRAL[m.pts[ib][2]];
      if (m.fix && j === m.fix.line) {
        // the critic's correction: the line first reaches for the wrong star, then swings to the right one
        const w = m.pts[m.fix.wrong];
        this.xy2[0] = w[0] + (this.xy2[0] - w[0]) * st.correct; this.xy2[1] = w[1] + (this.xy2[1] - w[1]) * st.correct;
        if (st.correct < 0.5) cb = SPECTRAL[3];
        alpha = 0.4 + 0.3 * st.correct;
      }
      if (m.resolves) { alpha = (f & 1 ? 0.2 : 0.32) + 0.45 * st.resolve; if (st.resolve > 0.5) { ca = cb = SPECTRAL[1]; } }
      P.setXYZ(v0, this.xy[0], this.xy[1], 0);
      P.setXYZ(v1, this.xy[0] + (this.xy2[0] - this.xy[0]) * frac, this.xy[1] + (this.xy2[1] - this.xy[1]) * frac, 0);
      Cc.setXYZ(v0, ca[0], ca[1], ca[2]); Cc.setXYZ(v1, cb[0], cb[1], cb[2]);
      const on = frac > 0.001 ? alpha : 0;
      A.setX(v0, on); A.setX(v1, on);
    }
    P.needsUpdate = Cc.needsUpdate = A.needsUpdate = true;
  }

  private writeLights(m: Motif, st: ReturnType<typeof chapterState>, t: number) {
    const P = this.tg.getAttribute("position") as BufferAttribute, Cc = this.tg.getAttribute("aCol") as BufferAttribute;
    const S = this.tg.getAttribute("aSize") as BufferAttribute, A = this.tg.getAttribute("aA") as BufferAttribute;
    let k = 0;
    const put = (x: number, y: number, c: number, size: number, a: number) => {
      if (k >= MAX_L) return;
      const col = SPECTRAL[c]; P.setXYZ(k, x, y, 0); Cc.setXYZ(k, col[0], col[1], col[2]); S.setX(k, size); A.setX(k, a); k++;
    };
    const ambient = !this.mobile; // mobile lite: only the lights that carry meaning (pen, critic, launch)
    if (ambient) for (const l of m.lights) {
      const u = lightU(l, t);
      along(m, l.path, u, this.xy);
      const fadeEnds = l.bounce ? 1 : sm(0, 0.08, u) * (1 - sm(0.9, 1, u));
      put(this.xy[0], this.xy[1], l.color, 0.9, st.draw * fadeEnds);
    }
    if (m.pen != null && st.draw < 1 && !this.still) {
      const n = m.lines.length, f = Math.min(n - 1, Math.floor((st.draw / 0.85) * n));
      const [ia, ib] = m.lines[f];
      const fr = sm((f / n) * 0.85, (f / n) * 0.85 + 0.15, st.draw);
      this.pt(m, ia, this.xy); this.pt(m, ib, this.xy2);
      put(this.xy[0] + (this.xy2[0] - this.xy[0]) * fr, this.xy[1] + (this.xy2[1] - this.xy[1]) * fr, m.pen, 1.0, 1);
    }
    if (m.fix && st.correct > 0.01 && st.correct < 0.99) {
      const [ia, ib] = m.lines[m.fix.line]; void ia;
      const w = m.pts[m.fix.wrong], b = m.pts[ib];
      put(w[0] + (b[0] - w[0]) * st.correct, w[1] + (b[1] - w[1]) * st.correct, 2, 1.1, 1);
    }
    if (m.launch && st.launch > 0.001 && st.arrive < 0.999) {
      along(m, m.launch.path, st.launch, this.xy);
      put(this.xy[0], this.xy[1], 1, 1.25, 1);
    }
    if (m.launch && st.arrive > 0.001) { const p = m.pts[m.launch.to]; put(p[0], p[1], 0, 2.4 * st.arrive, 0.5 * st.arrive); }
    for (let i = k; i < MAX_L; i++) A.setX(i, 0);
    P.needsUpdate = Cc.needsUpdate = S.needsUpdate = A.needsUpdate = true;
  }

  dispose() {
    this.cam.remove(this.group);
    for (const g of [this.pg, this.lg, this.tg]) g.dispose();
    for (const m of [this.ptM, this.lnM, this.ltM]) m.dispose();
  }
}
