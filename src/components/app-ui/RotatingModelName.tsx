"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import s from "./RotatingModelName.module.css";

/**
 * The greeting's name slot: "How can [Claude] help you today?", cycling through the models Keplar asks. Each name wears its brand
 * gradient on the name element itself (src/styles/gemini.css, [data-model]) with a slow shimmer. The switch lifts the old name out
 * and springs the new one in letter by letter (transform and opacity only), and the slot's width eases to the new name so the rest
 * of the line glides instead of jumping.
 *
 * Accessibility: screen readers get the sentence once with every name ("Claude, ChatGPT, DeepSeek, Mistral or Gemini"), not a word
 * that changes under them; hovering pauses the cycle; under prefers-reduced-motion nothing cycles and the slot reads "Keplar".
 */
export const MODEL_NAMES = [
  { id: "claude", name: "Claude" },
  { id: "chatgpt", name: "ChatGPT" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "mistral", name: "Mistral" },
  { id: "gemini", name: "Gemini" },
] as const;

export const SWITCH_MS = 1800;
/** Delay between letters on the way in. The longest name (DeepSeek) still finishes inside 600ms with the 450ms pop. */
export const STAGGER_MS = 18;

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
};
const reducedNow = () => Boolean(window.matchMedia?.(QUERY).matches);

export function RotatingModelName() {
  const reduced = useSyncExternalStore(subscribeMotion, reducedNow, () => false);
  // One state for the cycle: the current name, the one leaving, and a counter that remounts both so their animations replay.
  const [{ i, prev, turn }, setCycle] = useState<{ i: number; prev: number | null; turn: number }>({ i: 0, prev: null, turn: 0 });
  const [paused, setPaused] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const measure = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      setCycle((c) => ({ i: (c.i + 1) % MODEL_NAMES.length, prev: c.i, turn: c.turn + 1 }));
    }, SWITCH_MS);
    return () => window.clearInterval(t);
  }, [reduced, paused]);

  // The slot's width follows the current name; measured again once the web font has loaded (its widths differ from the fallback's).
  useLayoutEffect(() => {
    const read = () => { const el = measure.current[i]; if (el) setWidth(el.getBoundingClientRect().width); };
    read();
    void document.fonts?.ready.then(read);
  }, [i]);

  if (reduced) return <>Keplar</>;

  const names = MODEL_NAMES.map((m) => m.name);
  return (
    <>
      <span className={s.slot} data-model-slot="" style={width ? { width } : undefined} aria-hidden="true" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {prev !== null ? (
          <span key={`out-${turn}`} className={`${s.word} ${s.out}`} data-model={MODEL_NAMES[prev].id}>
            <Glyphs name={MODEL_NAMES[prev].name} pop={false} />
          </span>
        ) : null}
        <span key={`in-${turn}`} className={`${s.word} ${turn ? s.in : ""}`} data-model={MODEL_NAMES[i].id}>
          <Glyphs name={MODEL_NAMES[i].name} pop={turn > 0} />
        </span>
        <span className={s.measure}>
          {MODEL_NAMES.map((m, k) => (
            <span key={m.id} ref={(el) => { measure.current[k] = el; }}>
              <Glyphs name={m.name} pop={false} />
            </span>
          ))}
        </span>
      </span>
      <span className="visually-hidden">{`${names.slice(0, -1).join(", ")} or ${names.at(-1)}`}</span>
    </>
  );
}

function Glyphs({ name, pop }: { name: string; pop: boolean }) {
  return Array.from(name).map((ch, index) => (
    <span key={index} data-letter="" className={pop ? s.letter : undefined} style={pop ? { animationDelay: `${index * STAGGER_MS}ms` } : undefined}>{ch}</span>
  ));
}
