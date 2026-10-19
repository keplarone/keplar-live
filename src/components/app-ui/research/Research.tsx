"use client";

/**
 * Deep Research and Live Research in the chat: the live plan (steps + pages being read) while the run works, then the report header
 * ("N sources read · M cited"), inline [n] citations with a popover, and the numbered list of pages read.
 * Everything shown comes from the run's real events / answer.research: no page is shown that a search didn't return.
 * Live Research (the Keplar One desktop app read the pages on this computer) adds each page's provenance, the passage the answer leans
 * on, and the desktop's citation check; that check compares words and numbers and is never presented as a check by Keplar's servers.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CitationCheck, LiveResearchMeta, ResearchSource, ResearchSummary } from "@/lib/orchestration/types";
import { LIVE_RESEARCH_STEPS, RESEARCH_STEPS, type LiveResearch } from "../state/research";
import type { CiteRenderer } from "../Markdown";
import { IconCheck, IconDeep } from "../icons";
import s from "./research.module.css";

const initial = (src: ResearchSource) => (src.host.replace(/^(www|m|en)\./, "")[0] ?? "?").toUpperCase();

export function ResearchLive({ r, running }: { r: LiveResearch; running: boolean }) {
  const st = r.steps;
  const desktop = r.via === "desktop";
  const steps = desktop ? LIVE_RESEARCH_STEPS : RESEARCH_STEPS;
  const read = desktop ? Math.max(r.read ?? 0, r.sources.length) : r.sources.length;
  const label = desktop
    ? r.off ? "Answering without web pages…"
      : st.check.status === "active" ? "Checking citations against the pages…"
      : st.write.status === "active" ? "Keplar is writing the answer…"
      : r.label || "Researching on this computer…"
    : r.off ? "Researching with the models…"
    : st.write.status === "active" ? "Writing the report…"
    : st.check.status === "active" ? "Cross-checking claims…"
    : st.read.status === "done" ? "Pages read · the models are working through them…"
    : st.read.status === "active" ? "Reading sources…"
    : st.search.status === "active" ? "Searching the web…"
    : "Planning research…";
  return (
    <section className={s.live} aria-label={desktop ? "Live Research progress" : "Deep Research progress"} data-research-live="" data-via={desktop ? "desktop" : undefined} aria-busy={running || undefined}>
      <header className={s.head}>
        <IconDeep size={15} />
        <span className={s.headLabel} aria-live="polite">{running ? label : "Research"}</span>
        <span className={s.tag}>{desktop ? "Live Research · on this computer" : "Deep Research"}</span>
      </header>
      <div className={s.cols}>
        <ol className={s.steps} aria-label="Research plan">
          {steps.map((st) => {
            const v = r.steps[st.id];
            const state = !running && v.status === "active" ? "done" : v.status;
            return (
              <li key={st.id} className={s.step} data-state={state}>
                <span className={s.stepDot} aria-hidden="true">{state === "done" ? <IconCheck size={11} /> : null}</span>
                <span className={s.stepText}>
                  <span className={s.stepLabel}>{st.label}</span>
                  {st.id === "read" && v.status === "active" ? <span className={s.stepDetail}>{read} read so far</span> : st.id === "search" && desktop && r.webSearch === false ? <span className={s.stepDetail}>Reference, scholarly and news indexes</span> : v.detail ? <span className={s.stepDetail}>{v.detail}</span> : null}
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
            <b aria-live="polite">{read} read</b>
          </div>
          {r.off ? (
            <p className={s.off} role="note">{r.off}</p>
          ) : r.sources.length ? (
            <ul className={s.feedList}>
              {r.sources.map((src) => (
                <li key={src.n} className={s.feedRow}>
                  <span className={s.fav} aria-hidden="true">{initial(src)}</span>
                  <span className={s.feedTitle}>{src.title}</span>
                  <span className={s.feedHost}>{src.publisher ?? src.host}</span>
                  <span className={s.feedState}>{src.fromEarlierTurn ? "Earlier" : "Read"}</span>
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
  if (research.live && research.sources.length) return <LiveHead research={research} live={research.live} />;
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
        {research.checked && checkCounts(research.checked.summary) ? <span className={s.badge} title="Keplar compared each cited sentence with the text the search returned for its page: words and numbers, not meaning.">Citations: {checkCounts(research.checked.summary)}</span> : null}
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
    if (!src) return null;
    // Live Research pages carry provenance (retrieval time at least): they get the interactive preview.
    return src.retrievedAt ? <LiveCitation key={key} n={n} src={src} /> : <Citation key={key} n={n} src={src} />;
  };
  return render;
}

/** "2026-10-12": dates as the page and the desktop gave them, the same for everyone (no locale guessing on a date-only value). */
const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");

