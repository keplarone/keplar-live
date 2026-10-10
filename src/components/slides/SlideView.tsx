"use client";
import type { CSSProperties } from "react";
import { paletteVars } from "@/lib/slides/themes";
import type { DeckTheme, Slide } from "@/lib/slides/types";
import s from "./slides.module.css";

/** One slide at 16:9. Sizes use container units, so the same markup is the thumbnail, the editor preview and the fullscreen slide. */
export function SlideView({ slide, theme, index, label }: { slide: Slide; theme: DeckTheme; index?: number; label?: string }) {
  const big = slide.layout !== "content";
  return (
    <div className={s.frame} style={paletteVars(theme) as CSSProperties} role="img" aria-label={label ?? `Slide ${(index ?? 0) + 1}: ${slide.title}`}>
      <div className={s.slide} data-layout={slide.layout}>
        {slide.section && slide.layout !== "closing" ? <p className={s.section}>{slide.section}</p> : null}
        <h3 className={s.sTitle}>{slide.title}</h3>
        <div className={s.body} data-big={big || undefined}>
          {slide.bullets.length ? (
            <ul className={s.bullets}>
              {slide.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          ) : null}
          {!big && slide.imagePrompt ? (
            <div className={s.placeholder}>
              <span className={s.phLabel}>Image placeholder</span>
              <span className={s.phText}>{slide.imagePrompt}</span>
            </div>
          ) : null}
        </div>
        {index !== undefined ? <span className={s.num}>{index + 1}</span> : null}
      </div>
    </div>
  );
}
