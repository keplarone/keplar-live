"use client";

import { reasonTrail } from "@/lib/personalize/reason-trail";
import { draftIdIn } from "@/lib/personalize/drafts";
import type { KeplarMessage, UserMessage } from "../state/types";
import { openDraft } from "./draft-bus";
import { XPostsTool } from "./XPosts";
import { Button } from "@/components/kit";
import s from "./parity.module.css";

/**
 * Under a finished answer: the Reason steps (when the question was asked with Reason) and the side-draft actions
 * ("Open as draft", or "Apply to draft" when this answer is a revision of a draft).
 */
export function AnswerTools({ message: m, user }: { message: KeplarMessage; user?: UserMessage }) {
  const a = m.answer;
  if (m.status !== "done" || !a || a.smalltalk || !a.markdown) return null;
  const reason = Boolean(user?.modes?.reason);
  const steps = reason ? reasonTrail(a) : [];
  const fromDraft = user ? draftIdIn(user.text) : null;
  const title = (user?.text ?? "Draft").replace(/\s+/g, " ").slice(0, 60);
  return (
    <div className={`${s.tools} ${s.answerTools}`} data-answer-tools="">
      {reason ? (
        <details className={s.trail} open data-reason-trail="">
          <summary>Reason · how this answer was checked ({steps.length} step{steps.length === 1 ? "" : "s"})</summary>
          {steps.length ? (
            <ol className={s.steps}>
              {steps.map((st, i) => (
                <li key={i}><span className={s.stepKind} data-tone={st.tone}>{st.kind}.</span> {st.text}</li>
              ))}
            </ol>
          ) : <p className={s.muted}>No verification data came back with this answer.</p>}
        </details>
      ) : null}
      <div className={s.row}>
        {fromDraft ? (
          <Button size="sm" variant="primary" onClick={() => openDraft({ kind: "apply", draftId: fromDraft, markdown: a.markdown })}>Apply to draft</Button>
        ) : null}
        <Button size="sm" variant="ghost" className={s.quiet} onClick={() => openDraft({ kind: "open", markdown: a.markdown, title })} data-open-draft="">Open as draft</Button>
        {user && !fromDraft ? <XPostsTool question={user.text} /> : null}
      </div>
    </div>
  );
}
