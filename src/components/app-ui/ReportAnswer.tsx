"use client";

import { useId, useState } from "react";
import { REPORT_CATEGORIES, REPORT_LABEL, type ReportCategory } from "@/lib/safety/categories";
import { Button, Dialog, IconButton } from "@/components/kit";
import s from "./ShareAnswer.module.css";

const FlagIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </svg>
);

/**
 * "Report this answer": stored for the Keplar team to review (nothing is emailed automatically, nothing is shared outside Keplar).
 * The kit Dialog (native modal <dialog>): focus is trapped while open; Escape, the backdrop and Close dismiss it; focus returns
 * to the button. It renders nothing while closed.
 */
export function ReportAnswer({ answerId, chatId, excerpt, triggerClass, triggerLabel, subject = "answer" }: { answerId?: string; chatId?: string; excerpt: string; triggerClass?: string; /** Text on the trigger instead of the flag icon (shared pages). */ triggerLabel?: string; subject?: "answer" | "page" }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("harmful");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"form" | "busy" | "sent">("form");
  const [error, setError] = useState("");

  const show = () => { setState("form"); setError(""); setOpen(true); };
  const close = () => { setOpen(false); setNote(""); };

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
      {triggerLabel ? (
        // Shared pages show a quiet text link, styled by the page.
        <button type="button" className={triggerClass} aria-haspopup="dialog" onClick={show}>{triggerLabel}</button>
      ) : (
        <IconButton size="sm" className={triggerClass} label={`Report this ${subject}`} aria-haspopup="dialog" onClick={show} icon={<FlagIcon />} />
      )}
      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }} title={state === "sent" ? "Thanks, we have your report" : `Report this ${subject}`} size="lg">
        {state === "sent" ? (
          <div className={s.body}>
            <p className={s.p}>The Keplar team reviews reports by hand. We may not reply to you directly. If someone is in danger, contact your local emergency number.</p>
            <div className={s.row}><Button variant="primary" onClick={close}>Done</Button></div>
          </div>
        ) : (
          <form className={s.body} onSubmit={(e) => { e.preventDefault(); if (state !== "busy") void send(); }}>
            <p className={s.p}>Your report is stored for the Keplar team to review. It includes the start of this {subject} so we can see what you saw. Nothing is posted publicly.</p>
            <fieldset className={s.choices}>
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
              <Button type="submit" variant="primary" loading={state === "busy"}>{state === "busy" ? "Sending…" : "Send report"}</Button>
              <Button variant="secondary" onClick={close}>Cancel</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
