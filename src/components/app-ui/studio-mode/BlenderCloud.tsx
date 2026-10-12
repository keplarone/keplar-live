"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { blenderCloud, type CloudPack, type CloudProgress } from "@/lib/desktop/studio-bridge";
import s from "./studio-mode.module.css";

type Report = { file: string; blender: string; engine: string; frameStart: number; frameEnd: number; frameCurrent: number; fps: number; resX: number; resY: number; resPercent: number; samples: number | null; objects: number; missing: string[]; warnings: string[] };
type Settings = { engine: string; frameStart: number; frameEnd: number; frameStep: number; resPercent: number; samples?: number; format: string; video: boolean };
type JobView = {
  id: string; file: string; report: Report; settings: Settings; maxUnits: number; maxMinutes: number; status: string; stopReason: string | null; createdAt: string; expiresAt: string;
  frames: { total: number; done: number; current: { frame: number; progress: string } | null; secondsPerFrame: number | null };
  usage: { units: number; machineMinutes: number }; outputs: { name: string; bytes: number }[]; machine: { vcpus: number; state: string } | null; downloadedAt: string | null;
  log: { at: string; kind: string; text: string }[];
};
type Overview = { jobs: JobView[]; capacity: { open: boolean; minutesLeft: number; busy: boolean }; machine: { vcpus: number; sessionMinutes: number; creditsPerMinute: number } };

const STATUS: Record<string, string> = { uploading: "Uploading", queued: "Starting", rendering: "Rendering", paused: "Paused", done: "Finished", stopped: "Stopped", failed: "Failed" };
const ENGINE: Record<string, string> = { CYCLES: "Cycles", BLENDER_EEVEE: "EEVEE", BLENDER_WORKBENCH: "Workbench" };
const HOURS = [1, 2, 4, 8, 12, 24];
const active = (j: JobView) => j.status === "uploading" || j.status === "queued" || j.status === "rendering";
const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`);
const noSubscribe = () => () => {};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Keplar answered ${res.status}.`);
  return data;
}

/**
 * Blender Cloud on the Blender page: render the open scene on Keplar's servers, then close Blender or turn the computer off.
 * The desktop app packs the scene (textures inside) and uploads it straight to the job's render machine; frames render there
 * with no network access, and come back to Documents/Keplar renders when you download them. Charged by machine time.
 */
