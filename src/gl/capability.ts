export type GLTier = "none" | "low" | "mobile" | "desktop";

/** Feature detection only; no user-agent sniffing. */
export function detectTier(): GLTier {
  if (typeof window === "undefined") return "none";
  try {
    const c = document.createElement("canvas");
    // failIfMajorPerformanceCaveat: no context when the browser would fall back to
    // software rendering (no GPU, blocklisted driver, VMs/remote desktops).
    const opts = { failIfMajorPerformanceCaveat: true };
    const gl = (c.getContext("webgl2", opts) || c.getContext("webgl", opts)) as WebGLRenderingContext | null;
    if (!gl) return "none";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    // Software rasterizers make the stage's first frames block the main thread for seconds.
    if (/swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(renderer)) return "none";
  } catch {
    return "none";
  }
  const narrow = window.matchMedia("(max-width: 899px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  if (narrow || coarse) return weak ? "low" : "mobile";
  return weak ? "low" : "desktop";
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
