"use client";
/**
 * Mirrors which landing chapter is on screen into the page, for CSS and analytics:
 *   - <html data-chapter="create">
 *   - window event "keplar:chapter-view" with detail { id, index } (index into CHAPTERS, -1 when none)
 *   - window.__keplarChapter = { id, index }
 * The space scene does NOT need this: it reads the same data-chapter sections itself (src/field/monolith/CHAPTERS.md). This
 * deliberately never dispatches "keplar:chapter", because that event overrides the scene's scroll-driven progress.
 */
import { useEffect } from "react";
import { CHAPTERS } from "@/lib/features";

declare global { interface Window { __keplarChapter?: { id: string | null; index: number } } }

export function ChapterSync() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<Element, number>();
    let cur: string | null = null;
    const emit = (id: string | null) => {
      if (id === cur) return;
      cur = id;
      const index = id ? CHAPTERS.findIndex((c) => c.id === id) : -1;
      if (id) document.documentElement.dataset.chapter = id;
      else delete document.documentElement.dataset.chapter;
      window.__keplarChapter = { id, index };
      window.dispatchEvent(new CustomEvent("keplar:chapter-view", { detail: { id, index } }));
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
      let best: HTMLElement | null = null;
      let ratio = 0;
      for (const el of els) { const r = seen.get(el) ?? 0; if (r > ratio) { ratio = r; best = el; } }
      emit(best?.dataset.chapter ?? null);
    }, { rootMargin: "-35% 0px -45% 0px", threshold: [0, 0.01, 0.25, 0.5, 1] });
    els.forEach((el) => io.observe(el));
    return () => { io.disconnect(); delete document.documentElement.dataset.chapter; };
  }, []);
  return null;
}
