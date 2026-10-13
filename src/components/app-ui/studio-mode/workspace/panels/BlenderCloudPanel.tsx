"use client";
/**
 * Blender Cloud (rendered inside the "Blender Cloud" dialog). The behaviour of BlenderCloud.tsx, unchanged: the desktop app
 * packs the open scene with its textures, uploads it to the job's render machine, frames render there, and come back to
 * Documents/Keplar renders on download. Charged by machine time; stops at the budget or time limit. Jobs are polled every
 * 10 s while active (which also restarts a render whose watcher died). Needs desktop app 0.1.10+ (bridge cloud API).
 */
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { blenderCloud, type CloudPack, type CloudProgress } from "@/lib/desktop/studio-bridge";
import { ActivityIndicator, Badge, Button, Checkbox, Icon, MorphIcon, Progress } from "../../ui";
import {
  api, BLENDER_HOURS, BLENDER_STATUS, blenderActive, canDownload, canRender, capacityText, clock, downloadLabel, ENGINE, FORMATS, formFromReport, frameCount,
  hoursLabel, INITIAL_FORM, jobTone, MAX_FRAMES, mb, missingText, RENDER_BUDGET, renderSettings, resolutionOptions, when,
  type BlenderJob, type BlenderOverview, type BlenderReport, type RenderForm,
} from "./panel-logic";
import s from "./panels.module.css";

const noSubscribe = () => () => {};

export type BlenderCloudPanelProps = { busy: boolean; compact?: boolean };

