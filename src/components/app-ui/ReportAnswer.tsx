"use client";

import { useId, useRef, useState } from "react";
import { REPORT_CATEGORIES, REPORT_LABEL, type ReportCategory } from "@/lib/safety/categories";
import s from "./ShareAnswer.module.css";

/**
 * "Report this answer": stored for the Keplar team to review (nothing is emailed automatically, nothing is shared outside Keplar).
 * Native <dialog>: focus is trapped while open, Esc closes, focus returns to the button.
 */
export function ReportAnswer({ answerId, chatId, excerpt, triggerClass, triggerLabel, subject = "answer" }: { answerId?: string; chatId?: string; excerpt: string; triggerClass: string; /** Text on the trigger instead of the flag icon (shared pages). */ triggerLabel?: string; subject?: "answer" | "page" }) {
  const uid = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<ReportCategory>("harmful");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"form" | "busy" | "sent">("form");
  const [error, setError] = useState("");

  const send = async () => {
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, note, answerId, chatId, excerpt: excerpt.slice(0, 400) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not send the report.");
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the report.");
      setState("form");
    }
  };

  return (
    <>
      <button type="button" className={triggerClass} aria-label={`Report this ${subject}`} aria-haspopup="dialog" title={`Report this ${subject}`} onClick={() => { setState("form"); setError(""); dlg.current?.showModal(); }}>
        {triggerLabel ? triggerLabel : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 21V4" />
          <path d="M5 4h11l-2 4 2 4H5" />
        </svg>}
      </button>
      <dialog ref={dlg} className={s.dialog} aria-labelledby={`${uid}-t`} data-testid="report-dialog" onClose={() => setNote("")} onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}>
        <button type="button" className={s.x} aria-label="Close" onClick={() => dlg.current?.close()}>×</button>
        <h2 id={`${uid}-t`} className={s.h}>{state === "sent" ? "Thanks, we have your report" : `Report this ${subject}`}</h2>
        {state === "sent" ? (
          <>
            <p className={s.p}>The Keplar team reviews reports by hand. We may not reply to you directly. If someone is in danger, contact your local emergency number.</p>
            <div className={s.row}><button type="button" className={s.primary} onClick={() => dlg.current?.close()}>Done</button></div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "grid", gap: "var(--s-4)" }}>
            <p className={s.p}>Your report is stored for the Keplar team to review. It includes the start of this {subject} so we can see what you saw. Nothing is posted publicly.</p>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--s-2)" }}>
              <legend className={s.p}>What is wrong?</legend>
              {REPORT_CATEGORIES.map((c) => (
                <label key={c} className={s.check}>
                  <input type="radio" name={`${uid}-cat`} value={c} checked={category === c} onChange={() => setCategory(c)} />
                  <span>{REPORT_LABEL[c]}</span>
                </label>
              ))}
            </fieldset>
            <textarea className={s.area} aria-label="Details (optional)" placeholder="Details (optional)" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            {error ? <p className={s.err} role="alert">{error}</p> : null}
            <div className={s.row}>
              <button type="submit" className={s.primary} disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send report"}</button>
              <button type="button" className={s.ghost} onClick={() => dlg.current?.close()}>Cancel</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
