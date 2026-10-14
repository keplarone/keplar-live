"use client";
/**
 * Create in the chat (composer Create chip): the message is built into a working app by the same pipeline as the Create studio,
 * right where it was asked. Left: the build as it happens (plan -> files -> tests -> requested vs built -> design review). Right:
 * the live preview (Preview / Code, desktop / phone), then Publish and "Open in Create studio". Nothing here is a stand-in: every
 * step, check, verdict, file and URL comes from the build's own events and the saved app.
 *   Free plan: starts at once (free models, front-end only). Paid plans: one confirm step with the cost and the look.
 * Follow-ups work on an app already built, by name ("edit my BikeFix app to add a dark mode") or on the latest card ("publish it"):
 *   edit    -> an edit build of that app (same pipeline, same confirm step on paid plans)
 *   theme   -> PATCH /api/apps/[id]/theme (no model, no credits; the draft changes now, the live app on the next publish)
 *   publish / unpublish -> the owner confirms with one click (POST / DELETE /api/sites/[id]/publish)
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { applyEvent, emptyLive, runAppBuild, type BuildError, type Live } from "@/components/create/apps/build-client";
import type { Check, PublicSpec, Report, Verdict, Visual } from "@/components/create/apps/types";
import type { ChatCreate, KeplarMessage, Ledger, UserMessage } from "../state/types";
import { matchApp } from "../workspace/workspace-data";
import { DomainsPanel } from "./DomainsPanel";
import { colorPatch, currentColors, FONT_CHOICES, STYLE_COLORS } from "./look-edit";
import { ScaledViewport } from "@/components/create/ScaledViewport";
import s from "./create.module.css";
import { ActivityIndicator, Button, Progress, SegmentedControl, notify } from "@/components/kit";

type Props = {
  message: KeplarMessage;
  user?: UserMessage;
  ledger: Ledger;
  onPatch: (patch: Partial<ChatCreate>) => void;
  /** "Open in Create studio": the App tab opens this app (or a new one with this prompt). */
  onOpen: (target: { id?: string; prompt?: string }) => void;
  onSettled: () => void;
};

type Cfg = { plan: string; estimateUnits: number; maxUnits: number; limits: { backend: boolean; ai: boolean }; styles: { id: string; name: string; line: string }[] };
type Detail = { app: { id: string; name: string; spec: PublicSpec | null; report: Report | null; previewUrl: string | null; liveUrl: string | null; publishedVersion: number | null; headVersion: number; design?: { style?: string; mode?: "light" | "dark"; fonts?: string; palette?: { bg: string; accent: string } | null; paletteSource?: string } | null } };
type AppRow = { id: string; name: string; appName?: string };


async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { status: res.status });
  return data;
}

const STAGE_ORDER = ["plan", "generate", "verify", "visual", "fix", "save", "done"];

/** Cards started in this tab (StrictMode runs effects twice; a re-render must never start a second build). */
const started = new Set<string>();


