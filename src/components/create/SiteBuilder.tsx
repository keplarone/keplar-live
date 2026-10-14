"use client";
import { coverage, fixPrompt, gapsOf, type CoverageItem } from "@/lib/site-builder/coverage";
/**
 * Site builder: describe a site, get a multi-page result with a live sandboxed preview, change it by chat,
 * undo/restore versions, view the code, export a ZIP, edit SEO, read form leads and publish to /s/<slug>.
 * No dollars anywhere: costs are shown as credits (Keplar Usage).
 */
import { SignInGate } from "@/components/app-ui/SignInGate";
import { useCallback, useEffect, useRef, useState } from "react";
import { brand } from "@/lib/site";
import { DomainPanel } from "./DomainPanel";
import { ProductCard, ProductStart, productReady } from "./ProductImport";
import { newForgeState, type ForgeFile, type ForgeState } from "./workspace/forgeState";
import { buildSrcdoc } from "./workspace/partial";
import { BriefReview } from "./workspace/BriefReview";
import { Understand } from "./workspace/UnderstandPanel";
import { Groups, type Group } from "./workspace/ActivityGroups";
import { entry, phaseLabel, progressOf, readNdjson, type Entry, type Phase } from "./workspace/activity";
import { discover, useFlow } from "./workspace/flow";
import { Rail } from "./workspace/Rail";
import { DeleteSiteDialog, SiteUndo } from "./delete/DeleteSiteDialog";
import { useSiteDelete } from "./delete/useSiteDelete";
import { StagePanel, type ShotView, type StageTab } from "./workspace/StagePanel";
import { ComparePane } from "./ComparePane";
import { FeaturesPane } from "./FeaturesPane";
import { SectionsPane } from "./SectionsPane";
import { StylePane, type DirectionInfo } from "./StylePane";
import type { SiteBrief } from "@/lib/site-builder/brief";
import type { LintSummary, QaSummary, SiteDesign } from "@/lib/site-builder/types";
import type { SiteFx } from "@/lib/site-builder/fx/types";
// Decorative three.js field: split out so the sign-in gate and the first paint never wait for the three.js chunk.
import s from "./create.module.css";
import b from "./builder.module.css";
import w from "./workspace/ws.module.css";
import { Button, SegmentedControl } from "@/components/kit";

type Seo = { title: string; description: string; ogImage: string; indexable: boolean; pages: Record<string, { title?: string; description?: string }> };
type SiteSummary = { id: string; name: string; slug: string; headVersion: number; publishedVersion: number | null; publishedUrl: string | null; needsReview: boolean; takenDown: boolean; leadCount: number; seo: Seo; updatedAt: string; design?: SiteDesign | null; fx?: SiteFx | null; archived?: boolean };
type Template = { id: string; name: string; description: string; pages: string[]; starterPrompt: string; accent: string };
type Meter = { used: number; total: number | null; plan: string; windows: { id: string; label: string; used: number; limit: number; resetsAt: string | null }[] | null; cooldown: { until: string; message: string } | null; breaker?: { notice: string | null } };
type Config = { ready: boolean; plan: string; planLabel: string; verified: boolean; maxSites: number; limits: { promptChars: number; pages: number; siteKB: number; jobsPerDay: number; concurrent: number }; model: string; textOnly: boolean; templates: Template[]; directions?: DirectionInfo[]; breakerNotice: string | null };
type Msg = { id: string; role: "user" | "assistant" | "system"; text: string; at: string; version?: number; units?: number };
type VersionRow = { n: number; kind: string; summary: string; createdAt: string; units: number; pages: number; bytes: number; lint?: LintSummary | null };
type Detail = { site: SiteSummary; messages: Msg[]; files: Record<string, string>; pages: string[]; versions: VersionRow[]; previewToken: string };
type Estimate = { units: number; low: number; high: number; free: boolean; modelLabel: string; kind: string };
type Lead = { id: string; page: string; email: string | null; fields: Record<string, string>; createdAt: string };

class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `Request failed (${res.status})`), res.status, data);
  return data as T;
}

type Tab = "preview" | "style" | "code" | "seo" | "leads" | "versions" | "sections" | "features" | "publish";

const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Cooldown({ until, onDone }: { until: string; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = new Date(until).getTime() - now;
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);
  if (left <= 0) return null;
  return (
    <div className={b.cooldown} role="status" aria-live="polite">
      <strong>Keplar usage cooldown</strong>
      <span>
        You&apos;ve used a lot in a short time. New requests resume in <span className={b.clock}>{fmtClock(left)}</span> (at {fmtTime(until)}). Your credits are kept.
      </span>
    </div>
  );
}

const SIGN_IN_ERROR = "Sign in to use Create.";
const AUTOTEST_KEY = "keplar:create-autotest";
const MORE: { id: Tab; label: string }[] = [
  { id: "style", label: "Style" },
  { id: "code", label: "Code" },
  { id: "seo", label: "SEO" },
  { id: "features", label: "Features" },
  { id: "leads", label: "Leads" },
  { id: "sections", label: "Sections" },
  { id: "versions", label: "History" },
  { id: "publish", label: "Publish" },
];

