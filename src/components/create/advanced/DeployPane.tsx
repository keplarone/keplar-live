"use client";
/**
 * Deploy: what is live (URL, version, HTTPS), one click to put the newest version live, every step of a deploy with its
 * timestamped log as it happens, roll back to any kept version (ones that were live before take the fast path), and the
 * custom-domain flow. A deploy whose live check fails is reverted by the server automatically; this pane says so plainly.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ndjson } from "../api";
import { DomainPanel } from "../DomainPanel";
import { durationMs, type Deploy, type Step } from "@/lib/deploy/machine";
import s from "./advanced.module.css";

type Version = { n: number; summary: string; kind: string; createdAt: string; bytes: number; previewUrl: string; wasLive?: boolean; lastLiveAt?: string | null; current?: boolean };
type Overview = {
  site: { id: string; name: string; slug: string; kind: string; headVersion: number; publishedVersion: number | null; publishedAt: string | null; needsReview?: boolean; takenDown?: boolean };
  live: { version: number; url: string; deployId: string | null; at: string | null; legacy: boolean } | null;
  versions: Version[];
  deploys: Deploy[];
  canDeploy: boolean;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const secs = (ms: number | null) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const STEP_ICON: Record<Step["state"], string> = { pending: "", running: "", ok: "✓", warn: "!", failed: "×", skipped: "" };
const STATUS_TEXT: Record<Deploy["status"], string> = { queued: "Queued", running: "Deploying", live: "Live", failed: "Failed", superseded: "Replaced", canceled: "Canceled" };

export function DeployPane({ siteId, onChanged, toast }: { siteId: string; onChanged?: () => void; toast: (t: string) => void }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Deploy | null>(null);
  const [running, setRunning] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  /** undefined: open the failed or running step automatically; null: all closed. */
  const [openStep, setOpenStep] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    try { const r = await api<Overview>(`/api/deploy/${siteId}`); setOv(r); setErr(null); return r; } catch (e) { setErr((e as Error).message); return null; }
  }, [siteId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void load(); }, [load]);

  async function deploy(version?: number) {
    setRunning(true); setErr(null); setPicked(null); setOpenStep(undefined);
    let last: Deploy | null = null;
    try {
      for await (const ev of ndjson(`/api/deploy/${siteId}`, version ? { version } : {})) {
        if (ev.t === "error") { setErr(String(ev.error)); break; }
        last = ev.deploy as Deploy;
        setActive(last);
      }
      if (last?.status === "live") toast(`v${last.version} is live.`);
      else if (last?.status === "failed") setErr(last.error ?? "The deploy failed. Nothing your visitors see changed.");
    } catch (e) { setErr((e as Error).message); } finally {
      setRunning(false);
      await load();
      onChanged?.();
    }
  }

  if (!ov) return <div className={s.pane}><div className={s.paneIn}>{err ? <p role="alert" className={s.errText}>{err}</p> : <p className={s.dim}>Loading deploys…</p>}</div></div>;

  const head = ov.site.headVersion;
  const liveV = ov.live?.version ?? null;
  const shown = (picked ? ov.deploys.find((d) => d.id === picked) : null) ?? active ?? ov.deploys[0] ?? null;
  // the dot is about what visitors get: a failed deploy that was reverted still leaves the previous version live
  const state = running ? "running" : liveV !== null ? "live" : ov.deploys[0]?.status === "failed" ? "failed" : "none";
  // a failed step opens its log by default, so the reason (and the auto-revert line) is on screen
  const open = openStep === undefined ? shown?.steps.find((x) => x.state === "failed" || x.state === "running")?.id ?? null : openStep;

  return (
    <div className={s.pane}>
      <div className={s.paneIn}>
        <div className={s.liveCard}>
          <div style={{ minWidth: 0 }}>
            <span className={s.liveState} data-s={state}>{running ? `Deploying v${active?.version ?? head}` : liveV !== null ? `Live · v${liveV}` : "Not live yet"}</span>
            {ov.live ? <a className={s.liveUrl} href={ov.live.url} target="_blank" rel="noopener">{ov.live.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : <span className={s.liveUrl} style={{ color: "var(--c-ink-3)" }}>keplar.one/s/{ov.site.slug}</span>}
            <div className={s.facts}>
              {ov.live?.at ? <span>Since <b>{when(ov.live.at)}</b></span> : null}
              {ov.live?.url.startsWith("https://") ? <span className={s.lock}>HTTPS</span> : null}
              <span>Newest <b>v{head}</b></span>
              {ov.site.needsReview ? <span style={{ color: "var(--c-attention)" }}>Queued for a content review</span> : null}
              {ov.site.takenDown ? <span style={{ color: "var(--c-err)" }}>Taken down</span> : null}
            </div>
          </div>
          {ov.canDeploy ? (
            <button type="button" className={s.primary} disabled={running || !head || (liveV === head) || ov.site.takenDown} onClick={() => void deploy(head)}>
              {running ? "Deploying…" : liveV === head ? `v${head} is live` : `Deploy v${head}`}
            </button>
          ) : <span className={s.dim} style={{ fontSize: "var(--t-label)" }}>Owners and admins deploy.</span>}
        </div>

        {err ? <p role="alert" className={s.errText}>{err}</p> : null}

        <div className={s.cols}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {shown ? (
              <section aria-label="Deploy steps">
                <div className={s.toolbar} style={{ marginBottom: 10 }}>
                  <h3 className={s.sectionTitle}>{shown.kind === "rollback" ? "Rollback" : "Deploy"} v{shown.version}</h3>
                  <span className={s.pill} data-t={shown.status === "live" ? "live" : shown.status === "failed" ? "failed" : "was"}>{STATUS_TEXT[shown.status]}</span>
                  <span className={s.dim} style={{ fontSize: "var(--t-label)" }}>{shown.byName} · {when(shown.createdAt)}{durationMs(shown) != null ? ` · ${secs(durationMs(shown))}` : ""}{shown.criticScore != null ? ` · critic ${shown.criticScore}` : ""}</span>
                </div>
                <div className={s.steps}>
                  {shown.steps.map((st) => {
                    const ms = st.startedAt && st.endedAt ? Date.parse(st.endedAt) - Date.parse(st.startedAt) : null;
                    const isOpen = open === st.id && st.lines.length > 0;
                    return (
                      <div key={st.id}>
                        <button type="button" className={s.stepRow} data-s={st.state} aria-expanded={st.lines.length ? isOpen : undefined} onClick={() => setOpenStep(isOpen ? null : st.id)}>
                          <span className={s.stepIcon} data-s={st.state} aria-hidden="true">{STEP_ICON[st.state]}</span>
                          <span className={s.stepName}>{st.label}{st.state === "skipped" ? <span className={s.dim}> · skipped</span> : null}</span>
                          <span className={s.stepMs}>{secs(ms)}</span>
                        </button>
                        {isOpen ? (
                          <div className={s.log} role="log">
                            {st.lines.map((l, i) => <div key={i} className={s.logLine} data-l={l.level}><time dateTime={l.at}>{clock(l.at)}</time><span>{l.text}</span></div>)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {shown.status === "failed" && shown.error ? <p className={s.errText} style={{ marginTop: 10 }}>{shown.error}</p> : null}
              </section>
            ) : <div className={s.empty}><h3>No deploys yet</h3><p>Deploy runs the safety checks, takes an immutable snapshot, moves the live pointer and checks the live page.</p></div>}

            {ov.deploys.length > 1 ? (
              <section aria-label="Deploy history">
                <h3 className={s.sectionTitle} style={{ marginBottom: 6 }}>History</h3>
                <div className={s.history}>
                  {ov.deploys.slice(0, 15).map((d) => (
                    <button key={d.id} type="button" className={s.hRow} aria-current={shown?.id === d.id} onClick={() => { setPicked(d.id); setOpenStep(undefined); }}>
                      <span className={s.stepIcon} data-s={d.status === "live" ? "ok" : d.status === "failed" ? "failed" : d.status === "running" ? "running" : "skipped"} aria-hidden="true">{d.status === "live" ? "✓" : d.status === "failed" ? "×" : ""}</span>
                      <span>{d.kind === "rollback" ? "↩ " : ""}v{d.version}</span>
                      <span className={s.ellipsis}>{STATUS_TEXT[d.status]} · {d.byName}</span>
                      <span className={s.stepMs}>{when(d.createdAt)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <section aria-label="Versions">
            <h3 className={s.sectionTitle} style={{ marginBottom: 6 }}>Versions</h3>
            <div className={s.rail}>
              {ov.versions.map((v) => (
                <div key={v.n} className={s.ver} data-live={v.n === liveV}>
                  <span className={s.verN}>v{v.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <p className={s.verSum}>{v.summary || (v.kind === "edit" ? "Edit" : "Build")}</p>
                    <div className={s.verMeta}>
                      {v.n === liveV ? <span className={s.pill} data-t="live">Live</span> : v.wasLive ? <span className={s.pill} data-t="was">Was live</span> : null}
                      <span>{when(v.createdAt)}</span>
                      <a className={s.link} href={v.previewUrl} target="_blank" rel="noopener">Preview</a>
                      {ov.canDeploy && v.n !== liveV ? <button type="button" className={s.link} disabled={running || ov.site.takenDown} onClick={() => void deploy(v.n)}>{v.wasLive ? "Roll back to this" : "Deploy this"}</button> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section aria-labelledby="dp-domain">
          <h3 id="dp-domain" className={s.sectionTitle} style={{ marginBottom: 10 }}>Custom domain</h3>
          <DomainPanel siteId={siteId} />
        </section>
      </div>
    </div>
  );
}
