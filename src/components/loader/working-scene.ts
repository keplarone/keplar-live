import { BufferAttribute, BufferGeometry, Color, NormalBlending, PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer } from "three";
import { swarmSeeds, workingDpr, workingPoints, workingState, type WorkingInput } from "@/lib/working-hard";

/** three.js side of WorkingHard. Loaded lazily (dynamic import) only when the device is allowed to animate. */
export type WorkingScene = {
  /** feed the latest real inputs (cheap uniform writes) */
  set(i: Pick<WorkingInput, "progress" | "done" | "failed">): void;
  /** call on every real progress event */
  pulse(): void;
  setDark(dark: boolean): void;
  resize(): void;
  dispose(): void;
};

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uPhase, uRadius, uSpread, uBurst, uTime, uSize, uDpr;
varying float vK;
void main() {
  float a = aSeed.x + uPhase * aSeed.w;
  vec3 radial = vec3(cos(a), sin(a), 0.0);
  vec3 p = radial * uRadius + radial * (aSeed.y * uSpread * 0.7) + vec3(0.0, 0.0, aSeed.z * uSpread);
  p += normalize(p + 1e-4) * uBurst * (0.25 + aSeed.w * 0.6);
  p += vec3(sin(uTime * 0.9 + aSeed.x * 3.0), cos(uTime * 0.8 + aSeed.x * 2.0), sin(uTime * 0.7 + aSeed.y * 5.0)) * 0.04;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vK = 0.55 + 0.45 * aSeed.w;
  gl_PointSize = clamp(uSize * uDpr * (9.0 / -mv.z), 1.0, 14.0 * uDpr);
}`;
const FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uColor; uniform float uGlow;
varying float vK;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 0.7) discard;
  gl_FragColor = vec4(uColor, vK * uGlow);
}`;

export function createWorkingScene(canvas: HTMLCanvasElement, hooks: { onError?: () => void } = {}): WorkingScene {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0, 11);
  const scene = new Scene();
  const w0 = Math.max(1, canvas.clientWidth);
  const count = workingPoints(w0, window.devicePixelRatio || 1);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3)); // required by three; the shader places points
  geo.setAttribute("aSeed", new BufferAttribute(swarmSeeds(count), 4));
  geo.boundingSphere = null;
  const u = {
    uPhase: { value: 0 }, uRadius: { value: 3 }, uSpread: { value: 1 }, uBurst: { value: 0 }, uTime: { value: 0 },
    uSize: { value: 2.4 }, uDpr: { value: 1 }, uColor: { value: new Color(1, 1, 1) }, uGlow: { value: 0.6 },
  };
  const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u as never, transparent: true, depthWrite: false, depthTest: false });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.rotation.x = 1.0;
  pts.rotation.y = -0.25;
  scene.add(pts);

  let input: Pick<WorkingInput, "progress" | "done" | "failed"> = {};
  let dark = true;
  let lastPulse = -Infinity;
  let t = 0, last = performance.now(), phase = 0, raf = 0, visible = true, disposed = false;
  const applyTheme = () => {
    u.uColor.value.setRGB(dark ? 0.95 : 0.09, dark ? 0.95 : 0.09, dark ? 0.97 : 0.1);
    mat.blending = NormalBlending;
    mat.needsUpdate = true;
  };
  applyTheme();

  const fit = () => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    const dpr = workingDpr(window.devicePixelRatio || 1, w, h);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 0.9 ? 13.5 : 11;
    camera.updateProjectionMatrix();
    u.uDpr.value = dpr;
  };
  fit();

  const frame = (now: number) => {
    raf = 0;
    if (disposed) return;
    if (!visible || document.hidden) return; // resumed by the observer / visibilitychange
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    const st = workingState({ ...input, t, sincePulse: t - lastPulse });
    phase += st.spin * dt;
    u.uPhase.value = phase;
    u.uTime.value = t;
    u.uRadius.value = st.radius;
    u.uSpread.value = st.spread;
    u.uBurst.value = st.burst;
    u.uGlow.value = st.glow;
    pts.rotation.z += dt * 0.08;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((e) => { visible = !!e[0]?.isIntersecting; if (visible) start(); }) : null;
  io?.observe(canvas);
  const onVis = () => { if (!document.hidden) start(); };
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e: Event) => { e.preventDefault(); hooks.onError?.(); };
  canvas.addEventListener("webglcontextlost", onLost);
  start();

  return {
    set: (i) => { input = i; },
    pulse: () => { lastPulse = t; },
    setDark: (d) => { dark = d; applyTheme(); },
    resize: fit,
    dispose: () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