export function CreateTurn({ message: m, user, ledger, onPatch, onOpen, onSettled }: Props) {
  const c = m.create!;
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [live, setLive] = useState<Live>(emptyLive());
  const [detail, setDetail] = useState<Detail["app"] | null>(null);
  const [look, setLook] = useState<{ style: string; mode: "auto" | "light" | "dark" }>({ style: "auto", mode: "auto" });
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [lookOpen, setLookOpen] = useState(c.op?.type === "theme");
  const [restyling, setRestyling] = useState(false);
  const [domainsOpen, setDomainsOpen] = useState(c.op?.type === "domain");
  /** The color picker's unsaved values (null: show the app's current colors). */
  const [colors, setColors] = useState<{ bg: string; accent: string } | null>(null);
  const patch = useRef(onPatch);
  const settled = useRef(onSettled);
  useEffect(() => { patch.current = onPatch; settled.current = onSettled; });
  const prompt = (c.prompt ?? user?.text ?? "").trim();
  const op = c.op;

  const start = async (body: Record<string, unknown>, appId?: string) => {
    let id = appId ?? c.appId;
    try {
      if (!id) {
        const made = await api<{ app: { id: string } }>("/api/apps", { method: "POST", body: JSON.stringify({ name: prompt.split(/[.,:\n]/)[0].slice(0, 50) || "New app" }) });
        id = made.app.id;
      }
      patch.current({ phase: "working", appId: id, error: undefined });
      setLive({ ...emptyLive(), stageText: "Starting" });
      const r = await runAppBuild(id, body, (ev) => {
        setLive((l) => applyEvent(l, ev));
        if (ev.type === "build") patch.current({ buildId: String(ev.id) });
        if (ev.type === "plan") patch.current({ name: (ev.spec as PublicSpec).name });
      });
      patch.current({ phase: "ready", previewUrl: r.previewUrl });
      const d = await api<Detail>(`/api/apps/${id}`).catch(() => null);
      if (d) setDetail(d.app);
      setFrameKey((k) => k + 1);
    } catch (e) {
      const ex = e as BuildError;
      if (ex.code === "confirm") patch.current({ phase: "confirm", appId: id, estimate: ex.estimate?.units });
      else patch.current({ phase: "failed", appId: id, error: ex.message });
    } finally {
      settled.current();
    }
  };

  const restyle = async (id: string, design: Record<string, unknown>) => {
    setRestyling(true);
    setErr("");
    try {
      await api(`/api/apps/${id}/theme`, { method: "PATCH", body: JSON.stringify({ design }) });
      const d = await api<Detail>(`/api/apps/${id}`).catch(() => null);
      if (d) { setDetail(d.app); patch.current({ name: d.app.spec?.name ?? d.app.name, previewUrl: d.app.previewUrl ?? undefined }); }
      setFrameKey((k) => k + 1);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setRestyling(false);
    }
  };

  /** A follow-up on an app already built (edit / theme / publish / unpublish), once we know which app. */
  const runOp = async (id: string) => {
    if (!op) return;
    if (op.type === "edit") {
      const { config } = await api<{ config: Cfg }>("/api/apps");
      setCfg(config);
      if (config.estimateUnits > 0) patch.current({ phase: "confirm", appId: id, estimate: config.estimateUnits, choices: undefined });
      else await start({ prompt: op.instruction, edit: true, confirm: true }, id);
      return;
    }
    if (op.type === "theme") {
      patch.current({ phase: "working", appId: id, choices: undefined });
      if (!cfg) api<{ config: Cfg }>("/api/apps").then(({ config }) => setCfg(config)).catch(() => undefined); // the style chips in the look panel
      const ok = await restyle(id, { ...(op.style ? { style: op.style } : {}), ...(op.mode ? { mode: op.mode } : {}) });
      patch.current(ok ? { phase: "ready" } : { phase: "failed", error: "The look couldn't be changed. Nothing was charged." });
      return;
    }
    // publish / unpublish: show the app with a one-click confirm; domain: show it with the domains panel open
    if (op.type === "domain") setDomainsOpen(true);
    patch.current({ phase: "ready", appId: id, choices: undefined });
  };

  // Kick off: signed out -> sign in; Free -> build now with a Keplar-picked look; paid -> confirm with the cost and the look.
  useEffect(() => {
    if (!ledger.synced) return;
    if (c.phase === "waiting" && op) {
      if (!ledger.signedIn) { patch.current({ phase: "signin" }); return; }
      if (started.has(m.id)) return;
      started.add(m.id);
      const resolve = c.appId
        ? Promise.resolve<{ id: string } | { choices: AppRow[] }>({ id: c.appId })
        : api<{ apps: AppRow[]; config?: Cfg }>("/api/apps").then(({ apps, config }) => { if (config) setCfg(config); return matchApp(apps, c.appName); });
      resolve
        .then((r) => {
          if ("id" in r) return runOp(r.id);
          patch.current(r.choices.length
            ? { phase: "choose", choices: r.choices.slice(0, 12).map((a) => ({ id: a.id, name: a.appName ?? a.name })) }
            : { phase: "failed", error: "You haven't built an app yet. Turn on Create (or type /create) and describe one." });
        })
        .catch((e: Error) => patch.current({ phase: "failed", error: e.message }))
        .finally(() => settled.current());
      return;
    }
    if (c.phase === "waiting") {
      if (!ledger.signedIn) { patch.current({ phase: "signin" }); return; }
      if (started.has(m.id)) return;
      started.add(m.id);
      api<{ config: Cfg }>("/api/apps")
        .then(({ config }) => {
          setCfg(config);
          if (config.estimateUnits > 0) patch.current({ phase: "confirm", estimate: config.estimateUnits });
          else void start({ prompt, design: { auto: true }, confirm: true });
        })
        .catch((e: Error) => patch.current({ phase: "failed", error: e.message }));
      return;
    }
    // A build that was running when the page went away picks up where the server left it.
    if (c.phase === "working" && !started.has(m.id)) {
      started.add(m.id);
      if (c.appId && c.buildId) void Promise.resolve().then(() => start({ buildId: c.buildId }, c.appId));
      // A look change has no build to resume: show the app as the server has it now (the change either saved or it didn't).
      else if (c.appId && op && op.type !== "edit") patch.current({ phase: "ready" });
      else patch.current({ phase: "failed", error: "The page closed before the build began. Try again." });
    }
    if (c.phase === "confirm" && !cfg) api<{ config: Cfg }>("/api/apps").then(({ config }) => setCfg(config)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.phase, ledger.synced, ledger.signedIn, m.id]);

  // A finished app shown again (reload, scrolling back): its report, preview and live address.
  useEffect(() => {
    if (c.phase !== "ready" || !c.appId || detail) return;
    let on = true;
    api<Detail>(`/api/apps/${c.appId}`).then((d) => { if (!on) return; setDetail(d.app); if (!c.name) patch.current({ name: d.app.spec?.name ?? d.app.name }); }).catch(() => undefined);
    return () => { on = false; };
  }, [c.phase, c.appId, c.name, detail]);

  const build = () => {
    if (op?.type === "edit") { void start({ prompt: op.instruction, edit: true, confirm: true }); return; }
    const design = look.style === "auto" ? { auto: true, ...(look.mode !== "auto" ? { mode: look.mode } : {}) } : { style: look.style, ...(look.mode !== "auto" ? { mode: look.mode } : {}) };
    void start({ prompt, design, confirm: true });
  };

  const unpublish = async () => {
    if (!c.appId) return;
    setPublishing(true);
    setErr("");
    try {
      await api(`/api/sites/${c.appId}/publish`, { method: "DELETE" });
      const d = await api<Detail>(`/api/apps/${c.appId}`);
      setDetail(d.app);
      patch.current({ liveUrl: undefined, ...(op?.type === "unpublish" ? { opDone: "done" as const } : {}) });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const openLook = () => {
    setLookOpen((v) => !v);
    if (!cfg) api<{ config: Cfg }>("/api/apps").then(({ config }) => setCfg(config)).catch(() => undefined);
  };

  const publish = async () => {
    if (!c.appId) return;
    setPublishing(true);
    setErr("");
    try {
      await api(`/api/sites/${c.appId}/publish`, { method: "POST" });
      if (op?.type === "publish") patch.current({ opDone: "done" });
      const d = await api<Detail>(`/api/apps/${c.appId}`);
      setDetail(d.app);
      if (d.app.liveUrl) {
        patch.current({ liveUrl: d.app.liveUrl });
        const url = d.app.liveUrl;
        notify({ title: "Published", description: url.replace(/^https?:\/\//, ""), tone: "success", action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") } });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (c.phase === "signin") {
    return (
      <section className={s.card} data-create="signin">
        <Head label="Create" busy={false} />
        <p className={s.note}>Sign in to build this. Keplar plans it, writes it, tests it in a real browser and gives you a live preview you can publish. Free accounts build front-end apps and sites; Plus and Pro add accounts, saved data and AI.</p>
        <div className={s.actions}><Link className={s.primary} href="/signin?next=/app">Sign in</Link><Link className={s.ghost} href="/signup?next=/app">Create a free account</Link></div>
      </section>
    );
  }

  if (c.phase === "waiting") {
    return <section className={s.card} data-create="waiting" aria-busy="true"><Head label={op ? "Finding your app…" : "Getting the builder ready…"} busy /></section>;
  }

  if (c.phase === "choose") {
    return (
      <section className={s.card} data-create="choose" aria-label="Which app?">
        <Head label="Which app?" busy={false} />
        <p className={s.note}>{c.appName ? `None of your apps is called “${c.appName}”.` : "You have more than one app."} Pick the one to {op?.type === "edit" ? "change" : op?.type === "theme" ? "restyle" : op?.type ?? "open"}:</p>
        <div className={s.lookRow}>
          {(c.choices ?? []).map((a) => (
            <button key={a.id} type="button" className={s.lookChip} onClick={() => { patch.current({ appId: a.id, name: a.name, choices: undefined }); void runOp(a.id).catch((e: Error) => patch.current({ phase: "failed", error: e.message })); }}>{a.name}</button>
          ))}
        </div>
      </section>
    );
  }

  if (c.phase === "confirm") {
    return (
      <section className={s.card} data-create="confirm" aria-label="Build this app">
        <Head label={op?.type === "edit" ? `Change ${c.name ?? "this app"}` : "Build this as an app"} busy={false} chip={c.estimate ? `about ${c.estimate.toLocaleString("en-US")} credits` : undefined} />
        {op?.type === "edit" ? <p className={s.note}>&ldquo;{op.instruction}&rdquo;: Keplar edits only the files this touches, tests the app again in a real browser and saves it as a new version. The live app changes when you publish.</p> : null}
        {op?.type === "edit" ? null : <>
        <p className={s.note}>Keplar plans the product, writes every file, tests each screen and flow in a real browser, fixes what fails and checks what you asked for against what was built.{cfg && !cfg.limits.ai ? " AI features need Plus or Pro." : ""}</p>
        <div className={s.lookRow} role="radiogroup" aria-label="Look">
          <button type="button" role="radio" aria-checked={look.style === "auto"} className={s.lookChip} onClick={() => setLook((l) => ({ ...l, style: "auto" }))} title="Keplar art-directs a look for this idea">Keplar picks</button>
          {(cfg?.styles ?? []).map((st) => (
            <button key={st.id} type="button" role="radio" aria-checked={look.style === st.id} className={s.lookChip} onClick={() => setLook((l) => ({ ...l, style: st.id }))} title={st.line}>{st.name}</button>
          ))}
        </div>
        <div className={s.lookRow} role="radiogroup" aria-label="Light or dark">
          {(["auto", "light", "dark"] as const).map((md) => (
            <button key={md} type="button" role="radio" aria-checked={look.mode === md} className={s.lookChip} onClick={() => setLook((l) => ({ ...l, mode: md }))}>{md === "auto" ? "Either" : md === "light" ? "Light" : "Dark"}</button>
          ))}
        </div>
        </>}
        <div className={s.actions}>
          <Button variant="primary" size="sm" onClick={build}>{op?.type === "edit" ? "Make the change" : "Build it"}</Button>
          {op?.type === "edit" ? <Button variant="secondary" size="sm" onClick={() => onOpen({ id: c.appId })}>Open in Create studio</Button> : <Button variant="secondary" size="sm" onClick={() => onOpen({ prompt })}>Pick colors and fonts in Create</Button>}
          <span className={s.meta}>Credits are charged for what the build uses, up to {cfg?.maxUnits?.toLocaleString("en-US") ?? "the plan cap"}.</span>
        </div>
      </section>
    );
  }

  const running = c.phase === "working";
  const report = detail?.report ?? null;
  const spec = live.spec ?? detail?.spec ?? null;
  const previewUrl = detail?.previewUrl ?? c.previewUrl ?? null;
  const liveUrl = detail?.liveUrl ?? c.liveUrl ?? null;
  const published = Boolean(detail?.publishedVersion && detail.publishedVersion === detail.headVersion) || Boolean(liveUrl && !detail);
  const name = spec?.name ?? c.name ?? "Your app";
  /** Files the plan lists: the only real count a running build has (no stage-weighted guesses). */
  const filesPlanned = live.spec?.files.length ?? 0;

  return (
    <section className={`${s.card} ${s.wide}`} data-create={c.phase} aria-label={`Create: ${name}`}>
      <div className={s.split}>
        <div className={s.left}>
          <Head label={running ? (op?.type === "edit" ? `Changing ${name}` : op?.type === "theme" ? `Restyling ${name}` : "Building the app") : c.phase === "failed" ? (op ? "That didn't work" : "The build stopped") : name} busy={running} chip={!running && op?.type === "edit" ? "Edited" : !running && op?.type === "theme" ? "New look" : !running && spec ? spec.kind : undefined} />
          {op?.type === "edit" ? <p className={s.meta}>&ldquo;{op.instruction}&rdquo;</p> : null}
          {op && op.type !== "edit" && detail ? (
            <p className={s.meta} data-app-status>
              {[detail.design?.style ? (cfg?.styles.find((x) => x.id === detail.design?.style)?.name ?? detail.design.style.charAt(0).toUpperCase() + detail.design.style.slice(1)) : null, detail.design?.mode === "light" ? "Light" : detail.design?.mode === "dark" ? "Dark" : null, published ? "Live" : detail.publishedVersion ? "Live, with unpublished changes" : "Draft", `v${detail.headVersion}`].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <Steps live={live} report={report} spec={spec} running={running} />
          {c.phase === "failed" ? <p className={s.note} role="alert">{c.error}</p> : null}
        </div>
        <div className={s.right}>
          <div className={s.paneBar}>
            <SegmentedControl label="Preview or code" size="sm" value={tab} onValueChange={setTab} options={[{ value: "preview", label: "Preview" }, { value: "code", label: "Code" }]} />
            <SegmentedControl label="Device" size="sm" value={device} onValueChange={setDevice} options={[{ value: "desktop", label: null, icon: <DesktopIcon />, ariaLabel: "Desktop" }, { value: "phone", label: null, icon: <PhoneIcon />, ariaLabel: "Phone" }]} />
            <span className={s.grow} />
            {running ? (
              <span className={s.progress} aria-live="polite">
                <span className={s.progressText}>{live.stageText || "Building preview"}</span>
                {filesPlanned > 0 ? <Progress className={s.bar} value={Math.min(live.files.length, filesPlanned)} max={filesPlanned} label="Files written" showLabel={false} /> : <ActivityIndicator label="" />}
              </span>
            ) : null}
            {running ? <Button variant="primary" size="sm" disabled title="Publish opens when the app passes its tests">Publish</Button> : null}
            {c.phase === "ready" ? (
              published ? (
                <>
                  <span className={s.pill}><i aria-hidden="true" />Published</span>
                  <Button variant="secondary" size="sm" onClick={() => void unpublish()} loading={publishing}>Unpublish</Button>
                </>
              ) : <Button variant="primary" size="sm" onClick={() => void publish()} loading={publishing}>{publishing ? "Publishing…" : detail?.publishedVersion ? "Publish changes" : "Publish"}</Button>
            ) : null}
          </div>
          {c.phase === "ready" && (op?.type === "publish" || op?.type === "unpublish") && !c.opDone && detail ? (
            (op.type === "publish" && published) || (op.type === "unpublish" && !detail.publishedVersion) ? (
              <p className={s.meta} role="status">{op.type === "publish" ? `${name} is already live with this version.` : `${name} isn't published.`}</p>
            ) : (
              <div className={s.confirm} role="group" aria-label={op.type === "publish" ? "Publish this app?" : "Unpublish this app?"}>
                <span>{op.type === "publish" ? (detail.publishedVersion ? `Put your latest changes to ${name} live? The current live version is v${detail.publishedVersion}.` : `Publish ${name} to the web? Anyone with the link can open it.`) : `Take ${name} offline? The link stops working until you publish again.`}</span>
                <Button variant="primary" size="sm" disabled={publishing} onClick={() => void (op.type === "publish" ? publish() : unpublish())}>{op.type === "publish" ? "Publish" : "Unpublish"}</Button>
                <Button variant="secondary" size="sm" disabled={publishing} onClick={() => patch.current({ opDone: "declined" })}>Not now</Button>
              </div>
            )
          ) : null}
          {c.phase === "ready" && c.opDone === "declined" ? <p className={s.meta}>Left as it was.</p> : null}
          {c.phase === "ready" && lookOpen ? (
            <div className={s.lookPanel} aria-label="Look" aria-busy={restyling || undefined}>
              <div className={s.lookRow} role="radiogroup" aria-label="Style">
                {(cfg?.styles ?? []).map((st) => (
                  <button key={st.id} type="button" role="radio" aria-checked={detail?.design?.style === st.id} className={s.lookChip} disabled={restyling} onClick={() => c.appId && void restyle(c.appId, { style: st.id })} title={st.line}>{st.name}</button>
                ))}
              </div>
              <div className={s.lookRow} role="radiogroup" aria-label="Light or dark">
                {(["light", "dark"] as const).map((md) => (
                  <button key={md} type="button" role="radio" aria-checked={detail?.design?.mode === md} className={s.lookChip} disabled={restyling} onClick={() => c.appId && void restyle(c.appId, { mode: md })}>{md === "light" ? "Light" : "Dark"}</button>
                ))}
              </div>
              <span className={s.lookLabel}>Fonts</span>
              <div className={`${s.lookRow} ${s.fontChips}`} role="radiogroup" aria-label="Fonts">
                {FONT_CHOICES.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={detail?.design?.fonts === f.id} className={s.lookChip} disabled={restyling} onClick={() => c.appId && void restyle(c.appId, { fonts: f.id })} title={f.title}>{f.label}</button>
                ))}
              </div>
              <span className={s.lookLabel}>Colors</span>
              {(() => {
                const cur = colors ?? currentColors(detail?.design ?? {});
                const change = colorPatch(detail?.design ?? {}, cur.bg, cur.accent);
                return (
                  <div className={s.colorRow}>
                    <label>Background <input type="color" className={s.swatch} value={cur.bg} disabled={restyling} onChange={(e) => setColors({ ...cur, bg: e.target.value })} /></label>
                    <label>Accent <input type="color" className={s.swatch} value={cur.accent} disabled={restyling} onChange={(e) => setColors({ ...cur, accent: e.target.value })} /></label>
                    <button type="button" className={s.lookChip} disabled={restyling || !change} onClick={() => c.appId && change && void restyle(c.appId, change).then((ok) => ok && setColors(null))} data-apply-colors="">Apply colors</button>
                    {detail?.design?.paletteSource === "picked" ? <button type="button" className={s.lookChip} disabled={restyling} onClick={() => c.appId && void restyle(c.appId, STYLE_COLORS).then((ok) => ok && setColors(null))}>Style&rsquo;s colors</button> : null}
                  </div>
                );
              })()}
              <span className={s.meta}>Changes the draft at once, free. Text colors adjust for contrast. The live app changes when you publish.</span>
            </div>
          ) : null}
          {c.phase === "ready" && domainsOpen && c.appId ? <DomainsPanel siteId={c.appId} name={name} initial={op?.type === "domain" ? op.hostname : undefined} /> : null}
          <div className={s.stage} data-device={device}>
            {tab === "code" ? (
              <CodeView previewUrl={previewUrl} files={live.files.length ? live.files.map((f) => f.path) : spec?.files ?? []} />
            ) : previewUrl && !running ? (
              <div className={s.browser}>
                <div className={s.chrome}><span className={s.dots} aria-hidden="true"><i /><i /><i /></span><span className={s.addr}>{(liveUrl ?? "Preview").replace(/^https?:\/\//, "")}</span></div>
                {(() => {
                  const frame = <iframe key={frameKey} className={s.frame} src={previewUrl} title={`${name} preview`} sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" />;
                  // Desktop is a real 1920x1080 viewport scaled to the card width (as on a 1080p monitor); phone keeps its 390px width.
                  return device === "desktop" ? <ScaledViewport fit="width">{frame}</ScaledViewport> : frame;
                })()}
              </div>
            ) : (
              <div className={s.placeholder} aria-hidden={running ? undefined : true}>
                <div className={s.skel}><i /><i /><i /><i /></div>
                <p className={s.meta}>{running ? "The preview opens as soon as the app passes its tests." : "No preview."}</p>
              </div>
            )}
          </div>
          {err ? <p className={s.note} role="alert">{err}</p> : null}
          <div className={s.actions}>
            {c.appId ? <Button variant="secondary" size="sm" onClick={() => onOpen({ id: c.appId })}>Open in Create studio</Button> : null}
            {c.phase === "ready" && c.appId ? <Button variant="secondary" size="sm" aria-expanded={lookOpen} onClick={openLook}>Change look</Button> : null}
            {c.phase === "ready" && c.appId ? <Button variant="secondary" size="sm" aria-expanded={domainsOpen} onClick={() => setDomainsOpen((v) => !v)}>Domains</Button> : null}
            {c.phase === "failed" && c.appId && op?.type !== "theme" ? <Button variant="secondary" size="sm" onClick={() => void start(c.buildId ? { buildId: c.buildId } : op?.type === "edit" ? { prompt: op.instruction, edit: true, confirm: true } : { prompt, design: { auto: true }, confirm: true })}>Try again</Button> : null}
            {liveUrl ? <a className={s.ghost} href={liveUrl} target="_blank" rel="noreferrer">Open live app</a> : null}
            {spec?.notBuilt?.length && !running ? <span className={s.meta}>Not built on this plan: {spec.notBuilt.slice(0, 2).join("; ")}.</span> : null}
            {c.phase === "ready" ? <span className={s.meta}>Say what to change (&ldquo;add a contact form&rdquo;) and Keplar edits this app.</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Head({ label, busy, chip }: { label: string; busy: boolean; chip?: string }) {
  return (
    <header className={s.head}>
      <KeplarSymbol size={16} className={s.sym} />
      <span className={s.label} data-busy={busy || undefined}>{label}</span>
      {chip ? <span className={s.chip}>{chip}</span> : null}
    </header>
  );
}

type Row = { key: string; text: string; state: "done" | "live" | "bad" | "todo"; sub?: string };

/** The build as a checklist, newest step last, like a person narrating the work. */
function Steps({ live, report, spec, running }: { live: Live; report: Report | null; spec: PublicSpec | null; running: boolean }) {
  const checks: Check[] = live.checks.length ? live.checks : report?.checks ?? [];
  const verdicts: Verdict[] = live.verdicts.length ? live.verdicts : report?.verdicts ?? [];
  const visual: Visual | null = live.visual ?? report?.visual ?? null;
  const stage = running ? live.stage || "plan" : "done";
  const after = (st: string) => STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(st);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (spec || running) out.push({ key: "plan", text: spec ? `Planned ${spec.name}` : "Planning the product", state: spec ? "done" : "live", sub: spec ? `${spec.pages.length} screens · ${spec.collections.length} data tables${spec.ai.length ? ` · ${spec.ai.length} AI features` : ""}${spec.auth ? " · accounts" : ""}` : undefined });
    if (spec || live.files.length) {
      const written = new Set(live.files.map((f) => f.path));
      const all = (spec?.files ?? []).filter((f) => f !== "index.html");
      const list = running ? all : all.slice(0, 0);
      for (const f of list) out.push({ key: `f:${f}`, text: `Writing ${f}`, state: written.has(f) ? "done" : stage === "generate" ? "live" : after("generate") ? "done" : "todo" });
      if (!running && all.length) out.push({ key: "files", text: `Wrote ${all.length} files`, state: "done" });
    }
    if (checks.length || stage === "verify") {
      const bad = checks.filter((x) => !x.ok);
      out.push({ key: "tests", text: stage === "verify" ? "Testing every screen in a real browser" : `Tested ${checks.length} things${bad.length ? `, ${bad.length} open` : ""}`, state: stage === "verify" ? "live" : bad.length ? "bad" : "done", sub: bad[0] ? `${bad[0].label}: ${bad[0].detail}` : undefined });
    }
    if (live.problems && running && (stage === "fix" || stage === "verify")) out.push({ key: "fix", text: `Fixing ${live.problems.count} problem${live.problems.count === 1 ? "" : "s"}`, state: stage === "fix" ? "live" : "done" });
    if (verdicts.length) {
      const built = verdicts.filter((v) => v.status === "built").length;
      out.push({ key: "rvb", text: `Requested vs built: ${built} of ${verdicts.length}`, state: built === verdicts.length ? "done" : "bad", sub: verdicts.filter((v) => v.status !== "built").slice(0, 2).map((v) => `${v.title} (${v.status})`).join(" · ") || undefined });
    }
    if (visual) out.push({ key: "visual", text: `Design review: ${visual.score}/10`, state: visual.score >= 7 ? "done" : "bad", sub: visual.summary });
    if (running && stage === "save") out.push({ key: "save", text: "Saving the version", state: "live" });
    return out;
  }, [spec, live.files, live.problems, checks, verdicts, visual, running, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = running ? rows.slice(-9) : rows;
  return (
    <ol className={s.steps}>
      {visible.map((r) => (
        <li key={r.key} className={s.step} data-state={r.state}>
          <span className={s.stepText}>{r.text}{r.sub ? <span className={s.stepSub}>{r.sub}</span> : null}</span>
          <span className={s.mark} aria-label={r.state === "done" ? "done" : r.state === "live" ? "in progress" : r.state === "bad" ? "needs attention" : "to do"}>{r.state === "done" ? "✓" : r.state === "bad" ? "!" : r.state === "live" ? <i className={s.spin} /> : null}</span>
        </li>
      ))}
    </ol>
  );
}

function CodeView({ previewUrl, files }: { previewUrl: string | null; files: string[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const pick = sel ?? files[0] ?? null;
  useEffect(() => {
    if (!previewUrl || !pick) return;
    let on = true;
    fetch(`${previewUrl}${pick}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).then((t) => on && setText(t.slice(0, 60_000))).catch(() => on && setText(""));
    return () => { on = false; };
  }, [previewUrl, pick]);
  if (!files.length) return <div className={s.placeholder}><p className={s.meta}>Files appear here as they are written.</p></div>;
  return (
    <div className={s.code}>
      <ul className={s.fileList} aria-label="Files">
        {files.map((f) => <li key={f}><button type="button" aria-current={f === pick || undefined} onClick={() => setSel(f)}>{f}</button></li>)}
      </ul>
      <pre className={s.pre}>{previewUrl ? text || "…" : "The code opens here once the first version is saved."}</pre>
    </div>
  );
}

const DesktopIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
const PhoneIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7 12.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
