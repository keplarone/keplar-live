"use client";
/**
 * Create: images. Prompt -> estimate + confirm -> a real backend job -> image saved to your library.
 * Every state shown here comes from the job's status on the server (UNDERSTANDING -> GENERATING -> READY | FAILED):
 * no simulated progress and no percentages. Costs are credits, never dollars.
 */
import Link from "next/link";
import { ReferencePicker, type RefItem, type RefLimits } from "./video/ReferencePicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lightbox } from "../app-ui/Lightbox";
import { SlashCommandMenu } from "../app-ui/SlashCommandMenu";
import {
  activeSlashToken,
  expandPromptIfSlash,
  expandSlashCommand,
  filterSlashCommands,
  type SlashCommand,
} from "@/lib/images/slash-commands";
import { TwoTone } from "@/components/page/TwoTone";
import s from "./create.module.css";
import b from "./images.module.css";

type Status = "understanding" | "generating" | "ready" | "failed";
type Job = {
  id: string; rootId: string; parentId: string | null; version: number; prompt: string; size: string; quality: string; status: Status;
  estimateUnits: number; units: number | null; error: string | null; errorCode: string | null; url: string | null; bytes: number;
  usedIn: { siteId: string; siteName: string; page: string }[]; createdAt: string; startedAt: string | null; finishedAt: string | null;
};
type Config = {
  available: boolean; configured?: boolean; message?: string; plan: string;
  sizes?: { id: string; label: string }[]; qualities?: { id: string; label: string; note: string }[];
  defaults?: { size: string; quality: string }; estimates?: Record<string, Record<string, number>>;
  limits?: { promptChars: number; perDay: number | null; highPerDay?: number | null; concurrent: number; storedImages: number };
  paused?: boolean; notice?: string | null;
  provider?: "higgsfield" | "openai" | null;
  models?: { id: string; label: string; provider: string; note: string; available: boolean; default: boolean; supports: { seed: boolean; negativePrompt: boolean; references: boolean }; estimates: Record<string, Record<string, number>> }[];
  references?: { available: boolean; types: string[]; maxBytes: number; maxImages: number; model: string; estimateUnits: number; rightsNote: string };
};
type Listing = { config: Config; usage?: { today: number; highToday?: number; stored: number; running: number }; meter?: { cooldown: { until: string; message: string } | null }; images: Job[] };
type SiteLite = { id: string; name: string; headVersion: number };

const SIZE_LABEL: Record<string, string> = { "1536x1024": "1536 × 1024", "1024x1024": "1024 × 1024", "1024x1536": "1024 × 1536" };
const fmtBytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

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

const active = (j: Job) => j.status === "understanding" || j.status === "generating";
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);
const fmtSecs = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const STEPS: { id: Status; label: string }[] = [
  { id: "understanding", label: "Checking your prompt" },
  { id: "generating", label: "Creating the image" },
  { id: "ready", label: "Ready" },
];

function JobState({ job, onRetry, onEdit }: { job: Job; onRetry: () => void; onEdit: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const live = active(job);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  if (job.status === "failed") {
    return (
      <div className={b.state} role="alert">
        <strong>That didn&apos;t work</strong>
        <p className={b.error}>{job.error ?? "Something went wrong. Nothing was charged."}</p>
        <div className={b.btnRow}>
          {job.errorCode === "refused" ? null : <button type="button" className={s.btn} onClick={onRetry}>Try again</button>}
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onEdit}>Edit the prompt</button>
        </div>
      </div>
    );
  }
  const idx = job.status === "understanding" ? 0 : 1;
  return (
    <div className={b.state} role="status" aria-live="polite">
      <ul className={b.steps}>
        {STEPS.map((st, i) => (
          <li key={st.id} data-on={i === idx} data-done={i < idx}>
            <span className={b.dot} aria-hidden="true" />
            {st.label}
          </li>
        ))}
      </ul>
      <span className={b.hint}>
        Started <span className={b.clock}>{fmtSecs(now - Date.parse(job.createdAt))}</span> ago. This usually takes under a minute. You can leave this page; the image will be in your library.
      </span>
    </div>
  );
}

