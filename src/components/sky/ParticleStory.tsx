"use client";

import { useEffect, useRef, useState } from "react";
import { detectTier } from "@/gl/capability";
import { frameGap, isPhone, liteFx } from "@/lib/fx/lite";
import type { ParticleScene } from "./particle-scene";
import s from "./Sky.module.css";

type Step = { title: string; body: string };

/**
 * "How Keplar works" as a pinned scroll scene: the stage sticks for about three screens while a glowing particle cloud
 * (particle-scene.ts) goes from one core to five linked models to one sphere, and the matching step lights up beside it.
 * Every step stays readable at rest (the others are only dimmed). three.js is its own chunk, fetched when the section nears the
 * viewport, and only on devices with a real GPU (detectTier), independent of the sitewide THREE_D_ENABLED switch. No GPU keeps a
 * CSS glow; prefers-reduced-motion unpins the section (CSS) and draws one still frame of the sphere. Frames run only while the
 * stage is on screen and the tab is visible; lite devices draw fewer points at about 30 fps.
 * Phones (isPhone) never fetch three.js: the section is a plain, unpinned list of the three steps there (Sky.module.css).
 */
export function ParticleStory({ title, muted, steps }: { title: string; muted: string; steps: Step[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const [gl, setGl] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas || isPhone() || detectTier() === "none") return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = liteFx();
    const gap = frameGap(lite);
    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
    let scene: ParticleScene | null = null;
    let disposed = false;
    let raf = 0;
    let onScreen = false;
    let lastFrame = 0;
    let shown = 0;
    let p = 0;

    // 0..2 across the pinned stretch: 0 = core, 1 = five models, 2 = one sphere
    const target = () => {
      const r = section.getBoundingClientRect();
      const run = Math.max(1, r.height - window.innerHeight);
      return Math.min(1, Math.max(0, -r.top / run)) * 2;
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastFrame < gap || !scene) return;
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0.016;
      lastFrame = now;
      // ease toward the scroll position (time-based, so 30 fps and 120 fps settle alike)
      p +=(target() - p) * Math.min(1, dt * 5);
      const step = p < 0.55 ? 0 : p < 1.45 ? 1 : 2;
      if (step !== shown) { shown = step; setActive(step); }
      scene.frame(now, p);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      if (scene && !reduce && onScreen && !document.hidden) raf = requestAnimationFrame(loop);
    };

    const load = () => {
      void import("./particle-scene").then(({ createParticleScene }) => {
        if (disposed) return;
        try {
          scene = createParticleScene(canvas, { lite, dark: isDark() });
        } catch {
          return;
        }
        setGl(true);
        if (reduce) { setActive(2); scene.frame(performance.now(), 2); }
        else { p = target(); run(); }
      }).catch(() => {});
    };

    let started = false;
    const near = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started) { started = true; load(); near.disconnect(); }
    }, { rootMargin: "100% 0px" });
    near.observe(section);
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; run(); });
    io.observe(canvas);

    const onResize = () => { scene?.resize(); if (reduce) scene?.frame(performance.now(), 2); };
    const onPointer = (e: PointerEvent) => scene?.setPointer(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1);
    const mo = new MutationObserver(() => { scene?.setDark(isDark()); if (reduce) scene?.frame(performance.now(), 2); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", onResize);
    if (!lite) window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", run);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      near.disconnect();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", run);
      scene?.dispose();
    };
  }, []);

  return (
    <section ref={sectionRef} className={s.story} aria-labelledby="how-title">
      <div className={s.storyStage}>
        <div className={s.storyGlow} data-hidden={gl ? "" : undefined} aria-hidden="true" />
        <canvas ref={canvasRef} className={s.storyCanvas} aria-hidden="true" />
        <div className={s.storyText}>
          <h2 id="how-title" className={`${s.h2} ${s.storyTitle}`}><span>{title}</span> <span className={s.muted}>{muted}</span></h2>
          <ol className={s.storySteps}>
            {steps.map((st, i) => (
              <li key={st.title} data-active={i === active ? "" : undefined}>
                <span className={s.stepN}>{i + 1}</span>
                <div>
                  <h3>{st.title}</h3>
                  <p>{st.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