export function SiteBuilder() {
  const [config, setConfig] = useState<Config | null>(null);
  const [meter, setMeter] = useState<Meter | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [mode, setMode] = useState<"site" | "new">("site");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageTab, setStageTab] = useState<StageTab>("preview");
  const [moreTab, setMoreTab] = useState<Tab>("style");
  const [device, setDevice] = useState<"phone" | "desktop">("desktop");
  const [page, setPage] = useState("index.html");
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  /** Set when the site was just remixed from a gallery template: the prompt box invites changes to it. Shown while that site is open. */
  const [remixed, setRemixed] = useState<{ siteId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [confirm, setConfirm] = useState<{ prompt: string; units: number; brief?: SiteBrief } | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [shots, setShots] = useState<ShotView[]>([]);
  const [qa, setQa] = useState<QaSummary | null>(null);
  const [browserNote, setBrowserNote] = useState<string | null>(null);
  const [focusShot, setFocusShot] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [pane, setPane] = useState<"chat" | "preview">("chat");
  const [autoTest, setAutoTest] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [attach, setAttach] = useState(false);
  const [startTpl, setStartTpl] = useState("blank");
  const [startName, setStartName] = useState("");
  const [progress, setProgress] = useState<{ phase: Phase; chars: number; files: number; pages: number; testSteps: number }>({ phase: "idle", chars: 0, files: 0, pages: 3, testSteps: 0 });
  const threadRef = useRef<HTMLDivElement>(null);
  const forgeRef = useRef<ForgeState>(newForgeState());
  const partialFiles = useRef<Record<string, string>>({});
  const [partialDoc, setPartialDoc] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [forgeFiles, setForgeFilesState] = useState<ForgeFile[]>([]);
  const setForgeFiles = (next: ForgeFile[]) => { forgeRef.current.files = next; setForgeFilesState(next); };
  const flow = useFlow();
  const openId = useRef<string | null>(null);

  const refreshList = useCallback(async () => {
    const r = await api<{ sites: SiteSummary[]; config: Config; meter: Meter }>("/api/sites");
    setConfig(r.config);
    setMeter(r.meter);
    setSites(r.sites);
    setCooldownUntil(r.meter.cooldown?.until ?? null);
    return r.sites;
  }, []);

  const loadLibrary = useCallback(async (id: string) => {
    try {
      const r = await api<{ qa: QaSummary | null; shots: ShotView[] }>(`/api/sites/${id}/qa`);
      setQa(r.qa);
      setShots(r.shots.filter((x) => !r.qa || x.version === r.qa.version));
    } catch {
      setQa(null);
      setShots([]);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await api<Detail>(`/api/sites/${id}`);
    setDetail(d);
    setViewVersion(null);
    setPage((p) => (d.pages.includes(p) ? p : d.pages[0] ?? "index.html"));
    void loadLibrary(id);
    return d;
  }, [loadLibrary]);

  /** Delete with undo. The server hides the site at once; deleting the open one switches to another site, or to the empty "What are we building?" state. */
  const del = useSiteDelete({
    isActive: (id) => openId.current === id,
    onRemoved: async (site, wasActive) => {
      setSites((list) => list.filter((x) => x.id !== site.id));
      setRailOpen(false);
      let next: SiteSummary | undefined;
      try { next = (await refreshList()).find((x) => !x.archived) ?? undefined; } catch { /* the list refreshes on the next action */ }
      if (wasActive) {
        flow.reset();
        setGroups([]);
        setShots([]);
        setQa(null);
        setConfirm(null);
        setError(null);
        if (next) {
          setMode("site");
          try { await loadDetail(next.id); } catch { setDetail(null); setMode("new"); }
        } else {
          setDetail(null);
          setMode("new");
          setPane("chat");
        }
      }
      requestAnimationFrame(() => document.querySelector<HTMLElement>('nav[aria-label="Projects"] [aria-current="true"], nav[aria-label="Projects"] ul button, nav[aria-label="Projects"] button')?.focus());
    },
    onRestored: async (site, wasActive) => {
      await refreshList().catch(() => undefined);
      if (wasActive) {
        setMode("site");
        try { await loadDetail(site.id); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't reopen the site."); }
      }
    },
  });

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const list = await refreshList();
        try { if (on) setAutoTest(localStorage.getItem(AUTOTEST_KEY) !== "0"); } catch { /* storage unavailable */ }
        let want: string | null = null;
        try { want = sessionStorage.getItem("keplar:create-site"); sessionStorage.removeItem("keplar:create-site"); } catch { /* storage unavailable */ }
        let remix: { siteId: string; title: string } | null = null;
        try {
          const raw = sessionStorage.getItem("keplar:create-remix");
          sessionStorage.removeItem("keplar:create-remix");
          const j = raw ? (JSON.parse(raw) as { siteId?: unknown; title?: unknown }) : null;
          if (j && typeof j.siteId === "string" && typeof j.title === "string" && j.siteId === want) remix = { siteId: j.siteId, title: j.title.slice(0, 80) };
        } catch { /* storage unavailable or malformed */ }
        const first = list.find((x) => x.id === want) ?? list.find((x) => !x.archived) ?? list[0];
        if (remix && first?.id === remix.siteId && on) {
          setRemixed(remix);
          requestAnimationFrame(() => document.getElementById("ws-prompt")?.focus());
        }
        if (first && on) await loadDetail(first.id);
        else if (on) setMode("new");
      } catch (e) {
        if (on) setError(e instanceof ApiError && e.status === 401 ? SIGN_IN_ERROR : e instanceof Error ? e.message : "Couldn't load Create.");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [refreshList, loadDetail]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [detail?.messages.length, groups, pending, flow.stage, flow.q, flow.brief === null]);

  // Cost estimate while typing a change (free to call).
  useEffect(() => {
    if (!detail || mode !== "site" || prompt.trim().length < 3 || flow.stage !== "idle") return;
    const id = detail.site.id;
    const t = setTimeout(() => {
      api<{ estimate: Estimate }>(`/api/sites/${id}/estimate`, { method: "POST", body: JSON.stringify({ prompt }) }).then((r) => setEstimate(r.estimate)).catch(() => setEstimate(null));
    }, 450);
    return () => clearTimeout(t);
  }, [prompt, detail, mode, flow.stage]);

  // Keep the credit estimate in step with edits to the brief while reviewing it.
  const { stage: flowStage, brief: flowBrief, idea: flowIdea, setEstimate: setFlowEstimate } = flow;
  useEffect(() => {
    if (flowStage !== "review" || !flowBrief) return;
    const t = setTimeout(() => {
      discover({ idea: flowIdea, brief: flowBrief }).then((r) => setFlowEstimate(r.estimate)).catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [flowBrief, flowStage, flowIdea, setFlowEstimate]);

  const current = detail?.site ?? null;
  const currentId = current?.id ?? null;
  useEffect(() => { openId.current = mode === "site" ? currentId : null; }, [mode, currentId]);
  const hasSite = Boolean(current && current.headVersion > 0);
  const shownVersion = viewVersion ?? current?.headVersion ?? 0;
  const previewSrc = detail && shownVersion ? `/sites/draft/${detail.site.id}/${shownVersion}${page === "index.html" ? "" : `/${page}`}?t=${detail.previewToken}` : null;
  const working = busy || testing;
  const lastLines = groups.length ? groups[groups.length - 1].entries.filter((e) => e.kind === "status" || e.kind === "file" || e.kind === "check").map((e) => e.text) : [];

  // Feed the three.js canvases from the real counters.
  useEffect(() => {
    const p = progressOf(progress);
    forgeRef.current.progress = working ? p : 0;
  }, [progress, working]);

  const push = useCallback((gid: string, e: Entry) => setGroups((g) => g.map((x) => (x.id === gid ? { ...x, entries: [...x.entries, e] } : x))), []);
  const patchGroup = useCallback((gid: string, p: Partial<Group>) => setGroups((g) => g.map((x) => (x.id === gid ? { ...x, ...p } : x))), []);
  const [pulses, setPulses] = useState(0);
  const [fixOffer, setFixOffer] = useState<{ siteId: string; prompt: string; n: number } | null>(null);
  const pulse = () => { forgeRef.current.pulse += 1; setPulses((n) => n + 1); };

  async function createSite(templateId: string | undefined, name: string) {
    const r = await api<{ site: SiteSummary }>("/api/sites", { method: "POST", body: JSON.stringify({ name: name || undefined, template: templateId && templateId !== "blank" ? templateId : undefined }) });
    await refreshList();
    setMode("site");
    return loadDetail(r.site.id);
  }

  /** The browser test (and one repair pass) with live narration. */
  async function runTest(siteId: string, repair = true) {
    if (testing) return;
    setTesting(true);
    setBrowserNote(null);
    setProgress((p) => ({ ...p, phase: "testing", testSteps: 0 }));
    const gid = `qa${Date.now()}`;
    setGroups((g) => [...g.map((x) => ({ ...x, open: false })), { id: gid, title: "Testing in a real browser", entries: [], running: true, open: true }]);
    let sawError = false;
    try {
      const res = await fetch(`/api/sites/${siteId}/qa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repair }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(data.error ?? `Request failed (${res.status})`));
      }
      await readNdjson(res, (ev) => {
        pulse();
        if (ev.type === "step") { setProgress((p) => ({ ...p, testSteps: p.testSteps + 1, phase: String(ev.text).startsWith("Fix") || String(ev.text).startsWith("Repair") ? "repairing" : p.phase === "repairing" ? "repairing" : "testing" })); push(gid, entry("status", String(ev.text))); }
        else if (ev.type === "check") { setProgress((p) => ({ ...p, testSteps: p.testSteps + 1 })); push(gid, entry("check", String(ev.name), { detail: String(ev.detail ?? ""), tone: ev.ok ? "ok" : "bad" })); }
        else if (ev.type === "issue") { const i = ev.issue as { severity: string; message: string; viewport: string }; push(gid, entry("issue", i.message, { tone: i.severity === "error" ? "bad" : "warn", detail: i.viewport })); }
        else if (ev.type === "shot") { push(gid, entry("shot", `Screenshot: ${String(ev.page) === "index.html" ? "home" : String(ev.page).replace(/\.html$/, "")}, ${String(ev.label)}`, { shot: String(ev.id) })); setShots((l) => [...l, { id: String(ev.id), page: String(ev.page), viewport: String(ev.viewport), width: Number(ev.width), height: Number(ev.height), label: String(ev.label), version: Number(ev.version) }]); }
        else if (ev.type === "critique") { const c = ev.critique as { score?: number | null; summary?: string }; push(gid, entry("critique", c.summary ? `Visual review: ${c.summary}` : "Visual review finished", { detail: typeof c.score === "number" ? `Score ${c.score}/10, a model's opinion` : undefined })); }
        else if (ev.type === "repaired") { push(gid, entry("repair", `Fixed what the test found (v${String(ev.version)})`, { detail: String(ev.summary ?? ""), tone: "ok" })); setProgress((p) => ({ ...p, phase: "testing" })); void loadDetail(siteId); setShots([]); }
        else if (ev.type === "done") { push(gid, entry("done", "Test finished", { tone: "ok" })); const sum = ev.summary as QaSummary; setQa(sum); }
        else if (ev.type === "error") {
          sawError = true;
          if (ev.code === "browser_unavailable") { setBrowserNote(String(ev.error)); push(gid, entry("error", "Browser testing isn't available right now", { detail: String(ev.error), tone: "warn" })); }
          else push(gid, entry("error", String(ev.error), { tone: "bad" }));
        }
      });
    } catch (e) {
      sawError = true;
      push(gid, entry("error", e instanceof Error ? e.message : "The test stopped.", { tone: "bad" }));
    } finally {
      patchGroup(gid, { running: false, open: sawError || true });
      setTesting(false);
      setProgress((p) => ({ ...p, phase: "idle" }));
      await Promise.all([loadLibrary(siteId), loadDetail(siteId), refreshList()]).catch(() => undefined);
      setStageTab((t) => (t === "preview" ? "library" : t));
    }
  }

  async function runGenerate(siteId: string, text: string, confirmed = false, brief?: SiteBrief, fixPass = false) {
    setFixOffer(null);
    setBusy(true);
    setError(null);
    setConfirm(null);
    setStageTab("preview");
    setPane("preview");
    const gid = `gen${Date.now()}`;
    setGroups((g) => [...g.map((x) => ({ ...x, open: false })), { id: gid, title: brief ? "Building the site" : "Applying your change", entries: [], running: true, open: true }]);
    setForgeFiles([]);
    forgeRef.current.dissolve = 0;
    forgeRef.current.planned = (brief?.pages.length ?? Math.max(1, detail?.pages.length ?? 3)) + 1;
    partialFiles.current = {};
    setPartialDoc(null);
    setFinished(false);
    setProgress({ phase: "writing", chars: 0, files: 0, pages: brief?.pages.length ?? Math.max(1, detail?.pages.length ?? 3), testSteps: 0 });
    setPending(text);
    let failed: string | null = null;
    let built = false;
    let gaps: CoverageItem[] = [];
    try {
      const res = await fetch(`/api/sites/${siteId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text, confirm: confirmed, ...(brief ? { brief } : {}) }) });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (data.code === "confirm") {
          setConfirm({ prompt: text, units: Number((data.estimate as Estimate | undefined)?.units ?? 0), brief });
          setGroups((g) => g.filter((x) => x.id !== gid));
          setPending(null);
          setBusy(false);
          setProgress((p) => ({ ...p, phase: "idle" }));
          return;
        }
        if (data.code === "cooldown" && typeof data.until === "string") setCooldownUntil(data.until);
        throw new ApiError(String(data.error ?? `Request failed (${res.status})`), res.status, data);
      }
      setPrompt("");
      await readNdjson(res, (ev) => {
        if (ev.type === "estimate") push(gid, entry("note", ev.free ? `Free build on ${String(ev.model)}` : `About ${Number(ev.units).toLocaleString()} credits on ${String(ev.model)}`));
        else if (ev.type === "status") {
          const t = String(ev.text);
          pulse();
          setProgress((p) => ({ ...p, phase: /^Checking the design|^Comparing|^Fixing/.test(t) ? "checking" : p.phase }));
          push(gid, entry("status", t));
        } else if (ev.type === "file") {
          const path = String(ev.path);
          if (!forgeRef.current.files.some((f) => f.path === path)) setForgeFiles([...forgeRef.current.files, { path, done: false }]);
          setProgress((p) => ({ ...p, files: p.files + 1 }));
          push(gid, entry("file", `Writing ${path}`));
        } else if (ev.type === "filedone") {
          const path = String(ev.path);
          setForgeFiles(forgeRef.current.files.map((f) => (f.path === path ? { ...f, done: true } : f)));
          if (typeof ev.content === "string") {
            partialFiles.current = { ...partialFiles.current, [path]: ev.content };
            setPartialDoc(buildSrcdoc(partialFiles.current));
          }
          push(gid, entry("file", `Wrote ${path}`));
        }
        else if (ev.type === "progress") setProgress((p) => ({ ...p, chars: Number(ev.chars) || p.chars }));
        else if (ev.type === "saving") { pulse(); setProgress((p) => ({ ...p, phase: "saving" })); push(gid, entry("status", "Checking and saving")); }
        else if (ev.type === "done") { built = true; push(gid, entry("done", String(ev.summary || "Saved a new version"), { tone: "ok", detail: ev.lint && (ev.lint as { errors: number }).errors ? `${(ev.lint as { errors: number }).errors} design issue(s) left` : undefined })); }
        else if (ev.type === "error") { failed = String(ev.error); push(gid, entry("error", failed, { tone: "bad" })); }
      });
      if (built && !failed && brief) {
        // what was asked for versus what is in the finished files (a plain text check, said so in the first line)
        const items = coverage(brief, partialFiles.current);
        gaps = gapsOf(items);
        if (items.length) {
          push(gid, entry("status", `Requested vs built: ${items.filter((i) => i.built).length} of ${items.length} found (a text check of the files)`));
          for (const it of items) push(gid, entry(it.built ? "check" : "issue", it.ask, { detail: it.note, tone: it.built ? "ok" : "warn" }));
        }
      }
      await Promise.all([loadDetail(siteId), refreshList()]);
      if (failed) setError(failed);
    } catch (e) {
      failed = e instanceof Error ? e.message : "Something went wrong.";
      setError(failed);
      push(gid, entry("error", failed, { tone: "bad" }));
      await refreshList().catch(() => undefined);
    } finally {
      patchGroup(gid, { running: false, open: Boolean(failed) });
      forgeRef.current.dissolve = built && !failed ? 1 : 0;
      setFinished(built && !failed);
      setBusy(false);
      setPending(null);
      setProgress((p) => ({ ...p, phase: "idle" }));
    }
    if (built && !failed) {
      // self-review: pages or sections the brief asked for but the files lack. With "Test after build" on, one automatic fix pass; otherwise one click.
      if (gaps.length && !fixPass) {
        const fix = fixPrompt(gaps);
        if (autoTest) { await runGenerate(siteId, fix, false, undefined, true); return; }
        setFixOffer({ siteId, prompt: fix, n: gaps.length });
      }
      if (autoTest) await runTest(siteId, true);
    }
  }

  async function send(text: string, confirmed = false) {
    const p = text.trim();
    if (!p || working || !current) return;
    await runGenerate(current.id, p, confirmed);
  }

  async function approve(brief: SiteBrief) {
    if (working) return;
    setError(null);
    try {
      const d = await createSite(undefined, brief.name);
      flow.reset();
      await runGenerate(d.site.id, brief.idea || brief.purpose || brief.name, false, brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the build.");
    }
  }

  async function startFromTemplate() {
    if (working) return;
    setError(null);
    try {
      const tpl = config?.templates.find((t) => t.id === startTpl);
      await createSite(startTpl, startName.trim() || tpl?.name || "My site");
      setShowTemplates(false);
      setGroups([]);
      setShots([]);
      setQa(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the site.");
    }
  }

  function newChat() {
    flow.reset();
    setMode("new");
    setDetail(null);
    setGroups([]);
    setShots([]);
    setQa(null);
    setPrompt("");
    setError(null);
    setConfirm(null);
    setPane("chat");
  }

  async function pick(id: string) {
    if (working) return;
    flow.reset();
    setMode("site");
    setGroups([]);
    setError(null);
    try { await loadDetail(id); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't open that project."); }
  }

  async function restore(n: number | "undo") {
    if (!current || working) return;
    setError(null);
    try {
      await api(`/api/sites/${current.id}/versions`, { method: "POST", body: JSON.stringify(n === "undo" ? { undo: true } : { n }) });
      await Promise.all([loadDetail(current.id), refreshList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore that version.");
    }
  }

  const onCooldownDone = useCallback(() => {
    setCooldownUntil(null);
    void refreshList().catch(() => undefined);
  }, [refreshList]);

  if (loading) return <div className={w.root}><p className={w.muted} style={{ padding: 24 }} role="status">Loading Create…</p></div>;
  if (error && !config) {
    return (
      <div className={w.root}>
        {error === SIGN_IN_ERROR ? (
          <SignInGate title="Sign in to create" body="Create builds your site, images and video, and keeps them in your account so you can edit, publish and come back to them. Free accounts can start; Plus and Pro unlock more." next="/app/create" />
        ) : (
          <p className={w.error} style={{ padding: 24 }} role="alert">{error}</p>
        )}
      </div>
    );
  }

  const inFlow = flow.stage !== "idle";
  const isNew = mode === "new" || !detail;
  const goal = isNew ? (flow.brief?.goal || flow.idea || "") : (detail?.site.name ?? "");
  const placeholder = cooldownUntil ? "Paused during the usage cooldown" : remixed && detail?.site.id === remixed.siteId && !prompt ? `Change this template: your name, words, colors, photos, pages…` : flow.stage === "asking" && flow.cur ? flow.cur.placeholder || "Type your answer" : isNew ? "Describe what to build, change, or explore..." : hasSite ? "Describe what to build, change, or explore..." : "Describe what to build, change, or explore...";
  const composerLocked = working || Boolean(cooldownUntil) || flow.working || flow.stage === "review" || flow.stage === "product" || flow.stage === "understand";
  const shownEstimate = !isNew && prompt.trim().length >= 3 ? estimate : null;
  const building = {
    active: busy,
    label: phaseLabel(progress.phase) || "Building preview",
    progress: progressOf(progress),
    lines: lastLines,
    forge: forgeRef,
    files: forgeFiles,
    partialDoc,
    finished,
    pulseKey: pulses,
    testProgress: testing ? Math.min(0.95, progress.testSteps / 14) : undefined,
  };

  function submit() {
    const text = prompt.trim();
    if (flow.stage === "asking") {
      flow.answer(text);
      setPrompt("");
      return;
    }
    if (text.length < 3) return;
    if (isNew) {
      setPrompt("");
      void flow.begin(text, false);
      return;
    }
    void send(text);
  }

  const morePane = detail ? (
    <>
      <div className={w.moreNav} role="tablist" aria-label="More">
        {MORE.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={moreTab === t.id} className={w.segBtn} onClick={() => setMoreTab(t.id)}>{t.label}{t.id === "leads" && detail.site.leadCount ? ` (${detail.site.leadCount})` : ""}</button>
        ))}
      </div>
      {moreTab === "style" ? (
        <StylePane
          key={`${detail.site.id}-${detail.site.headVersion}-${detail.site.design?.direction ?? ""}-${detail.site.fx?.enabled ? 1 : 0}-${detail.site.fx?.effect ?? ""}`}
          site={detail.site}
          directions={config?.directions ?? []}
          lint={detail.versions.find((v) => v.n === detail.site.headVersion)?.lint ?? detail.versions.find((v) => v.lint)?.lint ?? null}
          disabled={working || detail.site.takenDown}
          onChanged={() => { void loadDetail(detail.site.id); void refreshList(); }}
        />
      ) : null}
      {moreTab === "sections" ? <SectionsPane files={detail.files} disabled={working || detail.site.takenDown} onRegenerate={(p) => { setStageTab("preview"); void send(p); }} /> : null}
      {moreTab === "code" ? <CodePane detail={detail} /> : null}
      {moreTab === "seo" ? <SeoPane detail={detail} onSaved={() => { void loadDetail(detail.site.id); void refreshList(); }} /> : null}
      {moreTab === "features" ? <FeaturesPane siteId={detail.site.id} version={detail.site.headVersion} disabled={working || detail.site.takenDown} onAdd={(p) => { setStageTab("preview"); void send(p); }} /> : null}
      {moreTab === "leads" ? <LeadsPane site={detail.site} /> : null}
      {moreTab === "versions" ? <VersionsPane detail={detail} onRestore={restore} onView={(n) => { setViewVersion(n); setStageTab("preview"); }} /> : null}
      {moreTab === "publish" ? (
        <PublishPane
          detail={detail}
          verified={config?.verified ?? false}
          onChanged={() => { void loadDetail(detail.site.id); void refreshList(); }}
          onDelete={() => del.ask({ id: detail.site.id, name: detail.site.name })}
        />
      ) : null}
    </>
  ) : (
    <p className={w.muted}>Build something first. Style, code, SEO, leads, history and publishing appear here.</p>
  );

  const thread = (
    <div className={w.thread} ref={threadRef} aria-live="polite">
      {isNew && !inFlow ? (
        <div className={w.welcome}>
          <h2>What are we building?</h2>
          <p className={w.muted}>Describe a site or app in your own words. I&rsquo;ll ask a few quick questions here, show you the brief, then build it, test it in a real browser, and fix what the test finds.{config?.textOnly ? " The Free plan builds text-and-layout sites on free models, with tighter limits." : ""}</p>
          <div className={w.starts}>
            <button type="button" className={w.start} onClick={() => setAttach((a) => !a)} aria-expanded={attach}><strong>Import a product</strong><small>From a link or a photo</small></button>
            <button type="button" className={w.start} onClick={() => setShowTemplates((a) => !a)} aria-expanded={showTemplates}><strong>Start from a template</strong><small>A real starting point</small></button>
          </div>
          {attach ? <ProductStart onDraft={(d) => { flow.takeDraft(d); setAttach(false); }} onManual={() => { flow.manualProduct(); setAttach(false); }} disabled={working} /> : null}
          {showTemplates ? (
            <div className={w.card}>
              <div className={w.tpls} role="group" aria-label="Start from">
                {config?.templates.map((t) => (
                  <button key={t.id} type="button" className={w.tpl} aria-pressed={startTpl === t.id} onClick={() => setStartTpl(t.id)}>
                    <TypeThumb name={t.name} pages={t.pages} />
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                  </button>
                ))}
              </div>
              <label className={w.field}><span>Site name</span><input spellCheck={false} className={w.input} value={startName} maxLength={60} placeholder="e.g. Fig & Oat Cafe" onChange={(e) => setStartName(e.target.value)} /></label>
              <div className={w.row}>
                <Button variant="primary" size="sm" disabled={working || startTpl === "blank"} onClick={() => void startFromTemplate()}>Use this template</Button>
                <span className={w.muted}>{config?.limits.pages} pages · up to {config?.limits.siteKB} KB · {config?.limits.jobsPerDay} AI builds a day</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isNew && inFlow ? (
        <>
          {flow.idea ? <div className={w.user}>{flow.idea}</div> : null}
          {flow.stage === "product" && flow.product ? (
            <div className={w.card}>
              <ProductCard product={flow.product} assets={flow.assets} notes={flow.pNotes} excerpt={flow.excerpt} maxImages={flow.maxImages} onChange={flow.setProduct} onAssets={flow.setAssets} onRemove={flow.removeProduct} />
              <div className={w.row}>
                <Button variant="primary" size="sm" disabled={flow.working || !productReady(flow.product)} onClick={() => { const t = prompt.trim() || `A one-product page for ${flow.product?.name ?? "my product"}`; setPrompt(""); void flow.begin(t, false); }}>{flow.working ? "One moment…" : "Looks right, ask me a few questions"}</Button>
                <Button variant="ghost" size="sm" disabled={flow.working || !productReady(flow.product)} onClick={() => void flow.begin(prompt.trim() || `A one-product page for ${flow.product?.name ?? "my product"}`, true)}>Just build it</Button>
                <span className={w.muted}>{productReady(flow.product) ? "Free. Nothing is built until you approve the brief." : "Add a product name, confirm the photo rights, and give the Buy button an address (or pick another option)."}</span>
              </div>
            </div>
          ) : null}
          {flow.stage === "understand" ? <Understand flow={flow} onSkipAll={() => { void flow.toReview({}); }} /> : null}
          {flow.stage === "asking" ? flow.questions.slice(0, flow.q).map((x) => {
            const a = flow.answers[x.id];
            const said = a?.skipped || (!a?.chips?.length && !a?.text) ? "Skipped" : [...(a.chips ?? []), a.text].filter(Boolean).join(", ");
            return (
              <div key={x.id} className={w.pair}>
                <div className={w.botBubble}>{x.text}</div>
                <div className={w.user}>{said}</div>
              </div>
            );
          }) : null}
          {flow.stage === "asking" && flow.cur ? (
            <div className={w.botBubble} data-testid="question">
              <small className={w.step}>Question {flow.q + 1} of {flow.questions.length}</small>
              <strong>{flow.cur.text}</strong>
              {flow.cur.help ? <span className={w.muted}>{flow.cur.help}</span> : null}
              {!flow.cur.textOnly && flow.cur.chips.length ? (
                <div className={w.chips}>
                  {flow.cur.chips.map((c) => <button key={c} type="button" className={w.pill} aria-pressed={flow.picked.includes(c)} onClick={() => flow.toggle(c)}>{c}</button>)}
                </div>
              ) : null}
              <div className={w.row}>
                <Button variant="primary" size="sm" disabled={flow.working} onClick={() => { flow.answer(prompt); setPrompt(""); }}>{flow.q + 1 >= flow.questions.length ? (flow.working ? "Writing the brief…" : "See the brief") : "Next"}</Button>
                <Button variant="ghost" size="sm" disabled={flow.working} onClick={() => { flow.answer("", true); setPrompt(""); }}>Skip</Button>
                <Button variant="ghost" size="sm" disabled={flow.working || flow.q === 0} onClick={flow.back}>Back</Button>
                <Button variant="ghost" size="sm" disabled={flow.working} onClick={() => { flow.skipAll(prompt); setPrompt(""); }}>Just build it</Button>
              </div>
              {flow.cur.multi ? <small className={w.muted}>Pick as many as you like, or type your own answer below.</small> : <small className={w.muted}>Pick one, or type your own answer below.</small>}
            </div>
          ) : null}
          {flow.stage === "review" ? <BriefReview flow={flow} busy={working} onApprove={(b) => void approve(b)} onStartOver={flow.reset} /> : null}
          {flow.working && flow.stage !== "review" ? <div className={w.botBubble} role="status"><span className={w.typing}>One moment…</span></div> : null}
          {flow.err ? <p className={w.error} role="alert">{flow.err}</p> : null}
        </>
      ) : null}

      {!isNew && detail ? (
        <>
          {detail.messages.length === 0 && !pending && groups.length === 0 ? (
            <div className={w.welcome}>
              <h2>{hasSite ? "Your site is ready to change." : "Describe the site you want."}</h2>
              <p className={w.muted}>{hasSite ? "Ask for a change in plain words. Every change is saved as a version you can go back to." : "Say what it is for, who it is for, and the pages you need."}</p>
            </div>
          ) : null}
          {detail.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className={w.user}>{m.text}</div>
            ) : m.role === "system" ? (
              <div key={m.id} className={w.sys}>{m.text}</div>
            ) : (
              <div key={m.id} className={w.botBubble}>
                <span className={w.meta}>
                  <span>{brand.engineName}</span>
                  {m.version ? <button type="button" className={w.chipBtn} onClick={() => { setViewVersion(m.version ?? null); setStageTab("preview"); setPane("preview"); }} title="Preview this version">v{m.version}</button> : null}
                  {m.units ? <span>{m.units.toLocaleString()} credits</span> : null}
                </span>
                <p>{m.text}</p>
              </div>
            ),
          )}
          {pending ? <div className={w.user}>{pending}</div> : null}
          {fixOffer && fixOffer.siteId === detail.site.id && !working ? (
            <div className={w.botBubble} data-testid="gap-offer">
              <strong>{fixOffer.n === 1 ? "1 thing you asked for isn't in the site yet." : `${fixOffer.n} things you asked for aren't in the site yet.`}</strong>
              <span className={w.muted}>Found by a text check of the finished files. One click adds them and leaves the rest alone.</span>
              <div className={w.row}><Button variant="primary" size="sm" onClick={() => void runGenerate(fixOffer.siteId, fixOffer.prompt, false, undefined, true)}>Add what&rsquo;s missing</Button><Button variant="ghost" size="sm" onClick={() => setFixOffer(null)}>Not now</Button></div>
            </div>
          ) : null}
          <Groups groups={groups} siteId={detail.site.id} onToggle={(id) => setGroups((g) => g.map((x) => (x.id === id ? { ...x, open: !x.open } : x)))} onShot={(id) => { setStageTab("library"); setFocusShot(id); setPane("preview"); }} />
        </>
      ) : null}
      {error && !flow.err ? <p className={w.error} role="alert">{error}</p> : null}
    </div>
  );

  const answerChips = flow.stage === "asking" && flow.cur && !flow.cur.textOnly ? null : null;
  void answerChips;

  return (
    <div className={w.root} data-testid="workspace">
      <div className={w.shell} data-pane={pane}>
        <Rail
          sites={sites}
          currentId={isNew ? null : current?.id ?? null}
          canCreate={sites.length < (config?.maxSites ?? 1)}
          busy={working}
          meter={meter}
          planLabel={config?.planLabel ?? ""}
          open={railOpen}
          onNew={newChat}
          onPick={(id) => void pick(id)}
          onClose={() => setRailOpen(false)}
          onDelete={del.ask}
        />
        <section className={w.center} aria-label="Conversation">
          <header className={w.centerTop}>
            <button type="button" className={w.menuBtn} onClick={() => setRailOpen(true)} aria-label="Open the project list">Projects</button>
            <span className={w.goal} title={goal || undefined}><small>Goal</small><strong>{goal || "Describe what you want to build"}</strong></span>
            <div className={w.paneSwitch}>
              <SegmentedControl label="Show" size="sm" value={pane} onValueChange={setPane} options={[{ value: "chat", label: "Chat" }, { value: "preview", label: "Preview" }]} />
            </div>
          </header>
          {cooldownUntil ? <Cooldown until={cooldownUntil} onDone={onCooldownDone} /> : null}
          {config?.breakerNotice ? <p className={w.notice} role="status">{config.breakerNotice}</p> : null}
          {config && !config.ready ? <p className={w.notice} role="status">The site builder isn&apos;t connected to its models yet. Templates still work.</p> : null}
          {thread}
          <form className={w.composer} onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {confirm ? (
              <div className={w.confirm} role="alertdialog" aria-label="Confirm cost">
                <span>This will use about <strong>{confirm.units.toLocaleString()} credits</strong>. Continue?</span>
                <div className={w.row}>
                  <Button variant="primary" size="sm" onClick={() => current && void runGenerate(current.id, confirm.prompt, true, confirm.brief)} disabled={working}>Yes, build it</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
            {remixed && detail?.site.id === remixed.siteId ? <p className={w.notice} role="status" data-testid="remix-hint">Remixed from the “{remixed.title}” template. It is a copy in your workspace: none of the original owner&apos;s messages, orders or members came with it. Describe what to change below.</p> : null}
            <label htmlFor="ws-prompt" className="visually-hidden">{isNew ? "Describe what to build" : "Describe a change"}</label>
            <textarea
              id="ws-prompt"
              className={w.prompt}
              rows={2}
              maxLength={config?.limits.promptChars}
              value={prompt}
              disabled={composerLocked}
              placeholder={placeholder}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className={w.composerRow}>
              <span className={w.estimate} aria-live="polite">{shownEstimate ? (shownEstimate.free ? `Free · ${shownEstimate.modelLabel} · text only` : `About ${shownEstimate.units.toLocaleString()} credits · ${shownEstimate.modelLabel}`) : config?.textOnly ? "Free plan: text-only, free models" : ""}</span>
              <label className={w.auto} title="After each build, open the site in a real browser, check three screen sizes, and fix what breaks"><input type="checkbox" checked={autoTest} onChange={(e) => { setAutoTest(e.target.checked); try { localStorage.setItem(AUTOTEST_KEY, e.target.checked ? "1" : "0"); } catch { /* storage unavailable */ } }} /> Test after build</label>
              {!isNew ? <Button variant="ghost" size="sm" disabled={working || !hasSite || (current?.headVersion ?? 0) < 2} onClick={() => void restore("undo")} title="Go back to the version before this one">Undo</Button> : null}
              <Button variant="primary" size="sm" type="submit" loading={working} disabled={composerLocked || prompt.trim().length < 3}>{working ? "Working…" : isNew ? (flow.stage === "asking" ? "Answer" : "Start") : hasSite ? "Update" : "Build"}</Button>
            </div>
          </form>
        </section>
        <StagePanel
          tab={stageTab}
          onTab={setStageTab}
          siteId={detail?.site.id}
          name={detail?.site.name ?? "Preview"}
          hasSite={hasSite}
          previewSrc={isNew ? null : previewSrc}
          fx={Boolean(detail?.site.fx?.enabled)}
          device={device}
          onDevice={setDevice}
          pages={detail?.pages ?? []}
          page={page}
          onPage={setPage}
          building={building}
          shots={isNew ? [] : shots}
          qa={isNew ? null : qa}
          testing={testing}
          browserNote={browserNote}
          onTest={() => detail && void runTest(detail.site.id, true)}
          onChat={() => setPane("chat")}
          viewing={viewVersion}
          headVersion={detail?.site.headVersion ?? 0}
          exportHref={hasSite && detail ? `/api/sites/${detail.site.id}/export` : null}
          more={morePane}
          leadCount={detail?.site.leadCount ?? 0}
          focusShot={focusShot}
          onFocusShot={setFocusShot}
        />
      </div>
      <DeleteSiteDialog
        target={del.target}
        busy={del.busy}
        error={del.error}
        blockedReason={del.target && working && del.target.id === current?.id ? "A build or test is still running for this site. Wait for it to finish, then delete it." : null}
        onCancel={del.cancel}
        onConfirm={() => void del.confirm()}
      />
      <SiteUndo toast={del.toast} notice={del.notice} onUndo={(id) => void del.undo(id)} />
    </div>
  );
}

function TypeThumb({ name, pages }: { name: string; pages: string[] }) {
  return (
    <span className={w.thumb} aria-hidden="true">
      <span className={w.thumbName}>{name}</span>
      <span className={w.thumbPages}>{pages.slice(0, 4).map((p) => <span key={p}>{p.replace(/\.html$/, "")}</span>)}</span>
    </span>
  );
}

/* ── panes ── */

function CodePane({ detail }: { detail: Detail }) {
  const names = Object.keys(detail.files).sort((a, c) => (a === "index.html" ? -1 : c === "index.html" ? 1 : a.localeCompare(c)));
  const [file, setFile] = useState(names[0] ?? "index.html");
  const active = detail.files[file] !== undefined ? file : names[0];
  const [copied, setCopied] = useState(false);
  if (!names.length) return <div className={b.pane}><p className={s.muted}>No files yet.</p></div>;
  return (
    <div className={b.pane}>
      <div className={b.row}>
        <div className={b.files} role="tablist" aria-label="Files">
          {names.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={active === n} className={b.chip} style={active === n ? { borderColor: "var(--c-ink)", color: "var(--c-ink)" } : undefined} onClick={() => setFile(n)}>{n}</button>
          ))}
        </div>
        <span className={b.grow} />
        <Button variant="ghost" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(detail.files[active] ?? ""); } catch { /* clipboard may be blocked */ } setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "Copied" : "Copy"}</Button>
        <a className={s.iconBtn} href={`/api/sites/${detail.site.id}/export`}>Download ZIP</a>
      </div>
      <pre className={b.code} tabIndex={0} aria-label={`Source of ${active}`}><code>{detail.files[active]}</code></pre>
      <p className={b.hint}>This is the exact, sanitized code of version {detail.site.headVersion}. Plain HTML and CSS: you can host it anywhere. Change it by chatting.</p>
    </div>
  );
}

