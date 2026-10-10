"use client";
import { useEffect, useState } from "react";
import s from "./account.module.css";

type Case = { id: string; at: string; category: string; reason: string; text: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

/**
 * "Help improve Keplar": off by default. Honest about what it does: Keplar keeps score of which models worked for which kind of
 * question (no text, no account) whatever this says; this switch only controls whether a shortened, cleaned copy of a question that
 * went wrong may be kept to test future changes. The models are not retrained.
 */
export function LearningConsent() {
  const [on, setOn] = useState<boolean | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    api<{ shareFailures: boolean; cases: Case[] }>("/api/learning/consent").then((r) => { if (live) { setOn(r.shareFailures); setCases(r.cases); } }).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const toggle = async () => {
    if (on === null) return;
    setError(""); setNote("");
    try {
      const r = await api<{ shareFailures: boolean }>("/api/learning/consent", { method: "PATCH", body: JSON.stringify({ shareFailures: !on }) });
      setOn(r.shareFailures);
      if (!r.shareFailures) { setCases([]); setNote("Off. Anything saved under this setting was deleted."); }
    } catch (e) { setError((e as Error).message); }
  };
  const erase = async () => {
    setError(""); setNote("");
    try { const r = await api<{ erased: number }>("/api/learning/consent", { method: "DELETE" }); setCases([]); setNote(`Deleted ${r.erased} saved ${r.erased === 1 ? "question" : "questions"}.`); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className={s.panel} id="learning" aria-labelledby="learning-h">
      <div className={s.row}>
        <h2 id="learning-h" className={s.k} style={{ margin: 0 }}>Help improve Keplar</h2>
        <button type="button" role="switch" aria-checked={on ?? false} aria-label="Help improve Keplar" className={s.btn} style={{ height: 36 }} onClick={() => void toggle()} disabled={on === null}>
          {on === null ? "…" : on ? "On" : "Off"}
        </button>
      </div>
      <p className={s.note}>
        Keplar gets better at choosing which models to ask. It does this by keeping score, for each kind of question, of which models answered well, how fast, and whether people copied, regenerated or rated the answer. That score holds no question text and no account.
        The AI models themselves are not retrained: this is Keplar tuning its own routing within fixed safety rules.
      </p>
      <p className={s.note}>
        If you turn this on, when an answer fails or you mark it down, Keplar may keep a short copy of that question (links, emails, numbers and anything that looks like a secret removed) to test future changes before they go live. It is off until you say so, you can see and delete every saved question here, and turning it off deletes them.
      </p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
      {on && cases.length ? (
        <>
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }} aria-label="Saved questions">
            {cases.map((c) => (
              <li key={c.id} style={{ borderTop: "1px solid var(--c-border)", paddingTop: "var(--s-2)", overflowWrap: "anywhere" }}>
                {c.text || <em>(question not kept: it looked sensitive)</em>} <span className={s.badge}>{c.reason.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
          <div className={s.actions}><button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void erase()}>Delete all saved questions</button></div>
        </>
      ) : on ? <p className={s.note}>Nothing saved.</p> : null}
    </div>
  );
}
