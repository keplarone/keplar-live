import Link from "next/link";
import type { ShareRow } from "@/lib/growth/share";
import s from "./Shared.module.css";
import { DisagreementView } from "@/components/answer/DisagreementView";
import { SourceChecks } from "@/components/answer/SourceChecks";
import { ReportAnswer } from "@/components/app-ui/ReportAnswer";

import { agreementLine } from "@/lib/growth/share-text";

/** The question, the answer (plain text, no links) and how the models compared. Shared by the private /r page and the public /answers page. */
export function SharedBody({ r, answerHeading }: { r: ShareRow; answerHeading?: boolean }) {
  const c = r.consensus;
  return (
    <>
      <section className={s.card} aria-label="The shared answer">
        {r.question ? (
          <>
            <p className={s.qLabel}>Question</p>
            <p className={s.q}>{r.question}</p>
          </>
        ) : null}
        {answerHeading ? <h2 className={s.h} style={{ marginTop: "var(--s-6)" }}>Answer</h2> : null}
        <div className={s.answer}>{r.markdown}</div>
      </section>

      <section className={s.card} aria-label="How the models compared">
        <h2 className={s.h}>How the models compared</h2>
        <p className={s.count}>{agreementLine(c.level, c.agree, c.disagree, c.responded, c.consulted)}</p>
        <p className={s.muted}>Agreement is a signal, not proof that the answer is right.</p>
        {r.models.length ? (
          <ul className={s.list}>
            {r.models.map((m, i) => (
              <li key={`${m.name}-${i}`}>
                <span>{m.name}{m.slot !== "panel" ? ` (${m.slot})` : ""}</span>
                <span className={s.muted}>{m.status === "responded" ? "Responded" : m.status === "failed" ? "No response" : m.status}{m.stance ? ` · ${m.stance}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <div className={s.dvWrap}>
        <DisagreementView heading="h3" data={{ consensus: c, models: r.models, disagreements: r.disagreements, checks: r.checks, reviewer: r.reviewer }} />
      </div>
      {r.sourcing && (r.sourcing.state === "checked" || r.sourcing.state === "no_sources") ? <SourceChecks sourcing={r.sourcing} shared /> : null}
    </>
  );
}

/** `report`: which shared page this is (public slug or private token) and the start of what it shows, so the team sees what was reported. */
export function SharedCta({ campaign, extra, report }: { campaign: string; extra?: React.ReactNode; report?: { ref: string; excerpt: string } }) {
  return (
    <div className={s.cta}>
      <Link className={s.btn} data-orbit-fx="primary" href={`/app?utm_source=share&utm_medium=link&utm_campaign=${campaign}`}>Ask your own question, free</Link>
      <Link href="/how-it-works">How Keplar works</Link>
      {extra}
      {report ? (
        <ReportAnswer answerId={`shared:${report.ref}`} excerpt={report.excerpt} triggerClass={s.reportLink} triggerLabel="Report this page" subject="page" />
      ) : (
        <Link href="/feedback?kind=problem&from=shared-page" rel="nofollow">Report this page</Link>
      )}
    </div>
  );
}
