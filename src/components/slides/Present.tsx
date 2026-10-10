"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "@/lib/slides/types";
import { SlideView } from "./SlideView";
import s from "./slides.module.css";

/** Full-screen presenting: arrow keys / Space / click to move, Esc to leave, N toggles speaker notes. */
export function Present({ deck, start, onClose }: { deck: Deck; start: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, deck.slides.length - 1));
  const [notes, setNotes] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const go = useCallback((d: number) => setI((v) => Math.max(0, Math.min(deck.slides.length - 1, v + d))), [deck.slides.length]);

  useEffect(() => {
    const el = root.current;
    el?.focus();
    void el?.requestFullscreen?.().catch(() => undefined);
    const onFs = () => {
      if (!document.fullscreenElement && fsEntered.current) onClose();
    };
    const fsEntered = { current: false };
    const t = window.setTimeout(() => (fsEntered.current = Boolean(document.fullscreenElement)), 400);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "Enter") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Backspace") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(deck.slides.length - 1);
      else if (e.key.toLowerCase() === "n") setNotes((v) => !v);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, deck.slides.length]);

  const slide = deck.slides[i];
  return (
    <div ref={root} className={s.present} role="dialog" aria-modal="true" aria-label={`Presenting ${deck.title}`} tabIndex={-1} data-theme-deck={deck.theme}>
      <div className={s.presentStage} onClick={() => go(1)}>
        <SlideView slide={slide} theme={deck.theme} index={i} />
      </div>
      {notes && slide.notes ? <p className={s.presentNotes}>{slide.notes}</p> : null}
      <div className={s.presentBar} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={s.pBtn} onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide">←</button>
        <span className={s.pCount} aria-live="polite">{i + 1} / {deck.slides.length}</span>
        <button type="button" className={s.pBtn} onClick={() => go(1)} disabled={i === deck.slides.length - 1} aria-label="Next slide">→</button>
        <button type="button" className={s.pBtn} onClick={() => setNotes((v) => !v)} aria-pressed={notes}>Notes</button>
        <button type="button" className={s.pBtn} onClick={onClose}>Exit</button>
      </div>
    </div>
  );
}
