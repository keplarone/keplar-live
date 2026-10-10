import * as THREE from "three";

/** Shared bits for the two Create canvases. Both draw only white/grey light on dark and graphite ink on light (no blue), follow the app theme live, render only while on screen and visible, and dispose fully. */
export type Glow = { dispose: () => void };

export function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const lowPower = () => window.matchMedia("(max-width: 760px), (pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;

export const dotVertex = `
attribute float aSize; attribute float aAlpha; varying float vA;
void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
export const dotFragment = `
uniform vec3 uInk; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(uInk, a * vA); }`;

/** Theme of the page right now. Dark is the default, same as the root layout. */
export const isDark = () => document.documentElement.getAttribute("data-theme") !== "light";
/** Light-on-dark is white and additive; dark-on-light is graphite and normal-blended (additive dark would vanish). */
export const inkHex = (dark = isDark()) => (dark ? 0xffffff : 0x0b0b0d);

export function dotMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: dotVertex, fragmentShader: dotFragment, uniforms: { uInk: { value: new THREE.Color(inkHex()) } }, transparent: true, depthWrite: false, blending: isDark() ? THREE.AdditiveBlending : THREE.NormalBlending });
}

/** Recolors every material in the scene for the given theme (lines, meshes, dots). Opacity is left to the animation. */
export function recolor(scene: THREE.Scene, dark: boolean) {
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      if (m instanceof THREE.ShaderMaterial) {
        (m.uniforms.uInk?.value as THREE.Color | undefined)?.set(inkHex(dark));
        m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      } else if ((m as THREE.MeshBasicMaterial).color) {
        (m as THREE.MeshBasicMaterial).color.set(inkHex(dark));
      }
    }
  });
}

/** Calls `cb(dark)` whenever <html data-theme> changes (sun/moon/auto in the app, or the OS in Auto). Returns a stopper. */
export function watchTheme(cb: (dark: boolean) => void): () => void {
  const mo = new MutationObserver(() => cb(isDark()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** Runs `tick` each frame while the canvas is on screen and the tab is visible. Returns a stopper. */
export function loop(canvas: HTMLCanvasElement, tick: (dt: number, t: number) => void, still: boolean): () => void {
  let raf = 0;
  let on = false;
  let last = 0;
  let t = 0;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    t += dt;
    tick(dt, t);
    if (on && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (raf || !on || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  if (still) {
    tick(0, 3);
    return () => undefined;
  }
  const io = new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    kick();
  });
  io.observe(canvas);
  const vis = () => kick();
  document.addEventListener("visibilitychange", vis);
  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    document.removeEventListener("visibilitychange", vis);
    on = false;
  };
}

export function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  });
  renderer.dispose();
}

export function fitRenderer(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, dprCap: number) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, r.width);
  const h = Math.max(1, r.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
