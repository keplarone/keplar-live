"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudioBridge } from "@/lib/desktop/studio-bridge";
import { applyChanges, startCloudJob, takeSnapshot, type ApplyResult, type Change } from "@/lib/roblox-cloud/client";
import { hunks, lineDiff } from "@/lib/site-builder/diff";
import type { Place } from "./useStudioAgent";
import s from "./studio-mode.module.css";

type JobView = {
  id: string; place: { name: string }; goal: string; mode: string; maxUnits: number; maxMinutes: number; status: string; stopReason: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; scriptCount: number;
  plan: { title: string; status: string }[]; log: { at: string; kind: string; text: string }[];
  usage: { turns: number; units: number }; baseline: { problems: number; unchecked: number } | null;
  report: { summary: string; done: string[]; unresolved: string[]; testing: string[]; files: { path: string; status: string; plus: number; minus: number }[]; checks: { before: number; after: number; unchecked: number } } | null;
};

const STATUS: Record<string, string> = { draft: "Uploading", queued: "Starting", running: "Working", paused: "Paused", done: "Finished", stopped: "Stopped", blocked: "Needs you", failed: "Failed" };
const MODES = [
  { id: "until_done", label: "Until the goal is done" },
  { id: "time", label: "For a set time" },
  { id: "checkpoint", label: "First step only, then wait for me" },
];
const HOURS = [1, 2, 4, 8, 12];
const active = (j: JobView) => j.status === "queued" || j.status === "running" || j.status === "draft";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Keplar answered ${res.status}.`);
  return data;
}

function Diff({ c }: { c: Change }) {
  const { rows, truncated } = useMemo(() => hunks(lineDiff(c.base, c.next ?? ""), 2, 160), [c.base, c.next]);
  return (
    <pre className={s.code} data-diff="">
      {rows.map((r, i) => <span key={i} data-op={r.t === "+" ? "add" : r.t === "-" ? "del" : r.t === "…" ? "gap" : undefined}>{r.t === "…" ? "  …" : `${r.t} ${r.s}`}{"\n"}</span>)}
      {truncated ? <span data-op="gap">  … (longer change: the rest applies too)</span> : null}
    </pre>
  );
}

/**
 * Roblox Cloud on the Studio page: hand the game's scripts to Keplar to work on overnight, follow the job, read the morning
 * report, review every change and apply the ones you want in Studio (each as one undoable step, skipped if you edited that
 * script since). Studio itself does not run in the cloud, so jobs work on scripts; the report lists anything that needs Studio.
 */
export function RobloxCloud({ bridge, place, busy }: { bridge: StudioBridge; place: Place | null; busy: boolean }) {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState("until_done");
  const [budget, setBudget] = useState(3000);
  const [hours, setHours] = useState(8);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<ApplyResult[] | null>(null);

  const load = useCallback(async () => {
    try { setJobs((await api<{ jobs: JobView[] }>("/api/roblox-cloud/jobs")).jobs); } catch (e) { setError(e instanceof Error ? e.message : "Could not load jobs."); }
  }, []);
  useEffect(() => {
    let live = true;
    void api<{ jobs: JobView[] }>("/api/roblox-cloud/jobs").then((r) => { if (live) setJobs(r.jobs); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const anyActive = !!jobs?.some(active);
  useEffect(() => {
    if (!anyActive) return;
    // Polling also restarts a job whose server slice died (the job route does that); the work itself runs on Keplar's servers.
    const t = window.setInterval(() => {
      void Promise.all((jobs ?? []).filter(active).map((j) => api(`/api/roblox-cloud/jobs/${j.id}`).catch(() => undefined))).then(load);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [anyActive, jobs, load]);

  const start = async () => {
    if (!place) return;
    setError(null);
    try {
      setPhase("Reading your scripts from Studio…");
      const snap = await takeSnapshot(bridge, place.id, (d, t) => setPhase(`Reading scripts from Studio: ${d} of ${t}`));
      if (!snap.scripts.length) throw new Error("This place has no scripts yet, so there is nothing for Roblox Cloud to work on.");
      setPhase("Uploading the snapshot…");
      const { id } = await startCloudJob(snap, { placeId: place.placeId ?? place.id, goal, mode, maxUnits: budget, maxMinutes: hours * 60 }, (d, t) => setPhase(`Uploading: ${d} of ${t} scripts`));
      setGoal("");
      setOpen(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the job.");
      await load();
    } finally {
      setPhase(null);
    }
  };

  const act = async (id: string, action: "pause" | "resume" | "stop") => {
    setError(null);
    try { await api(`/api/roblox-cloud/jobs/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
  };

  const review = async (id: string) => {
    setError(null); setApplied(null);
    try {
      const r = await api<{ changes: Change[] }>(`/api/roblox-cloud/jobs/${id}/changes`);
      setChanges(r.changes);
      // Edits and new scripts are picked by default; deletions only when the person ticks them.
      setPicked(new Set(r.changes.filter((c) => !c.applied && c.status !== "deleted").map((c) => c.path)));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the changes."); }
  };

  const apply = async (id: string) => {
    if (!changes || !place) return;
    const list = changes.filter((c) => picked.has(c.path));
    if (!list.length) return;
    setError(null);
    setPhase("Applying in Studio…");
    try {
      const res = await applyChanges(bridge, place.id, list, (d, t) => setPhase(`Applying in Studio: ${d} of ${t}`));
      setApplied(res);
      const ok = res.filter((r) => r.result === "applied").map((r) => r.path);
      if (ok.length) await api(`/api/roblox-cloud/jobs/${id}/changes`, { method: "POST", body: JSON.stringify({ applied: ok }) });
      await review(id);
      setApplied(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Applying failed.");
    } finally {
      setPhase(null);
    }
  };

  const running = jobs?.find(active) ?? null;
  return (
    <section className={s.card} aria-labelledby="cloud-title" data-cloud="">
      <div className={s.panelHead}>
        <h2 id="cloud-title" className={s.cardTitle}>Roblox Cloud: work while you&apos;re away</h2>
        <span className={s.grow} />
      </div>
      <p className={s.text}>
        Keplar copies this game&apos;s scripts, works on them in the cloud with your Studio closed, checks every edit with Luau&apos;s own analyzer, and leaves the changes for you to review. Nothing touches your game until you apply it here. Studio doesn&apos;t run in the cloud, so overnight jobs work on scripts; anything that needs parts, UI objects or a play test is listed in the report.
      </p>

      {!running ? (
        <form className={s.cloudForm} onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <label className={s.cloudField} data-wide="">
            <span>What should Keplar work on?</span>
            <textarea className={s.input} rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Fix the inventory bugs, add a pet system with equip and follow, and make the shop remotes secure." maxLength={4000} required minLength={8} />
          </label>
          <label className={s.cloudField}>
            <span>How long</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </label>
          <label className={s.cloudField}>
            <span>Time limit</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{HOURS.map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}</select>
          </label>
          <label className={s.cloudField}>
            <span>Budget (credits)</span>
            <input type="number" min={300} max={20000} step={100} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </label>
          <div className={s.cloudActions}>
            <button type="submit" className={s.primary} disabled={!place || busy || !!phase || goal.trim().length < 8}>Start the job</button>
            <span className={s.meta}>{place ? `Game: ${place.name}` : "Open a place in Studio first"} · it stops at the budget or time limit, whichever comes first</span>
          </div>
        </form>
      ) : null}

      {phase ? <p className={s.note} role="status">{phase}</p> : null}
      {error ? <p className={s.note} data-tone="warn" role="alert">{error}</p> : null}

      {jobs?.length ? (
        <ul className={s.cloudJobs}>
          {jobs.map((j) => {
            const done = j.plan.filter((p) => p.status === "done").length;
            const isOpen = open === j.id;
            return (
              <li key={j.id} className={s.cloudJob} data-status={j.status}>
                <button type="button" className={s.cloudJobHead} aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : j.id); setChanges(null); setApplied(null); }}>
                  <span className={s.riskTag} data-status={j.status}>{STATUS[j.status] ?? j.status}</span>
                  <span className={s.cloudGoal}>{j.goal}</span>
                  <span className={s.meta}>{j.place.name} · {when(j.createdAt)} · {j.usage.units.toLocaleString()} of {j.maxUnits.toLocaleString()} credits</span>
                </button>
                {isOpen ? (
                  <div className={s.cloudBody}>
                    {j.plan.length ? (
                      <>
                        <div className={s.progress} role="progressbar" aria-valuenow={Math.round((done / j.plan.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Plan progress"><span style={{ width: `${(done / j.plan.length) * 100}%` }} data-live={active(j) || undefined} /></div>
                        <ol className={s.planList}>{j.plan.map((p, i) => <li key={i} data-state={p.status === "done" ? "done" : p.status === "doing" ? "doing" : "todo"}><span className={s.planMark} aria-hidden="true" /><span>{p.title}</span></li>)}</ol>
                      </>
                    ) : null}
                    {j.stopReason && j.status !== "done" ? <p className={s.text}><strong>{j.stopReason}</strong></p> : null}
                    {j.report ? (
                      <div className={s.cloudReport}>
                        <p className={s.text}>{j.report.summary}</p>
                        <p className={s.meta}>Luau check: {j.report.checks.before} problem{j.report.checks.before === 1 ? "" : "s"} before, {j.report.checks.after} after{j.report.checks.unchecked ? ` · ${j.report.checks.unchecked} large scripts not checked in the cloud` : ""} · {j.report.files.length} script{j.report.files.length === 1 ? "" : "s"} changed · {j.usage.turns} turns</p>
                        {j.report.done.length ? <><h3 className={s.panelTitle}>Done</h3><ul className={s.builtList}>{j.report.done.map((d, i) => <li key={i}>{d}</li>)}</ul></> : null}
                        {j.report.unresolved.length ? <><h3 className={s.panelTitle}>Still open or needs Studio</h3><ul className={s.builtList}>{j.report.unresolved.map((d, i) => <li key={i}>{d}</li>)}</ul></> : null}
                        {j.report.testing.length ? <><h3 className={s.panelTitle}>Try in a play test</h3><ul className={s.builtList}>{j.report.testing.map((d, i) => <li key={i}>{d}</li>)}</ul></> : null}
                      </div>
                    ) : (
                      <ul className={s.cloudLog} aria-live="polite">{j.log.slice(-8).map((l, i) => <li key={i} data-kind={l.kind}><span className={s.meta}>{new Date(l.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> {l.text}</li>)}</ul>
                    )}
                    <div className={s.cloudActions}>
                      {j.status === "running" || j.status === "queued" ? <button type="button" className={s.ghost} onClick={() => void act(j.id, "pause")}>Pause</button> : null}
                      {j.status === "paused" ? <button type="button" className={s.ghost} onClick={() => void act(j.id, "resume")}>Resume</button> : null}
                      {active(j) || j.status === "paused" ? <button type="button" className={s.ghost} onClick={() => void act(j.id, "stop")}>Stop</button> : null}
                      {j.report && j.report.files.length ? <button type="button" className={s.primary} onClick={() => void review(j.id)}>Review changes</button> : null}
                    </div>
                    {changes ? (
                      <div className={s.cloudChanges}>
                        {changes.length === 0 ? <p className={s.text}>No script changes in this job.</p> : changes.map((c) => (
                          <details key={c.path} className={s.cloudChange}>
                            <summary>
                              <input type="checkbox" checked={picked.has(c.path)} disabled={c.applied} aria-label={`${c.status === "deleted" ? "Delete" : "Apply"} ${c.path}`} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(c.path); else n.delete(c.path); return n; })} />
                              <span className={s.riskTag} data-status={c.status}>{c.applied ? "applied" : c.status}</span>
                              <code>{c.path}</code>
                            </summary>
                            {c.status === "deleted" ? <p className={s.text}>Keplar proposes deleting this script. It is only deleted if you tick it.</p> : <Diff c={c} />}
                          </details>
                        ))}
                        {changes.some((c) => !c.applied) ? (
                          <div className={s.cloudActions}>
                            <button type="button" className={s.primary} disabled={!picked.size || !!phase || busy} onClick={() => void apply(j.id)}>Apply {picked.size} in Studio</button>
                            <span className={s.meta}>Each change is one Undo step in Studio. A script you edited since the snapshot is skipped, never overwritten.</span>
                          </div>
                        ) : null}
                        {applied ? <ul className={s.builtList}>{applied.map((r) => <li key={r.path}>{r.path}: {r.result}{r.detail ? ` (${r.detail})` : ""}</li>)}</ul> : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
