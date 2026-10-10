"use client";

/**
 * Deep Research in the chat: the live plan (steps + pages being read) while the run works, then the report header
 * ("N sources read · M cited"), inline [n] citations with a popover, and the numbered list of pages read.
 * Everything shown comes from the run's real events / answer.research: no page is shown that a search didn't return.
 */
import { useId, type ReactNode } from "react";
import type { ResearchSource, ResearchSummary } from "@/lib/orchestration/types";
import { RESEARCH_STEPS, type LiveResearch } from "../state/research";
import type { CiteRenderer } from "../Markdown";
import { IconCheck, IconDeep } from "../icons";
import s from "./research.module.css";

const initial = (src: ResearchSource) => (src.host.replace(/^(www|m|en)\./, "")[0] ?? "?").toUpperCase();

export function ResearchLive({ r, running }: { r: LiveResearch; running: boolean }) {
  const st = r.steps;
  const label = r.off ? "Researching with the models…"
    : st.write.status === "active" ? "Writing the report…"
    : st.check.status === "active" ? "Cross-checking claims…"
    : st.read.status === "done" ? "Pages read · the models are working through them…"
    : st.read.status === "active" ? "Reading sources…"
    : st.search.status === "active" ? "Searching the web…"
    : "Planning research…";
  return (
    <section className={s.live} aria-label="Deep Research progress" data-research-live="" aria-busy={running || undefined}>
      <header className={s.head}>
        <IconDeep size={15} />
        <span className={s.headLabel}>{running ? label : "Research"}</span>
        <span className={s.tag}>Deep Research</span>
      </header>
      <div className={s.cols}>
        <ol className={s.steps} aria-label="Research plan">
          {RESEARCH_STEPS.map((st) => {
            const v = r.steps[st.id];
            const state = !running && v.status === "active" ? "done" : v.status;
            return (
              <li key={st.id} className={s.step} data-state={state}>
                <span className={s.stepDot} aria-hidden="true">{state === "done" ? <IconCheck size={11} /> : null}</span>
                <span className={s.stepText}>
                  <span className={s.stepLabel}>{st.label}</span>
                  {st.id === "read" && v.status === "active" ? <span className={s.stepDetail}>{r.sources.length} read so far</span> : v.detail ? <span className={s.stepDetail}>{v.detail}</span> : null}
                </span>
              </li>
            );
          })}
          {r.queries.length ? (
            <li className={s.queries}>
              <span className={s.queriesLabel}>Searching for</span>
              <ul>{r.queries.map((q) => <li key={q}>{q}</li>)}</ul>
            </li>
          ) : null}
        </ol>
        <div className={s.feed}>
          <div className={s.feedHead}>
            <span>Sources</span>
            <b aria-live="polite">{r.sources.length} read</b>
          </div>
          {r.off ? (
            <p className={s.off} role="note">{r.off}</p>
          ) : r.sources.length ? (
            <ul className={s.feedList}>
              {r.sources.map((src) => (
                <li key={src.n} className={s.feedRow}>
                  <span className={s.fav} aria-hidden="true">{initial(src)}</span>
                  <span className={s.feedTitle}>{src.title}</span>
                  <span className={s.feedHost}>{src.host}</span>
                  <span className={s.feedState}>Read</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.waiting}>{running ? "Waiting for the first pages…" : "No pages were read."}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** The report's header line: what the research really did. */
export function ResearchHead({ research }: { research: ResearchSummary }) {
  if (!research.sources.length) {
    return (
      <p className={s.reportOff} role="note" data-research-off="">
        <span className={s.tag}>Deep Research</span> {research.off ?? "No pages were read for this report."}
      </p>
    );
  }
  return (
    <div className={s.reportHead} data-research-report="">
      <span className={s.reportLabel}><IconDeep size={14} /> Deep Research report</span>
      <span className={s.badges}>
        <span className={s.badge} data-kind="web"><IconCheck size={12} /> Researched on the web</span>
        <span className={s.badge}>{research.sources.length} {research.sources.length === 1 ? "source" : "sources"} read · {research.cited.length} cited</span>
      </span>
    </div>
  );
}

/** One inline citation: the number, and on hover or focus the page's title, site and the passage the search returned. */
function Citation({ n, src }: { n: number; src: ResearchSource }) {
  const id = useId();
  return (
    <span className={s.cite}>
      <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className={s.citeChip} aria-describedby={id} data-cite={n}>{n}</a>
      <span id={id} role="tooltip" className={s.pop}>
        <span className={s.popTitle}>{src.title}</span>
        <span className={s.popHost}>{src.host}</span>
        {src.snippet ? <span className={s.popText}>{src.snippet}</span> : null}
      </span>
    </span>
  );
}

/** For Markdown's `cite`: a chip for a page that was read; anything else renders as nothing (the server already dropped those). */
export function citeRenderer(sources: ResearchSource[] | undefined): CiteRenderer | undefined {
  if (!sources?.length) return undefined;
  const byN = new Map(sources.map((x) => [x.n, x]));
  const render = (n: number, key: string): ReactNode => {
    const src = byN.get(n);
    return src ? <Citation key={key} n={n} src={src} /> : null;
  };
  return render;
}

/** The numbered pages read, cited ones first-class. */
export function ResearchSources({ research }: { research: ResearchSummary }) {
  if (!research.sources.length) return null;
  const cited = new Set(research.cited);
  return (
    <details className={s.list} data-research-sources="">
      <summary className={s.listSummary}>
        Pages read for this report <span className={s.listMeta}>{research.sources.length} read · {research.cited.length} cited</span>
      </summary>
      <p className={s.listNote}>Pages a live web search returned and a model read for this question. A cited page reports what the sentence says; it doesn&rsquo;t prove it.</p>
      <ol className={s.listItems}>
        {research.sources.map((src) => (
          <li key={src.n} data-cited={cited.has(src.n) || undefined}>
            <span className={s.listN}>{src.n}</span>
            <a href={src.url} target="_blank" rel="noopener noreferrer nofollow">{src.title}</a>
            <span className={s.feedHost}>{src.host}</span>
            {cited.has(src.n) ? <span className={s.citedTag}>Cited</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