export function ImageStudio({ onUsedInSite }: { onUsedInSite?: () => void }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("/");
  const [slashActive, setSlashActive] = useState(0);
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(null);
  const slashItems = useMemo(() => (slashOpen ? filterSlashCommands(slashQuery) : []), [slashOpen, slashQuery]);
  const slashListId = "img-studio-slash";
  const [size, setSize] = useState("1536x1024");
  const [quality, setQuality] = useState("high");
  const [regenOf, setRegenOf] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [seed, setSeed] = useState("");
  const [negative, setNegative] = useState("");
  const [count, setCount] = useState(1);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [rights, setRights] = useState(false);
  const [confirm, setConfirm] = useState<{ units: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [histFor, setHistFor] = useState<{ id: string; rows: Job[] } | null>(null);
  const [useOpen, setUseOpen] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [useSite, setUseSite] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [usePage, setUsePage] = useState("index.html");
  const [placement, setPlacement] = useState("top");
  const [useMsg, setUseMsg] = useState<string | null>(null);
  const [useBusy, setUseBusy] = useState(false);
  const keyRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** On a phone the result sits under the form: bring it into view when something starts or is picked. */
  const showStage = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth > 900) return;
    setTimeout(() => stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  const config = listing?.config;
  const images = useMemo(() => listing?.images ?? [], [listing]);
  const job = images.find((j) => j.id === selected) ?? null;

  const refresh = useCallback(async () => {
    const r = await api<Listing>("/api/images");
    setListing(r);
    return r;
  }, []);

  useEffect(() => {
    let on = true;
    api<Listing>("/api/images")
      .then((r) => {
        if (!on) return;
        setListing(r);
        try {
          const p = JSON.parse(localStorage.getItem("keplar.image.prefs.v1") ?? "{}") as { model?: string; size?: string; quality?: string; count?: number };
          if (p.model && r.config.models?.some((m) => m.id === p.model && m.available)) setModel(p.model);
          if (p.size && r.config.sizes?.some((x) => x.id === p.size)) setSize(p.size);
          if (p.quality && r.config.qualities?.some((x) => x.id === p.quality)) setQuality(p.quality);
          if (p.count) setCount(Math.min(p.count, r.config.limits?.concurrent ?? 1));
        } catch { /* no saved choices */ }
        const running = r.images.find(active);
        if (running) setSelected(running.id);
      })
      .catch((e) => on && setError(e instanceof ApiError && e.status === 401 ? "Sign in to create images." : e instanceof Error ? e.message : "Couldn't load images."))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, []);

  // Poll the backend for jobs that are still running. State only ever comes from the server.
  const runningIds = images.filter(active).map((j) => j.id).join(",");
  useEffect(() => {
    if (!runningIds) return;
    let stop = false;
    const tick = async () => {
      try {
        const updates = await Promise.all(runningIds.split(",").map((id) => api<{ job: Job }>(`/api/images/${id}`).then((r) => r.job)));
        if (stop) return;
        setOffline(false);
        setListing((l) => (l ? { ...l, images: l.images.map((j) => updates.find((u) => u.id === j.id) ?? j) } : l));
        if (updates.some((u) => !active(u))) void refresh().catch(() => undefined);
      } catch {
        if (!stop) setOffline(true);
      }
    };
    const t = setInterval(tick, 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [runningIds, refresh]);

  useEffect(() => {
    if (!job || job.status !== "ready") return;
    const id = job.id;
    let on = true;
    api<{ history: Job[] }>(`/api/images/${id}`).then((r) => on && setHistFor({ id, rows: r.history })).catch(() => undefined);
    return () => {
      on = false;
    };
  }, [job?.id, job?.status, images.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const history = histFor && job && histFor.id === job.id ? histFor.rows : [];
  const readyRefs = refs.filter((r) => r.status === "ready" && r.ref);
  const modelCfg = config?.models?.find((m) => m.id === (model || config.models?.find((x) => x.default)?.id));
  const estUnits = readyRefs.length && config?.references ? config.references.estimateUnits : (modelCfg?.estimates?.[quality]?.[size] ?? config?.estimates?.[quality]?.[size] ?? null);
  const remember = (p: Record<string, unknown>) => { try { localStorage.setItem("keplar.image.prefs.v1", JSON.stringify({ model, size, quality, count, ...p })); } catch { /* private mode */ } };
  const maxCount = Math.max(1, config?.limits?.concurrent ?? 1);
  const cooldown = listing?.meter?.cooldown ?? null;
  const dayLeft = config?.limits?.perDay != null && listing?.usage ? Math.max(0, config.limits.perDay - listing.usage.today) : null;
  const busyNow = (listing?.usage?.running ?? 0) >= (config?.limits?.concurrent ?? 1) || images.some(active);

  const syncSlash = (value: string, caret: number) => {
    const tok = activeSlashToken(value, caret);
    if (!tok) { setSlashOpen(false); setSlashRange(null); return; }
    setSlashOpen(true);
    setSlashQuery(tok.query);
    setSlashRange({ start: tok.start, end: tok.end });
    setSlashActive(0);
  };

  const applySlash = (cmd: SlashCommand) => {
    const value = prompt;
    const range = slashRange ?? activeSlashToken(value, promptRef.current?.selectionStart ?? value.length);
    if (!range) return;
    const hasRef = refs.some((r) => r.status === "ready");
    const lineAfter = value.slice(range.end).split("\n")[0] ?? "";
    const subject = lineAfter.trim();
    const expanded = expandSlashCommand(cmd, subject, hasRef);
    const rest = value.slice(range.end + lineAfter.length);
    const next = `${value.slice(0, range.start)}${expanded}${rest}`;
    setPrompt(next);
    keyRef.current = null;
    setConfirm(null);
    setSlashOpen(false);
    setSlashRange(null);
    requestAnimationFrame(() => {
      const el = promptRef.current;
      if (!el) return;
      const pos = range.start + expanded.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  function openConfirm() {
    setError(null);
    const hasRef = refs.some((r) => r.status === "ready");
    const { prompt: expanded } = expandPromptIfSlash(prompt, { hasReference: hasRef });
    if (expanded !== prompt) {
      setPrompt(expanded);
      keyRef.current = null;
    }
    if (expanded.trim().length < 4) {
      setError("Describe the image you want (at least a few words).");
      return;
    }
    keyRef.current ??= newKey();
    if (readyRefs.length && !rights) { setError("Confirm that you have the rights to your reference."); return; }
    if (refs.some((r) => r.status === "uploading")) { setError("Wait for the reference to finish uploading."); return; }
    setConfirm({ units: estUnits ?? 0 });
  }

  async function submit() {
    if (!confirm || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const finalPrompt = expandPromptIfSlash(prompt, { hasReference: readyRefs.length > 0 }).prompt.trim();
      const extra = {
        ...(model ? { model } : {}), ...(seed.trim() && modelCfg?.supports.seed ? { seed: Number(seed) } : {}), ...(negative.trim() && modelCfg?.supports.negativePrompt ? { negativePrompt: negative.trim() } : {}),
        ...(readyRefs.length ? { references: readyRefs.map((x) => x.ref), rightsConfirmed: rights } : {}),
      };
      let r = await api<{ job: Job }>("/api/images", {
        method: "POST",
        body: JSON.stringify({ prompt: finalPrompt, size, quality, regenerateOf: regenOf ?? undefined, idempotencyKey: keyRef.current ?? newKey(), confirmUnits: confirm.units, ...extra }),
      });
      // More than one output: each is its own job with its own idempotency key and the same approved price.
      for (let n = 1; n < count; n++) {
        r = await api<{ job: Job }>("/api/images", { method: "POST", body: JSON.stringify({ prompt: finalPrompt, size, quality, idempotencyKey: newKey(), confirmUnits: confirm.units, ...extra }) });
        setListing((l) => (l ? { ...l, images: [r.job, ...l.images.filter((j) => j.id !== r.job.id)] } : l));
      }
      setConfirm(null);
      keyRef.current = null;
      setRegenOf(null);
      setSelected(r.job.id);
      showStage();
      setListing((l) => (l ? { ...l, images: [r.job, ...l.images.filter((j) => j.id !== r.job.id)] } : l));
    } catch (e) {
      if (e instanceof ApiError && e.data.code === "confirm") {
        const est = (e.data.estimate as { units?: number } | undefined)?.units;
        if (typeof est === "number") setConfirm({ units: est }); // the price changed: show the new one before going on
        else setConfirm(null);
        setError(e.message);
      } else {
        setConfirm(null);
        setError(e instanceof Error ? e.message : "Couldn't start the image.");
        if (e instanceof ApiError && e.status === 402) keyRef.current = null;
      }
    } finally {
      setSubmitting(false);
    }
  }

  function loadIntoForm(j: Job, regenerate: boolean) {
    setPrompt(j.prompt);
    setSize(j.size);
    setQuality(j.quality);
    setRegenOf(regenerate ? j.id : null);
    keyRef.current = null;
    setConfirm(null);
    setError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(j: Job, force = false) {
    try {
      await api(`/api/images/${j.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
      if (selected === j.id) setSelected(null);
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.data.code === "in_use" && window.confirm(`${e.message} Delete anyway?`)) return remove(j, true);
      setError(e instanceof Error ? e.message : "Couldn't delete.");
    }
  }

  async function openUse() {
    setUseOpen(true);
    setUseMsg(null);
    try {
      const r = await api<{ sites: SiteLite[] }>("/api/sites");
      const usable = r.sites.filter((x) => x.headVersion > 0);
      setSites(usable);
      if (usable[0]) await pickSite(usable[0].id);
    } catch (e) {
      setUseMsg(e instanceof Error ? e.message : "Couldn't load your sites.");
    }
  }
  async function pickSite(id: string) {
    setUseSite(id);
    setPages([]);
    try {
      const d = await api<{ pages: string[] }>(`/api/sites/${id}`);
      setPages(d.pages);
      setUsePage(d.pages[0] ?? "index.html");
    } catch {
      setUseMsg("Couldn't load that site's pages.");
    }
  }
  async function doUse(j: Job) {
    setUseBusy(true);
    setUseMsg(null);
    try {
      const r = await api<{ version: number; page: string }>(`/api/images/${j.id}/use`, { method: "POST", body: JSON.stringify({ siteId: useSite, page: usePage, placement, alt: j.prompt.slice(0, 120) }) });
      setUseMsg(`Added to ${r.page} (site version ${r.version}). You can undo it from the site's History.`);
      onUsedInSite?.();
      await refresh();
    } catch (e) {
      setUseMsg(e instanceof Error ? e.message : "Couldn't add the image.");
    } finally {
      setUseBusy(false);
    }
  }

  if (loading) return <div className={b.root}><p className={s.muted}>Loading…</p></div>;
  if (!listing || !config) return <div className={b.root}><p className={b.error} role="alert">{error ?? "Couldn't load images."}</p></div>;

  if (!config.available) {
    return (
      <div className={b.root}>
        <div className={`${b.panel} ${b.locked}`}>
          <h2 className={b.h1}><TwoTone text="Create images" /></h2>
          <p className={s.muted}>{config.message}</p>
          <Link href="/pricing" className={s.btn}>See plans</Link>
        </div>
      </div>
    );
  }

  const disabled = !config.configured || Boolean(config.paused) || Boolean(cooldown);
  const submitLabel = regenOf ? "Regenerate" : "Create image";
  const siteReady = sites.length > 0;

  return (
    <div className={b.root}>
      <div className={b.head}>
        <h2 className={b.h1}><TwoTone text="Create images" /></h2>
        <p className={s.muted}>Describe an image. You see the cost first, and you are charged only if the image is created.</p>
      </div>
      {!config.configured ? <p className={b.banner} role="status">Image generation isn&apos;t connected yet (Not configured).</p> : null}
      {config.notice ? <p className={b.banner} role="status">{config.notice}</p> : null}
      {cooldown ? (
        <p className={b.banner} role="status"><strong>Keplar usage cooldown</strong> {cooldown.message} Resumes at {new Date(cooldown.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>
      ) : null}
      {offline ? <p className={b.banner} role="status">Connection lost. Retrying… your image keeps going on the server.</p> : null}

      <div className={b.grid}>
        <form ref={formRef} className={b.panel} onSubmit={(e) => { e.preventDefault(); openConfirm(); }} aria-label="New image">
          <label className={b.field}>
            <span>{regenOf ? "Regenerate (edit the prompt if you like)" : "Prompt"}</span>
            {slashOpen ? (
              <SlashCommandMenu
                id={slashListId}
                items={slashItems}
                active={slashActive}
                onActive={setSlashActive}
                onPick={applySlash}
              />
            ) : null}
            <textarea
              ref={promptRef}
              className={s.textarea}
              rows={5}
              maxLength={config.limits?.promptChars}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                keyRef.current = null;
                setConfirm(null);
                syncSlash(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyDown={(e) => {
                if (!slashOpen || !slashItems.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setSlashActive((i) => (i + 1) % slashItems.length); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSlashActive((i) => (i - 1 + slashItems.length) % slashItems.length); }
                else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) { e.preventDefault(); applySlash(slashItems[Math.min(slashActive, slashItems.length - 1)]!); }
                else if (e.key === "Escape") { e.preventDefault(); setSlashOpen(false); }
              }}
              aria-autocomplete={slashOpen ? "list" : undefined}
              aria-controls={slashOpen ? slashListId : undefined}
              aria-expanded={slashOpen || undefined}
              aria-activedescendant={slashOpen && slashItems[slashActive] ? `${slashListId}-opt-${slashItems[slashActive]!.id}` : undefined}
              placeholder="A warm, sunlit bakery counter… or type / for commands like /BTS"
            />
            <span className={b.hint}>Type / for slash commands (/BTS, /Adcreative, /Explodeview, …).</span>
          </label>
          <div className={b.field}>
            <span id="img-size">Shape</span>
            <div className={b.seg} role="group" aria-labelledby="img-size">
              {config.sizes?.map((x) => (
                <button key={x.id} type="button" className={b.segBtn} aria-pressed={size === x.id} onClick={() => { setSize(x.id); remember({ size: x.id }); keyRef.current = null; setConfirm(null); }}>{x.label}</button>
              ))}
            </div>
          </div>
          <div className={b.field}>
            <span id="img-quality">Quality</span>
            <div className={b.seg} role="group" aria-labelledby="img-quality">
              {config.qualities?.map((x) => (
                <button key={x.id} type="button" className={b.segBtn} aria-pressed={quality === x.id} onClick={() => { setQuality(x.id); remember({ quality: x.id }); keyRef.current = null; setConfirm(null); }}>{x.label}</button>
              ))}
            </div>
            <span className={b.hint}>{config.qualities?.find((x) => x.id === quality)?.note}</span>
          </div>
          {config.models && config.models.length > 1 ? (
            <label className={b.field}>
              <span>Model</span>
              <select className={s.select} value={model || modelCfg?.id || ""} disabled={Boolean(readyRefs.length)} onChange={(e) => { setModel(e.target.value); remember({ model: e.target.value }); keyRef.current = null; setConfirm(null); }}>
                {config.models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.default ? " (default)" : ""}{m.available ? "" : " · not configured"}</option>)}
              </select>
              <span className={b.hint}>{readyRefs.length ? `With a reference, Keplar uses ${config.references?.model ?? "an edit model"}.` : modelCfg?.note}</span>
            </label>
          ) : null}
          {modelCfg?.supports.seed && !readyRefs.length ? (
            <label className={b.field}><span>Seed <em className={b.hint}>optional</em></span>
              <input className={s.input} inputMode="numeric" value={seed} onChange={(e) => { setSeed(e.target.value.replace(/\D/g, "").slice(0, 10)); keyRef.current = null; setConfirm(null); }} placeholder="Same seed, similar result" />
            </label>
          ) : null}
          {modelCfg?.supports.negativePrompt && !readyRefs.length ? (
            <label className={b.field}><span>Avoid <em className={b.hint}>optional</em></span>
              <input className={s.input} maxLength={500} value={negative} onChange={(e) => { setNegative(e.target.value); keyRef.current = null; setConfirm(null); }} placeholder="blurry, text overlays" />
            </label>
          ) : null}
          {maxCount > 1 ? (
            <label className={b.field}><span>Outputs</span>
              <select className={s.select} value={count} onChange={(e) => { setCount(Number(e.target.value)); remember({ count: Number(e.target.value) }); keyRef.current = null; setConfirm(null); }}>
                {Array.from({ length: maxCount }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ) : null}
          {config.references ? (
            config.references.available ? (
              <ReferencePicker
                limits={{ image: { types: config.references.types, maxBytes: config.references.maxBytes, max: config.references.maxImages }, video: { types: [], maxBytes: 0, minSec: 0, maxSec: 0 }, inlineMaxBytes: 3_000_000, rightsNote: config.references.rightsNote } as RefLimits}
                accepts={{ image: true, video: false }}
                maxImages={config.references.maxImages}
                items={refs}
                onChange={(x) => { setRefs(x); keyRef.current = null; setConfirm(null); }}
                rights={rights}
                onRights={(r) => { setRights(r); keyRef.current = null; setConfirm(null); }}
                label="Reference image"
              />
            ) : <p className={b.hint}>Reference images need Higgsfield (Not configured).</p>
          ) : null}
          <p className={b.cost}>
            {estUnits ? <>Up to <strong>{(estUnits * count).toLocaleString()} credits</strong>{count > 1 ? ` for ${count} images` : ""}, only if {count > 1 ? "they are" : "the image is"} created.</> : null}
            {dayLeft !== null ? <> {dayLeft} of {config.limits?.perDay} images left today{quality === "high" && config.limits?.highPerDay != null ? <> ({Math.max(0, config.limits.highPerDay - (listing?.usage?.highToday ?? 0))} High quality)</> : null}.</> : null}
          </p>
          {confirm ? (
            <div className={b.confirm} role="alertdialog" aria-label="Confirm cost">
              <span>This will use up to <strong>{(confirm.units * count).toLocaleString()} credits</strong>{count > 1 ? ` for ${count} images` : ""}. Create {count > 1 ? "them" : "the image"}?</span>
              <div className={b.btnRow}>
                <button type="button" className={s.btn} onClick={() => void submit()} disabled={submitting}>{submitting ? "Starting…" : "Yes, create it"}</button>
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirm(null)} disabled={submitting}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className={b.btnRow}>
              <button type="submit" className={s.btn} disabled={disabled || busyNow || prompt.trim().length < 4}>{busyNow ? "An image is being created…" : submitLabel}</button>
              {regenOf ? <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setRegenOf(null); keyRef.current = null; }}>Cancel regenerate</button> : null}
            </div>
          )}
          {error ? <p className={b.error} role="alert">{error}</p> : null}
          <span className={b.hint}>
            {listing.usage ? `${listing.usage.stored} of ${config.limits?.storedImages} saved images. ` : ""}No real people, no explicit or violent content, nothing that imitates a brand&apos;s login or payment page.
          </span>
        </form>

        <div className={b.stage} ref={stageRef}>
          {job ? (
            <section className={b.viewer} aria-label="Selected image">
              {job.status === "ready" && job.url ? (
                <>
                  <button type="button" className={b.frame} onClick={() => setViewer(true)} aria-label="View full size" title="Click to view full size" style={{ cursor: "zoom-in", border: 0, padding: 0, background: "none" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route, not optimizable */}
                    <img src={job.url} alt={job.prompt} />
                  </button>
                  {viewer ? <Lightbox src={job.url} alt={job.prompt} caption={`v${job.version} · ${SIZE_LABEL[job.size] ?? job.size} · ${job.quality}`} downloadHref={`${job.url}?download=1`} onClose={() => setViewer(false)} /> : null}
                  <p className={b.prompt}>{job.prompt}</p>
                  <span className={b.hint}>Version {job.version} · {job.units ?? 0} credits · {fmtBytes(job.bytes)} · original file, not re-compressed</span>
                  <div className={b.btnRow}>
                    <a className={s.btn} href={`${job.url}?download=1`} download>Download original</a>
                    <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => loadIntoForm(job, true)}>Regenerate</button>
                    <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => (useOpen ? setUseOpen(false) : void openUse())}>Use in my site</button>
                    <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void remove(job)}>Delete</button>
                  </div>
                  {useOpen ? (
                    <div className={b.use}>
                      {!siteReady ? (
                        <p className={s.muted}>{useMsg ?? "You don't have a built site yet. Build an app in Create first, then you can place images into a published page."}</p>
                      ) : (
                        <>
                          <label className={b.field}><span>Site</span><select className={s.select} value={useSite} onChange={(e) => void pickSite(e.target.value)}>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                          <label className={b.field}><span>Page</span><select className={s.select} value={usePage} onChange={(e) => setUsePage(e.target.value)}>{pages.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
                          <label className={b.field}><span>Where</span><select className={s.select} value={placement} onChange={(e) => setPlacement(e.target.value)}><option value="top">Under the main heading</option><option value="bottom">At the end of the page</option></select></label>
                          <div className={b.btnRow}>
                            <button type="button" className={s.btn} disabled={useBusy || !useSite} onClick={() => void doUse(job)}>{useBusy ? "Adding…" : "Add to page"}</button>
                          </div>
                          {useMsg ? <p className={useMsg.startsWith("Added") ? b.ok : b.error} role="status">{useMsg}</p> : null}
                          <span className={b.hint}>The image becomes viewable by anyone with a link to your published site. No credits are used.</span>
                        </>
                      )}
                    </div>
                  ) : null}
                  {history.length > 1 ? (
                    <div className={b.field}>
                      <span>History</span>
                      <ul className={b.hist}>
                        {history.map((h) => (
                          <li key={h.id} aria-current={h.id === job.id}>
                            <button type="button" onClick={() => setSelected(h.id)}>v{h.version} · {h.status === "ready" ? "ready" : h.status === "failed" ? "failed" : "in progress"} · {h.prompt.slice(0, 60)}</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <JobState job={job} onRetry={() => { loadIntoForm(job, false); keyRef.current = newKey(); setConfirm({ units: config.estimates?.[job.quality]?.[job.size] ?? job.estimateUnits }); }} onEdit={() => loadIntoForm(job, false)} />
                  {job.status === "failed" ? <button type="button" className={`${s.btn} ${s.btnGhost}`} style={{ alignSelf: "flex-start" }} onClick={() => void remove(job)}>Remove</button> : null}
                </>
              )}
            </section>
          ) : (
            <section className={`${b.viewer} ${b.state}`}>
              <strong>{images.length ? "Pick an image, or create a new one." : "Your first image will appear here."}</strong>
              <span className={b.hint}>Images are saved to your library with every version you make.</span>
            </section>
          )}

          {images.length > 0 ? (
            <section aria-label="Your images" className={b.panel}>
              <span className={b.lbl}>Your images</span>
              <div className={b.gallery}>
                {images.map((j) => (
                  <button key={j.id} type="button" className={b.thumb} aria-current={j.id === selected} aria-label={`${j.status === "ready" ? "Image" : j.status === "failed" ? "Failed image" : "Image in progress"}: ${j.prompt}`} onClick={() => { setSelected(j.id); setUseOpen(false); setUseMsg(null); showStage(); }}>
                    {j.status === "ready" && j.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route, not optimizable
                      <img src={j.url} alt="" loading="lazy" />
                    ) : (
                      <span>{j.status === "failed" ? "Failed" : j.status === "understanding" ? "Checking" : "Creating"}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
