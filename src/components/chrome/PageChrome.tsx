"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import s from "./PageChrome.module.css";

type Item = { el: HTMLElement; label: string };

/**
 * Shared page layer for the marketing routes: a quiet reading-progress hairline along the top and a left tick index built from the
 * page's own <h2> headings (the same language as the home story's section index). Purely orientation: it adds no content, takes no tab
 * stops, hides on small screens, and never touches scrolling (the page scrolls natively; clicking a tick uses scrollIntoView).
 */
export function PageChrome() {
  const path = usePathname();
  const bar = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const list = useRef<Item[]>([]);
  const home = path === "/";

  useEffect(() => {
    if (home) return;
    let raf = 0;
    const collect = () => {
      const hs = Array.from(document.querySelectorAll<HTMLElement>("main h2")).filter((h) => (h.textContent ?? "").trim().length > 1 && h.getBoundingClientRect().height > 0);
      const picked: Item[] = [];
      let lastTop = Number.NaN;
      for (const h of hs) {
        if (picked.length >= 9) break;
        if (h.closest("footer, [role='dialog'], nav, [data-still], [data-stage-window]")) continue; // demo windows are illustrations, not page sections
        // Headings side by side (e.g. the plan cards on /pricing) scroll to the same place: keep one tick per row, not one dead tick per card.
        const top = Math.round(h.getBoundingClientRect().top + window.scrollY);
        if (Math.abs(top - lastTop) <= 8) continue;
        lastTop = top;
        picked.push({ el: h, label: (h.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60) });
      }
      list.current = picked.length >= 3 ? picked : [];
      setItems(list.current.map((i) => i.label));
    };
    const frame = () => {
      raf = 0;
      // all layout reads first, then the one style write, so a scroll frame never forces a second style/layout pass
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      const mid = window.innerHeight * 0.4;
      let idx = -1;
      list.current.forEach((it, i) => { if (it.el.getBoundingClientRect().top < mid) idx = i; });
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`;
      setActive((a) => (a === idx ? a : idx));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const t = window.setTimeout(() => { collect(); frame(); }, 600);
    const t2 = window.setTimeout(() => { collect(); frame(); }, 2500); // late-hydrating sections
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.clearTimeout(t); window.clearTimeout(t2);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      list.current = [];
      setItems([]);
    };
  }, [path, home]);

  if (home) return null;
  return (
    <>
      <div className={s.progress} aria-hidden="true"><div ref={bar} className={s.bar} /></div>
      {items.length > 0 && (
        <ol className={s.index} aria-hidden="true">
          {items.map((label, i) => (
            <li key={`${i}-${label}`} data-active={i === active || undefined}>
              <button type="button" tabIndex={-1} onClick={() => list.current[i]?.el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}>
                <i />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
