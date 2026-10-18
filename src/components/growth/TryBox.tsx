"use client";

import { useId, useState } from "react";
import { track } from "@/lib/analytics";
import { parseUtm, useUtmRaw, withUtm } from "@/lib/utm";
import s from "./growth.module.css";

/**
 * "Try it now": no account needed. Submitting opens the app with the question already in the composer
 * (it is only prefilled: nothing is sent until the visitor presses Send). The question travels in the URL fragment, which browsers never send to a server.
 */
export function TryBox({ examples, where, heading = "Try it now. No signup." }: { examples: string[]; where: string; heading?: string }) {
  const id = useId();
  const [text, setText] = useState("");
  const utm = parseUtm(useUtmRaw());

  const go = (q: string, event: "try_submit" | "example_click") => {
    const question = q.trim().slice(0, 600);
    if (!question) return;
    track(event, { where });
    // Full page load, not router.push: the Whop Pixel (public pages) reports soft navigations with their full URL, and this one carries the question in its fragment.
    window.location.assign(withUtm(`/app#q=${encodeURIComponent(question)}`, utm));
  };

  return (
    <section className={s.try} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={s.tryTitle}>{heading}</h2>
      <form
        className={s.tryForm}
        onSubmit={(e) => {
          e.preventDefault();
          go(text, "try_submit");
        }}
      >
        <label htmlFor={`${id}-q`} className="visually-hidden">Your question</label>
        <textarea
          id={`${id}-q`}
          className={s.tryInput}
          rows={2}
          maxLength={600}
          value={text}
          placeholder="Ask anything. Keplar asks several AI models and gives you one answer."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go(text, "try_submit");
            }
          }}
        />
        <button type="submit" className={`sp-btn ${s.tryGo}`} data-sp-btn="" data-variant="primary" data-size="md" disabled={!text.trim()}>Ask Keplar →</button>
      </form>
      <ul className={s.chips} aria-label="Example questions">
        {examples.map((ex) => (
          <li key={ex}>
            <button type="button" className={s.chip} onClick={() => go(ex, "example_click")}>{ex}</button>
          </li>
        ))}
      </ul>
      <p className={s.tryNote}>Free runs on free open models and never needs a card.</p>
    </section>
  );
}
