"use client";

import { useEffect, useRef } from "react";
import { creationCopy } from "@/lib/sections";
import { SectionHeader } from "./SectionHeader";
import s from "./Creation.module.css";

/**
 * Scattered artifact → organized project. Scroll-scrubbed; static final layout for reduced motion AND for phones/tablets
 * (width < 900 px) and for any window too short to hold the pinned screen: there the section is not pinned, so the scatter start state (tiles shifted by up to 100% of their width,
 * rotated, scaled) sat on screen half-played and cut off by the section's overflow while people read the heading.
 */
const SCATTER = [
  { x: -38, y: -30, r: -7, z: 120, s: 0.92 },
  { x: 30, y: -42, r: 6, z: 40, s: 0.86 },
  { x: 44, y: 22, r: -4, z: 160, s: 0.96 },
  { x: -46, y: 34, r: 5, z: 80, s: 0.9 },
  { x: -6, y: 48, r: -3, z: 200, s: 0.84 },
  { x: 12, y: -12, r: 8, z: 0, s: 1 },
];

function Visual({ id }: { id: string }) {
  switch (id) {
    case "website":
      return (
        <div className={s.vWebsite}>
          <div className={s.vBar}><i /><i /><i /></div>
          <div className={s.vHero}><b /><b /><span /></div>
          <div className={s.vCols}><span /><span /><span /></div>
        </div>
      );
    case "app":
      return (
        <div className={s.vApp}>
          <div className={s.vPhone}>
            <span className={s.vNotch} />
            {Array.from({ length: 5 }, (_, i) => <span key={i} className={s.vRow} />)}
            <span className={s.vTab} />
          </div>
        </div>
      );
    case "image":
      return (
        <div className={s.vImage}>
          <span className={s.vShapeA} />
          <span className={s.vShapeB} />
          <span className={s.vShapeC} />
        </div>
      );
    case "video":
      return (
        <div className={s.vVideo}>
          <div className={s.vFrame}><span className={s.vPlay} /></div>
          <div className={s.vStrip}>{Array.from({ length: 8 }, (_, i) => <span key={i} />)}<i /></div>
        </div>
      );
    case "code":
      return (
        <pre className={s.vCode} aria-hidden="true">
          <code>
            <span className={s.k}>const</span> plans = tiers{"\n"}
            {"  "}.<span className={s.f}>filter</span>(live){"\n"}
            {"  "}.<span className={s.f}>map</span>(toOffer);{"\n"}
            <span className={s.k}>function</span> <span className={s.f}>quote</span>(c) {"{"}{"\n"}
            {"  "}<span className={s.k}>return</span> c.n * rate;{"\n"}
            {"}"}
          </code>
        </pre>
      );
    default:
      return (
        <div className={s.vDoc}>
          <b />
          {Array.from({ length: 6 }, (_, i) => <span key={i} style={{ width: `${[92, 86, 94, 70, 88, 60][i]}%` }} />)}
          <div className={s.vCites}><em>1</em><em>2</em><em>3</em></div>
        </div>
      );
  }
}

export function Creation() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    const sticky = el?.querySelector<HTMLElement>("[data-sticky]");
    const inner = sticky?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !sticky || !inner) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 899px)");
    let kill = () => {};
    let cancelled = false;
    let animated = false;

    // The pinned (scroll-scrubbed) layout is only used when the whole pinned screen fits the window. On phones, in reduced motion, and on any
    // window too short for it (landscape phones and tablets, short laptops, a big iPad in portrait, 200% zoom) the final layout is shown as
    // a normal section instead of a pinned screen that cuts the bottom row off.
    const fitsPinned = () => {
      el.removeAttribute("data-static");
      sticky.style.removeProperty("--creation-shrink");
      if (reduce.matches || narrow.matches) return false;
      // The room the scene really has: the pinned screen minus the nav clearance (top padding) and the bottom padding. Layout heights only:
      // transforms and the 3D stage do not count.
      const cs = getComputedStyle(sticky);
      const room = () => sticky.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      let over = inner.offsetHeight - room();
      if (over > 1) {
        // Too tall by `over`: take it out of the two rows of previews (each loses over/2). The rows do not shrink exactly 1:1 (rounding, minimum
        // heights), so measure again and top up a few times; give up (stacked layout) if they would get too small.
        let shrink = 0;
        for (let i = 0; i < 5 && over > 1; i++) {
          shrink += Math.ceil(over);
          sticky.style.setProperty("--creation-shrink", `${shrink}px`);
          over = inner.offsetHeight - room();
        }
        const tile = el.querySelector<HTMLElement>("[data-art] > div");
        if (over > 1 || (tile && tile.offsetHeight < 96)) { sticky.style.removeProperty("--creation-shrink"); return false; }
      }
      return true;
    };
    const start = async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || animated || el.hasAttribute("data-static")) return;
      gsap.registerPlugin(ScrollTrigger);
      const tiles = el.querySelectorAll<HTMLElement>("[data-tile]");
      const frame = el.querySelector<HTMLElement>("[data-frame]");
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      tiles.forEach((t, i) => {
        const sc = SCATTER[i];
        tl.fromTo(
          t,
          { xPercent: sc.x * 2.2, yPercent: sc.y * 2.2, rotate: sc.r, z: sc.z, scale: sc.s },
          { xPercent: 0, yPercent: 0, rotate: 0, z: 0, scale: 1, duration: 1 },
          i * 0.04,
        );
      });
      if (frame) tl.fromTo(frame, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45 }, 0.6);
      const st = ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom bottom", scrub: 1, animation: tl });
      animated = true;
      kill = () => { st.kill(); tl.revert(); animated = false; };
    };
    const decide = () => {
      if (animated) { kill(); kill = () => {}; }
      if (fitsPinned()) void start();
      else el.setAttribute("data-static", "");
    };
    decide();
    void document.fonts?.ready.then(() => { if (!cancelled) decide(); }); // the web font changes text height
    let t = 0;
    const onResize = () => { window.clearTimeout(t); t = window.setTimeout(decide, 150); };
    window.addEventListener("resize", onResize);
    return () => { cancelled = true; window.clearTimeout(t); window.removeEventListener("resize", onResize); kill(); };
  }, []);

  return (
    <section ref={root} className={s.section} aria-labelledby="creation-title">
      <div className={s.sticky} data-sticky="">
        <div className={s.inner}>
          <SectionHeader tone="creation" id="creation-title" label={creationCopy.label} title={creationCopy.title} lede={creationCopy.lede} align="split" />
          <div className={s.stage}>
            <div className={s.frame} data-frame aria-hidden="true">
              <div className={s.frameBar}>
                <span className={s.frameTitle}>{creationCopy.workspace}</span>
                <span className={s.frameMeta}>Project · 6 artifacts</span>
              </div>
            </div>
            <ul className={s.grid}>
              {creationCopy.artifacts.map((a) => (
                <li key={a.id} className={s.tile} data-tile data-art={a.id}>
                  <div className={a.id === "code" ? `${s.visual} ${s.visualFit}` : s.visual} aria-hidden="true"><Visual id={a.id} /></div>
                  <div className={s.caption}>
                    <span className={s.name}>{a.name}</span>
                    <span className={s.meta}>{a.meta}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