function SeoPane({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const [seo, setSeo] = useState<Seo>(detail.site.seo);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await api(`/api/sites/${detail.site.id}`, { method: "PATCH", body: JSON.stringify({ seo }) });
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }
  const setPage = (p: string, k: "title" | "description", v: string) => setSeo((x) => ({ ...x, pages: { ...x.pages, [p]: { ...x.pages[p], [k]: v } } }));
  return (
    <div className={b.pane}>
      <div className={b.card}>
        <label className={b.field}><span>Site title</span><input className={s.input} maxLength={120} value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} /></label>
        <label className={b.field}><span>Description (shown in search results)</span><textarea className={s.textarea} rows={3} maxLength={300} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} /><span className={b.hint}>{seo.description.length}/300 · aim for 120–160</span></label>
        <label className={b.field}><span>Link preview image (https URL)</span><input className={s.input} inputMode="url" placeholder="https://…/preview.png" value={seo.ogImage} onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></label>
        <label className={b.row}><input type="checkbox" checked={seo.indexable} onChange={(e) => setSeo({ ...seo, indexable: e.target.checked })} /> <span>Let search engines index this site once it is published</span></label>
      </div>
      <div className={b.card}>
        <strong>Per-page titles and descriptions</strong>
        {detail.pages.map((p) => (
          <div key={p} className={b.field}>
            <span>{p}</span>
            <input className={s.input} aria-label={`${p} title`} maxLength={120} placeholder="Title (blank = use the page's own)" value={seo.pages[p]?.title ?? ""} onChange={(e) => setPage(p, "title", e.target.value)} />
            <input className={s.input} aria-label={`${p} description`} maxLength={300} placeholder="Description" value={seo.pages[p]?.description ?? ""} onChange={(e) => setPage(p, "description", e.target.value)} />
          </div>
        ))}
      </div>
      <div className={b.row}>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save SEO"}</Button>
        {msg ? <span role="status">{msg}</span> : null}
        {err ? <span className={s.error} role="alert">{err}</span> : null}
      </div>
    </div>
  );
}

