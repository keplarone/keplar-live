"use client";

import { STORY_BEATS, beatAt } from "@/field/monolith/story";
import s from "./StoryCaptions.module.css";

/**
 * DOM captions for the Monolith scroll story. Real text (Google Sans, selectable, accessible) — never drawn in WebGL.
 * WebGL mode: one beat at a time, cross-faded from damped act position. Static / reduced-motion: the full list.
 */
export function StoryCaptions({ act, staticMode, mobile, beats, label = "How Keplar works" }: { act: number; staticMode: boolean; mobile: boolean; beats?: Record<string, { text: string; short: string }>; label?: string }) {
  const say = (b: (typeof STORY_BEATS)[number]) => beats?.[b.id] ?? b;
  // Derived during render (no effect setState): beatAt is pure and cheap.
  const idx = staticMode ? -1 : beatAt(act);

  if (staticMode) {
    return (
      <ol className={s.list} aria-label={label}>
        {STORY_BEATS.map((b) => (
          <li key={b.id} className={s.item}>
            <span className={s.mark} aria-hidden="true" />
            <p className={s.text}>{say(b).text}</p>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className={s.stage} aria-live="polite">
      {STORY_BEATS.map((b, i) => {
        const on = i === idx;
        return (
          <p
            key={b.id}
            className={s.beat}
            data-on={on || undefined}
            data-mobile={mobile || undefined}
            aria-hidden={!on}
          >
            {mobile ? say(b).short : say(b).text}
          </p>
        );
      })}
    </div>
  );
}
