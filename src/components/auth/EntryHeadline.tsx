"use client";
import { useState } from "react";
import { RotatingHeadline } from "@/components/ui/space";
import s from "./auth.module.css";

/**
 * The sign-in statement as Space Studio's cycling headline (gradient verb, glyphs rising out of a motion blur), with a pause
 * control because it rotates on its own (WCAG 2.2.2). Screen readers get `label`, the stable sentence. Still on phones.
 */
export function EntryHeadline({ lines, label }: { lines: readonly (readonly [string, string])[]; label: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <>
      <RotatingHeadline as="p" className={s.panelTitle} lines={lines} label={label} paused={paused} />
      <button type="button" className={s.pause} onClick={() => setPaused((p) => !p)}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          {paused ? <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" /> : <path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" fill="currentColor" />}
        </svg>
        <span>{paused ? "Play" : "Pause"}<span className="visually-hidden"> the moving headline</span></span>
      </button>
    </>
  );
}
