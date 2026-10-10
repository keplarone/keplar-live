"use client";

/**
 * Keplar Core in the chat. While a Thorough / Exhaustive answer is worked on: the plan with each step's state and the
 * checking round (CoreLive). On the finished answer: one quiet line (depth · steps · confidence in plain words) that opens
 * to the plan, what checked each step, the final review and the budget used; then "Worth considering" next steps and,
 * when work was paused at the time limit, "Keep working". Everything shown comes from the run's real events.
 */
import { useEffect, useId, useState } from "react";
import type { CoreJobRef, CoreStep, CoreSummary } from "@/lib/core/types";
import type { LiveCore } from "../state/core";
import { IconCheck, IconChevron } from "../icons";
import { Markdown } from "../Markdown";
import s from "./core.module.css";

const DEPTH_LABEL = { quick: "Quick", thorough: "Thorough", exhaustive: "Exhaustive" } as const;
const KIND_LABEL: Record<CoreStep["kind"], string> = { reason: "Reasoning", math: "Math", code: "Code", search: "Web", retrieve: "Lookup", write: "Writing" };

function StepRow({ st, running }: { st: CoreStep; running: boolean }) {
  const state = !running && st.status === "active" ? "skipped" : st.status;
  return (
    <li className={s.step} data-state={state}>
      <span className={s.dot} aria-hidden="true">{state === "done" || state === "revised" ? <IconCheck size={10} /> : null}</span>
      <span className={s.stepText}>
        <span className={s.stepTitle}>
          {st.title}
          <span className={s.kind}>{KIND_LABEL[st.kind]}</span>
        </span>
        {st.result && state !== "active" ? <span className={s.stepResult}>{st.result}</span> : null}
        {st.check || st.model || st.attempts > 1 ? (
          <span className={s.stepMeta}>
            {[st.check, st.model ? `by ${st.model}` : "", st.attempts > 1 ? `${st.attempts} attempts` : ""].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        <span className="visually-hidden">{state === "active" ? "In progress" : state === "failed" ? "Couldn't be verified" : state === "skipped" ? "Skipped" : state === "pending" ? "Waiting" : "Done"}</span>
      </span>
    </li>
  );
}

export function CoreLive({ c, running }: { c: LiveCore; running: boolean }) {
  if (!c.depth || c.depth === "quick") {
    if (!c.escalated && !c.verifying) return null;
  }
  const active = c.steps.find((x) => x.status === "active");
  const label = c.verifying?.status === "active" ? `Checking the answer${c.verifying.round && c.verifying.round > 1 ? ` (round ${c.verifying.round})` : ""}…` : active ? `${active.title}…` : c.steps.length ? "Writing the answer from the checked steps…" : "Planning…";
  return (
    <section className={s.live} aria-label="Keplar's plan and progress" aria-busy={running || undefined} data-core-live="">
      <header className={s.head}>
        <span className={s.headLabel}>{running ? label : "Plan"}</span>
        {c.depth ? <span className={s.tag}>{DEPTH_LABEL[c.depth]}</span> : null}
      </header>
      {c.reason ? <p className={s.reason}>{c.reason}</p> : null}
      {c.steps.length ? <ol className={s.steps} aria-label="Plan">{c.steps.map((st) => <StepRow key={st.id} st={st} running={running} />)}</ol> : null}
      {c.use ? <p className={s.meta}>{formatUse(c.use)}</p> : null}
      <span className="visually-hidden" aria-live="polite">{label}</span>
    </section>
  );
}

function formatUse(u: CoreSummary["use"]): string {
  if (!u.callLimit) return "";
  return `Used ${u.calls} of ${u.callLimit} extra model requests · ${Math.max(1, Math.round(u.ms / 1000))} s`;
}

const STOP_COPY: Record<CoreSummary["stoppedBy"], string> = {
  criterion: "Stopped when every check passed.",
  budget: "Stopped at this plan's limit for one answer.",
  time: "Stopped at the time limit for one request.",
  pool: "Stopped because free capacity ran low.",
  cancelled: "Stopped.",
  "not-needed": "",
};

/** Under a finished answer. Quick answers show only the confidence line (and next steps when there are some). */
export function CoreSummaryView({ core, onAsk, enabled }: { core: CoreSummary; onAsk?: (text: string) => void; enabled: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const deep = core.depth !== "quick" || core.steps.length > 0 || core.checks.length > 0;
  const steps = core.steps.length;
  const passed = core.checks.filter((c) => c.outcome === "passed" || c.outcome === "fixed").length;
  const summary = [deep ? DEPTH_LABEL[core.depth] : null, steps ? `${steps} step${steps === 1 ? "" : "s"}` : null, passed ? `${passed} check${passed === 1 ? "" : "s"} passed` : null].filter(Boolean).join(" · ");
  return (
    <section className={s.summary} aria-label="How Keplar worked on this" data-core-summary="" data-level={core.confidence.level}>
      <div className={s.row}>
        <span className={s.conf} data-level={core.confidence.level}>{core.confidence.words}</span>
        {deep ? (
          <button type="button" className={s.toggle} aria-expanded={open} aria-controls={`${uid}-core`} onClick={() => setOpen((v) => !v)}>
            {summary || "Details"}
            <span className={s.chev} data-open={open || undefined} aria-hidden="true"><IconChevron size={12} /></span>
          </button>
        ) : null}
      </div>
      {deep ? (
        <div id={`${uid}-core`} className={s.details} hidden={!open}>
          <p className={s.reason}>{core.reason}</p>
          {steps ? <ol className={s.steps} aria-label="Plan">{core.steps.map((st) => <StepRow key={st.id} st={st} running={false} />)}</ol> : null}
          {core.checks.length ? (
            <ul className={s.checks} aria-label="Checks">
              {core.checks.map((c, i) => (
                <li key={i} data-outcome={c.outcome}>
                  <span className={s.outcome}>{c.outcome === "passed" ? "Passed" : c.outcome === "fixed" ? "Fixed" : c.outcome === "failed" ? "Didn't pass" : "Unclear"}</span>
                  <span>{c.label}{c.detail && c.outcome !== "passed" ? `: ${c.detail}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {core.grounding?.passages ? <p className={s.meta}>Pulled {core.grounding.passages} earlier passage{core.grounding.passages === 1 ? "" : "s"} back in from this long conversation or its attachments{core.grounding.summarized ? ", with a summary of the earlier part" : ""}.</p> : null}
          <p className={s.meta}>{[formatUse(core.use), STOP_COPY[core.stoppedBy]].filter(Boolean).join(" · ")}</p>
        </div>
      ) : null}
      {core.clarify ? (
        <p className={s.clarify}>
          <span className={s.clarifyLabel}>One question that would sharpen this</span>
          {core.clarify}
        </p>
      ) : null}
      {core.nextSteps?.length ? (
        <div className={s.next}>
          <p className={s.nextLabel} id={`${uid}-next`}>Worth considering</p>
          <ul aria-labelledby={`${uid}-next`}>
            {core.nextSteps.map((n) => (
              <li key={n}>
                {onAsk && enabled ? <button type="button" className={s.nextBtn} onClick={() => onAsk(n)}>{n}</button> : <span>{n}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {core.job ? <KeepWorking job={core.job} /> : null}
    </section>
  );
}

type JobView = { id: string; status: CoreJobRef["status"]; slices: number; steps: CoreStep[]; result?: { markdown: string; core: CoreSummary }; error?: string };

/** Work paused at the time limit: continue it in the background and show the improved answer when it's done. */
export function KeepWorking({ job }: { job: CoreJobRef }) {
  const [view, setView] = useState<JobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const status = view?.status ?? job.status;

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/core/jobs/${encodeURIComponent(job.id)}`, { cache: "no-store" }).catch(() => null);
      if (!r || !r.ok || stop) return;
      const v = (await r.json()) as JobView;
      if (!stop) setView(v);
    };
    void load();
    return () => { stop = true; };
  }, [job.id]);

  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/core/jobs/${encodeURIComponent(job.id)}?advance=1`, { cache: "no-store" }).catch(() => null);
      if (!r || !r.ok) return;
      const v = (await r.json()) as JobView;
      setView(v);
      if (v.status === "done" && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        try { new Notification("Keplar finished working", { body: "The improved answer is ready." }); } catch { /* optional */ }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [status, job.id]);

  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
      const r = await fetch(`/api/core/jobs/${encodeURIComponent(job.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keepGoing: true }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't continue.");
      setView((await r.json()) as JobView);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't continue.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "done" && view?.result) {
    return (
      <div className={s.job} data-job="done">
        <p className={s.jobHead}>Keplar kept working on this. Improved answer</p>
        <p className={s.conf} data-level={view.result.core.confidence.level}>{view.result.core.confidence.words}</p>
        <Markdown source={view.result.markdown} />
      </div>
    );
  }
  return (
    <div className={s.job} data-job={status}>
      {status === "running" ? (
        <p className={s.jobHead} role="status">Still working in the background{view?.slices ? ` (pass ${view.slices + 1})` : ""}. You can leave; the improved answer will appear here.</p>
      ) : status === "failed" ? (
        <p className={s.jobHead}>{view?.error ?? "The background work couldn't finish."}</p>
      ) : (
        <>
          <p className={s.jobHead}>This answer reached the time limit for one request before every check passed.</p>
          <button type="button" className={s.jobBtn} onClick={start} disabled={busy}>{busy ? "Starting…" : "Keep working"}</button>
        </>
      )}
      {err ? <p className={s.jobErr} role="alert">{err}</p> : null}
    </div>
  );
}
