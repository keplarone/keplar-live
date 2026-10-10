"use client";

import { useEffect, useRef, useState } from "react";
import { ProductDemo } from "@/components/home/ProductDemo";
import s from "./ProductShowcase.module.css";

/** The product demo on its own (outside the homepage narrative): plays once when in view. */
export function ProductShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = window.setTimeout(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), 0);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setActive(true);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, []);

  return (
    <section className={s.section} aria-label="Product example">
      <div ref={ref} className={s.stage}>
        <ProductDemo active={active} reducedMotion={reduced} />
      </div>
    </section>
  );
}
