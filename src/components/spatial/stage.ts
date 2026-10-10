import { THREE_D_ENABLED } from "@/lib/fx/three-d";
import * as THREE from "three";
import { adaptDpr, startDpr, type Caps, type Quality } from "@/lib/spatial/policy";

export function detectCaps(): Caps {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = THREE_D_ENABLED && Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return {
    webgl,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: Boolean(nav.connection?.saveData),
    mobile: window.matchMedia("(max-width: 760px), (pointer: coarse)").matches,
    deviceMemoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  /** Ask for another frame (render on demand). */
  invalidate: () => void;
  /** Restart the animation clock (elapsed = 0) and render again. */
  restart: () => void;
  dispose: () => void;
};

/**
 * Shared stage: orthographic scene, render on demand (frames only while `update` says it is still
 * animating, the canvas is on screen and the tab is visible), adaptive DPR from measured frame time,
 * full disposal. `quality === "static"` draws one still frame and never starts a loop.
 */
export function createStage(
  canvas: HTMLCanvasElement,
  quality: Exclude<Quality, "off">,
  update: (dt: number, elapsed: number) => boolean,
): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: quality === "high", powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const cap = startDpr(quality, window.devicePixelRatio || 1);
  let dpr = cap;
  let smooth = 16;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    const a = w / h;
    camera.left = -a;
    camera.right = a;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
  };
  fit();
  let raf = 0;
  let running = false;
  let onScreen = false;
  let wanted = true;
  let last = 0;
  let elapsed = 0;
  const draw = () => renderer.render(scene, camera);
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    const ms = (now - (last || now)) || 16;
    last = now;
    elapsed += dt;
    smooth = smooth * 0.9 + ms * 0.1;
    const next = adaptDpr(dpr, smooth, cap);
    if (next !== dpr) {
      dpr = next;
      fit();
    }
    wanted = update(dt, elapsed);
    draw();
    if (wanted && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    else running = false;
  };
  const kick = () => {
    if (quality === "static") {
      update(0, 99);
      draw();
      return;
    }
    if (running || !onScreen || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const ro = new ResizeObserver(() => {
    fit();
    draw();
  });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen) kick();
  });
  io.observe(canvas);
  const onVis = () => !document.hidden && kick();
  document.addEventListener("visibilitychange", onVis);
  if (quality === "static") {
    onScreen = true;
    kick();
  }
  return {
    renderer,
    scene,
    camera,
    invalidate: () => {
      wanted = true;
      kick();
    },
    restart: () => {
      elapsed = 0;
      wanted = true;
      kick();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/**
 * createStage that never throws: when the browser cannot give a WebGL context (blocked GPU, too many contexts,
 * a lost context) the decorative scene is skipped instead of crashing the page. Returns null in that case.
 */
export function tryCreateStage(...args: Parameters<typeof createStage>): Stage | null {
  try {
    return createStage(...args);
  } catch {
    return null;
  }
}
