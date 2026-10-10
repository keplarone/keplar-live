"use client";

import { useForOptions, type UseFor } from "./use-for";
import s from "./App.module.css";

/** Light first-visit question. Never blocks asking: the composer stays usable. */
export function UseForPrompt({ value, onChoose, onSkip }: { value: UseFor | null; onChoose: (v: UseFor) => void; onSkip: () => void }) {
  return (
    <section className={s.useFor} aria-labelledby="use-for-title">
      <div className={s.useForHead}>
        <h2 id="use-for-title" className={s.useForTitle}>
          What will you use Keplar for?
        </h2>
        <button type="button" className={s.useForSkip} onClick={onSkip}>
          Skip
        </button>
      </div>
      <p className={s.useForLede}>We&apos;ll tailor the examples and what&apos;s in your sidebar. You can change it any time.</p>
      <div className={s.useForOptions} role="group" aria-labelledby="use-for-title">
        {useForOptions.map((o) => (
          <button key={o.id} type="button" className={s.useForOption} aria-pressed={value === o.id} onClick={() => onChoose(o.id)}>
            <span className={s.useForLabel}>{o.label}</span>
            <span className={s.useForHint}>{o.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
