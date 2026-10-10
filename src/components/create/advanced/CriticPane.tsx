"use client";
/**
 * Critic: a second opinion on the build. Three passes, each shown as it runs: 63 rules over the source, axe-core on the page
 * rendered in Chromium, and a design/UX review by a separate model. Every finding is located (file:line), says what to change,
 * and most carry an exact patch: apply one, or a batch. On a saved version a fix becomes a new version; in a live session it
 * edits the shared files, so everyone sees it land.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ndjson } from "../api";
import { CATEGORY_LABEL, type Category, type CriticReport, type Finding } from "@/lib/critic/types";
import type { LiveSession } from "./useLiveSession";
import s from "./advanced.module.css";

type PassState = "wait" | "run" | "done" | "skip" | "fail";
type Pass = { id: "static" | "axe" | "ai"; label: string; state: PassState; text: string; ms?: number };
const PASS_LABEL = { static: "Rules", axe: "Browser (axe-core)", ai: "Design review" } as const;
const SOURCE_LABEL = { static: "Rule", axe: "axe-core", ai: "Model" } as const;
const CATS: Category[] = ["a11y", "design", "ux", "perf", "code"];

export const scoreTone = (n: number) => (n >= 85 ? "var(--c-verified)" : n >= 60 ? "var(--c-attention)" : "var(--c-err)");

function passesOf(r: CriticReport): Pass[] {
  const p = r.passes;
  return [
    { id: "static", label: PASS_LABEL.static, state: "done", text: `${p.static.rules || 63} rules over ${r.files} file${r.files === 1 ? "" : "s"}`, ms: p.static.ms },
    p.axe ? { id: "axe", label: PASS_LABEL.axe, state: p.axe.ok ? "done" : "fail", text: p.axe.ok ? `${p.axe.violations} violation${p.axe.violations === 1 ? "" : "s"} on the rendered page` : p.axe.note ?? "Unavailable", ms: p.axe.ms } : { id: "axe", label: PASS_LABEL.axe, state: "skip", text: "Not run on this report (instant check). Run the full review." },
    p.ai ? { id: "ai", label: PASS_LABEL.ai, state: p.ai.ok ? "done" : "skip", text: p.ai.ok ? `${p.ai.kept} located suggestion${p.ai.kept === 1 ? "" : "s"}${p.ai.model ? ` from ${p.ai.model}` : ""}` : p.ai.note ?? "Skipped", ms: p.ai.ms } : { id: "ai", label: PASS_LABEL.ai, state: "skip", text: "Not run on this report (instant check). Run the full review." },
  ];
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString();
};

export function ScoreRing({ score, size = 112, label = "of 100" }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <div className={s.ring} style={{ width: size, height: size }} role="img" aria-label={`Score ${score} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" />
        <circle className={s.ringArc} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" strokeLinecap="round" stroke={scoreTone(score)} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)} />
      </svg>
      <div className={s.ringNum}><div><b style={size < 90 ? { fontSize: 24 } : undefined}>{score}</b><span>{label}</span></div></div>
    </div>
  );
}

export function FindingDiff({ f }: { f: Finding }) {
  if (!f.patch?.length) return null;
  const clip = (t: string) => { const l = t.split("\n"); return l.length > 6 ? [...l.slice(0, 6), "…"] : l; };
  return (
    <div className={s.diff} aria-label="Proposed change">
      {f.patch.slice(0, 2).map((p, i) => (
        <div key={i} style={{ padding: 0 }}>
          {p.expect ? clip(p.expect).map((l, j) => <div key={`d${j}`} className={s.del}>{l}</div>) : null}
          {p.replace ? clip(p.replace).map((l, j) => <div key={`a${j}`} className={s.add}>{l}</div>) : null}
        </div>
      ))}
    </div>
  );
}

export function CriticPane({ siteId, headVersion, session, canRun, canEdit, onFixed, onShow, toast }: {
  siteId: string;
  headVersion: number;
  /** When given, the critic reviews the live session's files and fixes edit the shared doc. */
  session?: LiveSession | null;
  canRun: boolean;
  canEdit: boolean;
  onFixed?: (version: number) => void;
  onShow?: (file: string, line: number) => void;
  toast: (t: string) => void;
}) {
  const live = Boolean(session?.doc);
  const [report, setReport] = useState<CriticReport | null>(null);
  const [instant, setInstant] = useState(false);
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [streamed, setStreamed] = useState<Finding[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState<Category | null>(null);
  const [onlyFixable, setOnlyFixable] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  /** The rules-only pass in this browser over the live files (no network, no credits). */
  const instantLive = useCallback(async () => {
    if (!session?.doc) return null;
    const { runRules, buildReport, RULE_COUNT } = await import("@/lib/critic/engine");
    const files = session.liveFilesNow();
    const t = performance.now();
    const f = runRules(files, { kind: session.info?.site.kind, name: session.info?.site.name });
    return buildReport({ id: "instant", workspaceId: "", siteId, version: session.base, createdAt: new Date().toISOString(), live: true }, files, f, { static: { rules: RULE_COUNT, ms: Math.round(performance.now() - t) } });
  }, [session, siteId]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      if (!headVersion && !live) { setReport(null); return; }
      const r = await api<{ report: CriticReport | null }>(`/api/critic/${siteId}?v=${live ? "live" : headVersion}${live ? "" : "&quick=1"}`);
      if (r.report) { setReport(r.report); setInstant(!r.report.passes.axe && !r.report.passes.ai); }
      else if (live) { setReport(await instantLive()); setInstant(true); }
      else setReport(null);
      setPasses(null); setStreamed([]); setApplied(new Set()); setPicked(new Set());
    } catch (e) {
      if (live) { setReport(await instantLive()); setInstant(true); } else setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [headVersion, instantLive, live, siteId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void load(); }, [load]);

  async function run() {
    setRunning(true); setErr(null); setStreamed([]); setApplied(new Set()); setPicked(new Set());
    setPasses((["static", "axe", "ai"] as const).map((id) => ({ id, label: PASS_LABEL[id], state: "wait", text: "Waiting" })));
    try {
      for await (const ev of ndjson(`/api/critic/${siteId}`, live ? { live: true } : { version: headVersion })) {
        if (ev.t === "stage") {
          const st = ev as unknown as { stage: Pass["id"]; state: PassState; text: string; ms?: number };
          setPasses((ps) => (ps ?? []).map((p) => (p.id === st.stage ? { ...p, state: st.state, text: st.text, ms: st.ms } : p)));
        } else if (ev.t === "findings") setStreamed((f) => [...f, ...((ev.findings as Finding[]) ?? [])]);
        else if (ev.t === "report") { setReport(ev.report as CriticReport); setInstant(false); }
        else if (ev.t === "error") setErr(String(ev.error));
      }
      setPasses((ps) => ps?.map((p) => (p.state === "wait" || p.state === "run" ? { ...p, state: "skip", text: p.state === "run" ? "Stopped" : "Not run" } : p)) ?? null);
    } catch (e) { setErr((e as Error).message); } finally { setRunning(false); }
  }

  async function apply(ids: string[]) {
    if (!report || !ids.length) return;
    setApplying(true); setErr(null);
    try {
      if (live && session?.doc) {
        const [{ applyFindings }, { applyFiles }] = await Promise.all([import("@/lib/critic/patch"), import("@/lib/collab/doc")]);
        const chosen = report.findings.filter((f) => ids.includes(f.id));
        const r = applyFindings(session.liveFilesNow(), chosen);
        if (!r.applied.length) throw new Error(r.skipped[0]?.reason ?? "None of those fixes could be applied.");
        applyFiles(session.doc, r.files, "local");
        session.say([{ kind: "ok", text: `critic: applied ${r.applied.length} fix${r.applied.length === 1 ? "" : "es"} to the live files${r.skipped.length ? ` (${r.skipped.length} skipped)` : ""}` }]);
        setApplied((a) => new Set([...a, ...r.applied]));
        toast(`Applied ${r.applied.length} fix${r.applied.length === 1 ? "" : "es"} to the live session. Save a version to keep ${r.applied.length === 1 ? "it" : "them"}.`);
        if (r.skipped.length) setErr(r.skipped.map((x) => x.reason).filter((v, i, a) => a.indexOf(v) === i).join(" "));
      } else {
        const r = await api<{ version: number; applied: string[]; skipped: { id: string; reason: string }[]; report: CriticReport | null }>(`/api/critic/${siteId}/fix`, { method: "POST", body: JSON.stringify({ version: report.version, ids }) });
        toast(`Applied ${r.applied.length} fix${r.applied.length === 1 ? "" : "es"} as v${r.version}.`);
        if (r.skipped.length) setErr(r.skipped.map((x) => x.reason).filter((v, i, a) => a.indexOf(v) === i).join(" "));
        if (r.report) { setReport(r.report); setInstant(true); setPasses(null); setStreamed([]); }
        setApplied(new Set());
        onFixed?.(r.version);
      }
      setPicked(new Set());
    } catch (e) { setErr((e as Error).message); } finally { setApplying(false); }
  }

  const all = useMemo(() => (running ? streamed : report?.findings ?? []), [running, streamed, report]);
  const list = useMemo(() => all.filter((f) => (!cat || f.category === cat) && (!onlyFixable || f.patch?.length)), [all, cat, onlyFixable]);
  const fixable = list.filter((f) => f.patch?.length && !applied.has(f.id));
  const shownPasses = passes ?? (report ? passesOf(report) : null);

  if (loading) return <div className={s.pane}><div className={s.paneIn}><p className={s.dim}>Loading the last review…</p></div></div>;

  return (
    <div className={s.pane}>
      <div className={s.paneIn}>
        <div className={s.hero}>
          {report && !running ? <ScoreRing score={report.score} /> : <div className={s.ring} style={{ width: 112, height: 112 }} aria-hidden="true"><svg width="112" height="112" viewBox="0 0 112 112"><circle className={s.ringTrack} cx="56" cy="56" r="50" fill="none" strokeWidth="5" /></svg><div className={s.ringNum}><div><b>{running ? "…" : "–"}</b><span>{running ? "reviewing" : "no score"}</span></div></div></div>}
          <div>
            <h2 className={s.grade}>{running ? "Reviewing…" : report ? report.grade : "Not reviewed yet"}</h2>
            <p className={s.summary}>
              {running ? "Each pass reports as it finishes. Findings appear below as they arrive." : report ? report.summary : headVersion || live ? "Run the critic for a located, fixable review of accessibility, design, UX, performance and code." : "Build something first; the critic reviews a version or the live session."}
            </p>
            {report && !running ? <p className={s.fWhere}>{live ? "Live session" : `v${report.version}`} · {instant ? "instant check (rules only)" : "full review"} · {ago(report.createdAt)}</p> : null}
          </div>
          <div className={s.toolbar}>
            {canRun ? <button type="button" className={s.primary} onClick={() => void run()} disabled={running || (!headVersion && !live)}>{running ? "Reviewing…" : report && !instant ? "Review again" : "Run full review"}</button> : <span className={s.dim} style={{ fontSize: "var(--t-label)" }}>Viewers can read reports. Editors run the critic.</span>}
          </div>
        </div>

        {report && !running ? (
          <div className={s.cats} role="group" aria-label="Filter by category">
            {CATS.map((c) => {
              const cs = report.categories.find((x) => x.category === c);
              if (!cs) return null;
              return (
                <button key={c} type="button" className={s.cat} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>
                  <span className={s.catName}>{CATEGORY_LABEL[c]}</span>
                  <span className={s.catScore}>{cs.score}</span>
                  <span className={s.meter}><i style={{ width: `${cs.score}%`, background: scoreTone(cs.score) }} /></span>
                  <span className={s.catName}>{cs.findings ? `${cs.findings} finding${cs.findings === 1 ? "" : "s"}` : "Nothing found"}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {shownPasses ? (
          <div className={s.passes} aria-live="polite">
            {shownPasses.map((p) => (
              <div key={p.id} className={s.pass}>
                <span className={s.passIcon} data-s={p.state} aria-hidden="true">{p.state === "done" ? "✓" : p.state === "fail" ? "×" : p.state === "skip" ? "–" : p.state === "wait" ? "·" : ""}</span>
                <span>{p.label}</span>
                <span className={s.dim}>{p.text}</span>
                <span className={s.ms}>{p.ms == null ? "" : p.ms < 1000 ? `${p.ms} ms` : `${(p.ms / 1000).toFixed(1)} s`}</span>
              </div>
            ))}
          </div>
        ) : null}

        {err ? <p role="alert" className={s.errText}>{err}</p> : null}

        {all.length ? (
          <>
            <div className={s.toolbar}>
              <strong className={s.count}>{list.length} finding{list.length === 1 ? "" : "s"}{cat ? ` in ${CATEGORY_LABEL[cat]}` : ""}</strong>
              <label className={s.check}><input type="checkbox" checked={onlyFixable} onChange={(e) => setOnlyFixable(e.target.checked)} /> One-click fixes only</label>
              <span className={s.grow} />
              {canEdit && fixable.length && !running ? (
                <>
                  <button type="button" className={s.quiet} onClick={() => setPicked(picked.size === fixable.length ? new Set() : new Set(fixable.map((f) => f.id)))}>{picked.size === fixable.length ? "Clear" : `Select all ${fixable.length}`}</button>
                  <button type="button" className={s.btn} disabled={!picked.size || applying} onClick={() => void apply([...picked])}>{applying ? "Applying…" : picked.size ? `Apply ${picked.size} fix${picked.size === 1 ? "" : "es"}` : "Apply fixes"}</button>
                </>
              ) : null}
            </div>
            <div className={s.findings}>
              {list.map((f) => {
                const can = canEdit && Boolean(f.patch?.length) && !applied.has(f.id) && !running;
                const isOpen = open === f.id;
                return (
                  <article key={f.id} className={s.finding} data-applied={applied.has(f.id)}>
                    {can ? <input type="checkbox" className={s.pick} aria-label={`Select fix: ${f.title}`} checked={picked.has(f.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} /> : <span className={s.sev} data-sev={f.severity} aria-label={f.severity} />}
                    <div style={{ minWidth: 0 }}>
                      <h3 className={s.fTitle}>{can ? <span className={s.sev} data-sev={f.severity} aria-hidden="true" style={{ display: "inline-block", marginRight: 8, marginTop: 0 }} /> : null}{f.title}</h3>
                      <div className={s.fWhere}>
                        <code>{f.file}:{f.line}</code>
                        <span className={s.src}>{SOURCE_LABEL[f.source]}</span>
                        <span>{CATEGORY_LABEL[f.category]} · {f.severity}</span>
                        {f.ref ? <span>{f.ref}</span> : null}
                        {onShow ? <button type="button" className={s.link} onClick={() => onShow(f.file, f.line)}>Show in editor</button> : null}
                      </div>
                      {isOpen || list.length <= 6 ? (
                        <>
                          <p className={s.fDetail}>{f.detail}</p>
                          <p className={s.fFix}><b>Fix:</b> {f.fix}</p>
                          <FindingDiff f={f} />
                        </>
                      ) : <button type="button" className={s.link} style={{ marginTop: 6, fontSize: "var(--t-label)" }} onClick={() => setOpen(f.id)}>Details and fix</button>}
                    </div>
                    <div className={s.fActions}>
                      {applied.has(f.id) ? <span className={s.pill} data-t="live">Applied</span> : can ? <button type="button" className={s.btn} onClick={() => void apply([f.id])} disabled={applying}>Apply fix</button> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : report && !running ? (
          <div className={s.empty}><h3>Nothing to fix</h3><p>No check found an issue in {live ? "the live session" : `v${report.version}`}.</p></div>
        ) : null}
      </div>
    </div>
  );
}
