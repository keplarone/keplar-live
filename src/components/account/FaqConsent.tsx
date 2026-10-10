"use client";
import { useEffect, useState } from "react";
import s from "./account.module.css";

/**
 * "Count my questions": off by default. When on, a general question you ask (no personal details, no links or numbers) is counted
 * toward the "Most frequently asked" list on the home screen, as a keyed hash. It is shown only after several different people asked
 * the same thing. Turning it off removes you from every count.
 */
export function FaqConsent() {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/faq/consent", { cache: "no-store" })
      .then(async (r) => { const j = (await r.json().catch(() => ({}))) as { count?: boolean; error?: string }; if (!r.ok) throw new Error(j.error ?? "Something went wrong."); return j; })
      .then((j) => live && setOn(Boolean(j.count)))
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, []);
  const toggle = async () => {
    if (on === null) return;
    setError("");
    try {
      const r = await fetch("/api/faq/consent", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ count: !on }) });
      const j = (await r.json().catch(() => ({}))) as { count?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      setOn(Boolean(j.count));
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className={s.panel} id="faq-count" aria-labelledby="faq-count-h">
      <div className={s.row}>
        <h2 id="faq-count-h" className={s.k} style={{ margin: 0 }}>Count my questions</h2>
        <button type="button" role="switch" aria-checked={on ?? false} aria-label="Count my questions" className={s.btn} style={{ height: 36 }} onClick={() => void toggle()} disabled={on === null}>
          {on === null ? "…" : on ? "On" : "Off"}
        </button>
      </div>
      <p className={s.note}>
        The home screen lists the most frequently asked questions. If you turn this on, a general question you ask (nothing with personal details, links, numbers or rude words) is counted toward that list.
        A question is stored as a scrambled code, not as text, and appears in the list only after at least five different people asked the same thing. Nothing is tied to your name or email. It is off until you say so, and turning it off removes you from every count.
      </p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
    </div>
  );
}
