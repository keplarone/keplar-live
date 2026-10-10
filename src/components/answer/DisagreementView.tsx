import type { ReactNode } from "react";
import { buildDisagreementView, type DvInput } from "@/lib/disagreement-view";
import s from "./DisagreementView.module.css";

/**
 * "Show me the disagreement": each position side by side (stacked on narrow screens, by container width, not device), then what the
 * models and the review agreed on, what stayed apart, and why the final answer went the way it did.
 * Built only from fields the pipeline produced (src/lib/disagreement-view.ts). Renders nothing when there was nothing to compare.
 * No hooks: it works in server pages (shared answers) and in the app's answer card.
 */
export function DisagreementView({ data, heading = "h4", footer, className }: { data: DvInput; heading?: "h3" | "h4"; footer?: ReactNode; className?: string }) {
  const v = buildDisagreementView(data);
  if (!v) return null;
  const H = heading;
  const Sub = heading === "h3" ? "h4" : "h5";
  return (
    <section className={`${s.root} ${className ?? ""}`} aria-label="Where the models disagree" data-split="">
      <H className={s.head}>
        <span className={s.count}>{v.headline}</span>
        <span className={s.topic}>{v.topic}</span>
      </H>

      <ul className={s.cols} data-cols={v.columns.length}>
        {v.columns.map((c) => (
          <li key={c.stance} className={s.col} data-lead={c.lead ? "" : undefined}>
            <span className={s.tag}>{v.tie ? "Even split" : c.lead ? "Most models" : "Fewer models"}</span>
            <span className={s.stance}><strong>{c.count} of {c.total}</strong> {c.count === 1 ? "says" : "say"}: {c.stance}</span>
            <span className={s.who}>{c.models.join(", ")}</span>
            {c.summary ? <span className={s.summary}>{c.summary}</span> : null}
          </li>
        ))}
      </ul>

      {v.agreed.length || v.differ.length ? (
        <div className={s.lists}>
          <div className={s.list} data-kind="agreed">
            <Sub className={s.listH}>Where they agree</Sub>
            {v.agreed.length ? <ul>{v.agreed.map((t) => <li key={t}>{t}</li>)}</ul> : <p>No point was recorded as shared.</p>}
          </div>
          <div className={s.list} data-kind="differ">
            <Sub className={s.listH}>Where they differ</Sub>
            <ul>{v.differ.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </div>
      ) : null}

      <div className={s.why} data-recorded={v.why.recorded ? "" : undefined}>
        <Sub className={s.listH}>Why this answer</Sub>
        <p><strong>What Keplar did:</strong> {v.why.text}</p>
        {v.why.steps.length ? (
          <ul className={s.steps}>
            {v.why.steps.map((st, i) => (
              <li key={i}><span className={s.stepTag}>{st.outcome}</span> {st.finding} <span className={s.arrow} aria-hidden="true">→</span><span className={s.sr}> Resolution: </span> {st.resolution}</li>
            ))}
          </ul>
        ) : null}
        {v.why.reviewer ? <p className={s.foot}>A second model reviewed this draft ({v.why.reviewer}).</p> : null}
      </div>

      {v.notes.map((n) => <p key={n} className={s.foot}>{n}</p>)}
      <p className={s.foot}>Agreement counts models, not truth. {footer}</p>
    </section>
  );
}
