"use client";

import { useEffect, useRef, useState } from "react";
import { ProductDemo } from "./ProductDemo";
import s from "./HowDetail.module.css";

/** The product window, replayed from a scripted example. Labelled as such by the window itself. */
export function HowDetail() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const t = window.setTimeout(() => setReduced(rm.matches), 0);
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  }, []);
  return (
    <section id="how-detail" ref={ref} className={s.section} aria-labelledby="how-detail-h">
      <div className={s.inner}>
        <div className={s.head}>
          <p className={s.kicker}>In the app</p>
          <h2 id="how-detail-h" className={s.title}>What an answer looks like.</h2>
          <p className={s.body}>The steps, the intelligences consulted, where they agreed and what it cost, in one thread. This window replays a scripted example; it is not a live result.</p>
        </div>
        <div className={s.stage}>
          <ProductDemo active={active} reducedMotion={reduced} />
        </div>
      </div>
    </section>
  );
}
