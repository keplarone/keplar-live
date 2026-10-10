"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { noWebGL, probeCaps, softwareRenderer } from "@/field/caps";
import { createSceneHandle, type SceneHandle } from "@/field/host";
import { FIELD_EVENT, profileFor, type FieldDetail, type PageProfile } from "@/field/profile";
import type { SceneId, SceneParams } from "@/field/scenes";
import { fxDebug, fxDebugClear } from "@/field/debug";
import { resolveTier } from "@/lib/spatial/policy";
import { isTextTarget } from "@/lib/typing/insert-mode";

/**
 * The page-wide particle layer: ONE canvas and ONE renderer for the whole session. Each page picks a scene built from
 * the same tiny sharp points (Ask: models fan out and converge; Pricing: tiered formations; Memory: a constellation; ...),
 * and navigating morphs point-by-point into the next scene instead of cutting. The renderer lives in a worker on an
 * OffscreenCanvas when the browser allows it, and every point moves on the GPU from a time uniform, so the layer is
 * always alive (reduced motion only slows it) and costs the typing path nothing: no hold-still, no per-key work.
 * Home has its own scroll-linked field and published sites are never touched; there the layer just pauses.
 */
type Ctl = {
  canvas: HTMLCanvasElement | null;
  handle: SceneHandle | null;
  creating: boolean;
  disposed: boolean;
  profile: PageProfile | null;
  override: SceneId | null;
  params: SceneParams;
  teardown: (() => void)[];
  retries: number;
};

const root = () => document.documentElement;

function effectiveScene(c: Ctl): SceneId {
  const p = c.profile;
  if (!p) return "calm";
  return p.id === "app" || p.id === "onboarding" ? c.override ?? p.scene : p.scene;
}

function apply(c: Ctl) {
  const p = c.profile;
  const cv = c.canvas;
  if (!cv) return;
  if (!p) {
    cv.style.display = "none";
    c.handle?.setVisible(false);
    root().removeAttribute("data-field");
    root().removeAttribute("data-field-ask");
    return;
  }
  cv.style.display = "";
  cv.style.setProperty("--pf-o", String(p.opacity));
  const speedMul = probeCaps().reducedMotion ? 0.12 : 1;
  const h = c.handle;
  if (h) {
    h.setConfig({ fpsCap: p.fpsCap, density: p.density, speed: p.speed * speedMul, calm: probeCaps().reducedMotion });
    h.setScene(effectiveScene(c), c.params);
    h.setVisible(!document.hidden);
  }
  if (root().dataset.field) root().dataset.field = p.id;
}

async function ensure(c: Ctl, forceMain = false) {
  if (c.creating || c.disposed || !c.profile) return;
  const p = c.profile;
  const caps = probeCaps();
  const params = new URLSearchParams(window.location.search);
  const fq = params.get("fq");
  // CPU-rendered WebGL (no GPU) would block the page for seconds: the layer stays off and the page keeps its plain background.
  if (softwareRenderer() || noWebGL()) { fxDebug({ layer: "page", note: "no GPU WebGL: layer off" }); return; }
  // Never off, never frozen: weak device / data saver / reduced motion / mobile only lower the tier, the pixel ratio or the
  // drift speed. The one thing that stops the layer is a browser with no WebGL at all (and even then it retries on navigation).
  const tier = resolveTier(p.intensity, caps);
  const quality = fq === "low" || fq === "medium" || fq === "high" ? fq : tier.quality;
  const slow = tier.speed;
  const weak = tier.quality === "low" && /device|cores|data-saver/.test(tier.reason);
  c.creating = true;
  const canvas = document.createElement("canvas");
  canvas.className = "pagefield";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.setProperty("--pf-o", String(p.opacity));
  document.body.prepend(canvas);
  const mobile = window.matchMedia("(max-width: 899px)").matches;
  const pin = Number(params.get("fdpr"));
  try {
    const handle = await createSceneHandle(
      canvas,
      {
        quality: quality as "low" | "medium" | "high",
        form: mobile ? "mobile" : "desktop",
        dark: root().getAttribute("data-theme") !== "light",
        scene: effectiveScene(c),
        params: c.params,
        calm: caps.reducedMotion,
        fpsCap: weak ? Math.min(30, p.fpsCap ?? 30) : p.fpsCap,
        density: p.density,
        speed: p.speed * slow * (weak ? 0.6 : 1),
        pinDpr: Number.isFinite(pin) && pin > 0 ? pin : undefined,
        forceMain: forceMain || params.get("fworker") === "0",
      },
      {
        onFirstFrame: () => { if (c.profile) root().dataset.field = c.profile.id; },
        onStats: (st) => fxDebug({ layer: "page", fps: st.fps, dpr: st.dpr, count: st.count }),
        onError: () => {
          // The worker could not render (no WebGL there, module blocked) or the GPU context was lost for good:
          // rebuild the renderer on a fresh canvas (main thread), a few times at most.
          if (c.disposed || c.retries >= 4) return;
          c.retries++;
          fxDebug({ layer: "page", note: `renderer rebuilt (attempt ${c.retries})` });
          c.teardown.forEach((f) => f());
          c.teardown = [];
          c.handle?.dispose();
          c.handle = null;
          canvas.remove();
          c.canvas = null;
          c.creating = false;
          void ensure(c, true);
        },
      },
    );
    if (c.disposed) {
      handle.dispose();
      canvas.remove();
      return;
    }
    c.canvas = canvas;
    c.handle = handle;
    fxDebug({ layer: "page", tier: quality, mode: handle.mode, reason: tier.reason, note: `scene ${effectiveScene(c)}` });
    const ro = new ResizeObserver(() => handle.resize());
    ro.observe(canvas);
    const mo = new MutationObserver(() => handle.setDark(root().getAttribute("data-theme") !== "light"));
    mo.observe(root(), { attributes: true, attributeFilter: ["data-theme"] });
    const onVis = () => handle.setVisible(!document.hidden && Boolean(c.profile));
    document.addEventListener("visibilitychange", onVis);
    c.teardown.push(() => { ro.disconnect(); mo.disconnect(); document.removeEventListener("visibilitychange", onVis); });
    apply(c);
  } catch {
    canvas.remove();
    c.canvas = null;
  } finally {
    c.creating = false;
  }
}

