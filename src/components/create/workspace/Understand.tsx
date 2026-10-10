"use client";
import { KIND_LABEL, type SiteKind } from "@/lib/site-builder/brief";
import type { Flow } from "./flow";
import { pickChoices } from "./understand";
import s from "./ws.module.css";

/**
 * Shown in the chat right after the idea is sent and before any questions: what Keplar understood (kind, audience, goal, tone, pages)
 * and three quick directions to choose from. Nothing here calls a model; it reads the same free analysis the brief uses. Everything can be
 * skipped: "Continue" keeps the suggested direction, "Just build it" goes straight to the brief.
 */
export function Understand({ flow, onSkipAll }: { flow: Flow; onSkipAll: () => void }) {
  const { info } = flow;
  const b = info?.brief;
  if (!info || !b) return null;
  const choices = pickChoices(info.directions, b.direction);
  const chosen = flow.dirPick ?? b.direction;
  const rows: [string, string][] = [
    ["Looks like", KIND_LABEL[info.kind as SiteKind] ?? info.kind],
    ["For", b.audience || "Not clear yet. I'll ask."],
    ["Goal", b.goal || "Not clear yet. I'll ask."],
    ["Tone", b.tone.length ? b.tone.join(", ") : "Not clear yet. I'll ask."],
    ["Pages", b.pages.join(", ")],
  ];
  return (
    <div className={s.botBubble} data-testid="understand">
      <small className={s.step}>How I read your idea</small>
      <dl className={s.dl}>
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <strong id="understand-dir">Pick a direction (optional)</strong>
      <div className={s.dirs} role="radiogroup" aria-labelledby="understand-dir">
        {choices.map((x, i) => (
          <button key={x.id} type="button" role="radio" aria-checked={chosen === x.id} className={s.dir} onClick={() => flow.setDirPick(x.id)}>
            <span className={s.sw} aria-hidden="true">{x.swatch.map((c, j) => <i key={j} style={{ background: c }} />)}</span>
            <strong>{x.name}{i === 0 ? " · suggested" : ""}</strong>
            <small>{x.tagline}</small>
          </button>
        ))}
      </div>
      <div className={s.row}>
        <button type="button" className={s.btn} disabled={flow.working} onClick={flow.continueFromUnderstand}>Continue</button>
        <button type="button" className={s.btnGhost} disabled={flow.working} onClick={onSkipAll}>Just build it</button>
        <span className={s.muted}>I&rsquo;ll ask a few short questions next. You can skip any of them.</span>
      </div>
    </div>
  );
}
