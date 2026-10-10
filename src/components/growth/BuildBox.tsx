"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { giveAppHandoff } from "@/components/create/apps/handoff";
import { track } from "@/lib/analytics";
import { parseUtm, useUtmRaw, withUtm } from "@/lib/utm";
import s from "./growth.module.css";

/**
 * "Describe what to build": hands the description to Create (read once by the app builder, same handoff as the showcase)
 * and opens /app/create. Nothing is built until the person presses Build there; signed-out visitors are asked to sign in first.
 */
export function BuildBox({ examples, where }: { examples: readonly string[]; where: string }) {
  const id = useId();
  const router = useRouter();
  const [text, setText] = useState("");
  const utm = parseUtm(useUtmRaw());

  const go = (q: string, event: "try_submit" | "example_click") => {
    const prompt = q.trim().slice(0, 1200);
    if (!prompt) return;
    track(event, { where });
    giveAppHandoff({ prompt });
    router.push(withUtm(`/app/create`, Object.keys(utm).length ? utm : { utm_source: where }));
  };

  return (
    <section className={s.try} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={s.tryTitle}>What do you want to build?</h2>
      <form
        className={s.tryForm}
        onSubmit={(e) => {
          e.preventDefault();
          go(text, "try_submit");
        }}
      >
        <label htmlFor={`${id}-q`} className="visually-hidden">Describe your site or app</label>
        <textarea
          id={`${id}-q`}
          className={s.tryInput}
          rows={2}
          maxLength={1200}
          value={text}
          placeholder="Describe a site or app: who it is for, what it should do."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go(text, "try_submit");
            }
          }}
        />
        <button type="submit" className={s.tryGo} disabled={!text.trim()}>Start building →</button>
      </form>
      <ul className={s.chips} aria-label="Example builds">
        {examples.map((ex) => (
          <li key={ex}>
            <button type="button" className={s.chip} onClick={() => go(ex, "example_click")}>{ex}</button>
          </li>
        ))}
      </ul>
      <p className={s.tryNote}>Create needs a free account. Free builds on free open models; no card needed.</p>
    </section>
  );
}
