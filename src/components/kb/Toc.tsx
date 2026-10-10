"use client";

import { useEffect, useState } from "react";
import s from "./kb.module.css";

export type TocItem = { id: string; text: string; depth: 2 | 3 };

/** "On this page" with scroll-spy. Server-rendered list; the highlight is the only client behavior. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  if (!items.length) return null;
  return (
    <nav className={s.toc} aria-label="On this page">
      <h2>On this page</h2>
      <ol>
        {items.map((i) => (
          <li key={i.id} className={i.depth === 3 ? s.tocSub : undefined}>
            <a className={s.tocLink} href={`#${i.id}`} data-active={active === i.id}>{i.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
