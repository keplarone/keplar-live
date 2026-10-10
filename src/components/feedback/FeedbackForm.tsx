"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { FEEDBACK_KINDS, KIND_LABEL, LIMITS, RESEARCH_QUESTIONS, ROLES, type FeedbackKind } from "@/lib/growth/research";
import { growthTrack } from "@/lib/growth/client";
import { brand } from "@/lib/site";
import s from "./Feedback.module.css";

type Status = "idle" | "sending" | "done" | "error";

export function FeedbackForm({ initialKind, from }: { initialKind: FeedbackKind; from?: string }) {
  const uid = useId();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [role, setRole] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const hp = useRef<HTMLInputElement>(null);
  const research = kind === "research";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, answers: research ? answers : undefined, role: role || undefined, contactOk, email: contactOk ? email : undefined, from, website: hp.current?.value ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        growthTrack("feedback_submitted");
        setStatus("done");
        return;
      }
      setError(res.status === 429 ? "That's a lot of messages from this connection. Please try again in a while." : (j.error ?? "That didn't send. Please try again."));
      setStatus("error");
    } catch {
      setError("We couldn't reach Keplar. Check your connection and try again.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className={s.ok} role="status">
        <h2>Thank you.</h2>
        <p className={s.hint}>It reached the Keplar team{contactOk ? "; we may reply to the address you gave" : ""}. Nothing else happens with it: no list, no automatic email.</p>
        <p className={s.row} style={{ marginTop: "var(--s-5)" }}>
          <Link href="/app">Back to Keplar</Link>
        </p>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-kind`}>What is this about?</label>
        <select id={`${uid}-kind`} className={s.select} value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
          {FEEDBACK_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
      </div>

      {research ? (
        RESEARCH_QUESTIONS.map((q, i) => (
          <div className={s.field} key={q.key}>
            <label className={s.label} htmlFor={`${uid}-${q.key}`}>{i + 1}. {q.q}</label>
            <span className={s.hint} id={`${uid}-${q.key}-h`}>{q.hint}</span>
            <textarea id={`${uid}-${q.key}`} aria-describedby={`${uid}-${q.key}-h`} className={s.area} maxLength={LIMITS.answer} value={answers[q.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
          </div>
        ))
      ) : (
        <div className={s.field}>
          <label className={s.label} htmlFor={`${uid}-msg`}>{kind === "cancel" ? "What made you decide to leave? Anything we could have done differently?" : "Tell us"}</label>
          <span className={s.hint} id={`${uid}-msg-h`}>Plain text. Please leave out passwords and private data.</span>
          <textarea id={`${uid}-msg`} aria-describedby={`${uid}-msg-h`} className={s.area} maxLength={LIMITS.message} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
      )}

      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-role`}>Which describes you best? <span className={s.hint}>(optional)</span></label>
        <select id={`${uid}-role`} className={s.select} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Prefer not to say</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.check}>
          <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} />
          <span>You may email me once about this answer. Leave unticked to stay anonymous; we never email you otherwise.</span>
        </label>
        {contactOk ? (
          <>
            <label className={s.label} htmlFor={`${uid}-email`}>Email</label>
            <input id={`${uid}-email`} className={s.input} type="text" inputMode="email" autoComplete="email" maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(e.target.value)} />
          </>
        ) : null}
      </div>

      <div className={s.hp} aria-hidden="true">
        <label>Website<input ref={hp} type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <div className={s.row}>
        <button type="submit" className={s.go} disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send"}</button>
      </div>
      <p className={s.hint} data-feedback-mailto="" style={{ overflowWrap: "anywhere" }}>
        {status === "error" ? "Still not sending? " : "Prefer email? "}Write to <a href={`mailto:${brand.feedbackEmail}?subject=${encodeURIComponent(`Keplar feedback: ${KIND_LABEL[kind]}`)}`}>{brand.feedbackEmail}</a>.
      </p>
    </form>
  );
}
