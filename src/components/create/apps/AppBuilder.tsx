"use client";
/**
 * Keplar Create, App studio: "the drafting table". Describe the app in your own words, Shape its look with real specimens, Ship.
 * The canvas is the hero from the first keystroke: a blueprint of the app inferred from the prompt, drawn in the chosen look.
 * When Build is pressed the same blueprint becomes the live build (screens ink in as their code is written, marks appear as
 * the browser test passes) and develops into the running preview. Then refine by prompt (with a per-version diff), browse the
 * code, data and settings, and publish. Builds survive a reload; errors say what happened and offer a retry.
 *
 * Speed: the prompt is uncontrolled (no React render per keystroke); the design picker, code, changes and data panes are
 * separate chunks loaded on first use; the preview iframe loads lazily.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { applyEvent, runAppBuild, type BuildError, type BuildEvent } from "./build-client";
import { takeAppHandoff } from "./handoff";
import Link from "next/link";
import { LiveCode } from "./LiveCode";
import { ScaledViewport } from "../ScaledViewport";
import { IdeFrame, useBusinessApp } from "./IdeFrame";
import { BuildTimeline, emptyLive, type Live } from "./BuildTimeline";
import { Blueprint, type BlueprintLook } from "./BlueprintView";
import { blueprintFromSpec, inferBlueprint } from "./blueprint";
import { LookTiles, RADIUS_PX } from "./LookTiles";
import { AppShelf } from "./AppShelf";
import { createPromptStore, PromptField, usePromptReady, usePromptSettled, type PromptHandle, type PromptStore } from "./PromptField";
import { STARTERS } from "./starters";
import { ReferenceTray, withReferences } from "./ReferenceTray";
import { BriefPanel } from "./BriefPanel";
import { surpriseBrief } from "@/lib/create/surprise-brief";
import { clearResume, isBusyError, loadResume, resumeAction, saveResume } from "./resume";
import { TwoTone } from "@/components/page/TwoTone";
import s from "./studio.module.css";
import { ActivityIndicator, Button, Dialog, Menu, MenuItem, SegmentedControl, Tabs, notify, tabId, tabPanelId } from "@/components/kit";
import type { AppDetail, AppDetailResponse, AppSummary, Config, Design, VersionMeta } from "./types";

const DesignPicker = lazy(() => import("./DesignPicker").then((m) => ({ default: m.DesignPicker })));
const CodePane = lazy(() => import("./CodePane"));
const ChangesPane = lazy(() => import("./ChangesPane"));
const FRAME_GRACE_MS = 3500;
const DataPane = lazy(() => import("./StudioPanes").then((m) => ({ default: m.DataPane })));
const SettingsPane = lazy(() => import("./StudioPanes").then((m) => ({ default: m.SettingsPane })));
// Live collaboration, the AI critic and one-click deploy: separate chunks (CodeMirror + Yjs load only when Live opens).
const LiveTab = lazy(() => import("../advanced/LiveTab"));
const CriticPane = lazy(() => import("../advanced/CriticPane").then((m) => ({ default: m.CriticPane })));
const DeployPane = lazy(() => import("../advanced/DeployPane").then((m) => ({ default: m.DeployPane })));
const PublishGate = lazy(() => import("../advanced/PublishGate").then((m) => ({ default: m.PublishGate })));
const VoiceLiveTheater = lazy(() => import("./VoiceLiveTheater").then((m) => ({ default: m.VoiceLiveTheater })));

const START_DESIGN: Design = { style: "editorial", mode: "light", palette: null, paletteSource: "style", fonts: "fraunces-hanken", density: "balanced", shape: "sharp", motion: "subtle", notes: "" };
const DRAFT_KEY = "keplar:app-prompt";
type Tab = "preview" | "code" | "changes" | "live" | "critic" | "deploy" | "look" | "data" | "settings";
type Device = "desktop" | "tablet" | "phone";
type Err = { message: string; kind: "failed" | "confirm" | "stopped" | "setup"; units?: number };
type Run = { appId: string; buildId: string | null; prompt: string; edit: boolean; startedAt: number };

const TAB_LABEL: Record<Tab, string> = { preview: "Preview", code: "Code", changes: "Changes", live: "Live", critic: "Critic", deploy: "Deploy", look: "Look", data: "Data", settings: "Settings" };
/** Always-visible studio tabs; the others (Live, Critic, Deploy, Look, Data, Settings) sit in the More menu. */
const MAIN_TABS: Tab[] = ["preview", "code", "changes"];
/** The kit Tabs id of the studio's view switch. */
const VIEW_TABS = "kc-view";
/** Tabs that take the whole studio width (the ledger hides). */
const WIDE: Tab[] = ["live", "critic", "deploy"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function paletteOf(d: Design, cfg: Config | null) {
  const st = cfg?.styles.find((x) => x.id === d.style) ?? cfg?.styles[0];
  return d.palette ?? (st ? (d.mode === "dark" ? st.dark : st.light) : null);
}

export function AppBuilder() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const biz = useBusinessApp();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [current, setCurrent] = useState<AppDetail | null>(null);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [design, setDesign] = useState<Design>(START_DESIGN);
  const [auto, setAuto] = useState(true);
  const [modeTouched, setModeTouched] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  /** Options show one section at a time (tabs), so opening them never turns the prompt page into a long scroll. */
  const [optTab, setOptTab] = useState<"look" | "refs" | "voice" | "screens">("look");
  const [briefOpen, setBriefOpen] = useState(false);
  const [shipped, setShipped] = useState<{ url: string; version: number } | null>(null);
  const [studio, setStudio] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<Live>(emptyLive());
  /** Errors the running preview reported (public/fx/kapp-report.1.js), for the "Fix these" bar. Cleared on every reload. */
  const [appErrorLog, setAppErrors] = useState<{ key: number; items: { message: string; file: string; line: number; route: string }[] }>({ key: 0, items: [] });
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  /** Click-to-edit: pick mode inside the preview, and the element the owner picked. */
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const pickingRef = useRef(false);
  const tellFrame = useCallback((msg: Record<string, unknown>) => {
    try { frameRef.current?.contentWindow?.postMessage({ source: "keplar-studio", ...msg }, "*"); } catch { /* frame gone */ }
  }, []);
  /** Where the running build can be viewed (the files written so far), from the build's first event. */
  const [buildPreview, setBuildPreview] = useState<string | null>(null);
  const [err, setErr] = useState<Err | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const appErrors = appErrorLog.key === frameKey ? appErrorLog.items : [];
  const frameKeyRef = useRef(frameKey);
  useEffect(() => { frameKeyRef.current = frameKey; }, [frameKey]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; message?: string; file?: string; line?: number; route?: string; label?: string; path?: string; text?: string; html?: string; tag?: string } | null;
      if (!d || d.source !== "keplar-app" || e.source !== frameRef.current?.contentWindow) return;
      if (d.type === "pick") {
        setPicked({ label: String(d.label ?? d.tag ?? "element").slice(0, 80), path: String(d.path ?? "").slice(0, 300), text: String(d.text ?? "").slice(0, 200), html: String(d.html ?? "").slice(0, 800), route: String(d.route ?? "/").slice(0, 80) });
        setPicking(false);
        return;
      }
      if (d.type === "pick-cancel") { setPicking(false); return; }
      // A freshly loaded preview does not know pick mode is on yet.
      if (d.type === "ready") { if (pickingRef.current) tellFrame({ type: "pick", on: true }); return; }
      if (d.type !== "error") return;
      const item = { message: String(d.message ?? "").slice(0, 300), file: String(d.file ?? "").slice(0, 120), line: Number(d.line) || 0, route: String(d.route ?? "/").slice(0, 80) };
      const key = frameKeyRef.current;
      setAppErrors((l) => {
        const items = l.key === key ? l.items : [];
        return items.length >= 8 || items.some((x) => x.message === item.message) ? { key, items } : { key, items: [...items, item] };
      });
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [tellFrame]);
  useEffect(() => { pickingRef.current = picking; tellFrame({ type: "pick", on: picking }); }, [picking, tellFrame]);
  // The load event waits for every subresource of the user's app (a slow web font can hold it for many seconds); the page
  // is painted long before that, so the preview develops in after a short grace period even if load has not fired yet.
  useEffect(() => {
    if (frameReady || !studio) return;
    const t = setTimeout(() => setFrameReady(true), FRAME_GRACE_MS);
    return () => clearTimeout(t);
  }, [frameKey, frameReady, studio]);
  const [panel, setPanel] = useState<"canvas" | "log">("canvas");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [lastEdit, setLastEdit] = useState<number | null>(null);
  const [gate, setGate] = useState(false);
  const store = useMemo<PromptStore>(() => createPromptStore(), []);
  const refineStore = useMemo<PromptStore>(() => createPromptStore(), []);
  const promptRef = useRef<PromptHandle>(null);
  const refineRef = useRef<PromptHandle>(null);
  const themeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /** One line of feedback, as a kit toast (UI v2: no hand-rolled toasts). */
  const say = useCallback((t: string) => { notify({ title: t }); }, []);

  const load = useCallback(async () => {
    const r = await api<{ apps: AppSummary[]; config: Config }>("/api/apps");
    if (!alive.current) return r;
    setCfg(r.config);
    setApps(r.apps);
    return r;
  }, []);

  const open = useCallback(async (id: string, opts?: { keepTab?: boolean }) => {
    const r = await api<AppDetailResponse>(`/api/apps/${id}`);
    if (!alive.current) return r;
    setCurrent(r.app);
    setVersions(r.versions ?? []);
    if (r.app.design) { setDesign(r.app.design); setAuto(false); }
    setStudio(true);
    if (!opts?.keepTab) setTab("preview");
    setFrameReady(false);
    setFrameKey((k) => k + 1);
    return r;
  }, []);
  // Previews never expire under the owner: renew the signed link 30 minutes before it runs out (or as soon as the tab is
  // visible again after it did), instead of leaving an app whose files and API calls start failing.
  const previewExp = Number(/\/(\d{9,})\.[^/]+\/$/.exec(current?.previewUrl ?? "")?.[1] ?? 0) * 1000;
  useEffect(() => {
    if (!previewExp || !current?.id || running) return;
    const id = current.id;
    const renew = () => { if (document.visibilityState === "visible") void open(id, { keepTab: true }).catch(() => undefined); };
    const due = previewExp - 30 * 60_000 - Date.now();
    const t = setTimeout(renew, Math.max(1_000, Math.min(due, 2_000_000_000)));
    const onVis = () => { if (Date.now() > previewExp - 30 * 60_000) renew(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onVis); };
  }, [previewExp, current?.id, running, open]);

  /** Follows a build to its end: streamed events while this page holds the request; polling while the slot is still held by the request from before a reload. */
  const follow = useCallback(async (r: Run, body: Record<string, unknown>) => {
    setRun(r);
    setRunning(true);
    setErr(null);
    let req = body;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const done = await runAppBuild(r.appId, req, (ev: BuildEvent) => {
          if (!alive.current) return;
          setLive((l) => applyEvent(l, ev));
          if (ev.type === "build") {
            if (typeof ev.preview === "string") setBuildPreview(ev.preview);
            r = { ...r, buildId: String(ev.id) };
            setRun(r);
            saveResume({ appId: r.appId, buildId: r.buildId, prompt: r.prompt, edit: r.edit, at: r.startedAt });
          }
          if (ev.type === "design" && ev.design && typeof ev.design === "object") setDesign(ev.design as Design);
          // Each (re-)test runs the latest code: reload the live preview so it shows what is being tested.
          if (ev.type === "stage" && ev.stage === "verify") { setFrameReady(false); setFrameKey((k) => k + 1); }
        });
        clearResume();
        if (!alive.current) return;
        await Promise.all([load().catch(() => undefined), open(r.appId, { keepTab: true }).catch(() => undefined)]);
        setTab("preview");
        setPanel("canvas");
        if (r.edit) setLastEdit(done.version);
        const secs = Math.round((Date.now() - r.startedAt) / 1000);
        say(`${r.edit ? "Change applied" : "Built"} in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} · v${done.version}`);
        setRunning(false);
        return;
      } catch (e) {
        const ex = e as BuildError;
        if (!alive.current) return;
        if (isBusyError(ex) && r.buildId) {
          // The request from before the reload still holds the build slot: show the server's progress until it lets go.
          setLive((l) => ({ ...l, stageText: "Reconnecting to your build (it kept running on the server)…" }));
          for (let i = 0; i < 3; i++) {
            await sleep(5000);
            if (!alive.current) return;
            const d = await api<AppDetailResponse>(`/api/apps/${r.appId}`).catch(() => null);
            if (d && !d.build) {
              clearResume();
              await Promise.all([load().catch(() => undefined), open(r.appId).catch(() => undefined)]);
              setRunning(false);
              return;
            }
            if (d?.build?.stage === "failed") {
              clearResume();
              setErr({ kind: "failed", message: d.build.error || "The build stopped with an error." });
              setRunning(false);
              return;
            }
            if (d?.build) setLive((l) => ({ ...l, stage: d.build!.stage, spec: d.build!.spec ?? l.spec, checks: d.build!.checks?.length ? d.build!.checks : l.checks, verdicts: d.build!.verdicts?.length ? d.build!.verdicts : l.verdicts, log: d.build!.log?.length ? d.build!.log.map((x) => x.text) : l.log }));
          }
          req = { buildId: r.buildId };
          continue;
        }
        clearResume();
        if (ex.code === "confirm") setErr({ kind: "confirm", message: ex.message, units: ex.estimate?.units });
        else if (ex.code === "stopped" || ex instanceof TypeError || /network|fetch|load failed/i.test(ex.message)) setErr({ kind: "stopped", message: r.buildId ? "The connection to the build dropped. It may still be running; reconnect to follow it." : ex.message });
        else if (ex.code === "not_configured" || ex.code === "credits") setErr({ kind: "setup", message: ex.message });
        else if (ex.code === "stalled" || ex.code === "plan_timeout") setErr({ kind: "failed", message: ex.message });
        else setErr({ kind: "failed", message: ex.message });
        setRunning(false);
        if (!r.edit) open(r.appId, { keepTab: true }).catch(() => undefined);
        return;
      }
    }
    setRunning(false);
    setErr({ kind: "stopped", message: "Still waiting for the server to finish the build. Reconnect in a minute." });
  }, [load, open, say]);

  // Create references (sites, screenshots, docs) ride with a new build's prompt as inspiration only.
  const refBriefs = useRef<string[]>([]);
  const onRefs = useCallback((b: string[]) => { refBriefs.current = b; }, []);
  const buildBody = useCallback((prompt: string, edit: boolean) => {
    const d = edit ? current?.design ?? design : auto ? { auto: true, ...(modeTouched ? { mode: design.mode } : {}) } : design;
    return { prompt: edit ? prompt : withReferences(prompt, refBriefs.current, cfg?.plan), design: d, edit, confirm: true };
  }, [auto, cfg?.plan, current, design, modeTouched]);

  /** Build (new app) or refine (edit). Feedback is instant: the studio and the blueprint show before the first request returns. */
  const build = useCallback(async (prompt: string, edit = false) => {
    if (!cfg || running) return;
    const startedAt = Date.now();
    setStudio(true);
    setErr(null);
    setTab("preview");
    setPanel("canvas");
    setLastEdit(null);
    setRunning(true);
    setLive({ ...emptyLive(), stageText: edit ? "Reading your change" : "Reserving a build" });
    if (!edit) { setCurrent(null); setVersions([]); }
    let appId = edit ? current?.id : undefined;
    try {
      if (!appId) {
        const made = await api<{ app: { id: string } }>("/api/apps", { method: "POST", body: JSON.stringify({ name: prompt.split(/[.,:\n]/)[0].slice(0, 50) }) });
        appId = made.app.id;
      }
    } catch (e) {
      setRunning(false);
      setErr({ kind: "failed", message: (e as Error).message });
      return;
    }
    const r: Run = { appId, buildId: null, prompt, edit, startedAt };
    setBuildPreview(null);
    setPicking(false);
    setPicked(null);
    saveResume({ appId, buildId: null, prompt, edit, at: startedAt });
    if (!edit) {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
    await follow(r, buildBody(prompt, edit));
  }, [buildBody, cfg, current, follow, running]);

  // Surprise me sets the design and the prompt, then builds on the next render (build reads the design through buildBody).
  const pendingBuild = useRef<string | null>(null);
  const [surpriseTick, setSurpriseTick] = useState(0);
  useEffect(() => {
    const p = pendingBuild.current;
    if (!p || !cfg || running) return;
    pendingBuild.current = null;
    void build(p);
  }, [surpriseTick, build, cfg, running]);

  // First load: config and apps; then a handoff from chat, or a build that was running when the page went away.
  useEffect(() => {
    (async () => {
      try {
        await load();
        const handed = takeAppHandoff();
        if (handed?.id) { await open(handed.id); return; }
        if (handed?.prompt) { promptRef.current?.set(handed.prompt); return; }
        const rec = loadResume();
        if (!rec) return;
        const d = await open(rec.appId).catch(() => null);
        if (!d) { clearResume(); return; }
        const act = resumeAction(rec, d.build ? { id: d.build.id, stage: d.build.stage, error: d.build.error } : null);
        if (act.kind === "follow") {
          setLive({ ...emptyLive(), stageText: "Picking up your build where it left off", spec: d.build?.spec ?? null, checks: d.build?.checks ?? [], verdicts: d.build?.verdicts ?? [] });
          void follow({ appId: rec.appId, buildId: act.buildId, prompt: rec.prompt, edit: rec.edit, startedAt: rec.at }, { buildId: act.buildId });
        } else if (act.kind === "failed") {
          clearResume();
          setRun({ appId: rec.appId, buildId: rec.buildId, prompt: rec.prompt, edit: rec.edit, startedAt: rec.at });
          setErr({ kind: "failed", message: act.error });
        } else clearResume();
      } catch (e) {
        if (alive.current) setLoadErr((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" focuses the prompt on the start screen (unless typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tuneOpen) setTuneOpen(false);
      if (studio || e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      promptRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studio, tuneOpen]);

  const saveTheme = useCallback((d: Design) => {
    setDesign(d);
    setAuto(false);
    if (!current?.spec) return;
    if (themeTimer.current) clearTimeout(themeTimer.current);
    const id = current.id;
    themeTimer.current = setTimeout(async () => {
      try {
        await api(`/api/apps/${id}/theme`, { method: "PATCH", body: JSON.stringify({ design: d }) });
        setFrameReady(false);
        setFrameKey((k) => k + 1);
      } catch (e) {
        say((e as Error).message);
      }
    }, 450);
  }, [current, say]);

  const publish = useCallback(async (id: string) => {
    setBusy((b) => ({ ...b, [id]: "publish" }));
    try {
      await api(`/api/sites/${id}/publish`, { method: "POST" });
      const [, d] = await Promise.all([load(), current?.id === id ? open(id, { keepTab: true }) : Promise.resolve(null)]);
      if (d?.app.liveUrl) setShipped({ url: d.app.liveUrl, version: d.app.headVersion });
      say(d?.app.liveUrl ? `Live at ${d.app.liveUrl.replace(/^https?:\/\//, "")}` : "Published.");
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  }, [current, load, open, say]);

  const duplicate = useCallback(async (id: string) => {
    setBusy((b) => ({ ...b, [id]: "duplicate" }));
    try {
      const r = await api<{ site: { id: string; name: string } }>(`/api/sites/${id}/duplicate`, { method: "POST" });
      await load();
      say(`Copied as “${r.site.name}”.`);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  }, [load, say]);

  const openApp = useCallback((id: string, refine = false) => {
    setErr(null);
    open(id).then((d) => {
      // An app with a build still running (started here before, or from the chat card) is followed live.
      const act = resumeAction(null, d.build ? { id: d.build.id, stage: d.build.stage } : null);
      if (act.kind === "follow" && !running) {
        setLive({ ...emptyLive(), stageText: "Following the build in progress", spec: d.build?.spec ?? null });
        void follow({ appId: id, buildId: act.buildId, prompt: "", edit: Boolean(d.app.headVersion), startedAt: Date.now() }, { buildId: act.buildId });
      }
      if (refine) setTimeout(() => refineRef.current?.focus(), 60);
    }, (e) => say((e as Error).message));
  }, [follow, open, running, say]);

  const backToStart = () => {
    if (running) return;
    setStudio(false);
    setCurrent(null);
    setErr(null);
    setRun(null);
    setLive(emptyLive());
    setTab("preview");
  };

  const retry = () => {
    if (!err || !run) return;
    if (err.kind === "stopped" && run.buildId) { void follow({ ...run }, { buildId: run.buildId }); return; }
    void build(run.prompt || store.text(), run.edit && Boolean(current));
  };

  const look: BlueprintLook = useMemo(() => {
    if (auto && !running && !current) return null;
    const p = paletteOf(design, cfg);
    if (!p) return null;
    const f = cfg?.fonts.find((x) => x.id === design.fonts);
    return { accent: p.accent, surface: p.surface, bg: p.bg, ink: p.ink, radius: Math.min(14, RADIUS_PX[design.shape]), display: f?.displayStack ?? "inherit" };
  }, [auto, cfg, current, design, running]);

  const free = cfg?.plan === "free";
  /** Each Options section is the panel of its kit tab. */
  const optPanel = (v: typeof optTab) => ({ id: tabPanelId("kc-opt", v), role: "tabpanel", "aria-labelledby": tabId("kc-opt", v), hidden: optTab !== v });

  // ───────────────────────── start: Prompt · Look · Build ─────────────────────────
  if (!studio) {
    return (
      <div className={s.root}>
        <div className={s.start}>
          <IdeFrame enabled={biz} cfg={cfg} apps={apps} starters={STARTERS} running={running} onStarter={(t) => promptRef.current?.set(t)} onOpenApp={(id) => openApp(id)} getBrief={() => store.text()} auto={auto} design={design} log={live.log}>
          {/* Minimal pass: one prompt, like Ask. Surprise me, Voice, References, Look and the screen preview sit behind Options. */}
          <div className={s.calm}>
            <header className={s.calmIntro}>
              <h2 className={s.calmTitle}><TwoTone text="What do you want to build?" /></h2>
              <p className={s.calmLede}>Describe it or say it. Keplar designs it, writes the code and tests every screen.</p>
            </header>

            <section className={s.calmCard} aria-label="Describe your app">
              <PromptField ref={promptRef} store={store} id="kc-prompt" className={s.prompt} draftKey={DRAFT_KEY} autoFocus label="Describe your app" placeholder="A place where film photographers post scans, follow each other and vote on a weekly darkroom challenge…" onSubmit={() => { const t = store.text().trim(); if (t.length >= 8) void build(t); }} />
              <div className={s.calmBar}>
                <button type="button" className={s.textBtn} onClick={() => { if (store.text().trim().length < 8) { say("Write a sentence about what you want, then shape the brief."); return; } setBriefOpen(true); }}>Shape the brief</button>
                <button type="button" className={s.textBtn} aria-expanded={optionsOpen} aria-controls="kc-options" onClick={() => setOptionsOpen((v) => !v)} data-create-options="">
                  Options{auto ? "" : " · look chosen"}
                  <svg width="10" height="10" viewBox="0 0 10 6" aria-hidden="true" style={{ transform: optionsOpen ? "rotate(180deg)" : undefined }}><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <ShipRow store={store} cfg={cfg} onBuild={() => { const t = store.text().trim(); if (t.length >= 8) void build(t); }} />
              </div>
            </section>

            {briefOpen ? (
              <BriefPanel
                idea={store.text().trim()}
                onClose={() => setBriefOpen(false)}
                onApply={(prompt, styleId) => {
                  promptRef.current?.set(prompt);
                  if (cfg) {
                    const st = cfg.styles.find((x) => x.id === styleId) ?? cfg.styles[0];
                    if (st) {
                      setAuto(false);
                      setDesign((d) => ({ ...d, style: st.id, fonts: st.fonts, shape: st.shape, density: st.density, motion: st.motion, palette: null, paletteSource: "style", direction: undefined }));
                    }
                  }
                  setBriefOpen(false);
                  say("Brief ready. Building with that direction.");
                  pendingBuild.current = prompt;
                  setSurpriseTick((n) => n + 1);
                }}
              />
            ) : null}

            <ul className={s.calmChips} aria-label="Start from an idea">
              {STARTERS.slice(0, 4).map((st) => (
                <li key={st.id}>
                  <button type="button" className={s.calmChip} onClick={() => promptRef.current?.set(st.prompt)}>{st.label}</button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className={s.calmChip}
                  disabled={running}
                  title="Zero input: Keplar picks an industry, audience, style and scope, then builds it."
                  onClick={() => {
                    const b = surpriseBrief();
                    promptRef.current?.set(b.prompt);
                    if (cfg) {
                      const st = cfg.styles.find((x) => x.id === b.style) ?? cfg.styles[0];
                      setAuto(false);
                      setDesign((d) => ({ ...d, style: st.id, mode: b.mode, fonts: st.fonts, shape: st.shape, density: st.density, motion: st.motion, palette: null, paletteSource: "style", direction: undefined }));
                    }
                    say(`Surprise: ${b.label}. Building…`);
                    pendingBuild.current = b.prompt;
                    setSurpriseTick((n) => n + 1);
                  }}
                >
                  Surprise me
                </button>
              </li>
            </ul>

            {cfg && (free || !cfg.limits.ai) ? (
              <p className={s.upsell}>{free ? "Free builds are front-end apps made with free models (data stays in each visitor's browser). Accounts, shared data, uploads, AI features and generated imagery come with paid plans." : "Your plan includes a real backend. AI features inside your apps come with Plus and higher."} <Link href="/pricing">See plans</Link></p>
            ) : null}
            {loadErr ? <p className={s.inlineErr} role="alert">{loadErr} <Button variant="ghost" size="sm" onClick={() => { setLoadErr(""); load().catch((e) => setLoadErr((e as Error).message)); }}>Try again</Button></p> : null}

            <div id="kc-options" className={s.calmOptions} hidden={!optionsOpen}>
              <Tabs id="kc-opt" label="Options" value={optTab} onValueChange={setOptTab} className={s.optTabs} items={[{ value: "look", label: "Look" }, { value: "refs", label: "References" }, { value: "voice", label: "Speak it" }, { value: "screens", label: "Screens" }]} />
              <section className={s.step} {...optPanel("voice")}>
                <h3 id="kc-voice" className={s.stepLabel}>Speak it</h3>
                <div className={s.voiceLive}>
                  {optionsOpen && optTab === "voice" ? (
                    <Suspense fallback={<p className={s.paneMsg}><ActivityIndicator label="Loading voice" showLabel /></p>}>
                      <VoiceLiveTheater
                        getText={() => store.text()}
                        setText={(v) => promptRef.current?.set(v)}
                        onBuild={(prompt) => { void build(prompt); }}
                        disabled={running}
                      />
                    </Suspense>
                  ) : null}
                </div>
              </section>

              <div {...optPanel("refs")}>
                <ReferenceTray className={s.step} labelClass={s.stepLabel} onChange={onRefs} disabled={running} plan={cfg?.plan} />
              </div>

              <section className={s.step} {...optPanel("look")}>
                <h3 id="kc-shape" className={s.stepLabel}>Look</h3>
                {cfg ? (
                  <LookTiles cfg={cfg} design={design} auto={auto} tuned={!auto && design.paletteSource !== "style"} onAuto={() => setAuto(true)} onStyle={(id) => { const st = cfg.styles.find((x) => x.id === id)!; setAuto(false); setDesign((d) => ({ ...d, style: id, fonts: st.fonts, shape: st.shape, density: st.density, motion: st.motion, palette: null, paletteSource: "style", direction: undefined })); }} onMode={(m) => { setModeTouched(true); setDesign((d) => ({ ...d, mode: m, ...(d.paletteSource === "style" ? { palette: null } : {}) })); }} onFineTune={() => setTuneOpen(true)} />
                ) : <div className={s.tilesGhost} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>}
              </section>

              <section className={s.step} {...optPanel("screens")}>
                <h3 id="kc-preview" className={s.stepLabel}>Screens preview</h3>
                <div className={`${s.canvas} ${s.calmCanvas}`} aria-label="Preview of your app">
                  {optionsOpen && optTab === "screens" ? <LiveBlueprint store={store} look={look} auto={auto} /> : null}
                </div>
              </section>
            </div>
          </div>

          <AppShelf apps={apps} busy={busy} onOpen={(id) => openApp(id)} onRefine={(id) => openApp(id, true)} onDuplicate={duplicate} onPublish={publish} />

          <p className={s.calmShowcase}>Need ideas? <Link href="/showcase">Browse the showcase</Link></p>
          </IdeFrame>
        </div>
        <Dialog open={tuneOpen && Boolean(cfg)} onOpenChange={setTuneOpen} title="Fine-tune the look" className={s.tuneDialog} footer={<Button variant="primary" onClick={() => setTuneOpen(false)}>Done</Button>}>
          {cfg ? (
            <Suspense fallback={<p className={s.paneMeta}><ActivityIndicator label="Opening the design picker" showLabel /></p>}>
              <DesignPicker cfg={cfg} design={design} onChange={(d) => { setDesign(d); setAuto(false); }} idea={store.text()} />
            </Suspense>
          ) : null}
        </Dialog>
      </div>
    );
  }

  // ───────────────────────── studio: the app on the canvas ─────────────────────────
  const name = current?.spec?.name ?? live.spec?.name ?? current?.name ?? "New app";
  const published = current?.publishedVersion != null;
  const behind = published && (current?.headVersion ?? 0) > (current?.publishedVersion ?? 0);
  const filesPlanned = live.spec?.files?.length ?? 0;
  const filesWritten = { done: Math.min(live.files.length, filesPlanned), total: filesPlanned };
  const bp = live.spec ? blueprintFromSpec(live.spec, live, { building: running }) : current?.spec ? blueprintFromSpec(current.spec) : inferBlueprint(run?.prompt ?? store.text());
  // While a build tests and fixes its code, the preview shows the app as written so far (refreshed after every fix round);
  // otherwise the saved version.
  const livePreview = running && buildPreview && LIVE_STAGES.includes(live.stage) ? buildPreview : null;
  const frameSrc = livePreview ?? (!running ? current?.previewUrl ?? null : null);
  const showFrame = Boolean(frameSrc);
  const tabs: Tab[] = current?.previewUrl ? ["preview", "code", "changes", "live", "critic", "deploy", "look", "data", "settings"] : ["preview"];
  // Minimal pass: three tabs stay visible; the rest open from one "More" menu (only once a build exists).
  const shownTabs = tabs.filter((t) => MAIN_TABS.includes(t));
  const moreTabs = tabs.filter((t) => !MAIN_TABS.includes(t));
  // A view opened from More joins the tab row while it is open, so the row always has a selected (and keyboard-reachable) tab.
  const rowTabs = tabs.includes(tab) && !shownTabs.includes(tab) ? [...shownTabs, tab] : shownTabs;
  const wide = WIDE.includes(tab);
  const reopen = () => { if (current) { void open(current.id, { keepTab: true }); void load(); } };

  return (
    <div className={s.root}>
      <div className={s.top}>
        <Button variant="ghost" size="sm" onClick={backToStart} disabled={running} aria-label="All apps" leadingIcon={<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}>
          Apps
        </Button>
        <div className={s.title}>
          <span className={s.appName} style={look ? { fontFamily: look.display } : undefined}>{name}</span>
          {current?.headVersion ? <span className={s.ver}>v{current.headVersion}</span> : null}
          <span className={s.badge} data-tone={running ? "live" : err ? "warn" : published ? (behind ? "warn" : "ok") : undefined}>{running ? <ActivityIndicator label="" size={12} /> : null}{running ? "Building" : err ? "Stopped" : published ? (behind ? "Update ready" : "Live") : current?.headVersion ? "Draft" : "New"}</span>
        </div>
        <nav className={s.tabs} aria-label="App views">
          <Tabs id={VIEW_TABS} label="App views" value={tab} onValueChange={setTab} className={s.tabRow} items={rowTabs.map((t) => ({ value: t, label: TAB_LABEL[t] }))} />
          {moreTabs.length ? <MoreTabs tabs={moreTabs} active={moreTabs.includes(tab) ? tab : null} onPick={setTab} /> : null}
        </nav>
        <span className={s.grow} />
        {tab === "preview" && showFrame && !running ? (
          <Button variant={picking ? "primary" : "secondary"} size="sm" className={s.pickBtn} aria-pressed={picking} aria-label={picking ? "Stop selecting" : "Select an element to change"} onClick={() => { setPicked(null); setPicking((x) => !x); }} title="Click anything in the preview to change it (Esc to stop)" leadingIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4l7 17 2.5-7.5L21 11z" /></svg>}>
            <span className={s.pickLabel}>{picking ? "Click an element" : "Select"}</span>
          </Button>
        ) : null}
        {tab === "preview" && showFrame ? (
          <SegmentedControl label="Device" size="sm" className={s.devices} value={device} onValueChange={setDevice} options={(["desktop", "tablet", "phone"] as const).map((d) => ({ value: d, label: null, icon: DEVICE_ICON[d], ariaLabel: d[0].toUpperCase() + d.slice(1) }))} />
        ) : null}
        {current?.previewUrl ? <a className={s.linkBtn} href={current.previewUrl} target="_blank" rel="noopener">Open<span aria-hidden="true"> ↗</span></a> : null}
        {current?.liveUrl ? <a className={s.linkBtn} href={current.liveUrl} target="_blank" rel="noopener">Live<span aria-hidden="true"> ↗</span></a> : null}
        {current?.previewUrl ? <Button variant="primary" size="sm" className={s.cta} onClick={() => setGate(true)} loading={busy[current.id] === "publish"} disabled={Boolean(busy[current.id]) || running || (published && !behind)}>{busy[current.id] === "publish" ? "Publishing…" : published ? (behind ? "Publish update" : "Published") : "Publish"}</Button> : null}
      </div>

      {wide ? null : (
        <div className={s.panelSwitch}>
          <SegmentedControl label="Show" size="sm" fullWidth value={panel} onValueChange={setPanel} options={[{ value: "canvas", label: running ? "Build" : "Preview" }, { value: "log", label: running ? "Steps" : "Report & refine" }]} />
        </div>
      )}

      <div className={s.work} data-panel={panel} data-wide={wide ? "true" : undefined}>
        <aside className={s.ledger}>
          {run?.prompt || current ? (
            <div className={s.asked}>
              <span>{run?.edit ? "Refining" : running ? "Building" : "Brief"}</span>
              {run?.prompt || versions[versions.length - 1]?.prompt || current?.spec?.summary || ""}
            </div>
          ) : null}
          {running ? <Elapsed since={run?.startedAt ?? 0} text={live.stageText} /> : null}
          {err ? (
            <div className={s.errCard} role="alert">
              <strong>{err.kind === "confirm" ? "Confirm the cost" : err.kind === "stopped" ? "Lost the connection" : err.kind === "setup" ? "Not available yet" : "The build stopped"}</strong>
              <p>{err.message}</p>
              <div className={s.errActions}>
                {err.kind === "confirm" ? <Button variant="primary" size="sm" onClick={retry}>Start the build{err.units ? ` · ${err.units.toLocaleString()} credits` : ""}</Button> : err.kind === "setup" ? null : <Button variant="primary" size="sm" onClick={retry}>{err.kind === "stopped" ? "Reconnect" : "Try again"}</Button>}
                {!run?.edit ? <Button variant="secondary" size="sm" onClick={() => { const p = run?.prompt ?? ""; backToStart(); setTimeout(() => p && promptRef.current?.set(p), 30); }}>Edit the prompt</Button> : null}
              </div>
            </div>
          ) : null}
          {lastEdit && !running ? <button type="button" className={s.changedNote} onClick={() => setTab("changes")}>v{lastEdit} saved · <u>See what changed</u></button> : null}
          {shipped && !running ? (
            <div className={s.shipped} role="status">
              <strong>Published v{shipped.version}</strong>
              <p>The live app is at this address. Further edits stay in the draft until you publish again. Deploy keeps a log and can roll back.</p>
              <div className={s.errActions}>
                <a className={s.linkPrimary} href={shipped.url} target="_blank" rel="noopener">Open live app</a>
                <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard?.writeText(shipped.url); say("Link copied."); }}>Copy link</Button>
                <Button variant="ghost" size="sm" onClick={() => setTab("deploy")}>Deploy log</Button>
              </div>
            </div>
          ) : null}
          <div className={s.timelineWrap}>
            {/* The stage line above (with the timer) already says what is happening, so the timeline does not repeat it. */}
            <BuildTimeline live={!running && !live.spec && current?.spec ? { ...live, stage: "done", spec: current.spec } : { ...live, stageText: "" }} report={current?.report ?? null} running={running} />
          </div>
          {/* The code as it is written (this build only; saved versions are in the Code tab). */}
          <LiveCode live={live} running={running} />
          {current?.spec && !running ? (
            <div className={s.refine}>
              <label className={s.refineLabel} htmlFor="kc-refine">Refine</label>
              <PromptField ref={refineRef} id="kc-refine" store={refineStore} className={s.refineBox} label="Describe a change" placeholder="“Add a saved-posts tab”, “make the feed denser”, “let admins block a time slot”" onSubmit={() => { const p = refineStore.text().trim(); if (p.length >= 4) { refineRef.current?.clear(); void build(p, true); } }} />
              <div className={s.refineRow}>
                <select className={s.select} defaultValue="" aria-label="Regenerate a screen" onChange={(e) => { if (e.target.value) refineRef.current?.set(`Regenerate the ${e.target.value} screen with a stronger, more distinctive composition. Keep its features and data.`); e.target.value = ""; }}>
                  <option value="">Regenerate a screen…</option>
                  {current.spec.pages.map((p) => <option key={p.route} value={`${p.title} (${p.route})`}>{p.title}</option>)}
                </select>
                <span className={s.grow} />
                <span className={s.kbd} aria-hidden="true">{KEY_MOD}↵</span>
                <RefineButton store={refineStore} onApply={() => { const p = refineStore.text().trim(); refineRef.current?.clear(); void build(p, true); }} />
              </div>
            </div>
          ) : null}
        </aside>

        <section className={s.stage} id={tabPanelId(VIEW_TABS, tab)} aria-label={tab === "preview" ? "Preview" : TAB_LABEL[tab]}>
          {tab === "preview" && !running && picked ? (
            <PickEditor picked={picked} onCancel={() => setPicked(null)} onApply={(what) => {
              const p = picked;
              setPicked(null);
              void build(`On the screen ${p.route}, change only this element: ${p.label} (CSS path: ${p.path})${p.text ? `, which currently reads "${p.text}"` : ""}.\nIts current HTML: ${p.html}\nThe change: ${what}\nKeep everything else as it is.`, true);
            }} />
          ) : null}
          {tab === "preview" && !running && current ? (
            <IssueBar
              open={current.report?.version === current.headVersion ? current.report?.open ?? [] : []}
              errors={appErrors}
              onFix={(items) => void build(`Fix these problems in the app (keep everything else as it is):\n${items.map((x) => `- ${x}`).join("\n")}`, true)}
            />
          ) : null}
          {tab === "preview" ? (
            <div className={s.canvas} data-device={device}>
              <div className={s.layer} data-hidden={showFrame && frameReady ? "true" : undefined}>
                <Blueprint bp={bp} look={look} building={running} files={filesWritten} caption={running ? live.stageText : !current?.previewUrl ? (err ? "Nothing was published." : "Your app appears here as soon as it passes its tests.") : "Developing the preview…"} />
              </div>
              {showFrame ? (
                <div className={s.frameLayer} data-ready={frameReady ? "true" : undefined}>
                  {(() => {
                    const frame = <iframe key={frameKey} className={s.frame} data-device={device} ref={frameRef} src={frameSrc!} title="App preview" onLoad={() => setFrameReady(true)} sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" />;
                    // Desktop is a real desktop-width viewport (1280-1920px) scaled to fill the whole pane: laid out as on a monitor, no empty bands.
                    return device === "desktop" ? <ScaledViewport fit="fill">{frame}</ScaledViewport> : frame;
                  })()}
                </div>
              ) : null}
            </div>
          ) : (
            <Suspense fallback={<div className={s.paneMsg}><ActivityIndicator label="Loading" showLabel /></div>}>
              {tab === "code" && current?.headVersion ? <CodePane appId={current.id} version={current.headVersion} onSaved={() => { void open(current.id, { keepTab: true }); void load(); say("Saved as a new version."); }} /> : null}
              {tab === "changes" && current ? <ChangesPane appId={current.id} versions={versions} head={current.headVersion} plan={cfg?.plan} onRestored={() => { void open(current.id, { keepTab: true }); void load(); say("Restored as a new version."); }} onBranched={(id) => { void load(); void open(id); say("Branched into a new draft. The original keeps its history."); }} /> : null}
              {tab === "look" && cfg && current ? <div className={s.pane}><DesignPicker cfg={cfg} design={design} onChange={saveTheme} idea={current.spec?.name ?? ""} compact /><p className={s.paneMeta}>Theme changes apply to the preview instantly and cost nothing. Publish to update the live app.</p></div> : null}
              {tab === "data" && current ? <DataPane id={current.id} /> : null}
              {tab === "settings" && current ? <SettingsPane app={current} onSaved={() => void open(current.id, { keepTab: true })} /> : null}
              {tab === "live" && current ? <LiveTab siteId={current.id} toast={say} onSaved={reopen} onDeployed={reopen} onOpenCritic={() => setTab("critic")} /> : null}
              {tab === "critic" && current ? <CriticPane siteId={current.id} headVersion={current.headVersion} canRun canEdit toast={say} onFixed={reopen} /> : null}
              {tab === "deploy" && current ? <DeployPane siteId={current.id} toast={say} onChanged={reopen} /> : null}
            </Suspense>
          )}
        </section>
      </div>
      {gate && current?.headVersion ? (
        <Suspense fallback={null}>
          <PublishGate
            siteId={current.id}
            version={current.headVersion}
            publishing={busy[current.id] === "publish"}
            onPublish={() => { void publish(current.id).then(() => setGate(false)); }}
            onFixed={() => { void open(current.id, { keepTab: true }); void load(); say("Fixes applied as a new version."); }}
            onOpenCritic={() => { setGate(false); setTab("critic"); }}
            onClose={() => setGate(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

type Picked = { label: string; path: string; text: string; html: string; route: string };

/** Click-to-edit: what was picked in the preview, and one line saying what to change (sent as a fast edit aimed at that element). */
function PickEditor({ picked, onApply, onCancel }: { picked: Picked; onApply: (what: string) => void; onCancel: () => void }) {
  const [what, setWhat] = useState("");
  return (
    <form className={s.pickEditor} onSubmit={(e) => { e.preventDefault(); if (what.trim()) onApply(what.trim()); }}>
      <div className={s.pickHead}>
        <span className={s.pickTag}>{picked.label}</span>
        <span className={s.pickText}>{picked.text ? `“${picked.text.slice(0, 90)}${picked.text.length > 90 ? "…" : ""}”` : `on ${picked.route}`}</span>
      </div>
      <div className={s.pickRow}>
        <input className={s.pickInput} autoFocus value={what} onChange={(e) => setWhat(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} placeholder="What should change? e.g. “make it bigger and blue”, “say Start free instead”" aria-label="What should change" />
        <Button type="submit" variant="primary" size="sm" disabled={!what.trim()}>Change it</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** What still needs fixing: problems the last build saved with, and errors the running preview reported. One click sends them as a (fast) edit. */
function IssueBar({ open, errors, onFix }: { open: string[]; errors: { message: string; file: string; line: number; route: string }[]; onFix: (items: string[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const items = [
    ...errors.map((e) => `While running on screen ${e.route}: ${e.message}${e.file ? ` (${e.file}${e.line ? `:${e.line}` : ""})` : ""}`),
    ...open.map((o) => `Found in testing: ${o}`),
  ];
  if (!items.length) return null;
  const title = errors.length && open.length ? `${errors.length} error${errors.length === 1 ? "" : "s"} while running · ${open.length} open from testing`
    : errors.length ? `The app hit ${errors.length === 1 ? "an error" : `${errors.length} errors`} while running`
    : `${open.length} issue${open.length === 1 ? "" : "s"} still open after testing`;
  return (
    <div className={s.issueBar} role="status">
      <div className={s.issueRow}>
        <span className={s.issueDot} aria-hidden="true" />
        <button type="button" className={s.issueTitle} onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>{title}</button>
        <Button variant="primary" size="sm" onClick={() => onFix(items)}>Fix {items.length === 1 ? "it" : "these"}</Button>
      </div>
      {expanded ? <ul className={s.issueList}>{items.map((x) => <li key={x}>{x}</li>)}</ul> : null}
    </div>
  );
}

/** Stages in which the build's code is complete enough to run (testing, review, fixing, saving). */
const LIVE_STAGES = ["verify", "visual", "fix", "save"];

const KEY_MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl ";

/** The blueprint for the start screen: re-renders only when the typed text settles, never per keystroke. */
function LiveBlueprint({ store, look, auto }: { store: PromptStore; look: BlueprintLook; auto: boolean }) {
  const text = usePromptSettled(store);
  const bp = useMemo(() => inferBlueprint(text), [text]);
  return <Blueprint bp={bp} look={look} caption={!text.trim() ? "Start typing — a preview of the screens appears here." : auto ? "Keplar picks the look while it plans. Choose a direction to preview it." : undefined} />;
}

function ShipRow({ store, cfg, onBuild }: { store: PromptStore; cfg: Config | null; onBuild: () => void }) {
  const ready = usePromptReady(store);
  return (
    <div className={s.ship}>
      <span className={s.shipMeta}>
        {cfg ? (cfg.estimateUnits ? `About ${cfg.estimateUnits.toLocaleString()} credits, at most ${cfg.maxUnits.toLocaleString()}` : "Free build") : "\u00a0"}
        {cfg ? <span className={s.dim}> · up to {cfg.limits.pages} screens{cfg.limits.backend ? `, ${cfg.limits.collections} data collections, accounts` : ""}{cfg.limits.ai ? ", AI features" : ""} · {cfg.model}</span> : null}
      </span>
      <span className={s.grow} />
      <span className={s.kbd} aria-hidden="true">{KEY_MOD}↵</span>
      <Button variant="primary" className={s.cta} disabled={!ready || !cfg} onClick={onBuild} aria-keyshortcuts="Control+Enter Meta+Enter" trailingIcon={<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}>
        Build the app
      </Button>
    </div>
  );
}

function RefineButton({ store, onApply }: { store: PromptStore; onApply: () => void }) {
  const ready = useSyncReady(store, 4);
  return <Button variant="primary" size="sm" disabled={!ready} onClick={onApply}>Apply change</Button>;
}

/** Ready at a lower threshold for refinements ("denser feed" is a fine change request). */
function useSyncReady(store: PromptStore, min: number) {
  const settled = usePromptSettled(store);
  const ready = usePromptReady(store);
  return ready || settled.trim().length >= min;
}

function Elapsed({ since, text }: { since: number; text: string }) {
  const [mounted] = useState(() => Date.now());
  const [now, setNow] = useState(mounted);
  since = since || mounted;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - since) / 1000));
  return (
    <div className={s.elapsed} aria-live="polite">
      <ActivityIndicator label="" />
      <span className={s.elapsedText}>{text || "Working"}</span>
      <span className={s.clock}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
    </div>
  );
}

/** The studio's secondary views in one small menu (the kit Menu). The open one is checked (it also sits in the tab row while open). */
function MoreTabs({ tabs, active, onPick }: { tabs: Tab[]; active: Tab | null; onPick: (t: Tab) => void }) {
  return (
    <Menu
      label="More views"
      trigger={({ open, ...p }) => (
        <button {...p} type="button" data-open={open || undefined} className={s.moreTrigger} data-studio-more="">
          More
          <svg width="10" height="10" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
    >
      {tabs.map((t) => (
        <MenuItem key={t} checked={active === t} hint={TAB_HINT[t]} onSelect={() => onPick(t)}>{TAB_LABEL[t]}</MenuItem>
      ))}
    </Menu>
  );
}

const TAB_HINT: Partial<Record<Tab, string>> = {
  live: "Edit together in real time",
  critic: "Review and fix the build",
  deploy: "Domains and deploy history",
  look: "Theme, fonts and colors",
  data: "Your app's stored data",
  settings: "Features and admins",
};

const DEVICE_ICON: Record<Device, React.ReactNode> = {
  desktop: <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  tablet: <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>,
  phone: <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7 12.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
};
