"use client";

import { useEffect, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { brand } from "@/lib/site";
import { isPhone } from "@/lib/fx/lite";
import { MODELS } from "./ModelStack";
import s from "./Sky.module.css";

const QUESTION = "Should my small business site use Webflow or WordPress?";
const ANSWER =
  "For most small businesses that want a polished site without a developer, Webflow is the better fit: hosting, security and updates are handled for you, and the visual editor is easy to hand off. Pick WordPress if you need a specific plugin, a store with complex inventory, or full control over hosting.";
const WORDS = ANSWER.split(" ");
const PANEL = MODELS.slice(0, 5);
const DISSENT = 3; // DeepSeek

/** Timeline in ms from the start of a loop. Everything on screen is derived from the elapsed time, so the layout never jumps. */
const T = {
  typeStart: 300,
  typeEach: 34,
  pillsAt: 300 + QUESTION.length * 34 + 350,
  pillEach: 120,
  resolveAt: [700, 950, 1150, 1650, 1350], // after pillsAt, per model; the dissenting model answers last
  wordEach: 26,
  hold: 4200,
  fade: 500,
};
const ANSWER_AT = T.pillsAt + 1950;
const WORDS_AT = ANSWER_AT + 220;
const DISSENT_AT = WORDS_AT + WORDS.length * T.wordEach + 300;
const FADE_AT = DISSENT_AT + T.hold;
const LOOP = FADE_AT + T.fade + 400;
const FINISHED = FADE_AT - 1; // every part shown, before the fade-out starts

/**
 * The home's product window as a short looping demo: the question types itself, each model's pill appears thinking and then
 * resolves, Keplar's answer streams in word by word and the disagreement note slides up. Runs only while on screen and the tab is
 * visible; prefers-reduced-motion shows the finished state. Example content, labelled under the window.
 * Phones show the finished state too, always: below the fold the loop used to rewind to its first frame and only restart once 30%
 * of the (tall, on a phone) window was on screen, so people scrolling past saw a large empty white card for several seconds.
 */
export function DemoWindow() {
  const ref = useRef<HTMLElement>(null);
  // Server render, reduced motion and phones: the finished frame. (It used to be LOOP - fade - 400, which is FADE_AT: the first frame
  // of the fade-out, so everything inside was at opacity 0 and the window rendered as an empty white card until a loop ran.)
  const [t, setT] = useState(FINISHED);

  useEffect(() => {
    const el = ref.current;
    if (!el || isPhone() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    // Never snap the finished frame (the server render) to an empty window in front of someone: if the window is on screen at load,
    // the loop carries on from the finished answer (hold, fade, then replay); below the fold it rewinds now, while nobody can see it,
    // so it plays from the first keystroke when it scrolls in.
    const box = el.getBoundingClientRect();
    const onScreen = box.top < window.innerHeight && box.bottom > 0;
    let elapsed = onScreen ? DISSENT_AT : 0; // carried across pauses, so the demo resumes where it stopped instead of restarting
    let prev = 0;
    let raf = onScreen ? 0 : requestAnimationFrame(() => setT(0));
    let last = 0;
    const tick = (now: number) => {
      if (prev) elapsed += Math.min(now - prev, 100);
      prev = now;
      if (now - last > 30) {
        last = now;
        setT(elapsed % LOOP);
      }
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      prev = 0;
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }, { threshold: 0.3 });
    io.observe(el);
    document.addEventListener("visibilitychange", run);
    return () => { io.disconnect(); cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", run); };
  }, []);

  const typed = Math.max(0, Math.min(QUESTION.length, Math.floor((t - T.typeStart) / T.typeEach)));
  const typing = t >= T.typeStart && typed < QUESTION.length;
  const words = Math.max(0, Math.min(WORDS.length, Math.floor((t - WORDS_AT) / T.wordEach)));
  const agree = PANEL.filter((_, i) => i !== DISSENT && t >= T.pillsAt + T.resolveAt[i]).length;
  const resolved = PANEL.filter((_, i) => t >= T.pillsAt + T.resolveAt[i]).length;
  const fading = t >= FADE_AT;

  return (
    <section ref={ref} className={s.window} aria-label="Example answer" data-fading={fading || undefined}>
      <div className={s.windowBar}>
        <i data-light="close" /><i data-light="min" /><i data-light="max" />
        <span>{brand.name}</span>
      </div>
      <p className={s.srOnly}>
        Example. Question: {QUESTION} Claude, ChatGPT, Gemini and Mistral agree; DeepSeek disagrees. {brand.name}&apos;s answer: {ANSWER} Where they
        disagree: DeepSeek recommends WordPress for long-term cost, since Webflow plans cost more as the site grows.
      </p>
      <div className={s.windowBody} aria-hidden="true">
        <p className={s.userMsg} data-shown={t >= T.typeStart || undefined}>
          {QUESTION.slice(0, typed)}
          {typing ? <span className={s.caret} /> : null}
          <span className={s.ghost}>{QUESTION.slice(typed)}</span>
        </p>
        <ul className={s.verdicts}>
          {PANEL.map((m, i) => {
            const shown = t >= T.pillsAt + i * T.pillEach;
            const done = t >= T.pillsAt + T.resolveAt[i];
            const no = i === DISSENT;
            return (
              <li key={m.id} data-shown={shown || undefined}>
                <img src={m.src} alt="" width={16} height={16} />
                {m.name}{" "}
                {done ? <span data-agree={no ? "no" : "yes"}>{no ? "disagrees" : "agrees"}</span> : <span className={s.thinking} aria-label="thinking"><i /><i /><i /></span>}
              </li>
            );
          })}
        </ul>
        <div className={s.answer}>
          <p className={s.answerHead} data-shown={t >= ANSWER_AT || undefined}>
            <KeplarSymbol size={18} /> {brand.name}&apos;s answer · {resolved < PANEL.length ? "comparing models…" : `${agree} of ${PANEL.length} models agree`}
          </p>
          <p>
            {WORDS.map((w, i) => (
              <span key={i} className={s.word} data-shown={i < words || undefined}>{w} </span>
            ))}
          </p>
          <p className={s.dissent} data-shown={t >= DISSENT_AT || undefined}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
            <span><b>Where they disagree:</b> DeepSeek recommends WordPress for long-term cost, since Webflow plans cost more as the site grows.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
