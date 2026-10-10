"use client";
import { useEffect, useRef, useState } from "react";
import s from "./Templates.module.css";

/** Small, scaled, script-free, sandboxed render of the template's home page. Mounted only when scrolled near, so a long gallery stays cheap. */
export function TemplateThumb({ slug, title }: { slug: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  return (
    <div ref={ref} className={s.thumb} style={{ ["--thumb-scale" as string]: String(scale) }} aria-hidden="true">
      {on ? <iframe className={s.frame} src={`/sites/template/${slug}?thumb=1`} title={`Preview of ${title}`} sandbox="" tabIndex={-1} loading="lazy" referrerPolicy="no-referrer" /> : null}
    </div>
  );
}
