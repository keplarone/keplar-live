"use client";

import { useState } from "react";
import type { Thread } from "./state/types";
import { ago, resumable } from "./resume";
import s from "./App.module.css";

/**
 * "Pick up where you left off" on the empty Ask screen: a returning person resumes a chat in one click, on every screen size
 * (on phones the sidebar's Recents sit behind the drawer). It replaces the separate full-screen welcome-back overlay, which
 * repeated this home (greeting, composer, starters) with the website's nav and had to be dismissed before the workspace.
 */
export function ResumeChats({ threads, onOpen, onAll }: { threads: Thread[]; onOpen: (id: string) => void; onAll: () => void }) {
  const [now] = useState(() => Date.now());
  const recent = resumable(threads);
  if (!recent.length) return null;
  return (
    <section className={s.resume} aria-labelledby="resume-h" data-resume="">
      <div className={s.resumeHead}>
        <h2 id="resume-h" className={s.resumeTitle}>Pick up where you left off</h2>
        <button type="button" className={s.resumeAll} onClick={onAll}>All chats</button>
      </div>
      <ul className={s.resumeList}>
        {recent.map((t) => (
          <li key={t.id}>
            <button type="button" className={s.resumeItem} onClick={() => onOpen(t.id)}>
              <span className={s.resumeName}>{t.title}</span>
              <span className={s.resumeWhen}>{ago(t.updatedAt, now)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
