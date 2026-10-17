/**
 * Landing-page clouds. Procedural shapes follow procedural-clouds-threejs
 * (Teaching Three.js series), MIT License.
 *
 * Desktop with a WebGPU adapter draws the volumetric march. Other WebGL2 desktops draw a mesh
 * cluster. Phones, low-power devices and reduced motion draw a few billboards, held still or
 * nearly still. The chunk loads after first paint and the loop stops when the canvas is off
 * screen, the tab is hidden, or the visitor is typing.
 */
import { frameGap, isPhone, liteFx } from "@/lib/fx/lite";
import type { CloudHandle } from "./webgl-clouds";

export type CloudMode = "volumetric" | "mesh" | "billboard";

export function chooseCloudMode(): CloudMode {
  if (typeof window === "undefined") return "billboard";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (isPhone() || liteFx() || reduce) return "billboard";
  if ("gpu" in navigator) return "volumetric";
  return "mesh";
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export async function mountClouds(canvas: HTMLCanvasElement): Promise<() => void> {
  const mode = chooseCloudMode();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dark = () => document.documentElement.getAttribute("data-theme") === "dark";
  let handle: CloudHandle | null = null;
  let disposed = false;

  if (mode === "volumetric") {
    try {
      const vol = await import("./volumetric");
      if (!disposed) handle = await vol.createVolumetric(canvas, { dark: dark() });
    } catch (err) {
      console.error("landing clouds", err);
      handle = null;
    }
  }
  if (!handle && !disposed) {
    try {
      const webgl = await import("./webgl-clouds");
      handle = webgl.createWebglClouds(canvas, { mode: mode === "billboard" ? "billboard" : "mesh", dark: dark() });
    } catch (err) {
      console.error("landing clouds", err);
      handle = null;
    }
  }
  if (!handle || disposed) {
    handle?.dispose();
    return () => {};
  }

  const clouds = handle;
  let raf = 0;
  let running = false;
  let onScreen = true;
  let last = 0;
  const nearStatic = mode === "billboard";
  const gap = reduce ? 1e9 : nearStatic ? 1000 / 12 : Math.max(frameGap(false), 1000 / 24);
  const speed = reduce ? 0 : nearStatic ? 0.15 : 1;

  const paint = (now: number) => {
    clouds.frame(reduce ? 0 : (now / 1000) * speed);
  };
  const loop = (now: number) => {
    raf = 0;
    if (disposed || !running) return;
    if (document.hidden || !onScreen) {
      running = false;
      return;
    }
    if (isTyping()) {
      running = false;
      return;
    }
    if (now - last >= gap) {
      last = now;
      paint(now);
    }
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (disposed || running || document.hidden || !onScreen || isTyping()) return;
    running = true;
    if (reduce) {
      paint(0);
      running = false;
      return;
    }
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const io = new IntersectionObserver(([entry]) => {
    onScreen = Boolean(entry?.isIntersecting);
    if (onScreen) start();
    else stop();
  });
  io.observe(canvas);
  const onVis = () => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener("visibilitychange", onVis);
  const onResize = () => {
    clouds.resize();
    paint(performance.now());
  };
  window.addEventListener("resize", onResize);
  const mo = new MutationObserver(() => {
    clouds.setDark(dark());
    paint(performance.now());
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onFocus = () => {
    if (isTyping()) stop();
    else start();
  };
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocus);

  clouds.resize();
  paint(0);
  start();

  return () => {
    disposed = true;
    stop();
    io.disconnect();
    mo.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onFocus);
    window.removeEventListener("resize", onResize);
    clouds.dispose();
  };
}
