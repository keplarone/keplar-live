"use client";
/**
 * Create: video (Beta). Higgsfield is the default provider and the default model (Seedance 2.0).
 * Everything shown comes from the server: the provider state ("Not configured" until the keys exist, and then nothing is ever
 * generated locally), the models and the options each one supports, the live credit quote, and the status of every job.
 * Flow: choose options (the quote updates as you change them) -> approve the exact credits -> the server submits -> progress ->
 * result stored in Keplar. Credits are charged only when a video is delivered.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "../create.module.css";
import { ReferencePicker, type RefItem, type RefLimits } from "./ReferencePicker";
import v from "./video.module.css";

type ModelCfg = {
  id: string; label: string; mode: string; note: string; default: boolean; durations: number[] | null; durationFollowsSource: boolean; aspectRatios: string[];
  refs: { image?: { min: number; max: number }; video?: { min: number; max: number } } | null;
  options: { resolutions: string[] | null; defaultResolution: string | null; sound: boolean; negativePrompt: boolean; seed: boolean };
  price: { known: boolean; label: string };
};
type Config = {
  configured: boolean; status: string; label: string; available: boolean; upgradeTo: string | null; message: string | null; defaultModel: string; maxSeconds: number;
  limits: { perDay: number | null; concurrent: number; maxCompare: number; promptChars: number; maxOutputs: number } | null;
  compare: { maxModels: number; perModel: number; runsPerDay: number | null; window: number } | null;
  models: ModelCfg[]; reference: RefLimits & { image: RefLimits["image"] };
};
type Job = {
  id: string; prompt: string; model: string; status: "queued" | "running" | "completed" | "failed" | "blocked"; params: { aspectRatio: string; durationSec?: number };
  estimatedUnits: number; units: number | null; error?: string; url: string | null; refs: { images: number; video: boolean; ignored: boolean } | null; compareId: string | null; waiting?: boolean;
};
type Item = { modelId: string; label: string; durationSec: number | null; count: number; units: number | null; source: string; priceNote: string; usesRefs: { image: boolean; video: boolean }; ignoresRefs: boolean; problem: string | null; ignoredOptions: string[] };
type Preview = { compare?: boolean; blocked?: string | null; items: Item[]; totalUnits: number | null; priceKnown: boolean; large: boolean };
type Prefs = { models?: string[]; compare?: boolean; ratio?: string; duration?: number; resolution?: string; sound?: boolean; count?: number; cmpCount?: number };

const PREFS_KEY = "keplar.video.prefs.v1";
const loadPrefs = (): Prefs => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs; } catch { return {}; } };
const savePrefs = (p: Prefs) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ } };

class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) { super(message); }
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `Request failed (${res.status})`), res.status, data);
  return data as T;
}
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);
const active = (j: Job) => j.status === "queued" || j.status === "running";
const uniq = <T,>(a: T[]) => [...new Set(a)];

export function VideoStudio() {
  const [data, setData] = useState<{ config: Config; jobs: Job[] } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [ratio0, setRatio] = useState("16:9");
  const [duration0, setDuration] = useState(5);
  const [resolution0, setResolution] = useState("");
  const [sound, setSound] = useState(true);
  const [negative, setNegative] = useState("");
  const [count, setCount] = useState(1);
  const [cmpCount, setCmpCount] = useState(6);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [rights, setRights] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [quotedKey, setQuotedKey] = useState("");
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [confirm, setConfirm] = useState<{ total: number; large: boolean } | null>(null);
  const [ackLarge, setAckLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const config = data?.config;
  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  const load = useCallback(async () => {
    const r = await api<{ config: Config; jobs: Job[] }>("/api/create/media/video");
    setData(r);
    return r;
  }, []);

  useEffect(() => {
    let on = true;
    api<{ config: Config; jobs: Job[] }>("/api/create/media/video")
      .then((r) => {
        if (!on) return;
        setData(r);
        const p = loadPrefs();
        const ids = new Set(r.config.models.map((m) => m.id));
        const keep = (p.models ?? []).filter((id) => ids.has(id));
        setModels(keep.length ? keep : [r.config.defaultModel]);
        setCompare(Boolean(p.compare) && keep.length > 1);
        if (p.ratio) setRatio(p.ratio);
        if (p.duration) setDuration(p.duration);
        if (p.resolution) setResolution(p.resolution);
        if (typeof p.sound === "boolean") setSound(p.sound);
        if (p.count) setCount(Math.min(p.count, r.config.limits?.maxOutputs ?? 1));
        if (p.cmpCount) setCmpCount(Math.min(p.cmpCount, r.config.compare?.perModel ?? 6));
      })
      .catch((e) => on && setLoadErr(e instanceof ApiError && e.status === 401 ? "Sign in to create video." : e instanceof Error ? e.message : "Couldn't load video."));
    return () => { on = false; };
  }, []);

  // Progress: the server advances running jobs on every read (and by webhook), so polling is all the client does.
  const anyActive = jobs.some(active);
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => void load().catch(() => undefined), 3000);
    return () => clearInterval(t);
  }, [anyActive, load]);

  const chosen = useMemo(() => (config?.models ?? []).filter((m) => models.includes(m.id)), [config, models]);
  const haveImage = refs.some((r) => r.kind === "image");
  const haveVideo = refs.some((r) => r.kind === "video");
  const accepts = { image: chosen.some((m) => m.refs?.image), video: chosen.some((m) => m.refs?.video) };
  const ratios = uniq(chosen.flatMap((m) => m.aspectRatios));
  const durations = uniq(chosen.flatMap((m) => m.durations ?? [])).sort((a, b) => a - b);
  const followsSource = chosen.length > 0 && chosen.every((m) => m.durationFollowsSource);
  const resolutions = uniq(chosen.flatMap((m) => m.options.resolutions ?? []));
  const hasSound = chosen.some((m) => m.options.sound);
  const hasNegative = chosen.some((m) => m.options.negativePrompt);
  const readyRefs = refs.filter((r) => r.status === "ready" && r.ref);
  const uploading = refs.some((r) => r.status === "uploading");
  const maxOut = config?.limits?.maxOutputs ?? 1;
  const maxModels = compare ? (config?.compare?.maxModels ?? config?.limits?.maxCompare ?? 1) : 1;
  const outCount = compare ? cmpCount : count;

  // Choices stay valid when the model set changes (derived, so no effect is needed).
  const ratio = !ratios.length || ratios.includes(ratio0) ? ratio0 : ratios[0];
  const duration = !durations.length || durations.includes(duration0) ? duration0 : durations.reduce((a, d) => (Math.abs(d - duration0) < Math.abs(a - duration0) ? d : a), durations[0]);
  const resolution = resolutions.includes(resolution0) ? resolution0 : "";

  const body = (extra: Record<string, unknown> = {}) => ({
    prompt: prompt.trim(), models, aspectRatio: ratio, durationSec: duration,
    ...(resolution && resolutions.includes(resolution) ? { resolution } : {}), ...(hasSound ? { sound } : {}), ...(hasNegative && negative.trim() ? { negativePrompt: negative.trim() } : {}),
    count: outCount, ...(compare ? { compare: true } : {}), references: readyRefs.map((r) => r.ref), rightsConfirmed: rights, ...extra,
  });

  // Live quote: re-asked (debounced) whenever an option changes.
  const quoteKey = JSON.stringify([prompt.trim().length >= 4, models, ratio, duration, resolution, hasSound && sound, hasNegative && negative.trim().length > 0, outCount, compare, readyRefs.map((r) => r.id), rights]);
  useEffect(() => {
    if (!config?.configured || !config.available || models.length === 0) return;
    if (prompt.trim().length < 4) return;
    if (readyRefs.length && !rights) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setQuoting(true);
      fetch("/api/create/media/video/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body()), signal: ctl.signal })
        .then(async (res) => {
          const j = (await res.json().catch(() => ({}))) as { preview?: Preview; error?: string };
          if (!res.ok || !j.preview) throw new Error(j.error ?? "Couldn't get the cost.");
          setPreview(j.preview);
          setQuotedKey(quoteKey);
          setPreviewErr(null);
        })
        .catch((e) => { if ((e as Error).name !== "AbortError") { setPreview(null); setPreviewErr(e instanceof Error ? e.message : "Couldn't get the cost."); } })
        .finally(() => setQuoting(false));
    }, 450);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [quoteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function remember(next: Prefs) {
    savePrefs({ models, compare, ratio, duration, resolution, sound, count, cmpCount, ...next });
  }
  const touch = () => { keyRef.current = null; setConfirm(null); setAckLarge(false); setError(null); };

  function toggleModel(id: string) {
    touch();
    let next: string[];
    if (!compare) next = [id];
    else next = models.includes(id) ? models.filter((m) => m !== id) : [...models, id].slice(0, maxModels);
    if (next.length === 0) next = [id];
    setModels(next);
    remember({ models: next });
  }

  const problems = (preview?.items ?? []).filter((i) => i.problem);
  const canStart = Boolean(config?.configured && config.available && preview && quotedKey === quoteKey && preview.priceKnown && preview.totalUnits !== null && problems.length === 0 && !preview.blocked && !uploading && !quoting && (!readyRefs.length || rights) && prompt.trim().length >= 4);

  async function start() {
    if (!confirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      keyRef.current ??= newKey();
      await api("/api/create/media/video", { method: "POST", body: JSON.stringify(body({ confirmUnits: confirm.total, acknowledgeLarge: ackLarge, idempotencyKey: keyRef.current })) });
      setConfirm(null);
      setAckLarge(false);
      keyRef.current = null;
      setPrompt("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && (e.data.code === "confirm" || e.data.code === "confirm_large")) {
        const t = (e.data.estimate as { totalUnits?: number } | undefined)?.totalUnits;
        setConfirm(typeof t === "number" ? { total: t, large: e.data.code === "confirm_large" || confirm.large } : null);
        setError(e.message);
      } else {
        setConfirm(null);
        setError(e instanceof Error ? e.message : "Couldn't start the video.");
      }
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    const by = new Map<string, Job[]>();
    for (const j of jobs) if (j.compareId) by.set(j.compareId, [...(by.get(j.compareId) ?? []), j]);
    return [...by.entries()].map(([id, list]) => ({ id, jobs: list.sort((a, b) => a.id.localeCompare(b.id)), models: uniq(list.map((j) => j.model)) }));
  }, [jobs]);
  const singles = useMemo(() => jobs.filter((j) => !j.compareId), [jobs]);

  async function removeClips(ids: string[]) {
    if (ids.length === 0) return;
    try {
      await api("/api/create/media/video/remove", { method: "POST", body: JSON.stringify({ ids }) });
      setPicked(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove those.");
    }
  }
  function downloadPicked(list: Job[]) {
    for (const j of list) {
      if (!picked.has(j.id) || !j.url) continue;
      const a = document.createElement("a");
      a.href = j.url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  const tile = (j: Job, selectable: boolean) => (
    <figure key={j.id} className={v.tile} data-status={j.status}>
      <div className={v.tileMedia}>
        {j.status === "completed" && j.url ? (
          <video src={j.url} muted loop playsInline controls aria-label={j.prompt} />
        ) : active(j) ? (
          <span className={s.label} role="status">{j.waiting ? "Waiting for a free slot" : j.status === "queued" ? "Queued" : "Generating"}</span>
        ) : (
          <span className={j.status === "blocked" ? v.err : v.hint}>{j.status === "blocked" ? "Blocked by the content safety check. Nothing was charged." : j.error ?? "Failed"}</span>
        )}
      </div>
      {!selectable ? <figcaption className={s.tilePrompt}>{j.prompt}</figcaption> : null}
      <div className={v.tileMeta}>
        <span>{selectable ? "" : (config?.models.find((m) => m.id === j.model)?.label ?? "Video")}{j.params.durationSec ? `${selectable ? "" : " · "}${j.params.durationSec}s` : ""}{j.refs && (j.refs.images || j.refs.video) ? (j.refs.ignored ? " · reference ignored" : " · with reference") : ""}</span>
        <span>{j.status === "completed" ? `${j.units ?? 0} credits` : j.status === "failed" || j.status === "blocked" ? "0 credits" : `≈${j.estimatedUnits} credits`}</span>
      </div>
      {selectable && !active(j) ? (
        <label className={v.pick}><input type="checkbox" checked={picked.has(j.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(j.id); else n.delete(j.id); return n; })} /> Pick</label>
      ) : null}
      {j.status === "completed" && j.url ? <a className={s.btn} href={j.url} download>Download</a> : null}
    </figure>
  );

  if (loadErr) return <div className={v.root}><p className={v.err} role="alert">{loadErr}</p></div>;
  if (!data || !config) return <div className={v.root}><p className={s.muted}>Loading…</p></div>;

  const off = !config.configured;
  const label = off ? "Not configured" : "Beta";
  return (
    <div className={v.root} data-testid="video-studio">
      <div className={v.head}>
        <h2 className={s.panelTitle}>Create video <span className={v.badge} data-state={off ? "off" : "on"} data-testid="video-badge">{label}</span></h2>
        <p className={s.muted}>Powered by Higgsfield. You see the cost first and are charged only for videos that are delivered.</p>
      </div>
      {off ? <p className={v.banner} role="status" data-testid="video-not-configured">Video generation isn&apos;t connected yet (Not configured). Nothing is generated until Higgsfield is connected.</p> : null}
      {!config.available ? (
        <div className={v.panel}>
          <p className={s.muted}>{config.message}</p>
          <Link href="/pricing" className={s.btn}>See plans</Link>
        </div>
      ) : (
        <div className={v.grid}>
          <form className={v.panel} aria-label="New video" onSubmit={(e) => { e.preventDefault(); if (canStart) { keyRef.current ??= newKey(); setConfirm({ total: preview!.totalUnits!, large: preview!.large }); } }}>
            <label className={v.field}>
              <span>Prompt</span>
              <textarea className={s.textarea} rows={4} maxLength={config.limits?.promptChars} value={prompt} disabled={off} onChange={(e) => { setPrompt(e.target.value); touch(); }} placeholder="A slow push-in on a rainy street at night, neon reflections" />
            </label>

            <div className={v.field}>
              <span className={v.row} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span id="vid-models">Model</span>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", textTransform: "none", letterSpacing: 0 }}>
                  <input type="checkbox" checked={compare} disabled={off || !config.compare} onChange={(e) => { setCompare(e.target.checked); touch(); if (!e.target.checked) { const one = models.slice(0, 1); setModels(one); remember({ compare: false, models: one }); } else remember({ compare: true }); }} />
                  Compare models
                </label>
              </span>
              <div className={v.models} role="group" aria-labelledby="vid-models">
                {config.models.map((m) => {
                  const on = models.includes(m.id);
                  const takesImg = Boolean(m.refs?.image);
                  const takesVid = Boolean(m.refs?.video);
                  const needsImg = (m.refs?.image?.min ?? 0) > 0;
                  const needsVid = (m.refs?.video?.min ?? 0) > 0;
                  const hasRef = haveImage || haveVideo;
                  const use = (haveImage && takesImg) || (haveVideo && takesVid);
                  const tag = needsVid && !haveVideo ? "needs a source video" : needsImg && !haveImage ? "needs an image" : hasRef ? (use ? "uses your reference" : "ignores your reference") : null;
                  return (
                    <label key={m.id} className={v.model} data-on={on}>
                      <input type={compare ? "checkbox" : "radio"} name="vid-model" checked={on} disabled={off} onChange={() => toggleModel(m.id)} />
                      <span>
                        {m.label} <span className={v.tag}>{m.mode.replaceAll("-", " ")}{m.default ? " · default" : ""}</span>
                        <small>{m.note} {m.price.known ? "" : "Price TBD until quoted."}</small>
                        {tag ? <small data-testid="ref-tag" data-ignored={tag === "ignores your reference"}>{tag}</small> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className={v.row}>
              {ratios.length ? (
                <label className={v.field}><span>Shape</span>
                  <select className={s.select} value={ratio} disabled={off} onChange={(e) => { setRatio(e.target.value); touch(); remember({ ratio: e.target.value }); }}>
                    {ratios.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
              ) : null}
              {!followsSource && durations.length ? (
                <label className={v.field}><span>Length</span>
                  <select className={s.select} value={duration} disabled={off} onChange={(e) => { setDuration(Number(e.target.value)); touch(); remember({ duration: Number(e.target.value) }); }}>
                    {durations.map((d) => <option key={d} value={d}>{d} seconds</option>)}
                  </select>
                </label>
              ) : followsSource ? <p className={v.hint}>Length follows your source video (up to {config.maxSeconds} s on your plan).</p> : null}
              {resolutions.length ? (
                <label className={v.field}><span>Resolution</span>
                  <select className={s.select} value={resolution} disabled={off} onChange={(e) => { setResolution(e.target.value); touch(); remember({ resolution: e.target.value }); }}>
                    <option value="">Default</option>
                    {resolutions.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
              ) : null}
              {compare ? (
                <label className={v.field}><span>Outputs per model</span>
                  <select className={s.select} value={cmpCount} disabled={off} onChange={(e) => { setCmpCount(Number(e.target.value)); touch(); remember({ cmpCount: Number(e.target.value) }); }}>
                    {Array.from({ length: config.compare?.perModel ?? 6 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ) : (
                <label className={v.field}><span>Outputs</span>
                  <select className={s.select} value={count} disabled={off || maxOut < 2} onChange={(e) => { setCount(Number(e.target.value)); touch(); remember({ count: Number(e.target.value) }); }}>
                    {Array.from({ length: maxOut }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
            </div>
            {hasSound ? (
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={sound} disabled={off} onChange={(e) => { setSound(e.target.checked); touch(); remember({ sound: e.target.checked }); }} /> Sound
                <span className={v.hint}>{chosen.some((m) => !m.options.sound) ? "(applies to models that support it)" : ""}</span>
              </label>
            ) : null}
            {hasNegative ? (
              <label className={v.field}><span>Avoid (negative prompt) <span className={v.opt}>optional</span></span>
                <input className={s.input} value={negative} maxLength={500} disabled={off} onChange={(e) => { setNegative(e.target.value); touch(); }} placeholder="blurry, text overlays" />
              </label>
            ) : null}

            {!accepts.image && !accepts.video && refs.length === 0 ? <p className={v.hint}>Add a reference image or video by choosing an image-to-video, reference or motion model above.</p> : null}
            {(accepts.image || accepts.video || refs.length > 0) ? (
              <ReferencePicker
                limits={config.reference}
                accepts={accepts}
                maxImages={Math.max(1, ...chosen.map((m) => m.refs?.image?.max ?? 0)) || 1}
                items={refs}
                onChange={(x) => { setRefs(x); touch(); }}
                rights={rights}
                onRights={(r) => { setRights(r); touch(); }}
                maxSourceSec={config.maxSeconds}
                disabled={off}
                label="Reference image or video"
              />
            ) : null}

            <div aria-live="polite" data-testid="video-quote">
              {quoting ? <p className={v.cost}>Getting the exact cost…</p> : null}
              {!quoting && preview ? (
                <>
                  <ul className={v.lines}>
                    {preview.items.map((i) => (
                      <li key={i.modelId}>
                        <span>{i.label}{i.count > 1 ? ` × ${i.count}` : ""}{i.durationSec ? ` · ${i.durationSec}s` : ""}{i.ignoresRefs ? <span className={v.mark}> · ignores your reference</span> : null}{i.ignoredOptions.length ? <span className={v.mark}> · {i.ignoredOptions.join(", ")} not supported</span> : null}</span>
                        <span>{i.problem ? <span className={v.err}>{i.problem}</span> : i.units === null ? "Price TBD" : `${i.units.toLocaleString()} credits`}</span>
                      </li>
                    ))}
                  </ul>
                  {compare ? <p className={v.hint}>Compare is Beta: {outCount} output{outCount === 1 ? "" : "s"} per model, side by side. You are charged only for clips that are delivered; failed or blocked clips cost nothing.{config.compare?.runsPerDay != null ? ` Up to ${config.compare.runsPerDay} Compare runs a day on your plan.` : ""}</p> : null}
                  <p className={v.cost}>{preview.priceKnown && preview.totalUnits !== null ? <>Up to <strong>{preview.totalUnits.toLocaleString()} credits</strong>, only if delivered. {preview.items.some((i) => i.source === "list") ? "Based on Higgsfield's published list price." : "Higgsfield's own quote."}</> : <>This price is TBD, so Keplar can&apos;t start it yet.</>}</p>
                </>
              ) : null}
              {!quoting && preview?.blocked ? <p className={v.err} role="alert" data-testid="video-blocked">{preview.blocked} This run needs {preview.totalUnits?.toLocaleString()} credits; try fewer outputs per model or a shorter length.</p> : null}
              {previewErr ? <p className={v.err} role="alert">{previewErr}</p> : null}
            </div>

            {confirm ? (
              <div className={v.confirm} role="alertdialog" aria-label="Approve cost" data-testid="video-confirm">
                <span>This will use up to <strong>{confirm.total.toLocaleString()} credits</strong>{preview && preview.items.reduce((t, i) => t + i.count, 0) > 1 ? ` for ${preview.items.reduce((t, i) => t + i.count, 0)} videos` : ""}. Start?</span>
                {confirm.large ? (
                  <label className={v.rights}><input type="checkbox" checked={ackLarge} onChange={(e) => setAckLarge(e.target.checked)} /><span>This is a large job. I understand it uses {confirm.total.toLocaleString()} credits.</span></label>
                ) : null}
                <div className={v.btnRow}>
                  <button type="button" className={s.btn} onClick={() => void start()} disabled={busy || (confirm.large && !ackLarge)}>{busy ? "Starting…" : "Approve and generate"}</button>
                  <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className={v.btnRow}>
                <button type="submit" className={s.btn} disabled={off || !canStart}>Preview and approve</button>
              </div>
            )}
            {error ? <p className={v.err} role="alert">{error}</p> : null}
            <span className={v.hint}>{config.limits?.perDay != null ? `Up to ${config.limits.perDay} videos a day on your plan. ` : ""}No real people, no explicit or violent content. Results are kept for 7 days.</span>
          </form>

          <section aria-label="Your videos">
            {jobs.length === 0 ? <p className={v.empty}>Your videos appear here.</p> : (
              <>
                {groups.map((g) => (
                  <div key={g.id} className={v.cmp} data-testid="compare-grid">
                    <div className={v.cmpHead}>
                      <strong>Compare</strong>
                      <span className={s.tilePrompt}>{g.jobs[0].prompt}</span>
                      <span className={v.hint}>{g.jobs.filter((j) => j.status === "completed").length} of {g.jobs.length} delivered</span>
                    </div>
                    <div className={v.cmpCols} style={{ gridTemplateColumns: `repeat(${g.models.length}, minmax(160px, 1fr))` }}>
                      {g.models.map((m) => (
                        <div key={m} className={v.cmpCol}>
                          <span className={s.label}>{config.models.find((x) => x.id === m)?.label ?? "Video"} <span className={v.tag}>{config.models.find((x) => x.id === m)?.mode.replaceAll("-", " ")}</span></span>
                          {g.jobs.filter((j) => j.model === m).map((j) => tile(j, true))}
                        </div>
                      ))}
                    </div>
                    <div className={v.btnRow}>
                      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setPicked(new Set(g.jobs.filter((j) => !active(j)).map((j) => j.id)))}>Select all</button>
                      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Select none</button>
                      <button type="button" className={s.btn} onClick={() => downloadPicked(g.jobs)} disabled={!g.jobs.some((j) => picked.has(j.id) && j.url)}>Download selected</button>
                      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void removeClips(g.jobs.filter((j) => !picked.has(j.id) && !active(j)).map((j) => j.id))} disabled={picked.size === 0 || !g.jobs.some((j) => !picked.has(j.id) && !active(j))} data-testid="remove-unselected">Remove the ones I didn&apos;t pick</button>
                      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void removeClips(g.jobs.filter((j) => picked.has(j.id)).map((j) => j.id))} disabled={!g.jobs.some((j) => picked.has(j.id) && !active(j))}>Remove selected</button>
                    </div>
                  </div>
                ))}
                <div className={v.gallery}>{singles.map((j) => tile(j, false))}</div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
