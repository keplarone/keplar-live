"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { KeplarAnswer } from "@/lib/orchestration/types";
import x from "./AnswerExtras.module.css";

/** Suggested readings of a message Keplar could not resolve. Each chip sends that text as the next message. */
export function ClarifyChips({ clarify, onAsk, enabled }: { clarify: NonNullable<KeplarAnswer["clarify"]>; onAsk?: (text: string) => void; enabled: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <ul className={x.chips} aria-label="Suggested questions" data-clarify-chips="">
      {clarify.options.map((o) => (
        <li key={o}>
          <button
            type="button"
            className={x.chip}
            disabled={!enabled || !onAsk || picked !== null}
            aria-pressed={picked === o}
            onClick={() => { setPicked(o); onAsk?.(o); }}
          >
            {o}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A subtle line shown when saved notes or past chats were part of this answer's context. */
export function UsingMemory({ used }: { used: number }) {
  return (
    <p className={x.usingMemory} role="status" data-using-memory="">
      Using memory{used > 1 ? ` (${used} notes)` : ""}. <Link href="/account#memory">Manage</Link>
    </p>
  );
}

export type QuietSection = { id: string; title: string; meta: string; body: ReactNode };

/** The rows that carry nothing ("Not applicable", "None", "Not needed") collapse into one "Details" disclosure. */
export function DetailsBody({ sections }: { sections: QuietSection[] }) {
  return (
    <div className={x.details}>
      {sections.map((q) => (
        <div key={q.id} className={x.detail} data-detail={q.id}>
          <h5 className={x.detailH}>{q.title} <span className={x.detailMeta}>· {q.meta}</span></h5>
          {q.body}
        </div>
      ))}
    </div>
  );
}

export { reasoningMeta, quietIds } from "@/lib/answer-quiet";
