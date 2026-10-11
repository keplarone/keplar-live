"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/app-ui/Markdown";
import type { KeplarEvent } from "@/lib/orchestration/types";
import { runEngine } from "./engine";
import s from "./cursor.module.css";

type Turn = { id: string; q: string; a: string; done: boolean; note?: string; models?: string };

/** A Business chat: questions answered by Keplar's multi-model engine, with project context when one was chosen. */
export function Ask({ first, projectId }: { first: string; projectId: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    const id = Math.random().toString(36).slice(2);
    const history = turns.flatMap((t) => [{ role: "user" as const, text: t.q }, { role: "keplar" as const, text: t.a }]);
    setTurns((t) => [...t, { id, q, a: "", done: false }]);
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const patch = (p: Partial<Turn>) => setTurns((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      let acc = "";
      const ans = await runEngine({ prompt: q, mode: "ask", projectId, history }, (e: KeplarEvent) => {
        if (e.type === "delta") { acc += e.text; patch({ a: acc }); }
        if (e.type === "error") patch({ note: e.message });
        if (e.type === "limit") patch({ note: e.window?.message ?? "You've reached your usage limit for now." });
      }, ctl.signal);
      patch({ a: ans?.markdown ?? acc, done: true, models: ans ? `${ans.consensus.responded} of ${ans.consensus.consulted} models · ${ans.consensus.summary}` : undefined });
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch({ note: e instanceof Error ? e.message : "Something went wrong.", done: true });
      else patch({ done: true });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    queueMicrotask(() => void ask(first));
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first question runs once, on arrival
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns]);

  return (
    <div className={s.thread}>
      <div className={s.turns} aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className={s.turn}>
            <p className={s.q}>{t.q}</p>
            <div className={s.a}>
              {t.a ? <Markdown source={t.a} streaming={!t.done} caret={!t.done} /> : !t.done ? <span className={s.thinking}>Thinking…</span> : null}
              {t.note ? <p className={s.note} role="alert">{t.note}</p> : null}
              {t.done && t.models ? <p className={s.meta}>{t.models}</p> : null}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className={`${s.composer} ${s.threadComposer}`} onSubmit={(e) => { e.preventDefault(); const q = text; setText(""); void ask(q); }}>
        <label htmlFor="biz-follow" className={s.srOnly}>Follow-up</label>
        <textarea id="biz-follow" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const q = text; setText(""); void ask(q); } }} placeholder={busy ? "Keplar is answering…" : "Follow up"} />
        <div className={s.composeBar}>
          <span className={s.model}><span className={s.modelDot} aria-hidden="true" />Keplar One · Auto</span>
          <span className={s.grow} />
          {busy ? <button type="button" className={s.quickBtn} onClick={() => abort.current?.abort()}>Stop</button> : null}
          <button type="submit" className={s.sendBtn} disabled={busy || !text.trim()} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