export function PageField() {
  const path = usePathname();
  const profile = profileFor(path);
  const ctl = useRef<Ctl>({ canvas: null, handle: null, creating: false, disposed: false, profile: null, override: null, params: {}, teardown: [], retries: 0 });

  // Listeners and teardown: once, for the whole session.
  useEffect(() => {
    const c = ctl.current;
    c.disposed = false;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reactive = () => Boolean(c.profile?.reactive);
    const onMove = (e: PointerEvent) => { if (reactive()) c.handle?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1), true); };
    const onLeave = () => c.handle?.setPointer(0, 0, false);
    const onIn = (e: FocusEvent) => { if (reactive() && isTextTarget(e.target)) c.handle?.setEnergy(1); };
    const onOut = (e: FocusEvent) => { if (isTextTarget(e.target)) c.handle?.setEnergy(0); };
    let settle = 0;
    const endAsk = () => { root().removeAttribute("data-field-ask"); c.handle?.setAsk(null); };
    const onField = (e: Event) => {
      const d = (e as CustomEvent<FieldDetail>).detail;
      if (d?.phase === "boom" || d?.phase === "personalize") {
        if (c.profile?.id === "onboarding") {
          if (d.phase === "boom") c.handle?.boom(d.x, d.y, d.strength);
          else c.handle?.setPersonalize(d.on);
        }
        return;
      }
      if (d?.phase === "scene" && c.profile?.id === "onboarding") {
        c.override = d.scene;
        c.params = { picks: d.picks };
        c.handle?.setScene(d.scene, c.params);
        return;
      }
      if (!d || c.profile?.id !== "app") {
        if (d?.phase === "scene") c.override = d.scene;
        return;
      }
      window.clearTimeout(settle);
      if (d.phase === "scene") {
        c.override = d.scene;
        c.handle?.setScene(d.scene);
      } else if (d.phase === "ask") {
        root().dataset.fieldAsk = "1";
        c.handle?.setAsk(d.p);
      } else if (root().dataset.fieldAsk) {
        c.handle?.setAsk(1); // the answer arrived: everything converges, holds a moment, then relaxes
        settle = window.setTimeout(endAsk, 2400);
      }
    };
    if (fine) {
      window.addEventListener("pointermove", onMove, { passive: true });
      root().addEventListener("pointerleave", onLeave);
    }
    // Scroll-driven camera: the page's scroll progress (window scroll on marketing pages) moves the scene's camera. One passive
    // listener, one rAF per frame at most, one tiny message; the renderer eases it, so nothing here touches layout.
    let scrollRaf = 0;
    const sendScroll = () => {
      scrollRaf = 0;
      const el = document.scrollingElement ?? document.documentElement;
      const max = Math.max(1, el.scrollHeight - window.innerHeight);
      c.handle?.setScroll(Math.min(1, Math.max(0, el.scrollTop / max)));
    };
    const onScroll = () => { if (!scrollRaf) scrollRaf = window.requestAnimationFrame(sendScroll); };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    window.addEventListener(FIELD_EVENT, onField);
    return () => {
      c.disposed = true;
      window.clearTimeout(settle);
      window.removeEventListener("pointermove", onMove);
      root().removeEventListener("pointerleave", onLeave);
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener(FIELD_EVENT, onField);
      window.removeEventListener("scroll", onScroll);
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      c.teardown.forEach((f) => f());
      c.teardown = [];
      c.handle?.dispose();
      c.handle = null;
      c.canvas?.remove();
      c.canvas = null;
      fxDebugClear("page");
      root().removeAttribute("data-field");
      root().removeAttribute("data-field-ask");
    };
  }, []);

  // Every navigation: same renderer, next scene.
  useEffect(() => {
    const c = ctl.current;
    if (c.profile?.id !== profile?.id) { c.override = null; c.params = {}; } // a stale scene from another surface never carries over
    c.profile = profile;
    if (profile && !c.canvas && !c.creating) void ensure(c);
    else apply(c);
    c.handle?.setScroll(0); // a new page starts at its top; the camera travels back to the scene's opening pose
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile objects are rebuilt per path; the path is the key
  }, [path]);

  return null;
}