/**
 * A Live Research citation: a button that opens a small preview (click, tap or Enter; Esc or a click outside closes it) with the page's
 * title, publisher, dates, the passage the answer leans on and plain-language notes, and a link to the page itself. In the desktop app
 * the link opens in the person's browser.
 */
function LiveCitation({ n, src }: { n: number; src: ResearchSource }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  // Kept inside the window on narrow screens (centered on the chip otherwise), so "Open page" can always be reached.
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!open || !pop) return;
    const r = pop.getBoundingClientRect();
    const room = document.documentElement.clientWidth - 8;
    const shift = r.left < 8 ? 8 - r.left : r.right > room ? room - r.right : 0;
    if (shift) pop.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Closes only the preview: the app's own Esc (stop a running answer, leave a field) must not also fire.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      ref.current?.querySelector("button")?.focus();
    };
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);
  const quote = src.evidence?.[0];
  return (
    <span className={s.cite} ref={ref} data-open={open || undefined} onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" className={s.citeChip} aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`Source ${n}: ${src.title}`} data-cite={n} onClick={() => setOpen((o) => !o)}>{n}</button>
      {open ? (
        <span id={id} ref={popRef} role="dialog" aria-label={`Source ${n}`} className={`${s.pop} ${s.popLive}`}>
          <span className={s.popTitle}>{src.title}</span>
          <span className={s.popHost}>
            {[src.publisher ?? src.host, src.publishedAt ? `Published ${day(src.publishedAt)}` : "Publication date unknown", src.retrievedAt ? `Retrieved ${day(src.retrievedAt)}${src.fromEarlierTurn ? ", earlier in this chat" : ""}` : ""].filter(Boolean).join(" · ")}
          </span>
          {quote ? <span className={s.popQuote}>&ldquo;{quote}&rdquo;</span> : src.snippet ? <span className={s.popText}>{src.snippet}</span> : null}
          {src.signals?.length ? <span className={s.popSignals}>{src.signals.slice(0, 2).join(" ")}</span> : null}
          <a className={s.popOpen} href={src.url} target="_blank" rel="noopener noreferrer nofollow">Open page</a>
        </span>
      ) : null}
    </span>
  );
}

const STATUS_WORD: Record<NonNullable<LiveResearchMeta["checked"]>["claims"][number]["status"], string> = {
  supported: "Supported",
  "partially-supported": "Partly supported",
  conflicting: "Conflicting evidence",
  "not-verified": "Not verified",
};

/** Live Research's header: where the pages came from, how many were read and cited, how many independent, and the citation check's counts. */
function LiveHead({ research, live }: { research: ResearchSummary; live: LiveResearchMeta }) {
  const counts = live.checked ? checkCounts(live.checked.summary) : "";
  return (
    <div className={s.reportHead} data-research-report="" data-via="desktop">
      <span className={s.reportLabel}><IconDeep size={14} /> Live Research</span>
      <span className={s.badges}>
        <span className={s.badge} data-kind="web">{live.webSearch ? "Pages read by the Keplar desktop app" : "Reference, scholarly and news pages read by the Keplar desktop app"}</span>
        <span className={s.badge}>{research.sources.length} {research.sources.length === 1 ? "source" : "sources"} read · {research.cited.length} cited{live.independentGroups ? ` · ${live.independentGroups} independent` : ""}</span>
        {counts ? <span className={s.badge} title="The desktop compared each cited sentence with the pages it read: words and numbers, not meaning.">Citations: {counts}</span> : null}
      </span>
    </div>
  );
}

/** "3 supported · 1 not verified": a citation check's counts, for a header badge. */
const checkCounts = (c: CitationCheck["summary"]) =>
  [c.supported && `${c.supported} supported`, c.partiallySupported && `${c.partiallySupported} partly supported`, c.conflicting && `${c.conflicting} conflicting`, c.notVerified && `${c.notVerified} not verified`].filter(Boolean).join(" · ");

