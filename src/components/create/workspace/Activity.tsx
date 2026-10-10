"use client";
import { useEffect, useState } from "react";
import type { Entry } from "./activity";
import s from "./ws.module.css";

export type Group = { id: string; title: string; entries: Entry[]; running: boolean; open: boolean };

const mark = (e: Entry) => (e.kind === "check" ? (e.tone === "bad" ? "✕" : "✓") : e.kind === "issue" ? "!" : e.kind === "file" ? "+" : e.kind === "done" ? "✓" : e.kind === "error" ? "✕" : e.kind === "repair" ? "↻" : e.kind === "critique" ? "◇" : "›");

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.round((now - since) / 1000));
  return <span className={s.elapsed}>{sec}s</span>;
}

export function EntryLine({ e, last, running, siteId, onShot }: { e: Entry; last: boolean; running: boolean; siteId?: string; onShot?: (id: string) => void }) {
  const live = last && running && (e.kind === "status" || e.kind === "check" || e.kind === "note");
  return (
    <li className={`${s.line} ${s[`k_${e.kind}`] ?? ""} ${e.tone ? s[`t_${e.tone}`] : ""} ${live ? s.lineLive : ""}`}>
      <span className={s.mark} aria-hidden="true">{mark(e)}</span>
      <span className={s.lineBody}>
        <span className={s.lineText}>{e.text}</span>
        {e.detail ? <small className={s.lineDetail}>{e.detail}</small> : null}
        {e.shot && siteId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <button type="button" className={s.lineShot} onClick={() => onShot?.(e.shot!)} aria-label="Open this screenshot in the Screen Library"><img src={`/api/sites/${siteId}/shots/${e.shot}`} alt="" loading="lazy" /></button>
        ) : null}
      </span>
      {live ? <Elapsed since={e.at} /> : null}
    </li>
  );
}

export function Groups({ groups, siteId, onToggle, onShot }: { groups: Group[]; siteId?: string; onToggle: (id: string) => void; onShot: (id: string) => void }) {
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} className={s.group} aria-label={g.title}>
          <button type="button" className={s.groupHead} aria-expanded={g.open || g.running} onClick={() => onToggle(g.id)} disabled={g.running}>
            <strong>{g.title}</strong>
            <small>{g.running ? "Working" : `${g.entries.length} steps`}</small>
            <span aria-hidden="true">{g.open || g.running ? "−" : "+"}</span>
          </button>
          {g.open || g.running ? (
            <ol className={s.lines}>
              {g.entries.map((e, i) => <EntryLine key={e.id} e={e} last={i === g.entries.length - 1} running={g.running} siteId={siteId} onShot={onShot} />)}
            </ol>
          ) : null}
        </section>
      ))}
    </>
  );
}
