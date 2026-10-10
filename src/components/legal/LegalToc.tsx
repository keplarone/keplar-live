"use client";

import { useEffect, useState } from "react";
import s from "./Legal.module.css";

type Item = { id: string; title: string };

/**
 * Table of contents with scroll-spy. Sticky on desktop; a native
 * <details> disclosure on mobile, so it works without JavaScript too.
 */
export function LegalToc({ items, label = "On this page" }: { items: Item[]; label?: string }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActive(top);
        }
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const list = (
    <ol className={s.tocList}>
      {items.map((i) => (
        <li key={i.id}>
          <a href={`#${i.id}`} className={s.tocLink} aria-current={active === i.id ? "true" : undefined}>
            {i.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <nav className={s.tocDesktop} aria-label={label}>
        <p className={s.tocLabel}>{label}</p>
        {list}
      </nav>
      <details className={s.tocMobile}>
        <summary className={s.tocSummary}>
          <span>{label}</span>
          <span className={s.tocCount}>{items.length} sections</span>
        </summary>
        <nav aria-label={label}>{list}</nav>
      </details>
    </>
  );
}