function LeadsPane({ site }: { site: SiteSummary }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    api<{ leads: Lead[] }>(`/api/sites/${site.id}/leads`).then((r) => on && setLeads(r.leads)).catch((e) => on && setErr(e.message));
    return () => { on = false; };
  }, [site.id, site.leadCount]);
  return (
    <div className={b.pane}>
      <p className={s.muted}>Messages from the forms on your published site land here. Forms in the preview never send anything.</p>
      {err ? <p className={s.error} role="alert">{err}</p> : null}
      {leads === null ? <p className={s.muted}>Loading…</p> : leads.length === 0 ? <p className={s.muted}>No messages yet.</p> : (
        <>
          <div className={b.row}><a className={s.iconBtn} href={`/api/sites/${site.id}/leads?format=csv`}>Download CSV</a></div>
          <table className={b.table}>
            <thead><tr><th>Received</th><th>Page</th><th>Message</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{fmtWhen(l.createdAt)}</td>
                  <td>{l.page}</td>
                  <td>{Object.entries(l.fields).map(([k, v]) => <div key={k}><strong>{k}:</strong> {v}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function VersionsPane({ detail, onRestore, onView }: { detail: Detail; onRestore: (n: number) => void; onView: (n: number) => void }) {
  const [cmp, setCmp] = useState<number | null>(null);
  return (
    <div className={b.pane}>
      <p className={s.muted}>Every change is a version. Restoring one makes a new version from it, so nothing is lost.</p>
      {cmp !== null ? <ComparePane siteId={detail.site.id} versions={detail.versions} head={detail.site.headVersion} initialFrom={cmp} onClose={() => setCmp(null)} /> : null}
      <ul className={b.list}>
        {detail.versions.map((v) => (
          <li key={v.n} className={`${b.item} ${v.n === detail.site.headVersion ? b.current : ""}`}>
            <div className={b.itemMain}>
              <strong>v{v.n}{v.n === detail.site.headVersion ? " · current" : ""}{v.n === detail.site.publishedVersion ? " · live" : ""}</strong>
              <small>{v.summary || v.kind} · {v.pages} page{v.pages === 1 ? "" : "s"} · {fmtWhen(v.createdAt)}{v.units ? ` · ${v.units} credits` : ""}{v.lint ? ` · ${v.lint.errors === 0 ? "checks passed" : `${v.lint.errors} issue${v.lint.errors === 1 ? "" : "s"} left`}` : ""}</small>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onView(v.n)}>Preview</Button>
            {v.n !== detail.site.headVersion ? <Button variant="ghost" size="sm" onClick={() => setCmp(v.n)}>Compare</Button> : null}
            {v.n !== detail.site.headVersion ? <Button variant="ghost" size="sm" onClick={() => onRestore(v.n)}>Restore</Button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PublishPane({ detail, verified, onChanged, onDelete }: { detail: Detail; verified: boolean; onChanged: () => void; onDelete: () => void }) {
  const site = detail.site;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [findings, setFindings] = useState<string[]>([]);
  const [slug, setSlug] = useState(site.slug);
  const [name, setName] = useState(site.name);
  const live = site.publishedVersion !== null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/s/${site.slug}`;
  const stale = live && site.publishedVersion !== site.headVersion;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    setFindings([]);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      if (e instanceof ApiError && Array.isArray(e.data.findings)) setFindings(e.data.findings as string[]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={b.pane}>
      <div className={b.card}>
        <div className={b.row}>
          <strong>{live ? "Published" : "Not published"}</strong>
          {live ? <span className={b.chip + " " + b.chipStatic}>v{site.publishedVersion}</span> : null}
          {stale ? <span className={b.chip + " " + b.chipStatic}>Newer version v{site.headVersion} not live yet</span> : null}
          {site.needsReview ? <span className={b.chip + " " + b.chipStatic}>Queued for review</span> : null}
        </div>
        {live ? <p><a href={url} target="_blank" rel="noreferrer" className={s.address}>{url}</a></p> : <p className={s.muted}>Your site will be at <span className={s.address}>{url}</span></p>}
        {!verified ? <p className={s.error}>Verify your email address before publishing.</p> : null}
        <div className={b.row}>
          <Button variant="primary" size="sm" disabled={busy || !detail.site.headVersion || !verified} onClick={() => run(() => api(`/api/sites/${site.id}/publish`, { method: "POST" }))}>{live ? (stale ? "Publish latest" : "Publish again") : "Publish"}</Button>
          {live ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => api(`/api/sites/${site.id}/publish`, { method: "DELETE" }))}>Unpublish</Button> : null}
        </div>
        {err ? <p className={s.error} role="alert">{err}</p> : null}
        {findings.length ? <ul>{findings.map((f) => <li key={f}>{f}</li>)}</ul> : null}
        <p className={b.hint}>Published pages are checked for phishing and malware patterns first, contain no scripts, and carry a “Report abuse” link.</p>
      </div>
      <div className={b.card}>
        <label className={b.field}><span>Site name</span><input spellCheck={false} className={s.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className={b.field}><span>Address</span><span className={b.row}><span className={s.address}>{origin}/s/</span><input className={s.input} value={slug} maxLength={40} disabled={live} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label="Address" /></span>{live ? <span className={b.hint}>Unpublish to change the address.</span> : null}</label>
        <div className={b.row}><Button variant="secondary" size="sm" disabled={busy || (slug === site.slug && name === site.name)} onClick={() => run(() => api(`/api/sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ name, slug }) }))}>Save</Button></div>
      </div>
      <div className={b.card}>
        <strong>Custom domain</strong>
        <DomainPanel siteId={site.id} />
      </div>
      <div className={b.card}>
        <strong>Images and video</strong>
        <p className={s.muted}>Image generation and editing, a gallery and video are coming next. Nothing is generated or charged for them today.</p>
      </div>
      <div className={b.card}>
        <strong>Delete this site</strong>
        <p className={s.muted}>Removes the draft, every version, the published page, uploaded images, the custom domain connection and form messages. You&apos;ll see exactly what before you confirm, and get a few seconds to undo.</p>
        <div className={b.row}><Button variant="danger" size="sm" disabled={busy} aria-haspopup="dialog" onClick={onDelete}>Delete site…</Button></div>
      </div>
    </div>
  );
}
