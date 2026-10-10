/**
 * Decides, before first paint and only on "/", whether the home will run its WebGL story or its static composition, and writes it
 * to <html data-fx="webgl|static">. The home is one screen either way, so the page is the same
 * size before and after hydration and nothing shifts (CLS). It mirrors MonolithHome's own decision: reduced motion, no WebGL 2, or a CPU
 * rasteriser (unless the ?fq= QA override is present) means static. If hydration later disagrees (context lost, script import failed)
 * the component falls back to its static mode on its own.
 */
export const HOME_FX_SCRIPT = `(function(){try{if(location.pathname!=="/")return;var fx="webgl";if(matchMedia("(prefers-reduced-motion: reduce)").matches)fx="static";else{var g=document.createElement("canvas").getContext("webgl2");if(!g)fx="static";else{if(!/[?&]fq=/.test(location.search)){var d=g.getExtension("WEBGL_debug_renderer_info"),n=String(g.getParameter(d?d.UNMASKED_RENDERER_WEBGL:g.RENDERER)||"");if(/swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(n))fx="static"}var l=g.getExtension("WEBGL_lose_context");if(l)l.loseContext()}}document.documentElement.setAttribute("data-fx",fx)}catch(e){}})();`;
