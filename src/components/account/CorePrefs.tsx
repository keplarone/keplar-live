"use client";
import { useEffect, useState } from "react";
import { Switch } from "@/components/kit";
import s from "./account.module.css";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

const brevityWords = (b: number) => (b <= -0.3 ? "shorter answers" : b >= 0.3 ? "more detail" : "no preference yet");

/**
 * Keplar Core outcome tracking: on by default, content-free, and one switch turns it off. Honest about what it does: Keplar
 * adjusts its own prompts, routing, retrieval and strategies from outcomes; it does not retrain the models.
 */
export function CorePrefs() {
  const [p, setP] = useState<{ optOut: boolean; brevity: number } | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    api<{ optOut: boolean; brevity: number }>("/api/core/prefs").then((r) => live && setP(r)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const save = async (patch: { optOut?: boolean; resetBrevity?: boolean }) => {
    setError(""); setNote("");
    try {
      const r = await api<{ optOut: boolean; brevity: number }>("/api/core/prefs", { method: "PATCH", body: JSON.stringify(patch) });
      setP(r);
      setNote(patch.resetBrevity ? "Preference cleared." : r.optOut ? "Off. Your answers are no longer counted." : "On.");
    } catch (e) { setError((e as Error).message); }
  };

  const tracking = p ? !p.optOut : null;
  return (
    <div className={s.panel} id="core-learning" aria-labelledby="core-learning-h">
      <div className={s.prefRow}>
        <h2 id="core-learning-h" className={s.cardTitle}>Learn from how answers land</h2>
        <Switch className={s.kSwitch} checked={tracking ?? false} onCheckedChange={() => p && void save({ optOut: !p.optOut })} label="Learn from how answers land" hideLabel describedBy="core-learning-d" disabled={p === null} />
      </div>
      <p className={s.note} id="core-learning-d">
        For questions answered step by step, Keplar notes how it went: how confident the checks were, and whether you rated, copied, regenerated, corrected or re-asked. It uses this to adjust its own prompts, model choices, search and checking strategies. Changes are tested on a small share of answers first and rolled back if they do worse. No question text and no account is kept for this. The AI models themselves are not retrained.
      </p>
      {p ? (
        <div className={s.row}>
          <p className={s.note}>Learned from your feedback: {brevityWords(p.brevity)}.</p>
          {Math.abs(p.brevity) >= 0.05 ? <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => void save({ resetBrevity: true })}>Clear</button> : null}
        </div>
      ) : null}
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
    </div>
  );
}
