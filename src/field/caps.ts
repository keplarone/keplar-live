import type { Caps } from "@/lib/spatial/policy";
/** Device capability probe (no three import, so it is safe in the main bundle). */
let webglOk: boolean | undefined;
export function probeCaps(): Caps {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  // probed once: every probe would otherwise leak a WebGL context (browsers cap them)
  if (webglOk === undefined) {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      // A CPU-rendered context (no GPU) counts as "no WebGL" for every consumer of caps.webgl (home orb, scenes): they show their still/static fallback.
      let soft = false;
      if (gl && !new URLSearchParams(window.location.search).has("fq")) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        soft = isSoftwareRendererName(String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? ""));
      }
      webglOk = Boolean(gl) && !soft;
      (gl?.getExtension("WEBGL_lose_context"))?.loseContext();
    } catch {
      webglOk = false;
    }
  }
  const webgl = webglOk;
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

/** Names the browsers report for CPU rasterizers (no GPU: VMs, remote desktops, blocklisted drivers, headless audit tools). */
export const isSoftwareRendererName = (name: string) => /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(name);

let softwareGl: boolean | undefined;
/**
 * True when WebGL would be drawn by the CPU. Those frames take seconds on the main thread (measured: Lighthouse mobile
 * 60 on the home page with the field running, vs 97+ on pages without it), so the particle layers stay off there and the
 * static composition shows instead. Real GPUs are never affected. `?fq=low|medium|high` (the QA tier override) bypasses it.
 */
export function softwareRenderer(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("fq")) return false;
  if (softwareGl !== undefined) return softwareGl;
  try {
    const gl = (document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return (softwareGl = false); // no WebGL at all is handled by the callers' own fallbacks
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    softwareGl = isSoftwareRendererName(name);
  } catch {
    softwareGl = false;
  }
  return softwareGl;
}

/** True when the browser can't make any WebGL context (so nothing could be drawn; three.js would only log errors). */
export function noWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !gl;
  } catch {
    return true;
  }
}
