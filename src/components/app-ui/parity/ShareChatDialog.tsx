"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { redactText } from "@/lib/growth/redact";
import type { Thread } from "../state/types";
import s from "./parity.module.css";
import { useExit } from "@/components/motion/usePresence";

type Turn = { key: string; role: "user" | "keplar"; text: string };

export function shareableTurns(thread: Thread): Turn[] {
  const out: Turn[] = [];
  for (const m of thread.messages) {
    if (m.role === "user") { if (m.text.trim()) out.push({ key: m.id, role: "user", text: m.text }); }
    else if (m.status === "done" && m.answer?.markdown) out.push({ key: m.id, role: "keplar", text: m.answer.markdown });
  }
  return out;
}

/**
 * Share a chat as a read-only link. Nothing leaves the browser until "Create link": pick the turns, keep "Hide personal details"
 * on (emails, phone and long numbers) and list any other words to hide; the preview shows exactly what the link will contain
 * (the server applies the same redaction again). Links can be revoked here or in Account > Shared links.
 */
export function ShareChatDialog({ thread, signedIn, onClose }: { thread: Thread; signedIn: boolean; onClose: () => void }) {
  const turns = useMemo(() => shareableTurns(thread), [thread]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(turns.map((t) => t.key)));
  const [auto, setAuto] = useState(true);
  const [termsText, setTermsText] = useState("");
  const [title, setTitle] = useState(thread.title || "A shared Keplar chat");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState<{ url: string; token: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const exit = useExit(onClose); // Escape, the scrim and Cancel/Done animate out before the bar unmounts the dialog
  const close = exit.close;
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [close]);

  const terms = termsText.split(/[,\n]/).map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 20);
  const chosen = turns.filter((t) => picked.has(t.key));
  const preview = chosen.map((t) => ({ ...t, red: redactText(t.text, { auto, terms }) }));
  const hidden = preview.reduce((n, t) => n + t.red.count, 0);
  const canShare = chosen.some((t) => t.role === "keplar");

  const create = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/share/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent: true, title, turns: chosen.map(({ role, text }) => ({ role, text })), redact: { auto, terms } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(typeof j?.error === "string" ? j.error : "Couldn't create the link."); return; }
      setLink({ url: j.url, token: j.token });
      void navigator.clipboard?.writeText(j.url).catch(() => {});
      setMsg(`Link created and copied. ${j.hidden ? `${j.hidden} detail${j.hidden === 1 ? "" : "s"} hidden. ` : ""}It expires in 90 days.`);
    } catch { setMsg("Couldn't reach Keplar. Check your connection."); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!link) return;
    setBusy(true);
    try {
      const r = await fetch("/api/share/chat", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: link.token }) });
      if (r.ok) { setLink(null); setMsg("Link revoked. Anyone who opens it now sees \u201cnot found\u201d."); }
      else setMsg("Couldn't revoke the link. Try again from Account > Shared links.");
    } finally { setBusy(false); }
  };

  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} {...exit.motion("fade")}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="share-chat-h" data-share-chat="" {...exit.motion("pop", false)}>
        <h2 id="share-chat-h">Share this chat</h2>
        {!signedIn ? (
          <p className={s.muted}>Sign in to create a link. You can still use Export chat to save a copy.</p>
        ) : (
          <>
            <p className={s.muted}>Anyone with the link can read the turns you pick. Your name, memory, files and pictures are never included.</p>
            <label className={s.field}>Title<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
            <ul className={s.turns} aria-label="Turns to share">
              {preview.length === 0 && turns.length === 0 ? <li className={s.muted}>There is no finished answer to share yet.</li> : null}
              {turns.map((t) => {
                const on = picked.has(t.key);
                const shown = on ? preview.find((p) => p.key === t.key)?.red.text ?? t.text : t.text;
                return (
                  <li key={t.key} className={s.turn}>
                    <input type="checkbox" checked={on} aria-label={`Include this ${t.role === "user" ? "question" : "answer"}`} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(t.key)) n.delete(t.key); else n.add(t.key); return n; })} />
                    <div>
                      <div className={s.turnRole}>{t.role === "user" ? "You" : "Keplar"}</div>
                      <div className={s.turnText} data-off={on ? undefined : ""}>{shown}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <label className={s.check}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Hide personal details (email addresses, phone numbers, long ID or card numbers)</label>
            <label className={s.field}>Other words to hide (names, companies), separated by commas
              <input value={termsText} maxLength={1200} onChange={(e) => setTermsText(e.target.value)} placeholder="e.g. Acme, Jordan" />
            </label>
            <p className={s.muted} role="status">{hidden ? `${hidden} detail${hidden === 1 ? "" : "s"} will show as [hidden].` : "Nothing will be hidden."} {chosen.length} of {turns.length} turns selected.</p>
          </>
        )}
        {link ? (
          <div className={s.row}>
            <input className={s.input} readOnly value={link.url} aria-label="Shared link" onFocus={(e) => e.currentTarget.select()} />
            <a className={s.btn} href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open</a>
            <button type="button" className={s.btn} onClick={revoke} disabled={busy}>Revoke</button>
          </div>
        ) : null}
        <p className={s.status} role="status">{msg}</p>
        <div className={s.row}>
          {signedIn && !link ? <button type="button" className={s.btn} data-primary="" disabled={!canShare || busy} onClick={create}>{busy ? "Creating..." : "Create link"}</button> : null}
          <button type="button" ref={closeRef} className={s.btn} onClick={close}>{link ? "Done" : "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}
