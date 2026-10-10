import { IcosahedronGeometry, Mesh, Points, Scene, ShaderMaterial, Vector3 } from "three";
import { BLOB_VARIANTS, blobDetail, blobPlacement, mixBlob, type BlobParams, type BlobVariant } from "./blob-variants";

/**
 * The hero blob (original technique): a sphere whose every vertex is displaced in the vertex shader by layered 3D value noise, a
 * per-route stretch / twist / lobe shape, a pointer bulge and slow time drift. Normals are rebuilt from the displaced surface, so the soft
 * body shades smoothly (diffuse + rim "fresnel" glow + a small specular), in white / black / grey only. A shell of crisp, sharp points sits
 * on the same surface. Forms morph into each other when the route changes; the camera-facing side follows the pointer; scroll carries and
 * turns it. One mesh + one points draw call, everything else is uniforms; the engine pauses it with the rest of the field.
 */
const COMMON = /* glsl */ `
uniform float uTime, uAmp, uFreq, uSpeed, uTwist, uLobes, uLobeK, uBulge;
uniform vec3 uStretch, uPointerDir;
float hsh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(hsh(i), hsh(i + vec3(1, 0, 0)), u.x), mix(hsh(i + vec3(0, 1, 0)), hsh(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(hsh(i + vec3(0, 0, 1)), hsh(i + vec3(1, 0, 1)), u.x), mix(hsh(i + vec3(0, 1, 1)), hsh(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
// the body: unit direction in, displaced surface point out
vec3 surf(vec3 d) {
  float t = uTime * uSpeed;
  vec3 q = d * uFreq + vec3(t * 0.9, t * 0.6, -t * 0.7);
  float n = noise3(q) * 0.62 + noise3(q * 2.07 + vec3(5.2, 1.3, 8.1)) * 0.38;
  float r = 1.0 + uAmp * (n - 0.5) * 2.0;
  r += uLobes * sin(uLobeK * d.x * 1.7 + t * 1.3) * sin(uLobeK * d.y * 1.3 - t) * 0.5 + uLobes * 0.5 * sin(uLobeK * d.z * 1.5 + t * 0.7) * 0.5;
  vec3 wd = normalize(mat3(modelMatrix) * d);
  float g = exp(-pow(distance(wd, uPointerDir), 2.0) * 4.5);
  r += uBulge * g;
  vec3 p = d * r * uStretch;
  float a = uTwist * p.y;
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  return p;
}
`;

const MESH_VERT = /* glsl */ `
${COMMON}
varying vec3 vNormal, vView;
varying float vDisp;
void main() {
  vec3 d = normalize(position);
  vec3 t1 = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
  vec3 t2 = cross(d, t1);
  vec3 p0 = surf(d), p1 = surf(normalize(d + t1 * 0.02)), p2 = surf(normalize(d + t2 * 0.02));
  vec3 n = normalize(cross(p1 - p0, p2 - p0));
  if (dot(n, d) < 0.0) n = -n;
  vNormal = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vView = -mv.xyz;
  vDisp = length(p0);
  gl_Position = projectionMatrix * mv;
}`;

const MESH_FRAG = /* glsl */ `
precision highp float;
uniform float uDark, uTime;
varying vec3 vNormal, vView;
varying float vDisp;
void main() {
  vec3 n = normalize(vNormal), v = normalize(vView);
  float ndv = max(dot(n, v), 0.0);
  float fr = pow(1.0 - ndv, 2.4);
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
  float dif = dot(n, L) * 0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, n), v), 0.0), 38.0);
  float band = 0.5 + 0.5 * sin(vDisp * 11.0 + uTime * 0.35);
  vec3 col;
  if (uDark > 0.5) {
    col = mix(vec3(0.03), vec3(0.2), dif * dif) + band * 0.025;
    col += vec3(0.95) * fr * 0.95 + vec3(1.0) * spec * 0.55;
  } else {
    col = mix(vec3(0.76), vec3(0.985), dif) - band * 0.03;
    col = mix(col, vec3(0.08), fr * 0.62);
    col += vec3(1.0) * spec * 0.4;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const PT_VERT = /* glsl */ `
