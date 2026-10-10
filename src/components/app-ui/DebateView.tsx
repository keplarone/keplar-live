"use client";
/**
 * Debate mode (BETA): the live transcript while the models argue, and the collapsible record under the final answer.
 * Turns are rounded-rect bubbles (shape-system.md); only the held / refined / changed tags are pills. Screen readers hear each finished turn
 * once (polite), not every streamed word. Motion is a short fade, off under prefers-reduced-motion.
 */
import { useId, useState } from "react";
import type { DebateSummaryData, DebateTurnUpdate } from "@/lib/orchestration/types";
import { streamingView, type LiveDebate, type LiveDebateTurn } from "./state/debate";
import { IconChevron } from "./icons";
import s from "./DebateView.module.css";

const LIVE_BODY = 520;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);
const letter = (seat: number) => String.fromCharCode(65 + seat);

export function roundTitle(round: number, rounds: number): string {
  if (round === 1) return "Round 1 · Opening positions";
  if (round === rounds) return `Round ${round} · Final answers`;
  return `Round ${round} · Rebuttals`;
}

const UPDATE_LABEL: Record<DebateTurnUpdate, string> = { held: "Held position", refined: "Refined position", changed: "Changed position" };

function UpdateTag({ update }: { update: DebateTurnUpdate | null }) {
  if (!update) return null;
  return <span className={s.tag} data-update={update}>{UPDATE_LABEL[update]}</span>;
}

function Bubble({ t, full }: { t: LiveDebateTurn; full?: boolean }) {
  const speaking = t.status === "speaking";
  const view = speaking ? streamingView(t.text) : null;
  const position = view ? view.position : t.position;
  const body = view ? view.body : t.text;
  return (
    <li className={s.turn} data-seat={t.seat % 4} data-status={t.status} aria-busy={speaking || undefined} data-debate-turn={`${t.round}-${t.seat}`}>
      <div className={s.turnHead}>
        <span className={s.avatar} aria-hidden="true">{letter(t.seat)}</span>
        <span className={s.speaker}>{t.name}</span>
        {speaking ? <span className={s.speaking}>{body || position ? "arguing…" : "thinking…"}</span> : <UpdateTag update={t.update} />}
      </div>
      {t.status === "failed" ? (
        <p className={s.failed}>Didn&apos;t answer this round{t.text ? ` (${clip(t.text, 120)})` : ""}. Its last argument still counts.</p>
      ) : (
        <>
          {position ? <p className={s.position}>{position}</p> : null}
          {t.why && !speaking ? <p className={s.why}>{clip(t.why, 220)}</p> : null}
          {body ? <p className={s.body}>{full ? body : clip(body, LIVE_BODY)}{speaking ? <span className={s.caret} aria-hidden="true" /> : null}</p> : null}
        </>
      )}
    </li>
  );
}

function Rounds({ d, full }: { d: Pick<LiveDebate, "rounds" | "turns">; full?: boolean }) {
  const rounds = [...new Set(d.turns.map((t) => t.round))].sort((a, b) => a - b);
  return (
    <>
      {rounds.map((r) => (
        <section key={r} className={s.round} aria-label={roundTitle(r, d.rounds)} data-debate-round={r}>
          <h4 className={s.roundTitle}>{roundTitle(r, d.rounds)}</h4>
          <ol className={s.turns}>
            {d.turns.filter((t) => t.round === r).sort((a, b) => a.seat - b.seat).map((t) => <Bubble key={`${t.round}-${t.seat}`} t={t} full={full} />)}
          </ol>
        </section>
      ))}
    </>
  );
}

/** While the answer is running (or after a stop): the debate as it happens. */
export function DebateLive({ d, running }: { d: LiveDebate; running: boolean }) {
  if (d.skipped) {
    return (
      <p className={s.skipped} role="status" data-debate-skipped="">
        <span className={s.beta}>Debate · Beta</span> {d.skipped}
      </p>
    );
  }
  if (!d.speakers.length) return null;
  const finished = d.turns.filter((t) => t.status !== "speaking");
  const latest = finished[finished.length - 1];
  const status = !running ? (d.done ? "Debate finished" : "Debate stopped") : d.done ? "Debate finished · writing one answer…" : d.round ? `Round ${d.round} of ${d.rounds}` : "Starting…";
  return (
    <section className={s.debate} aria-label="Live debate" data-debate-live="" data-running={running || undefined}>
      <header className={s.head}>
        <span className={s.title}>Debate</span>
        <span className={s.beta}>Beta</span>
        <span className={s.status}>{status}</span>
      </header>
      <p className={s.cast}>
        {d.speakers.map((sp) => (
          <span key={sp.seat} className={s.castItem} data-seat={sp.seat % 4}>
            <span className={s.avatar} aria-hidden="true">{letter(sp.seat)}</span>
            {sp.name}
          </span>
        ))}
      </p>
      <Rounds d={d} />
      {running && latest ? (
        <span className="visually-hidden" aria-live="polite">
          {latest.status === "failed" ? `${latest.name} didn't answer round ${latest.round}.` : `${latest.name}, round ${latest.round}: ${latest.update ? `${UPDATE_LABEL[latest.update]}. ` : ""}${latest.position}`}
        </span>
      ) : null}
    </section>
  );
}

/** Under a finished answer: the debate that led to it, collapsed by default. */
export function DebateTranscript({ debate }: { debate: DebateSummaryData }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const turns: LiveDebateTurn[] = debate.turns.map((t) => ({ ...t, status: t.ok ? "ok" : "failed" }));
  const summary = `${debate.rounds} ${debate.rounds === 1 ? "round" : "rounds"} · ${debate.speakers.length} models · ${debate.changed === 0 ? "no one changed position" : `${debate.changed} changed position`}`;
  // Each model's update in the final round it spoke (the round-1 openings carry none).
  const finalMoves = debate.speakers
    .map((sp) => {
      const last = debate.turns.filter((t) => t.seat === sp.seat && t.ok && t.update).sort((x, y) => y.round - x.round)[0];
      return last?.update ? { seat: sp.seat, update: last.update } : null;
    })
    .filter((x): x is { seat: number; update: DebateTurnUpdate } => x !== null);
  return (
    <section className={s.record} data-debate-record="">
      <button type="button" className={s.recordToggle} aria-expanded={open} aria-controls={`${id}-debate`} onClick={() => setOpen((v) => !v)}>
        <span className={s.title}>How the debate went</span>
        <span className={s.beta}>Beta</span>
        <span className={s.status}>{summary}</span>
        {finalMoves.length ? (
          <span className={s.summaryTags} aria-hidden="true">
            {finalMoves.map((mv) => <span key={mv.seat} className={`${s.tag} ${s.summaryTag}`} data-update={mv.update} data-seat={mv.seat % 4}>{letter(mv.seat)} {mv.update}</span>)}
          </span>
        ) : null}
        <span className={s.chev} data-open={open || undefined} aria-hidden="true"><IconChevron size={12} /></span>
      </button>
      <div id={`${id}-debate`} hidden={!open} className={s.recordBody}>
        <Rounds d={{ rounds: debate.rounds, turns }} full />
        <p className={s.footnote}>Each model read the others&apos; previous arguments before its next turn. The answer above was written from the final round and checked like any Keplar answer. Models can still be wrong together; check what matters.</p>
      </div>
    </section>
  );
}
