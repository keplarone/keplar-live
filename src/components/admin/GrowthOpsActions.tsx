"use client";

import { confirmQuestion } from "@/components/kit";
import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "./Admin.module.css";

/** One Command Center action (POST /api/admin/growth-ops), with an optional confirmation and a status line. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const call = async (payload: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !(await confirmQuestion(confirmText))) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/growth-ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; result?: { status: string; summary: string } };
      if (!r.ok) setMsg(j.error ?? "Failed.");
      else {
        setMsg(j.result ? `${j.result.status}: ${j.result.summary}` : "Saved.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, call };
}

export function GrowthPause({ paused }: { paused: boolean }) {
  const { busy, msg, call } = useAction();
  return (
    <div className={s.controls}>
      <div className={s.switches}>
        {paused
          ? <button type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "resume" })}>Resume growth jobs</button>
          : <button type="button" className={s.warn} disabled={busy} onClick={() => call({ action: "pause" }, "Pause every growth job? Scheduled runs are skipped (and logged) until you resume.")}>Pause all growth jobs</button>}
      </div>
      <p className={s.msg} role="status">{msg}</p>
    </div>
  );
}

export function JobActions({ job, paused }: { job: string; paused: boolean }) {
  const { busy, msg, call } = useAction();
  return (
    <span className={s.switches}>
      <button type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "run", job })}>Run now</button>
      <button type="button" className={s.btn} disabled={busy} onClick={() => call({ action: paused ? "resume" : "pause", job })}>{paused ? "Resume" : "Pause"}</button>
      {msg ? <span className={s.msg} role="status">{msg}</span> : null}
    </span>
  );
}

export function ReviewedButton({ id }: { id: string }) {
  const { busy, msg, call } = useAction();
  return (
    <span className={s.switches}>
      <button type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "watch.reviewed", id })}>Mark reviewed</button>
      {msg ? <span className={s.msg} role="status">{msg}</span> : null}
    </span>
  );
}

export function SubmissionActions({ platformId, status }: { platformId: string; status: string }) {
  const { busy, msg, call } = useAction();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const moves: Record<string, { to: string; label: string }[]> = {
    not_started: [{ to: "submitted", label: "I submitted it" }, { to: "declined", label: "Not pursuing" }],
    submitted: [{ to: "listed", label: "It's listed" }, { to: "rejected", label: "It was rejected" }],
    rejected: [{ to: "submitted", label: "Resubmitted" }, { to: "declined", label: "Not pursuing" }],
    listed: [{ to: "rejected", label: "Listing removed" }],
    declined: [{ to: "not_started", label: "Reopen" }],
  };
  return (
    <div className={s.controls}>
      {status === "submitted" ? (
        <>
          <label className={s.field}>Listing URL (for &ldquo;It&rsquo;s listed&rdquo;)<input value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <label className={s.field}>Reason (for &ldquo;rejected&rdquo;)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </>
      ) : null}
      <div className={s.switches}>
        {(moves[status] ?? []).map((m) => (
          <button key={m.to} type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "submission", platformId, to: m.to, listingUrl: url || undefined, note: note || undefined })}>{m.label}</button>
        ))}
      </div>
      {msg ? <p className={s.msg} role="status">{msg}</p> : null}
    </div>
  );
}

export function ContentActions({ id, status }: { id: string; status: string }) {
  const { busy, msg, call } = useAction();
  const [url, setUrl] = useState("");
  const next: Record<string, { to: string; label: string }[]> = {
    draft: [{ to: "in_review", label: "Send for review" }],
    in_review: [{ to: "approved", label: "Approve" }, { to: "rejected", label: "Reject" }, { to: "draft", label: "Back to draft" }],
    approved: [{ to: "published", label: "Mark published" }, { to: "draft", label: "Back to draft" }],
    rejected: [{ to: "draft", label: "Back to draft" }],
  };
  return (
    <div className={s.controls}>
      {status === "approved" ? <label className={s.field}>Where it was published (URL)<input value={url} onChange={(e) => setUrl(e.target.value)} /></label> : null}
      <div className={s.switches}>
        {(next[status] ?? []).map((m) => (
          <button key={m.to} type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "content.move", id, to: m.to, publishedUrl: url || undefined })}>{m.label}</button>
        ))}
      </div>
      {msg ? <p className={s.msg} role="status">{msg}</p> : null}
    </div>
  );
}

export function NewDraft() {
  const { busy, msg, call } = useAction();
  const [channel, setChannel] = useState("blog");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [claims, setClaims] = useState("");
  const submit = () => {
    // One claim per line: "claim text | https://source".
    const parsed = claims.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [text, source] = l.split("|").map((x) => x.trim()); return { text, source: source || null }; });
    void call({ action: "content.create", draft: { channel, title, body, claims: parsed } });
  };
  return (
    <div className={s.controls}>
      <label className={s.field}>Channel
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          {["blog", "docs", "x", "linkedin", "youtube", "tiktok", "instagram", "email", "community", "directory"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className={s.field}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className={s.field}>Body<textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <label className={s.field}>Factual claims, one per line: claim | source URL<textarea rows={3} value={claims} onChange={(e) => setClaims(e.target.value)} /></label>
      <div className={s.switches}><button type="button" className={s.btn} disabled={busy || !title || !body} onClick={submit}>Save draft</button></div>
      {msg ? <p className={s.msg} role="status">{msg}</p> : null}
    </div>
  );
}