${COMMON}
uniform float uDpr, uPt;
varying float vFace;
void main() {
  vec3 d = normalize(position);
  vec3 p = surf(d) * 1.012;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normalize(p));
  vFace = smoothstep(-0.25, 0.45, dot(n, normalize(-mv.xyz)));
  gl_PointSize = max(1.0, uPt * uDpr * (16.0 / -mv.z) * 2.2);
  gl_Position = projectionMatrix * mv;
}`;

const PT_FRAG = /* glsl */ `
precision mediump float;
uniform float uDark, uPtAlpha;
varying float vFace;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float edge = 1.0 - smoothstep(0.82, 1.0, d);
  vec3 c = uDark > 0.5 ? vec3(1.0) : vec3(0.07);
  gl_FragColor = vec4(c, edge * (0.18 + 0.82 * vFace) * uPtAlpha);
}`;

export class Blob {
  readonly mesh: Mesh;
  readonly points: Points;
  private meshMat: ShaderMaterial;
  private ptMat: ShaderMaterial;
  private shared: Record<string, { value: unknown }>;
  private from: BlobParams;
  private to: BlobParams;
  private cur: BlobParams;
  private t = 1;
  private ptr = new Vector3(0, 0, 0.7);
  private spin = 0;

  constructor(scene: Scene, o: { form: "mobile" | "desktop"; quality: "low" | "medium" | "high"; dark: boolean; dpr: number; variant: BlobVariant }) {
    const det = blobDetail(o.form, o.quality);
    this.cur = { ...BLOB_VARIANTS[o.variant] };
    this.from = { ...this.cur };
    this.to = { ...this.cur };
    this.shared = {
      uTime: { value: 0 }, uAmp: { value: this.cur.amp }, uFreq: { value: this.cur.freq }, uSpeed: { value: this.cur.speed }, uTwist: { value: 0 },
      uLobes: { value: 0 }, uLobeK: { value: 3 }, uBulge: { value: 0 }, uStretch: { value: new Vector3(1, 1, 1) }, uPointerDir: { value: this.ptr },
      uDark: { value: o.dark ? 1 : 0 },
    };
    this.meshMat = new ShaderMaterial({ vertexShader: MESH_VERT, fragmentShader: MESH_FRAG, uniforms: { ...this.shared } });
    this.ptMat = new ShaderMaterial({
      vertexShader: PT_VERT, fragmentShader: PT_FRAG, transparent: true, depthWrite: false,
      uniforms: { ...this.shared, uDpr: { value: o.dpr }, uPt: { value: o.dark ? 1.25 : 1.15 }, uPtAlpha: { value: 1 } },
    });
    this.mesh = new Mesh(new IcosahedronGeometry(1, det.mesh), this.meshMat);
    this.points = new Points(new IcosahedronGeometry(1, det.points), this.ptMat);
    this.mesh.frustumCulled = false;
    this.points.frustumCulled = false;
    this.mesh.renderOrder = -2;
    this.points.renderOrder = -1;
    scene.add(this.mesh, this.points);
  }

  /** Morph to another form (instant = no animation, used for the first frame). */
  setVariant(v: BlobVariant, instant = false) {
    this.from = { ...this.cur };
    this.to = BLOB_VARIANTS[v];
    this.t = instant ? 1 : 0;
    if (instant) this.cur = { ...this.to };
  }
  setDark(dark: boolean) {
    this.shared.uDark.value = dark ? 1 : 0;
    this.ptMat.uniforms.uPt.value = dark ? 1.25 : 1.15;
  }
  setDpr(dpr: number) { this.ptMat.uniforms.uDpr.value = dpr; }

  /** One frame. pointer is -1..1 on screen; scroll 0..1; calm = reduced motion (a quick, quiet morph, a gentler body). */
  update(dt: number, time: number, scroll: number, pointer: { x: number; y: number; on: number }, view: { hw: number; hh: number }, aspect: number, calm: boolean) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / (calm ? 0.4 : 1.9));
      mixBlob(this.from, this.to, this.t, this.cur);
    }
    const c = this.cur;
    const pl = blobPlacement(c, view.hw, view.hh, aspect, scroll);
    this.spin += dt * (calm ? 0.03 : 0.1);
    this.mesh.position.set(pl.x, pl.y, 0);
    this.mesh.scale.setScalar(pl.r);
    this.mesh.rotation.set(-pointer.y * 0.32 * pointer.on + Math.sin(time * 0.21) * 0.1, this.spin + pl.turn + pointer.x * 0.5 * pointer.on, 0);
    this.points.position.copy(this.mesh.position);
    this.points.scale.copy(this.mesh.scale);
    this.points.rotation.copy(this.mesh.rotation);
    this.points.visible = c.pts > 0.04;
    const u = this.shared;
    u.uTime.value = time;
    u.uAmp.value = c.amp * (calm ? 0.6 : 1);
    u.uFreq.value = c.freq;
    u.uSpeed.value = c.speed;
    u.uTwist.value = c.twist;
    u.uLobes.value = c.lobes;
    u.uLobeK.value = c.lobeK;
    (u.uStretch.value as Vector3).set(c.sx, c.sy, c.sz);
    u.uBulge.value = 0.22 * pointer.on * (calm ? 0 : 1);
    this.ptr.set(pointer.x * 0.9, pointer.y * 0.9, 0.7).normalize();
    this.ptMat.uniforms.uPtAlpha.value = c.pts;
  }

  dispose(scene: Scene) {
    scene.remove(this.mesh, this.points);
    this.mesh.geometry.dispose();
    this.points.geometry.dispose();
    this.meshMat.dispose();
    this.ptMat.dispose();
  }
}