export function BlenderCloudPanel({ busy, compact = false }: BlenderCloudPanelProps) {
  const cloud = useSyncExternalStore(noSubscribe, blenderCloud, () => null);
  const [data, setData] = useState<BlenderOverview | null>(null);
  const [pack, setPack] = useState<(CloudPack & { report: BlenderReport }) | null>(null);
  const [form, setForm] = useState<RenderForm>(INITIAL_FORM);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState<CloudProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<BlenderOverview>("/api/blender-cloud/jobs")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load cloud renders."); }
  }, []);
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    void api<BlenderOverview>("/api/blender-cloud/jobs").then((r) => { if (live) setData(r); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Could not load cloud renders."); });
    return () => { live = false; };
  }, [cloud]);
  useEffect(() => (cloud ? cloud.onProgress((p) => setProgress(p)) : undefined), [cloud]);
  const anyActive = !!data?.jobs.some(blenderActive);
  useEffect(() => {
    if (!anyActive) return;
    const t = window.setInterval(() => {
      void Promise.all((data?.jobs ?? []).filter(blenderActive).map((j) => api(`/api/blender-cloud/jobs/${j.id}`).catch(() => undefined))).then(load);
    }, 10_000);
    return () => window.clearInterval(t);
  }, [anyActive, data, load]);

  if (!cloud) {
    return (
      <div className={s.stack} data-compact={compact ? "" : undefined} data-cloud="blender">
        <p className={s.notice} data-tone="warning" role="status"><Icon name="warning" size={14} />Rendering on Keplar&apos;s servers needs the Keplar desktop app 0.1.10 or newer. Update the app, then press Set up Blender once so the add-on can pack your scene.</p>
        <span><Link className={s.linkAct} data-variant="outline" href="/download">Update the desktop app</Link></span>
      </div>
    );
  }

  const check = async () => {
    setError(null); setPack(null);
    setPhase("Packing the scene with its textures…");
    try {
      const r = await cloud.pack();
      if (!r.ok) throw new Error(r.error);
      const rep = r.result.report as BlenderReport;
      setPack({ ...r.result, report: rep });
      setForm((f) => formFromReport(f, rep));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Packing failed.");
    } finally {
      setPhase(null);
    }
  };

  const count = frameCount(form, pack?.report);
  const capOpen = data ? data.capacity.open : true;

  const start = async () => {
    if (!pack) return;
    setError(null);
    try {
      setPhase("Starting a render machine…");
      const settings = renderSettings(form, pack.report);
      const created = await api<{ job: BlenderJob; upload: { url: string; token: string } }>("/api/blender-cloud/jobs", { method: "POST", body: JSON.stringify({ report: pack.report, settings, maxUnits: form.budget, maxMinutes: form.hours * 60, sceneBytes: pack.bytes }) });
      setOpen(created.job.id);
      setPhase(`Uploading the scene (${mb(pack.bytes)})…`);
      const up = await cloud.upload(pack.packId, created.upload.url, created.upload.token);
      if (!up.ok) throw new Error(up.error);
      setPhase("Starting the render…");
      await api(`/api/blender-cloud/jobs/${created.job.id}/start`, { method: "POST" });
      setPack(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the render.");
      await load();
    } finally {
      setPhase(null); setProgress(null);
    }
  };

  const act = async (id: string, action: "pause" | "resume" | "stop") => {
    setError(null); setActing(`${id}:${action}`);
    try { await api(`/api/blender-cloud/jobs/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
    finally { setActing(null); }
  };
  const remove = async (id: string) => {
    setError(null); setActing(`${id}:delete`);
    try { await api(`/api/blender-cloud/jobs/${id}`, { method: "DELETE" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
    finally { setActing(null); }
  };
  const fetchRenders = async (j: BlenderJob) => {
    setError(null);
    setPhase("Waking the render machine…");
    try {
      const access = await api<{ url: string; token: string }>(`/api/blender-cloud/jobs/${j.id}/download`, { method: "POST", body: "{}" });
      setPhase("Downloading the renders…");
      const r = await cloud.download(access.url, access.token, downloadLabel(j));
      if (r.ok) setFolders((f) => ({ ...f, [j.id]: r.result.folder }));
      await api(`/api/blender-cloud/jobs/${j.id}/download`, { method: "POST", body: JSON.stringify({ done: true }) }).catch(() => undefined);
      if (!r.ok) throw new Error(r.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download failed.");
    } finally {
      setPhase(null); setProgress(null);
    }
  };

  const running = data?.jobs.find(blenderActive) ?? null;
  const rate = data?.machine;
  const set = (patch: Partial<RenderForm>) => setForm((f) => ({ ...f, ...patch }));
  const pct = progress && progress.total ? Math.floor((progress.done / progress.total) * 100) : null;

  return (
    <div className={s.stack} data-compact={compact ? "" : undefined} data-cloud="blender">
      <p className={s.meta}>
        {rate ? `${rate.vcpus} CPU cores · about ${rate.creditsPerMinute} credits a minute` : "Runs on Keplar's servers"} · Blender 5.2 on CPUs · your add-ons and scene scripts don&apos;t run there.
      </p>
      {data && !data.capacity.open ? <p className={s.notice} data-tone="warning" role="status"><Icon name="warning" size={14} />{capacityText(data.capacity)}</p> : null}

      {!running && !pack ? (
        <div className={s.row}>
          <Button variant="primary" leadingIcon={<Icon name="cube" size={14} />} disabled={busy || !!phase || !capOpen} onClick={() => void check()}>Prepare a cloud render</Button>
          <span className={`${s.meta} ${s.grow}`}>Saves a packed copy of the scene as it is now. Your file isn&apos;t changed.</span>
        </div>
      ) : null}

      {pack && !running ? (
        <form className={s.form} data-single={compact ? "" : undefined} aria-label="Cloud render settings" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <p className={s.meta} data-wide="">
            <span className={s.strong}>{pack.report.file}</span> · {mb(pack.bytes)} packed · {pack.report.resX}×{pack.report.resY} · frames {pack.report.frameStart}–{pack.report.frameEnd} at {pack.report.fps} fps · made in Blender {pack.report.blender}
          </p>
          {pack.report.missing.length ? <p className={s.notice} data-tone="warning" data-wide=""><Icon name="warning" size={14} />{missingText(pack.report.missing)}</p> : null}
          {pack.report.warnings.map((w) => <p key={w} className={s.notice} data-tone="warning" data-wide=""><Icon name="warning" size={14} />{w}</p>)}
          <Field label="Engine">
            <select className={s.control} value={form.engine} onChange={(e) => set({ engine: e.target.value })}>{Object.entries(ENGINE).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          </Field>
          <Field label="Frames">
            <select className={s.control} value={form.range} onChange={(e) => set({ range: e.target.value as RenderForm["range"], video: e.target.value !== "current" && form.video })}>
              <option value="current">This frame ({pack.report.frameCurrent})</option>
              <option value="all">The animation ({pack.report.frameStart}–{pack.report.frameEnd})</option>
              <option value="custom">Choose frames</option>
            </select>
          </Field>
          {form.range === "custom" ? (
            <>
              <Field label="First frame"><input className={s.control} type="number" value={form.frameStart} onChange={(e) => set({ frameStart: Number(e.target.value) })} /></Field>
              <Field label="Last frame"><input className={s.control} type="number" value={form.frameEnd} min={form.frameStart} onChange={(e) => set({ frameEnd: Number(e.target.value) })} /></Field>
              <Field label="Every nth frame"><input className={s.control} type="number" value={form.frameStep} min={1} max={1000} onChange={(e) => set({ frameStep: Number(e.target.value) })} /></Field>
            </>
          ) : null}
          <Field label="Resolution">
            <select className={s.control} value={form.resPercent} onChange={(e) => set({ resPercent: Number(e.target.value) })}>
              {resolutionOptions(pack.report).map((p) => <option key={p} value={p}>{p}% ({Math.round((pack.report.resX * p) / 100)}×{Math.round((pack.report.resY * p) / 100)})</option>)}
            </select>
          </Field>
          <Field label={`Samples${pack.report.samples ? ` (scene: ${pack.report.samples})` : ""}`}>
            <input className={s.control} type="number" min={1} max={65536} placeholder="The scene's own" value={form.samples ?? ""} onChange={(e) => set({ samples: e.target.value ? Number(e.target.value) : undefined })} disabled={form.engine === "BLENDER_WORKBENCH"} />
          </Field>
          <Field label="Format">
            <select className={s.control} value={form.format} onChange={(e) => set({ format: e.target.value, video: e.target.value === "OPEN_EXR" ? false : form.video })}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
          </Field>
          <Field label="Time limit">
            <select className={s.control} value={form.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>{BLENDER_HOURS.map((h) => <option key={h} value={h}>{hoursLabel(h)}</option>)}</select>
          </Field>
          <Field label="Budget (credits)">
            <input className={s.control} type="number" min={RENDER_BUDGET.min} max={RENDER_BUDGET.max} step={RENDER_BUDGET.step} value={form.budget} onChange={(e) => set({ budget: Number(e.target.value) })} />
          </Field>
          {count > 1 && form.format !== "OPEN_EXR" ? (
            <div data-wide=""><Checkbox checked={form.video} onCheckedChange={(v) => set({ video: v })} label="Also join the frames into an MP4 video" /></div>
          ) : null}
          {count > MAX_FRAMES ? <p className={s.notice} data-tone="warning" data-wide=""><Icon name="warning" size={14} />One render can have up to {MAX_FRAMES.toLocaleString()} frames.</p> : null}
          <div className={s.row} data-wide="">
            <Button variant="primary" type="submit" disabled={busy || !!phase || !canRender(count, capOpen)}>Render {count} frame{count === 1 ? "" : "s"} in the cloud</Button>
            <Button variant="ghost" onClick={() => setPack(null)} disabled={!!phase}>Cancel</Button>
            <span className={`${s.meta} ${s.grow}`}>Stops at the budget or the time limit. Frames already rendered are kept.</span>
          </div>
        </form>
      ) : null}

      {phase ? (
        <div className={s.row}>
          <ActivityIndicator label={`${phase}${pct !== null ? ` ${pct}%` : ""}`} showLabel />
          {progress ? <Button size="sm" variant="ghost" onClick={() => void cloud.cancel()}>Cancel the transfer</Button> : null}
        </div>
      ) : null}
      {phase && progress && progress.total ? <Progress value={progress.done} max={progress.total} label={progress.kind === "upload" ? "Uploading" : "Downloading"} valueText={`${pct}%`} /> : null}
      {error ? <p className={s.notice} data-tone="danger" role="alert"><Icon name="error" size={14} />{error}</p> : null}

      {data === null && !error ? <ActivityIndicator label="Loading renders" showLabel /> : null}
      {data?.jobs.length ? (
        <ul className={s.list} data-bordered="" aria-label="Cloud renders">
          {data.jobs.map((j) => {
            const isOpen = open === j.id;
            const bodyId = `bc-${j.id}`;
            return (
              <li key={j.id} data-status={j.status}>
                <button type="button" className={s.jobHead} aria-expanded={isOpen} aria-controls={bodyId} onClick={() => setOpen(isOpen ? null : j.id)}>
                  <Badge tone={jobTone(j.status)}>{BLENDER_STATUS[j.status] ?? j.status}</Badge>
                  <span className={s.jobTitle}>{j.file} · {ENGINE[j.settings.engine] ?? j.settings.engine} · {j.frames.done} of {j.frames.total} frame{j.frames.total === 1 ? "" : "s"}</span>
                  <span className={s.jobChevron}><MorphIcon icon="chevron" state={isOpen ? "expanded" : "collapsed"} size={14} /></span>
                  <span className={s.jobMeta}>{when(j.createdAt)} · {j.usage.units.toLocaleString()} of {j.maxUnits.toLocaleString()} credits · {Math.round(j.usage.machineMinutes)} machine min</span>
                </button>
                {isOpen ? (
                  <div className={s.jobBody} id={bodyId}>
                    <Progress value={j.frames.done} max={j.frames.total} label="Frames rendered" />
                    {j.frames.current && j.status === "rendering" ? <p className={s.meta}>{j.frames.current.frame ? `Frame ${j.frames.current.frame}: ` : ""}{j.frames.current.progress}{j.frames.secondsPerFrame ? ` · about ${j.frames.secondsPerFrame} s a frame` : ""}</p> : null}
                    {j.stopReason ? <p className={`${s.line} ${s.strong}`}>{j.stopReason}</p> : null}
                    {j.log.length ? (
                      <ul className={s.log} aria-live="polite" aria-label="Render log">
                        {j.log.slice(-6).map((l, i) => <li key={i} data-kind={l.kind}><time dateTime={l.at}>{clock(l.at)}</time><span>{l.text}</span></li>)}
                      </ul>
                    ) : null}
                    <div className={s.row}>
                      {j.status === "rendering" || j.status === "queued" ? <Button size="sm" loading={acting === `${j.id}:pause`} onClick={() => void act(j.id, "pause")}>Pause</Button> : null}
                      {j.status === "paused" ? <Button size="sm" loading={acting === `${j.id}:resume`} onClick={() => void act(j.id, "resume")}>Resume</Button> : null}
                      {blenderActive(j) || j.status === "paused" ? <Button size="sm" variant="ghost" loading={acting === `${j.id}:stop`} onClick={() => void act(j.id, "stop")}>Stop</Button> : null}
                      {canDownload(j) ? <Button size="sm" variant="primary" disabled={!!phase} onClick={() => void fetchRenders(j)}>{j.downloadedAt ? "Download again" : "Download the renders"}</Button> : null}
                      {folders[j.id] ? <Button size="sm" leadingIcon={<Icon name="folder" size={14} />} onClick={() => void cloud.open(folders[j.id]!)}>Open the folder</Button> : null}
                      {!blenderActive(j) ? <Button size="sm" variant="ghost" leadingIcon={<Icon name="trash" size={14} />} loading={acting === `${j.id}:delete`} onClick={() => void remove(j.id)}>Delete from the cloud</Button> : null}
                    </div>
                    {!blenderActive(j) ? <p className={s.meta}>Kept until {when(j.expiresAt)}, then deleted.</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : data ? <p className={s.meta}>No cloud renders yet.</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}
