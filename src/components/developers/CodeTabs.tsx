"use client";

/** Tabbed code sample with a copy button. Keyboard: arrow keys move between tabs (WAI-ARIA tabs pattern). */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import s from "./Developers.module.css";
import { useTabIndicator } from "@/components/motion/useTabIndicator";

export type CodeSample = { label: string; code: string };

export function CodeTabs({ samples, label }: { samples: CodeSample[]; label: string }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  useTabIndicator(listRef, i); // the underline slides to the picked tab
  const cur = samples[i] ?? samples[0]!;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + samples.length) % samples.length;
    setI(next);
    setCopied(false);
    refs.current[next]?.focus();
  };

  const copy = () => {
    void navigator.clipboard?.writeText(cur.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }).catch(() => undefined);
  };

  return (
    <div className={s.code}>
      <div className={s.codeBar}>
        <div ref={listRef} className={s.tabs} role="tablist" aria-label={label} data-slide="">
          {samples.map((x, n) => (
            <button
              key={x.label}
              ref={(el) => { refs.current[n] = el; }}
              type="button"
              role="tab"
              id={`${id}-t${n}`}
              aria-selected={n === i}
              aria-controls={`${id}-p`}
              tabIndex={n === i ? 0 : -1}
              className={s.tab}
              onClick={() => { setI(n); setCopied(false); }}
              onKeyDown={onKey}
            >
              {x.label}
            </button>
          ))}
          <span className="m-tab-indicator" aria-hidden="true" />
        </div>
        <button type="button" className={s.copy} onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className={s.pre} id={`${id}-p`} role="tabpanel" aria-labelledby={`${id}-t${i}`} tabIndex={0}><code>{cur.code}</code></pre>
    </div>
  );
}
