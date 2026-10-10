"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { TICKET_TOPICS, TICKET_TOPIC_LABEL, type TicketTopic } from "@/lib/support/topics";
import { brand } from "@/lib/site";
import s from "@/components/feedback/Feedback.module.css";

export function ContactForm({ initialTopic }: { initialTopic?: TicketTopic }) {
  const uid = useId();
  const [topic, setTopic] = useState<TicketTopic>(initialTopic ?? "account");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [ref, setRef] = useState("");
  const hp = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, subject, message, email, website: hp.current?.value ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; ref?: string; error?: string };
      if (res.ok && j.ok) { setRef(j.ref ?? ""); setStatus("done"); return; }
      setError(res.status === 429 ? "That's a lot of messages from this connection. Please try again later, or email us." : (j.error ?? "That didn't send. Please try again."));
      setStatus("error");
    } catch {
      setError("We couldn't reach Keplar. Check your connection and try again, or email us.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className={s.ok} role="status">
        <h2>We have your message.</h2>
        <p className={s.hint}>Reference <code>{ref}</code>. A person on the Keplar team reads every message and replies from {brand.feedbackEmail}. We do not send automatic emails about it. There is no guaranteed reply time.</p>
        <p className={s.row} style={{ marginTop: "var(--s-5)" }}><Link href="/help">Back to Help</Link></p>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-topic`}>What is this about?</label>
        <select id={`${uid}-topic`} className={s.select} value={topic} onChange={(e) => setTopic(e.target.value as TicketTopic)}>
          {TICKET_TOPICS.map((t) => <option key={t} value={t}>{TICKET_TOPIC_LABEL[t]}</option>)}
        </select>
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-sub`}>Subject</label>
        <input id={`${uid}-sub`} className={s.input} type="text" maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-msg`}>Message</label>
        <span className={s.hint} id={`${uid}-msg-h`}>Plain text. Please leave out passwords, card numbers and other private data.</span>
        <textarea id={`${uid}-msg`} aria-describedby={`${uid}-msg-h`} className={s.area} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-email`}>Your email <span className={s.hint}>(so we can reply; signed-in accounts can leave it empty)</span></label>
        <input id={`${uid}-email`} className={s.input} type="text" inputMode="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className={s.hp} aria-hidden="true">
        <label>Website<input ref={hp} type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <div className={s.row}>
        <button type="submit" className={s.go} disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send message"}</button>
      </div>
      <p className={s.hint} style={{ overflowWrap: "anywhere" }}>Prefer email? Write to <a href={`mailto:${brand.feedbackEmail}`}>{brand.feedbackEmail}</a>.</p>
    </form>
  );
}
