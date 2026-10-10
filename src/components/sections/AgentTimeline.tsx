"use client";

import { useEffect, useRef, useState } from "react";
import { agentsCopy } from "@/lib/sections";
import s from "./Agents.module.css";

/** The overnight log. Its rule fills with scroll; entries light up as they are reached. */
export function AgentTimeline() {
  const ref = useRef<HTMLOListElement>(null);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the list enters at 85% of the viewport, 1 when its end passes 45%
      const p = (vh * 0.85 - r.top) / (r.height + vh * 0.4);
      setProgress(Math.max(0, Math.min(1, p)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const n = agentsCopy.timeline.length;
  return (
    <ol ref={ref} className={s.timeline} style={{ ["--p" as string]: progress }}>
      {agentsCopy.timeline.map((e, i) => {
        const reached = progress >= (i + 0.5) / n;
        return (
          <li key={e.time} className={s.event} data-reached={reached || undefined} data-pending={e.pending || undefined}>
            <time className={s.time}>{e.time}</time>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.text}>{e.text}</span>
            {e.pending ? <span className={s.badge}>Approval required</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
