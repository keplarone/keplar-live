"use client";
/**
 * Roblox Cloud (rendered inside the "Roblox Cloud" dialog). The behaviour of RobloxCloud.tsx, unchanged: hand this game's
 * scripts to Keplar to work on while Studio is closed, follow the job (polled every 15 s while active, which also restarts a
 * job whose server slice died), read the report, review every change and apply the picked ones in Studio, each as one
 * undoable step, skipped if the script was edited since the snapshot. Nothing touches the game until the person applies it.
 */
import { useCallback, useEffect, useState } from "react";
import type { StudioBridge } from "@/lib/desktop/studio-bridge";
import { applyChanges, startCloudJob, takeSnapshot, type ApplyResult, type Change } from "@/lib/roblox-cloud/client";
import { DiffView } from "../../code";
import { ActivityIndicator, Badge, Button, Checkbox, Icon, MorphIcon, Progress } from "@/components/kit";
import type { Place } from "../../useStudioAgent";
import {
  api, clock, defaultPicked, GOAL_MIN, hoursLabel, jobTone, ROBLOX_BUDGET, ROBLOX_HOURS, ROBLOX_MODES, ROBLOX_STATUS, robloxActive, robloxChecks, when,
  type RobloxJob,
} from "./panel-logic";
import s from "./panels.module.css";

export type RobloxCloudPanelProps = { bridge: StudioBridge | null; place: Place | null; busy: boolean; compact?: boolean };

