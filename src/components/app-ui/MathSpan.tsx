"use client";

import { useEffect, useRef, useState } from "react";
import s from "./Markdown.module.css";

type Loaded = typeof import("./math-loader");
let loaded: Loaded | null = null;
let loading: Promise<Loaded | null> | null = null;

function load(): Promise<Loaded | null> {
  loading ??= import("./math-loader").then((m) => (loaded = m)).catch(() => null);
  return loading;
}

/**
 * One formula. Until KaTeX has loaded (first formula only) the space is reserved with invisible text, so no raw LaTeX
 * flashes. A formula KaTeX cannot parse shows its source as written, muted, never red and never an error.
 */
export function MathSpan({ tex, display, raw }: { tex: string; display: boolean; raw: string }) {
  const [, tick] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(false);
  useEffect(() => {
    if (!loaded) {
      let live = true;
      void load().then(() => live && tick((n) => n + 1));
      return () => { live = false; };
    }
  }, []);
  const html = loaded ? loaded.renderTex(tex, display) : null;

  useEffect(() => {
    const el = box.current;
    if (!display || !el || !html) return;
    const measure = () => setScroll(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [display, html]);

  if (!loaded) return <span className={s.mathPending} aria-hidden="true">{tex}</span>;
  if (html === null) return <span className={s.mathRaw}>{raw}</span>;
  if (display) {
    return (
      <span
        ref={box}
        className={s.mathDisplay}
        tabIndex={scroll ? 0 : undefined}
        role={scroll ? "group" : undefined}
        aria-label={scroll ? "Equation, scrollable" : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <span className={s.mathInline} dangerouslySetInnerHTML={{ __html: html }} />;
}