const CHECK_NOTE: Record<"desktop" | "server", string> = {
  desktop: "The Keplar desktop app compared each cited sentence with the pages it read. It matches words and numbers, not meaning, so read the page before relying on these.",
  server: "Keplar compared each cited sentence with the text the search returned for the page it cites. It matches words and numbers, not meaning, so read the page before relying on these.",
};

/** Statements the desktop's citation check couldn't fully back with a cited page, with the passage (or the conflicting page) it found. */
export function LiveChecks({ live }: { live?: LiveResearchMeta }) {
  return live?.checked ? <CitationChecks checked={live.checked} via="desktop" /> : null;
}

/** Statements a citation check (the desktop's, or the server's for Deep Research) couldn't fully back with a cited page. */
export function CitationChecks({ checked, via }: { checked: CitationCheck; via: "desktop" | "server" }) {
  const claims = checked.claims.filter((c) => c.status !== "supported");
  if (!claims.length) return null;
  // The count comes from the check's summary; only the most serious statements are kept with the chat.
  const sum = checked.summary;
  const total = Math.max(claims.length, sum.conflicting + sum.notVerified + sum.partiallySupported);
  const removed = via === "server" ? sum.removedCitations : 0;
  return (
    <details className={s.list} data-live-checks={via === "desktop" ? "" : undefined} data-citation-checks={via}>
      <summary className={s.listSummary}>Citation check <span className={s.listMeta}>{total} {total === 1 ? "statement needs" : "statements need"} a closer look</span></summary>
      <p className={s.listNote} role="note">{CHECK_NOTE[via]}{removed ? ` ${removed === 1 ? "1 citation was" : `${removed} citations were`} removed because the page didn't mention the sentence.` : ""}</p>
      <ul className={s.checks}>
        {claims.map((c, i) => (
          <li key={i} data-status={c.status}>
            <span className={s.checkStatus}>{STATUS_WORD[c.status]}</span>
            <span className={s.checkText}>{c.text}</span>
            {c.note ? <span className={s.checkNote}>{c.note}</span> : null}
            {c.conflict ? <span className={s.checkNote}>Source {c.conflict.n} says: &ldquo;{c.conflict.quote}&rdquo;</span> : null}
          </li>
        ))}
      </ul>
      {total > claims.length ? <p className={s.listNote}>And {total - claims.length} more not listed here (the most serious are listed first).</p> : null}
    </details>
  );
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
      <p className={s.listNote}>
        {research.live
          ? <>Pages the Keplar desktop app found and read for this question{research.live.webSearch ? "" : " (general web search isn\u2019t set up there, so only reference, scholarly and news indexes were searched)"}. A cited page reports what the sentence says; it doesn&rsquo;t prove it.</>
          : <>Pages a live web search returned and a model read for this question. A cited page reports what the sentence says; it doesn&rsquo;t prove it.</>}
      </p>
      <ol className={s.listItems}>
        {research.sources.map((src) => (
          <li key={src.n} data-cited={cited.has(src.n) || undefined}>
            <span className={s.listN}>{src.n}</span>
            <a href={src.url} target="_blank" rel="noopener noreferrer nofollow">{src.title}</a>
            <span className={s.feedHost}>{[src.publisher ?? src.host, research.live ? (src.publishedAt ? day(src.publishedAt) : "date unknown") : ""].filter(Boolean).join(" · ")}</span>
            {src.fromEarlierTurn ? <span className={s.citedTag}>From earlier</span> : null}
            {cited.has(src.n) ? <span className={s.citedTag}>Cited</span> : null}
          </li>
        ))}
      </ol>
      {research.live?.failed?.length ? (
        <details className={s.failed}>
          <summary className={s.listSummary}>Pages that couldn&rsquo;t be read <span className={s.listMeta}>{research.live.failed.length}</span></summary>
          <ul className={s.listItems}>
            {research.live.failed.map((f, i) => (
              <li key={i}><span className={s.feedHost}>{hostLabel(f.url)}</span><span className={s.checkNote}>{f.reason}</span></li>
            ))}
          </ul>
        </details>
      ) : null}
    </details>
  );
}

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
};