export function RobloxCloudPanel({ bridge, place, busy, compact = false }: RobloxCloudPanelProps) {
  const [jobs, setJobs] = useState<RobloxJob[] | null>(null);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<string>("until_done");
  const [budget, setBudget] = useState<number>(ROBLOX_BUDGET.initial);
  const [hours, setHours] = useState(8);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<ApplyResult[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setJobs((await api<{ jobs: RobloxJob[] }>("/api/roblox-cloud/jobs")).jobs); } catch (e) { setError(e instanceof Error ? e.message : "Could not load jobs."); }
  }, []);
  useEffect(() => {
    let live = true;
    void api<{ jobs: RobloxJob[] }>("/api/roblox-cloud/jobs").then((r) => { if (live) setJobs(r.jobs); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Could not load jobs."); });
    return () => { live = false; };
  }, []);
  const anyActive = !!jobs?.some(robloxActive);
  useEffect(() => {
    if (!anyActive) return;
    // Polling also restarts a job whose server slice died (the job route does that); the work itself runs on Keplar's servers.
    const t = window.setInterval(() => {
      void Promise.all((jobs ?? []).filter(robloxActive).map((j) => api(`/api/roblox-cloud/jobs/${j.id}`).catch(() => undefined))).then(load);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [anyActive, jobs, load]);

  const start = async () => {
    if (!place || !bridge) return;
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
    setActing(`${id}:${action}`);
    try { await api(`/api/roblox-cloud/jobs/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
    finally { setActing(null); }
  };

  const review = async (id: string) => {
    setError(null); setApplied(null);
    try {
      const r = await api<{ changes: Change[] }>(`/api/roblox-cloud/jobs/${id}/changes`);
      setChanges(r.changes);
      setPicked(defaultPicked(r.changes));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the changes."); }
  };

  const apply = async (id: string) => {
    if (!changes || !place || !bridge) return;
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

  const toggle = (path: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(path); else n.delete(path); return n; });
  const running = jobs?.find(robloxActive) ?? null;
  const goalOk = goal.trim().length >= GOAL_MIN;

  return (
    <div className={s.stack} data-compact={compact ? "" : undefined} data-cloud="roblox">
      <p className={s.meta}>Works on this game&apos;s scripts with Studio closed and checks every edit with Luau&apos;s analyzer. Nothing changes in your game until you apply it.</p>

      {!running ? (
        <form className={s.form} data-single={compact ? "" : undefined} aria-label="New Roblox Cloud job" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <label className={s.field} data-wide="">
            <span className={s.fieldLabel}>What should Keplar work on?</span>
            <textarea className={s.control} rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Fix the inventory bugs, add a pet system with equip and follow, and make the shop remotes secure." maxLength={4000} required minLength={GOAL_MIN} />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>How long</span>
            <select className={s.control} value={mode} onChange={(e) => setMode(e.target.value)}>{ROBLOX_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Time limit</span>
            <select className={s.control} value={hours} onChange={(e) => setHours(Number(e.target.value))}>{ROBLOX_HOURS.map((h) => <option key={h} value={h}>{hoursLabel(h)}</option>)}</select>
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Budget (credits)</span>
            <input className={s.control} type="number" min={ROBLOX_BUDGET.min} max={ROBLOX_BUDGET.max} step={ROBLOX_BUDGET.step} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </label>
          <div className={s.row} data-wide="">
            <Button variant="primary" type="submit" disabled={!place || !bridge || busy || !!phase || !goalOk}>Start the job</Button>
            <span className={`${s.meta} ${s.grow}`}>{place ? `Game: ${place.name}` : "Open a place in Studio first"} · stops at the budget or time limit, whichever comes first</span>
          </div>
        </form>
      ) : null}

      {phase ? <ActivityIndicator label={phase} showLabel /> : null}
      {error ? <p className={s.notice} data-tone="danger" role="alert"><Icon name="error" size={14} />{error}</p> : null}

      {jobs === null && !error ? <ActivityIndicator label="Loading jobs" showLabel /> : null}
      {jobs?.length ? (
        <ul className={s.list} data-bordered="" aria-label="Roblox Cloud jobs">
          {jobs.map((j) => {
            const done = j.plan.filter((p) => p.status === "done").length;
            const isOpen = open === j.id;
            const bodyId = `rc-${j.id}`;
            return (
              <li key={j.id} data-status={j.status}>
                <button type="button" className={s.jobHead} aria-expanded={isOpen} aria-controls={bodyId} onClick={() => { setOpen(isOpen ? null : j.id); setChanges(null); setApplied(null); }}>
                  <Badge tone={jobTone(j.status)}>{ROBLOX_STATUS[j.status] ?? j.status}</Badge>
                  <span className={s.jobTitle}>{j.goal}</span>
                  <span className={s.jobChevron}><MorphIcon icon="chevron" state={isOpen ? "expanded" : "collapsed"} size={14} /></span>
                  <span className={s.jobMeta}>{j.place.name} · {when(j.createdAt)} · {j.usage.units.toLocaleString()} of {j.maxUnits.toLocaleString()} credits</span>
                </button>
                {isOpen ? (
                  <div className={s.jobBody} id={bodyId}>
                    {j.plan.length ? (
                      <>
                        <Progress value={done} max={j.plan.length} label="Plan progress" />
                        <ol className={s.plan}>
                          {j.plan.map((p, i) => {
                            const st = p.status === "done" ? "done" : p.status === "doing" ? "doing" : "todo";
                            return <li key={i} data-state={st}><span className={s.planMark}>{st === "done" ? <Icon name="check" size={12} label="Done" /> : st === "doing" ? <Icon name="arrow-right" size={12} label="In progress" /> : <Icon name="minus" size={12} label="Next" />}</span><span>{p.title}</span></li>;
                          })}
                        </ol>
                      </>
                    ) : null}
                    {j.stopReason && j.status !== "done" ? <p className={`${s.line} ${s.strong}`}>{j.stopReason}</p> : null}
                    {j.report ? (
                      <>
                        <p className={s.line}>{j.report.summary}</p>
                        <p className={s.meta}>{robloxChecks(j)}</p>
                        <ReportList title="Done" items={j.report.done} />
                        <ReportList title="Still open or needs Studio" items={j.report.unresolved} />
                        <ReportList title="Try in a play test" items={j.report.testing} />
                      </>
                    ) : j.log.length ? (
                      <ul className={s.log} aria-live="polite" aria-label="Job log">
                        {j.log.slice(-8).map((l, i) => <li key={i} data-kind={l.kind}><time dateTime={l.at}>{clock(l.at)}</time><span>{l.text}</span></li>)}
                      </ul>
                    ) : null}
                    <div className={s.row}>
                      {j.status === "running" || j.status === "queued" ? <Button size="sm" loading={acting === `${j.id}:pause`} onClick={() => void act(j.id, "pause")}>Pause</Button> : null}
                      {j.status === "paused" ? <Button size="sm" loading={acting === `${j.id}:resume`} onClick={() => void act(j.id, "resume")}>Resume</Button> : null}
                      {robloxActive(j) || j.status === "paused" ? <Button size="sm" variant="ghost" loading={acting === `${j.id}:stop`} onClick={() => void act(j.id, "stop")}>Stop</Button> : null}
                      {j.report && j.report.files.length ? <Button size="sm" variant="primary" leadingIcon={<Icon name="diff" size={14} />} onClick={() => void review(j.id)}>Review changes</Button> : null}
                    </div>
                    {changes ? (
                      <div className={s.stack}>
                        {changes.length === 0 ? <p className={s.meta}>No script changes in this job.</p> : (
                          <ul className={s.list} data-bordered="" aria-label="Proposed script changes">
                            {changes.map((c) => (
                              <li key={c.path} className={s.change}>
                                <div className={s.changeHead}>
                                  <Checkbox checked={picked.has(c.path)} disabled={c.applied} label={`${c.status === "deleted" ? "Delete" : "Apply"} ${c.path}`} hideLabel onCheckedChange={(on) => toggle(c.path, on)} />
                                  <Badge tone={c.applied ? "success" : c.status === "deleted" ? "danger" : "neutral"} variant="outline">{c.applied ? "applied" : c.status}</Badge>
                                  <span className={s.path} title={c.path}>{c.path}</span>
                                </div>
                                {c.status === "deleted"
                                  ? <p className={s.notice} data-tone="warning"><Icon name="warning" size={14} />Keplar proposes deleting this script. It is only deleted if you tick it.</p>
                                  : <DiffView before={c.base} after={c.next ?? ""} language="luau" beforeLabel="Snapshot" afterLabel="Proposed" defaultCollapsed collapseUnchanged />}
                              </li>
                            ))}
                          </ul>
                        )}
                        {changes.some((c) => !c.applied) ? (
                          <div className={s.row}>
                            <Button variant="primary" disabled={!picked.size || !!phase || busy || !bridge || !place} onClick={() => void apply(j.id)}>Apply {picked.size} in Studio</Button>
                            <span className={`${s.meta} ${s.grow}`}>Each change is one Undo step in Studio. A script you edited since the snapshot is skipped, never overwritten.</span>
                          </div>
                        ) : null}
                        {applied ? (
                          <ul className={s.bullets} aria-label="Applied results">
                            {applied.map((r) => <li key={r.path}><span className={s.path}>{r.path}</span>: {r.result}{r.detail ? ` (${r.detail})` : ""}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : jobs ? <p className={s.meta}>No jobs yet.</p> : null}
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className={s.field}>
      <h3 className={s.sectionTitle}>{title}</h3>
      <ul className={s.bullets}>{items.map((d, i) => <li key={i}>{d}</li>)}</ul>
    </div>
  );
}
