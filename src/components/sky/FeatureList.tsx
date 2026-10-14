"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MiniDemo } from "./MiniDemos";
import s from "./Sky.module.css";

type Row = { id: string; n: string; label: string; title: string };

/**
 * "Everything in Keplar" as a hover list (after the reference recording): while the pointer is over a row, a small window floats
 * beside the cursor and plays that feature's looping mini demo. The window trails the pointer on a spring and tilts a little with
 * its speed; moving to another row swaps the demo. Keyboard focus shows the same window next to the focused row. Touch screens and
 * reduced motion get no floating window (the rows keep their text).
 */
export function FeatureList({ rows }: { rows: Row[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0, vx: 0 });
  const raf = useRef(0);

  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(fine.matches && !calm.matches);
    sync();
    fine.addEventListener("change", sync);
    calm.addEventListener("change", sync);
    return () => { fine.removeEventListener("change", sync); calm.removeEventListener("change", sync); };
  }, []);

  useEffect(() => {
    if (!active || !enabled) return;
    const step = () => {
      const p = pos.current;
      const t = target.current;
      const dx = t.x - p.x;
      p.vx = dx * 0.16;
      p.x += p.vx;
      p.y += (t.y - p.y) * 0.16;
      const tilt = Math.max(-8, Math.min(8, p.vx * 0.35));
      if (cardRef.current) cardRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${tilt}deg)`;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [active, enabled]);

  const moveTo = (clientX: number, clientY: number, jump: boolean) => {
    const box = listRef.current?.getBoundingClientRect();
    if (!box) return;
    target.current = { x: clientX - box.left + 28, y: clientY - box.top - 110 };
    if (jump) pos.current = { ...target.current, vx: 0 };
  };

  return (
    <div className={s.featureWrap}>
      <ol
        ref={listRef}
        className={s.featureList}
        onPointerMove={(e) => { if (e.pointerType === "mouse") moveTo(e.clientX, e.clientY, !active); }}
        onPointerLeave={() => setActive(null)}
      >
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/features#${c.id}`}
              className={s.featureRow}
              data-active={active === c.id || undefined}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setActive(c.id); }}
              onFocus={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                moveTo(r.left + r.width * 0.55, r.top + r.height / 2, true);
                setActive(c.id);
              }}
              onBlur={() => setActive(null)}
            >
              <span className={s.featureN}>{c.n}</span>
              <span className={s.featureName}>{c.label}</span>
              <span className={s.featureLede}>{c.title}</span>
            </Link>
          </li>
        ))}
      </ol>
      {enabled ? (
        <div ref={cardRef} className={s.floatCard} data-shown={active ? "" : undefined} aria-hidden="true">
          {rows.map((c) => (
            <div key={c.id} className={s.floatScene} data-on={active === c.id || undefined}>
              {active === c.id ? <MiniDemo id={c.id} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
