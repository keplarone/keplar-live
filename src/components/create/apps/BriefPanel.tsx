"use client";
/**
 * Discovery before a build. The same free brief the site studio uses: a few specific questions,
 * a real style direction, then a prompt that names the facts the owner actually gave.
 * Missing prices, customers and testimonials stay marked. Nothing here calls a model.
 */
import { useEffect, useState } from "react";
import { api } from "../api";
import s from "./studio.module.css";
import { ActivityIndicator, Button } from "@/components/kit";

type Question = { id: string; field: string; text: string; chips: string[]; multi: boolean; placeholder: string };
type Direction = { id: string; name: string; tagline: string; swatch: [string, string, string] };
type Answer = { chips?: string[]; text?: string };
type Discover = {
  questions: Question[];
  directions: Direction[];
  brief: Record<string, unknown>;
  prompt: string;
  styleId: string;
};

export function BriefPanel({ idea, onApply, onClose }: { idea: string; onApply: (prompt: string, styleId: string) => void; onClose: () => void }) {
  const [data, setData] = useState<Discover | null>(null);
  const [err, setErr] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    api<Discover>("/api/sites/discover", { method: "POST", body: JSON.stringify({ idea }) })
      .then((r) => {
        if (!on) return;
        setData(r);
        setDirection(typeof r.brief.direction === "string" ? r.brief.direction : r.directions[0]?.id ?? "");
      })
      .catch((e) => on && setErr((e as Error).message));
    return () => { on = false; };
  }, [idea]);

  const toggle = (q: Question, chip: string) => {
    setAnswers((prev) => {
      const cur = prev[q.field]?.chips ?? [];
      const chips = q.multi ? (cur.includes(chip) ? cur.filter((c) => c !== chip) : [...cur, chip]) : cur[0] === chip ? [] : [chip];
      return { ...prev, [q.field]: { ...prev[q.field], chips } };
    });
  };

  const build = async () => {
    if (!data || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api<Discover>("/api/sites/discover", {
        method: "POST",
        body: JSON.stringify({ idea, answers, brief: { ...data.brief, direction: direction || data.brief.direction } }),
      });
      onApply(r.prompt, r.styleId);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className={s.briefPanel} aria-label="Shape the brief">
      <header className={s.briefHead}>
        <div>
          <h3 className={s.briefTitle}>Shape the brief</h3>
          <p className={s.briefLede}>Answer what you know. Keplar keeps your words as the only facts, and leaves a marked placeholder everywhere else. It does not invent prices, customers, or testimonials.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Back to the prompt</Button>
      </header>
      {err ? <p className={s.inlineErr} role="alert">{err}</p> : null}
      {!data && !err ? <p className={s.paneMsg}><ActivityIndicator label="Reading the idea" showLabel /></p> : null}
      {data ? (
        <>
          <ol className={s.briefQuestions}>
            {data.questions.slice(0, 3).map((q) => (
              <li key={q.id}>
                <p className={s.briefQ}>{q.text}</p>
                {q.chips.length ? (
                  <div className={s.briefChips} role="group" aria-label={q.text}>
                    {q.chips.map((chip) => {
                      const on = (answers[q.field]?.chips ?? []).includes(chip);
                      return <button key={chip} type="button" className={s.calmChip} aria-pressed={on} onClick={() => toggle(q, chip)}>{chip}</button>;
                    })}
                  </div>
                ) : null}
                <input
                  className={s.briefInput}
                  aria-label={`${q.text} — your own answer`}
                  value={answers[q.field]?.text ?? ""}
                  placeholder={q.placeholder}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.field]: { ...prev[q.field], text: e.target.value.slice(0, 400) } }))}
                />
              </li>
            ))}
          </ol>
          <div>
            <p className={s.stepLabel}>Direction</p>
            <div className={s.briefDirs} role="listbox" aria-label="Style direction">
              {data.directions.slice(0, 6).map((d) => (
                <button key={d.id} type="button" className={s.briefDir} role="option" aria-selected={direction === d.id} onClick={() => setDirection(d.id)}>
                  <span className={s.briefSwatch} aria-hidden="true">{d.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>
                  <span className={s.briefDirName}>{d.name}</span>
                  <span className={s.briefDirLine}>{d.tagline}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={s.briefActions}>
            <Button variant="primary" loading={busy} onClick={() => void build()}>{busy ? "Preparing…" : "Build from this brief"}</Button>
            <p className={s.briefNote}>The direction sets the type, color and layout tokens. You can change the look after the preview is up, without another build.</p>
          </div>
        </>
      ) : null}
    </section>
  );
}

