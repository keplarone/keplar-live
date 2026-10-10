/**
 * Keplar site effects, three.js module (lazy-loaded by kfx.js only when a hero scene is about to be visible).
 * Built with esbuild into public/fx/kfx-gl.<v>.js (npm run fx:build). Tree-shaken three: renderer, points, lines, a few
 * geometries. No textures, no post-processing, no bloom: points are hard-edged discs one to three device pixels wide.
 *
 * Governance: DPR cap, particle budget by device tier, frame-time governor that steps quality down and finally freezes the
 * scene, pause when off-screen or tab hidden, reduced-motion renders one still frame, context loss disposes cleanly.
 */
import {
  BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, LineBasicMaterial, LineSegments, OctahedronGeometry, BoxGeometry,
  PerspectiveCamera, Points, Scene, ShaderMaterial, TorusKnotGeometry, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from "three";

type Effect = "particles" | "lattice" | "shapes" | "contours";
type Opts = { effect: Effect; shape?: string; intensity: number; small: boolean; reduce: boolean; ink: string; accent: string; bg: string };
type Scene3 = { update(t: number, dt: number, st: State): void; setQuality(q: number): void; setPx(px: number): void; dispose(): void; objects: Group };
type State = { ptr: Vector2; ptrTarget: Vector2; scroll: number; span: Vector2; reveal: number };

const hex = (s: string, fb: string): Vector3 => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s.trim()) ?? /^#?([0-9a-f]{6})$/i.exec(fb)!;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const POINT_FRAG = /* glsl */ `
uniform vec3 uInk; uniform vec3 uAccent; uniform float uAlpha;
varying float vTone; varying float vA;
void main(){
  vec2 c = gl_PointCoord - .5; float r = length(c); float w = fwidth(r);
  float a = 1. - smoothstep(.5 - w * 1.3, .5, r);
  if (a < .03) discard;
  vec3 col = mix(uInk, uAccent, step(.8, vTone));
  float al = a * vA * uAlpha;
  gl_FragColor = vec4(col * al, al);
}`;

function pointMaterial(vert: string, o: { ink: Vector3; accent: Vector3; alpha: number; px: number; span: Vector2 }, extra: Record<string, { value: unknown }> = {}) {
  const m = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: { uTime: { value: 0 }, uPtr: { value: new Vector2() }, uPx: { value: o.px }, uSpan: { value: o.span }, uScroll: { value: 0 }, uInk: { value: o.ink }, uAccent: { value: o.accent }, uAlpha: { value: o.alpha }, uReveal: { value: 1 }, ...extra },
  });
  return m;
}

/* ── particles: a sharp field in depth that leans away from the cursor ── */
const V_PARTICLES = /* glsl */ `
attribute float aSeed; attribute float aTone; attribute float aSize;
uniform float uTime; uniform vec2 uPtr; uniform float uPx; uniform vec2 uSpan; uniform float uScroll; uniform float uReveal;
varying float vTone; varying float vA;
void main(){
  vec3 p = position; float s = aSeed;
  p.x += sin(uTime * .11 + s * 40.) * .14;
  p.y = mod(p.y + uTime * (.02 + s * .035) + uSpan.y, 2. * uSpan.y) - uSpan.y;
  p.y += uScroll * (.25 + s * .9);
  p.z += sin(uTime * .07 + s * 13.) * .25;
  vec2 d = p.xy - uPtr * uSpan; float r = length(d);
  p.xy += normalize(d + 1e-4) * smoothstep(1.25, 0., r) * .32;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float depth = clamp(1. - (-mv.z - 3.) / 7., .25, 1.);
  gl_PointSize = max(1., floor(aSize * uPx * depth + .5));
  vTone = aTone; vA = (.35 + .65 * depth) * uReveal;
}`;

function makeParticles(o: Opts, st: State, mat: { ink: Vector3; accent: Vector3 }, dpr: number): Scene3 {
  const group = new Group();
  const base = o.small ? 520 : 1500;
  const max = Math.round(base * (0.35 + 0.65 * (o.intensity / 100)));
  const geo = new BufferGeometry();
  const pos = new Float32Array(max * 3), seed = new Float32Array(max), tone = new Float32Array(max), size = new Float32Array(max);
  for (let i = 0; i < max; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * st.span.x * 1.15;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * st.span.y;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 2.2;
    seed[i] = Math.random();
    tone[i] = Math.random();
    size[i] = 1 + Math.random() * Math.random() * 1.5;
  }
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new Float32BufferAttribute(seed, 1));
  geo.setAttribute("aTone", new Float32BufferAttribute(tone, 1));
  geo.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  const m = pointMaterial(V_PARTICLES, { ...mat, alpha: 0.9, px: dpr, span: st.span });
  const pts = new Points(geo, m);
  pts.frustumCulled = false;
  group.add(pts);
  return {
    objects: group,
    update(t, _dt, s) {
      m.uniforms.uTime.value = t; m.uniforms.uPtr.value.copy(s.ptr); m.uniforms.uScroll.value = s.scroll; m.uniforms.uReveal.value = s.reveal;
      group.rotation.y = s.ptr.x * 0.06; group.rotation.x = -s.ptr.y * 0.04;
    },
    setQuality(q) { geo.setDrawRange(0, Math.max(120, Math.round(max * q))); },
    setPx(px) { m.uniforms.uPx.value = px; },
    dispose() { geo.dispose(); m.dispose(); },
  };
}

/* ── lattice: a fine dot grid that ripples ── */
const V_LATTICE = /* glsl */ `
attribute vec2 aGrid; attribute float aSeed; attribute float aTone; attribute float aSize;
uniform float uTime; uniform vec2 uPtr; uniform float uPx; uniform vec2 uSpan; uniform float uReveal;
varying float vTone; varying float vA;
void main(){
  vec3 p = vec3(aGrid.x * uSpan.x * 1.35, aGrid.y * uSpan.y * 1.9, 0.);
  float h = sin(p.x * 1.15 + uTime * .45) * .2 + cos(p.y * 1.5 - uTime * .38) * .16 + sin((p.x + p.y) * .7 + uTime * .2) * .12;
  vec2 d = p.xy - uPtr * uSpan * vec2(1.2, 1.8); float r = length(d);
  float ripple = exp(-r * r * .7) * sin(uTime * 2.4 - r * 5.);
  h += ripple * .5;
  p.z = h;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1., floor(aSize * uPx + .5));
  float edge = smoothstep(1., .55, abs(aGrid.x)) * smoothstep(1., .5, abs(aGrid.y));
  vTone = clamp(h * 1.6 + .5 + aTone * .1, 0., 1.);
  vA = (.28 + .5 * edge + abs(ripple) * .5) * uReveal;
}`;

function makeLattice(o: Opts, st: State, mat: { ink: Vector3; accent: Vector3 }, dpr: number): Scene3 {
  const group = new Group();
  const cols = Math.round((o.small ? 34 : 64) * (0.6 + 0.4 * (o.intensity / 100)));
  const rows = Math.round(cols * 0.62);
  const n = cols * rows;
  const grid = new Float32Array(n * 2), pos = new Float32Array(n * 3), seed = new Float32Array(n), tone = new Float32Array(n), size = new Float32Array(n);
  let k = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++, k++) {
    grid[k * 2] = (x / (cols - 1)) * 2 - 1; grid[k * 2 + 1] = (y / (rows - 1)) * 2 - 1;
    seed[k] = Math.random(); tone[k] = Math.random(); size[k] = 1.2 + (x % 4 === 0 && y % 4 === 0 ? 0.9 : 0);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("aGrid", new Float32BufferAttribute(grid, 2));
  geo.setAttribute("aSeed", new Float32BufferAttribute(seed, 1));
  geo.setAttribute("aTone", new Float32BufferAttribute(tone, 1));
  geo.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  const m = pointMaterial(V_LATTICE, { ...mat, alpha: 0.95, px: dpr, span: st.span });
  const pts = new Points(geo, m);
  pts.frustumCulled = false;
  pts.rotation.x = -0.92;
  pts.position.y = -st.span.y * 0.18;
  group.add(pts);
  return {
    objects: group,
    update(t, _dt, s) { m.uniforms.uTime.value = t; m.uniforms.uPtr.value.copy(s.ptr); m.uniforms.uReveal.value = s.reveal; pts.rotation.z = s.ptr.x * 0.05 + s.scroll * 0.04; pts.position.y = -st.span.y * 0.18 + s.scroll * 0.4; },
    setQuality(q) { geo.setDrawRange(0, Math.max(200, Math.round(n * q))); },
    setPx(px) { m.uniforms.uPx.value = px; },
    dispose() { geo.dispose(); m.dispose(); },
  };
}

/* ── contours: hairlines forming a slow ridge ── */
const V_CONTOURS = /* glsl */ `
attribute float aRow; attribute float aU;
uniform float uTime; uniform vec2 uPtr; uniform vec2 uSpan; uniform float uReveal; uniform float uScroll;
varying float vA; varying float vAcc;
void main(){
  float x = (aU * 2. - 1.) * uSpan.x * 1.3;
  float y = (aRow - .5) * uSpan.y * 2.1;
  float n = sin(x * 1.05 + aRow * 5. + uTime * .13) * .5 + sin(x * 2.2 - aRow * 3.1 - uTime * .1) * .25 + sin(x * .5 + aRow * 9.) * .4;
  float env = smoothstep(0., .5, .5 - abs(aRow - .52)) * (.55 + .45 * sin(aU * 3.14159));
  float h = n * env * .95;
  vec2 d = vec2(x, y) - uPtr * uSpan * vec2(1.3, 1.1);
  h += exp(-dot(d, d) * .75) * .5;
  vec3 p = vec3(x, y + h * .7 + uScroll * .3, 0.);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  vA = (.22 + .55 * env) * uReveal;
  vAcc = step(.5, fract(aRow * 12.5)) * step(abs(fract(aRow * 6.) - .5), .02);
}`;
const F_CONTOURS = /* glsl */ `
uniform vec3 uInk; uniform vec3 uAccent; uniform float uAlpha; varying float vA; varying float vAcc;
void main(){ vec3 c = mix(uInk, uAccent, vAcc); float a = vA * uAlpha * mix(1., 1.6, vAcc); gl_FragColor = vec4(c * a, a); }`;

function makeContours(o: Opts, st: State, mat: { ink: Vector3; accent: Vector3 }): Scene3 {
  const group = new Group();
  const rows = Math.round((o.small ? 22 : 40) * (0.6 + 0.4 * (o.intensity / 100)));
  const segs = o.small ? 90 : 180;
  const pos: number[] = [], row: number[] = [], u: number[] = [];
  for (let r = 0; r < rows; r++) for (let s = 0; s < segs; s++) {
    for (const k of [s, s + 1]) { pos.push(0, 0, 0); row.push(r / (rows - 1)); u.push(k / segs); }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("aRow", new Float32BufferAttribute(row, 1));
  geo.setAttribute("aU", new Float32BufferAttribute(u, 1));
  const m = new ShaderMaterial({
    vertexShader: V_CONTOURS, fragmentShader: F_CONTOURS, transparent: true, depthWrite: false, premultipliedAlpha: true,
    uniforms: { uTime: { value: 0 }, uPtr: { value: new Vector2() }, uSpan: { value: st.span }, uReveal: { value: 1 }, uScroll: { value: 0 }, uInk: { value: mat.ink }, uAccent: { value: mat.accent }, uAlpha: { value: 0.9 } },
  });
  const lines = new LineSegments(geo, m);
  lines.frustumCulled = false;
  group.add(lines);
  return {
    objects: group,
    update(t, _dt, s) { m.uniforms.uTime.value = t; m.uniforms.uPtr.value.copy(s.ptr); m.uniforms.uReveal.value = s.reveal; m.uniforms.uScroll.value = s.scroll; },
    setQuality(q) { geo.setDrawRange(0, Math.max(400, Math.round((pos.length / 3) * Math.min(1, q + 0.15)))); },
    setPx() { /* lines are always one device pixel */ },
    dispose() { geo.dispose(); m.dispose(); },
  };
}

/* ── shapes: a wireframe form that turns with the scroll and resolves into view ── */
function makeShape(o: Opts, st: State, mat: { ink: Vector3; accent: Vector3 }, dpr: number): Scene3 {
  const group = new Group();
  const shape = o.shape || "ico";
  const detail = o.intensity > 60 && !o.small ? 2 : 1;
  const g0 = shape === "knot" ? new TorusKnotGeometry(1, 0.28, o.small ? 90 : 160, 10) : shape === "octa" ? new OctahedronGeometry(1.4, detail) : shape === "torus" ? new TorusGeometry(1.1, 0.42, 14, 40) : shape === "box" ? new BoxGeometry(1.8, 1.8, 1.8, 3, 3, 3) : new IcosahedronGeometry(1.45, detail);
  const edges = new EdgesGeometry(g0, 12);
  const line = new LineSegments(edges, new LineBasicMaterial({ color: ((mat.ink.x * 255) << 16) | ((mat.ink.y * 255) << 8) | (mat.ink.z * 255), transparent: true, opacity: 0.5, depthWrite: false }));
  group.add(line);
  const vp = g0.getAttribute("position");
  const vert = new BufferGeometry();
  const stride = Math.max(1, Math.ceil(vp.count / 150));
  const keep: number[] = [];
  for (let i = 0; i < vp.count; i += stride) keep.push(vp.getX(i), vp.getY(i), vp.getZ(i));
  vert.setAttribute("position", new Float32BufferAttribute(keep, 3));
  const cnt = keep.length / 3;
  const seed = new Float32Array(cnt), tone = new Float32Array(cnt), size = new Float32Array(cnt);
  for (let i = 0; i < cnt; i++) { seed[i] = Math.random(); tone[i] = Math.random(); size[i] = 2 + Math.random(); }
  vert.setAttribute("aSeed", new Float32BufferAttribute(seed, 1)); vert.setAttribute("aTone", new Float32BufferAttribute(tone, 1)); vert.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  const V = /* glsl */ `attribute float aSeed; attribute float aTone; attribute float aSize; uniform float uPx; uniform float uReveal; varying float vTone; varying float vA;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., floor(aSize * uPx + .5)); vTone = aTone; vA = uReveal; }`;
  const pm = pointMaterial(V, { ...mat, alpha: 1, px: dpr, span: st.span });
  const pts = new Points(vert, pm);
  group.add(pts);
  group.position.x = o.small ? 0 : st.span.x * 0.42;
  group.position.y = o.small ? st.span.y * 0.35 : 0;
  const lm = line.material as LineBasicMaterial;
  const baseScale = o.small ? 0.8 : 1.05;
  return {
    objects: group,
    update(t, _dt, s) {
      const e = 1 - Math.pow(1 - s.reveal, 3);
      group.scale.setScalar(baseScale * (0.55 + 0.45 * e));
      group.rotation.y = t * 0.12 + s.scroll * 1.6 + s.ptr.x * 0.35;
      group.rotation.x = 0.4 + s.scroll * 0.7 - s.ptr.y * 0.25;
      lm.opacity = 0.5 * e; pm.uniforms.uReveal.value = e;
    },
    setQuality() { /* geometry is small; nothing to shed */ },
    setPx(px) { pm.uniforms.uPx.value = px; },
    dispose() { g0.dispose(); edges.dispose(); vert.dispose(); (line.material as LineBasicMaterial).dispose(); pm.dispose(); },
  };
}

/* ── mount + governor ── */
export function mount(host: HTMLElement, canvas: HTMLCanvasElement, o: Opts): { stop(): void } | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "low-power", premultipliedAlpha: true });
  } catch {
    return null;
  }
  const dprCap = o.small ? 1 : 1.75;
  let dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const cam = new PerspectiveCamera(40, 1, 0.1, 40);
  cam.position.z = 6;
  const st: State = { ptr: new Vector2(), ptrTarget: new Vector2(), scroll: 0, span: new Vector2(2.4, 2.1), reveal: o.reduce ? 1 : 0 };
  const mat = { ink: hex(o.ink, "#111111"), accent: hex(o.accent, "#cc4422") };

  let w = 0, h = 0;
  const fit = () => {
    const r = host.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (Math.abs(nw - w) < 2 && Math.abs(nh - h) < 2) return;
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const vh = 2 * Math.tan((cam.fov * Math.PI) / 360) * cam.position.z;
    st.span.set((vh * cam.aspect) / 2, vh / 2);
  };
  fit();

  const impl: Scene3 = o.effect === "lattice" ? makeLattice(o, st, mat, dpr) : o.effect === "contours" ? makeContours(o, st, mat) : o.effect === "shapes" ? makeShape(o, st, mat, dpr) : makeParticles(o, st, mat, dpr);
  scene.add(impl.objects);

  let visible = true, raf = 0, last = 0, t0 = 0, ema = 16, frames = 0, tier = 0, stopped = false, revealStart = -1;
  const minFrame = o.small ? 1000 / 30 : 0;
  const setTier = (n: number) => {
    tier = n;
    if (n === 1) { dpr = 1; renderer.setPixelRatio(1); renderer.setSize(w, h, false); impl.setPx(1); impl.setQuality(0.65); }
    else if (n === 2) impl.setQuality(0.35);
  };
  const draw = (now: number) => {
    const t = (now - t0) / 1000;
    if (revealStart < 0) revealStart = now;
    if (!o.reduce) st.reveal = Math.min(1, (now - revealStart) / 1400);
    st.ptr.lerp(st.ptrTarget, 0.06);
    impl.update(t, 0, st);
    renderer.render(scene, cam);
    if (!canvas.hasAttribute("data-ready")) canvas.setAttribute("data-ready", "");
  };
  const loop = (now: number) => {
    raf = 0;
    if (stopped || !visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    if (minFrame && now - last < minFrame) return;
    const dt = last ? now - last : 16;
    last = now;
    draw(now);
    frames++;
    ema = ema * 0.94 + dt * 0.06;
    if (frames > 50 && frames % 25 === 0 && !o.small && ema > 30 && tier < 2) setTier(tier + 1);
    else if (frames > 50 && frames % 25 === 0 && o.small && ema > 55 && tier < 2) setTier(tier + 1);
    if (frames > 200 && ema > (o.small ? 90 : 45) && tier >= 2) freeze();
  };
  const start = () => { if (!raf && !stopped && !o.reduce) { last = 0; raf = requestAnimationFrame(loop); } };
  const freeze = () => { o.reduce = true; st.reveal = 1; if (raf) cancelAnimationFrame(raf); raf = 0; draw(performance.now()); };

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { fit(); start(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } }, { rootMargin: "80px" });
  io.observe(host);
  const ro = new ResizeObserver(() => { fit(); if (o.reduce || !raf) draw(performance.now()); });
  ro.observe(host);
  const onPtr = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    st.ptrTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  const onLeave = () => st.ptrTarget.set(0, 0);
  if (!o.small && !o.reduce) { host.addEventListener("pointermove", onPtr, { passive: true }); host.addEventListener("pointerleave", onLeave); }
  const onScroll = () => {
    const r = host.getBoundingClientRect();
    st.scroll = Math.max(0, Math.min(1.2, -r.top / Math.max(1, r.height)));
  };
  if (!o.reduce) window.addEventListener("scroll", onScroll, { passive: true });
  const onVis = () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else if (visible) start(); };
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e: Event) => { e.preventDefault(); stop(); };
  canvas.addEventListener("webglcontextlost", onLost);

  const stop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect(); ro.disconnect();
    host.removeEventListener("pointermove", onPtr); host.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("scroll", onScroll); document.removeEventListener("visibilitychange", onVis);
    canvas.removeEventListener("webglcontextlost", onLost);
    impl.dispose();
    renderer.dispose();
    canvas.removeAttribute("data-ready");
  };

  t0 = performance.now();
  onScroll();
  if (o.reduce) { st.reveal = 1; draw(performance.now() + 2000); } else start();
  return { stop };
}
