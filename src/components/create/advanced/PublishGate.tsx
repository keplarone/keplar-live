"use client";
/**
 * The publish gate: before a version goes live, the critic's report for it (the full review if one was run, otherwise the
 * instant rules pass, which is free). Blockers and major issues are listed with their one-click fixes; fixing makes a new
 * version and the gate re-checks it. Publishing anyway is always allowed: the gate informs, it never traps.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { CriticReport, Finding } from "@/lib/critic/types";
import { FindingDiff, ScoreRing } from "./CriticPane";
import s from "./advanced.module.css";
import { useExit } from "@/components/motion/usePresence";

export function PublishGate({ siteId, version, publishing, onPublish, onFixed, onOpenCritic, onClose }: {
  siteId: string;
  version: number;
  publishing: boolean;
  onPublish: () => void;
  /** A fix was applied as a new version: the caller reloads, and the gate follows the new version. */
  onFixed: (version: number) => void;
  onOpenCritic?: () => void;
  onClose: () => void;
}) {
  const [report, setReport] = useState<CriticReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const first = useRef<HTMLButtonElement>(null);
  // Escape, the scrim and Close play the exit before the parent unmounts the gate (never while publishing or fixing).
  const exit = useExit(onClose);
  const close = exit.close;
  /** The version the report in state is for: a fix hands back the new version's report, so the gate does not re-fetch it. */
  const have = useRef<number | null>(null);

  const load = useCallback(async (v: number) => {
    setLoading(true); setErr(null);
    try {
      const r = await api<{ report: CriticReport | null }>(`/api/critic/${siteId}?v=${v}&quick=1`);
      setReport(r.report);
      have.current = r.report?.version ?? null;
      setPicked(new Set((r.report?.findings ?? []).filter((f) => f.patch?.length && (f.severity === "critical" || f.severity === "major")).map((f) => f.id)));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [siteId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch for the version shown, state is set after the awaited request
  useEffect(() => { if (have.current !== version) void load(version); }, [load, version]);
  useEffect(() => { if (!loading) first.current?.focus(); }, [loading]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !publishing && !fixing) close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [close, publishing, fixing]);

  async function fix() {
    if (!report || !picked.size) return;
    setFixing(true); setErr(null);
    try {
      const r = await api<{ version: number; applied: string[]; skipped: { id: string; reason: string }[]; report: CriticReport | null }>(`/api/critic/${siteId}/fix`, { method: "POST", body: JSON.stringify({ version: report.version, ids: [...picked] }) });
      if (r.skipped.length) setErr(`${r.skipped.length} could not be applied: ${[...new Set(r.skipped.map((x) => x.reason))].join(" ")}`);
      if (r.report) { have.current = r.version; setReport(r.report); setPicked(new Set(r.report.findings.filter((f) => f.patch?.length && (f.severity === "critical" || f.severity === "major")).map((f) => f.id))); }
      onFixed(r.version);
    } catch (e) { setErr((e as Error).message); } finally { setFixing(false); }
  }

  const important = (report?.findings ?? []).filter((f) => f.severity === "critical" || f.severity === "major");
  const blockers = important.filter((f) => f.severity === "critical").length;
  const shown = important.slice(0, 8);
  /** Publishing always ships the newest version; the title and button name it, and an older report says so. */
  const v = version;
  const stale = report && report.version !== version ? report.version : null;

  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget && !publishing && !fixing) close(); }} {...exit.motion("fade")}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="gate-title" {...exit.motion("pop", false)} style={{ ["--m-origin" as string]: "50% 50%" }}>
        <div className={s.dialogHead}>
          <div className={s.grow}>
            <h2 id="gate-title">Before v{v} goes live</h2>
            <p className={s.dim} style={{ fontSize: "var(--t-small)", marginTop: 4 }}>The critic checked this version. Fix what matters, or publish as it is.</p>
          </div>
          <button type="button" className={s.quiet} onClick={close} disabled={publishing || fixing}>Close</button>
        </div>

        {loading ? <p className={s.dim}>Checking v{version}…</p> : report ? (
          <>
            <div className={s.gateScore}>
              <ScoreRing score={report.score} size={84} label={report.grade === "Ship it" ? "ready" : "score"} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 500 }}>{report.grade}</p>
                <p className={s.summary} style={{ marginTop: 2 }}>{report.summary}</p>
                <p className={s.fWhere}>{report.passes.axe || report.passes.ai ? "Full review" : "Instant check (rules only)"}{stale ? ` of v${stale}` : ""}{onOpenCritic ? <> · <button type="button" className={s.link} onClick={onOpenCritic}>Open the Critic</button></> : null}</p>
              </div>
            </div>
            {shown.length ? (
              <ul className={s.gateList} aria-label="Issues to look at">
                {shown.map((f: Finding) => (
                  <li key={f.id}>
                    {f.patch?.length ? (
                      <input type="checkbox" className={s.pick} aria-label={`Fix: ${f.title}`} checked={picked.has(f.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} />
                    ) : <span className={s.sev} data-sev={f.severity} aria-label={f.severity} style={{ marginTop: 4 }} />}
                    <div style={{ minWidth: 0 }}>
                      <span>{f.severity === "critical" ? <b style={{ color: "var(--c-err)", fontWeight: 500 }}>Blocker · </b> : null}{f.title}</span> <code>{f.file}:{f.line}</code>
                      <p className={s.dim} style={{ fontSize: "var(--t-label)", marginTop: 2 }}>{f.fix}</p>
                      {picked.has(f.id) ? <FindingDiff f={f} /> : null}
                    </div>
                  </li>
                ))}
                {important.length > shown.length ? <li><span /><span className={s.dim}>…and {important.length - shown.length} more in the Critic.</span></li> : null}
              </ul>
            ) : <p className={s.dim} style={{ fontSize: "var(--t-small)" }}>No blockers or major issues. {report.findings.length ? `${report.findings.length} minor note${report.findings.length === 1 ? "" : "s"} in the Critic.` : ""}</p>}
          </>
        ) : <p className={s.dim}>No report for this version{err ? "" : " yet"}. You can still publish.</p>}

        {err ? <p role="alert" className={s.errText}>{err}</p> : null}

        <div className={s.dialogFoot}>
          {report && picked.size ? <button ref={first} type="button" className={s.primary} onClick={() => void fix()} disabled={fixing || publishing}>{fixing ? "Fixing…" : `Fix ${picked.size} and re-check`}</button> : null}
          <button ref={report && picked.size ? undefined : first} type="button" className={report && picked.size ? s.btn : s.primary} onClick={onPublish} disabled={publishing || fixing || loading}>
            {publishing ? "Publishing…" : blockers ? `Publish v${v} anyway` : `Publish v${v}`}
          </button>
        </div>
      </div>
    </div>
  );
}