export function BlenderCloud({ busy }: { busy: boolean }) {
  const cloud = useSyncExternalStore(noSubscribe, blenderCloud, () => null);
  const [data, setData] = useState<Overview | null>(null);
  const [pack, setPack] = useState<(CloudPack & { report: Report }) | null>(null);
  const [form, setForm] = useState<Settings & { range: "current" | "all" | "custom"; budget: number; hours: number }>({ engine: "CYCLES", frameStart: 1, frameEnd: 1, frameStep: 1, resPercent: 100, format: "PNG", video: false, range: "current", budget: 1500, hours: 4 });
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState<CloudProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [folders, setFolders] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setData(await api<Overview>("/api/blender-cloud/jobs")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load cloud renders."); }
  }, []);
  useEffect(() => {
    let live = true;
    void api<Overview>("/api/blender-cloud/jobs").then((r) => { if (live) setData(r); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => (cloud ? cloud.onProgress((p) => setProgress(p)) : undefined), [cloud]);
  const anyActive = !!data?.jobs.some(active);
  useEffect(() => {
    if (!anyActive) return;
    // Polling also restarts a render whose watcher died (the job route does that); the render itself runs on the machine.
    const t = window.setInterval(() => {
      void Promise.all((data?.jobs ?? []).filter(active).map((j) => api(`/api/blender-cloud/jobs/${j.id}`).catch(() => undefined))).then(load);
    }, 10_000);
    return () => window.clearInterval(t);
  }, [anyActive, data, load]);

  if (!cloud) {
    return (
      <section className={s.card} aria-labelledby="bcloud-title" data-cloud="">
        <h2 id="bcloud-title" className={s.cardTitle}>Blender Cloud: render while you&apos;re away</h2>
        <p className={s.text}>Rendering on Keplar&apos;s servers needs the Keplar desktop app 0.1.10 or newer. Update the app, then press Set up Blender once so the add-on can pack your scene.</p>
      </section>
    );
  }

  const check = async () => {
    setError(null); setPack(null);
    setPhase("Packing the scene with its textures…");
    try {
      const r = await cloud.pack();
      if (!r.ok) throw new Error(r.error);
      const rep = r.result.report as Report;
      setPack({ ...r.result, report: rep });
      const engine = ENGINE[rep.engine] ? rep.engine : "CYCLES";
      setForm((f) => ({ ...f, engine, frameStart: rep.frameCurrent, frameEnd: rep.frameCurrent, frameStep: 1, resPercent: rep.resPercent, range: "current", video: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Packing failed.");
    } finally {
      setPhase(null);
    }
  };

  const frames = form.range === "current" ? { frameStart: pack?.report.frameCurrent ?? 1, frameEnd: pack?.report.frameCurrent ?? 1 } : form.range === "all" ? { frameStart: pack?.report.frameStart ?? 1, frameEnd: pack?.report.frameEnd ?? 1 } : { frameStart: form.frameStart, frameEnd: form.frameEnd };
  const count = Math.max(0, Math.floor((frames.frameEnd - frames.frameStart) / (form.range === "custom" ? Math.max(1, form.frameStep) : 1)) + 1);

  const start = async () => {
    if (!pack) return;
    setError(null);
    try {
      setPhase("Starting a render machine…");
      const settings: Settings = { engine: form.engine, ...frames, frameStep: form.range === "custom" ? form.frameStep : 1, resPercent: form.resPercent, ...(form.samples ? { samples: form.samples } : {}), format: form.format, video: form.video && count > 1 };
      const created = await api<{ job: JobView; upload: { url: string; token: string } }>("/api/blender-cloud/jobs", { method: "POST", body: JSON.stringify({ report: pack.report, settings, maxUnits: form.budget, maxMinutes: form.hours * 60, sceneBytes: pack.bytes }) });
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
    setError(null);
    try { await api(`/api/blender-cloud/jobs/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
  };
  const remove = async (id: string) => {
    setError(null);
    try { await api(`/api/blender-cloud/jobs/${id}`, { method: "DELETE" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work."); }
  };
  const fetchRenders = async (j: JobView) => {
    setError(null);
    setPhase("Waking the render machine…");
    try {
      const access = await api<{ url: string; token: string }>(`/api/blender-cloud/jobs/${j.id}/download`, { method: "POST", body: "{}" });
      setPhase("Downloading the renders…");
      const label = `${j.file.replace(/\.blend$/i, "")} ${j.createdAt.slice(0, 16).replace("T", " ").replace(":", ".")}`;
      const r = await cloud.download(access.url, access.token, label);
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

  const running = data?.jobs.find(active) ?? null;
  const cap = data?.capacity;
  const rate = data?.machine;
  return (
    <section className={s.card} aria-labelledby="bcloud-title" data-cloud="">
      <div className={s.panelHead}>
        <h2 id="bcloud-title" className={s.cardTitle}>Blender Cloud: render while you&apos;re away</h2>
        <span className={s.grow} />
        <span className={s.meta}>{rate ? `${rate.vcpus} CPU cores · about ${rate.creditsPerMinute} credits a minute` : "Runs on Keplar's servers"}</span>
      </div>
      <p className={s.text}>
        Keplar packs this scene with its textures, renders it on a machine of its own with Blender 5.2, and keeps the frames there for you to download, so you can close Blender or turn your computer off. Cycles, EEVEE and Workbench all render on CPUs, so a frame usually takes longer than on a good graphics card. Your add-ons and the scene&apos;s Python scripts don&apos;t run in the cloud.
      </p>
      {cap && !cap.open ? <p className={s.note} data-tone="warn">{cap.busy ? "Every render machine is busy right now. Try again in a few minutes." : "Cloud rendering has used this month's machine time. It opens again next month."}</p> : null}

      {!running && !pack ? (
        <div className={s.cloudActions}>
          <button type="button" className={s.primary} disabled={busy || !!phase || (cap ? !cap.open : false)} onClick={() => void check()}>Prepare a cloud render</button>
          <span className={s.meta}>Saves a packed copy of the scene as it is now. Your file isn&apos;t changed.</span>
        </div>
      ) : null}

      {pack && !running ? (
        <form className={s.cloudForm} onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <p className={s.text} data-span="">
            <strong>{pack.report.file}</strong> · {mb(pack.bytes)} packed · {pack.report.resX}×{pack.report.resY} · frames {pack.report.frameStart}–{pack.report.frameEnd} at {pack.report.fps} fps · made in Blender {pack.report.blender}
          </p>
          {pack.report.missing.length ? <p className={s.note} data-tone="warn" data-span="">Missing on this computer, so they&apos;ll render pink: {pack.report.missing.slice(0, 6).join(", ")}{pack.report.missing.length > 6 ? ` and ${pack.report.missing.length - 6} more` : ""}.</p> : null}
          {pack.report.warnings.map((w) => <p key={w} className={s.note} data-tone="warn" data-span="">{w}</p>)}
          <label className={s.cloudField}>
            <span>Engine</span>
            <select value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })}>{Object.entries(ENGINE).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          </label>
          <label className={s.cloudField}>
            <span>Frames</span>
            <select value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value as typeof form.range, video: e.target.value !== "current" && form.video })}>
              <option value="current">This frame ({pack.report.frameCurrent})</option>
              <option value="all">The animation ({pack.report.frameStart}–{pack.report.frameEnd})</option>
              <option value="custom">Choose frames</option>
            </select>
          </label>
          <label className={s.cloudField}>
            <span>Resolution</span>
            <select value={form.resPercent} onChange={(e) => setForm({ ...form, resPercent: Number(e.target.value) })}>{[...new Set([25, 50, 75, 100, 150, 200, pack.report.resPercent])].sort((a, b) => a - b).map((p) => <option key={p} value={p}>{p}% ({Math.round((pack.report.resX * p) / 100)}×{Math.round((pack.report.resY * p) / 100)})</option>)}</select>
          </label>
          {form.range === "custom" ? (
            <>
              <label className={s.cloudField}><span>First frame</span><input type="number" value={form.frameStart} onChange={(e) => setForm({ ...form, frameStart: Number(e.target.value) })} /></label>
              <label className={s.cloudField}><span>Last frame</span><input type="number" value={form.frameEnd} min={form.frameStart} onChange={(e) => setForm({ ...form, frameEnd: Number(e.target.value) })} /></label>
              <label className={s.cloudField}><span>Every nth frame</span><input type="number" value={form.frameStep} min={1} max={1000} onChange={(e) => setForm({ ...form, frameStep: Number(e.target.value) })} /></label>
            </>
          ) : null}
          <label className={s.cloudField}>
            <span>Samples{pack.report.samples ? ` (scene: ${pack.report.samples})` : ""}</span>
            <input type="number" min={1} max={65536} placeholder="The scene's own" value={form.samples ?? ""} onChange={(e) => setForm({ ...form, samples: e.target.value ? Number(e.target.value) : undefined })} disabled={form.engine === "BLENDER_WORKBENCH"} />
          </label>
          <label className={s.cloudField}>
            <span>Format</span>
            <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value, video: e.target.value === "OPEN_EXR" ? false : form.video })}><option value="PNG">PNG</option><option value="JPEG">JPEG</option><option value="OPEN_EXR">OpenEXR</option></select>
          </label>
          <label className={s.cloudField}>
            <span>Time limit</span>
            <select value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}>{HOURS.map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}</select>
          </label>
          <label className={s.cloudField}>
            <span>Budget (credits)</span>
            <input type="number" min={100} max={20000} step={100} value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
          </label>
          {count > 1 && form.format !== "OPEN_EXR" ? (
            <label className={s.cloudCheck}>
              <input type="checkbox" checked={form.video} onChange={(e) => setForm({ ...form, video: e.target.checked })} />
              <span>Also join the frames into an MP4 video</span>
            </label>
          ) : null}
          <div className={s.cloudActions}>
            <button type="submit" className={s.primary} disabled={busy || !!phase || count < 1 || count > 2500 || (cap ? !cap.open : false)}>Render {count} frame{count === 1 ? "" : "s"} in the cloud</button>
            <button type="button" className={s.ghost} onClick={() => setPack(null)} disabled={!!phase}>Cancel</button>
            <span className={s.meta}>It stops at the budget or the time limit, whichever comes first. Frames already rendered are kept.</span>
          </div>
        </form>
      ) : null}

      {phase ? <p className={s.note} role="status">{phase}{progress && progress.total ? ` ${Math.floor((progress.done / progress.total) * 100)}%` : ""}</p> : null}
      {phase && progress ? <button type="button" className={s.ghost} onClick={() => void cloud.cancel()}>Cancel the transfer</button> : null}
      {error ? <p className={s.note} data-tone="warn" role="alert">{error}</p> : null}

      {data?.jobs.length ? (
        <ul className={s.cloudJobs}>
          {data.jobs.map((j) => {
            const isOpen = open === j.id;
            const pct = j.frames.total ? (j.frames.done / j.frames.total) * 100 : 0;
            return (
              <li key={j.id} className={s.cloudJob} data-status={j.status}>
                <button type="button" className={s.cloudJobHead} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : j.id)}>
                  <span className={s.riskTag} data-status={j.status}>{STATUS[j.status] ?? j.status}</span>
                  <span className={s.cloudGoal}>{j.file} · {ENGINE[j.settings.engine] ?? j.settings.engine} · {j.frames.done} of {j.frames.total} frame{j.frames.total === 1 ? "" : "s"}</span>
                  <span className={s.meta}>{when(j.createdAt)} · {j.usage.units.toLocaleString()} of {j.maxUnits.toLocaleString()} credits · {Math.round(j.usage.machineMinutes)} machine min</span>
                </button>
                {isOpen ? (
                  <div className={s.cloudBody}>
                    <div className={s.progress} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Frames rendered"><span style={{ width: `${pct}%` }} data-live={active(j) || undefined} /></div>
                    {j.frames.current && j.status === "rendering" ? <p className={s.meta}>{j.frames.current.frame ? `Frame ${j.frames.current.frame}: ` : ""}{j.frames.current.progress}{j.frames.secondsPerFrame ? ` · about ${j.frames.secondsPerFrame} s a frame` : ""}</p> : null}
                    {j.stopReason ? <p className={s.text}><strong>{j.stopReason}</strong></p> : null}
                    <ul className={s.cloudLog} aria-live="polite">{j.log.slice(-6).map((l, i) => <li key={i} data-kind={l.kind}><span className={s.meta}>{new Date(l.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> {l.text}</li>)}</ul>
                    <div className={s.cloudActions}>
                      {j.status === "rendering" || j.status === "queued" ? <button type="button" className={s.ghost} onClick={() => void act(j.id, "pause")}>Pause</button> : null}
                      {j.status === "paused" ? <button type="button" className={s.ghost} onClick={() => void act(j.id, "resume")}>Resume</button> : null}
                      {active(j) || j.status === "paused" ? <button type="button" className={s.ghost} onClick={() => void act(j.id, "stop")}>Stop</button> : null}
                      {j.frames.done > 0 && j.machine?.state !== "deleted" && j.status !== "uploading" ? <button type="button" className={s.primary} disabled={!!phase} onClick={() => void fetchRenders(j)}>{j.downloadedAt ? "Download again" : "Download the renders"}</button> : null}
                      {folders[j.id] ? <button type="button" className={s.ghost} onClick={() => void cloud.open(folders[j.id])}>Open the folder</button> : null}
                      {!active(j) ? <button type="button" className={s.ghost} onClick={() => void remove(j.id)}>Delete from the cloud</button> : null}
                      {!active(j) ? <span className={s.meta}>Kept until {when(j.expiresAt)}, then deleted.</span> : null}
                    </div>
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
