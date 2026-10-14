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
import { ActivityIndicator, Button, Dialog } from "@/components/kit";

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
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      // Escape, the backdrop and Close never interrupt a publish or a fix in flight.
      dismissible={!publishing && !fixing}
      title={<>Before v{v} goes live</>}
      description="The critic checked this version. Fix what matters, or publish as it is."
      className={s.dialog}
      footer={<>
        {report && picked.size ? <Button ref={first} variant="primary" onClick={() => void fix()} loading={fixing} disabled={publishing}>{fixing ? "Fixing…" : `Fix ${picked.size} and re-check`}</Button> : null}
        <Button ref={report && picked.size ? undefined : first} variant={report && picked.size ? "secondary" : "primary"} onClick={onPublish} loading={publishing} disabled={fixing || loading}>
          {publishing ? "Publishing…" : blockers ? `Publish v${v} anyway` : `Publish v${v}`}
        </Button>
      </>}
    >
        {loading ? <ActivityIndicator label={`Checking v${version}`} showLabel /> : report ? (
          <>
            <div className={s.gateScore}>
              <ScoreRing score={report.score} size={84} label={report.grade === "Ship it" ? "ready" : "score"} />
              <div className={s.ellipsisBox}>
                <p className={s.gateGrade}>{report.grade}</p>
                <p className={s.summary}>{report.summary}</p>
                <p className={s.fWhere}>{report.passes.axe || report.passes.ai ? "Full review" : "Instant check (rules only)"}{stale ? ` of v${stale}` : ""}{onOpenCritic ? <> · <button type="button" className={s.link} onClick={onOpenCritic}>Open the Critic</button></> : null}</p>
              </div>
            </div>
            {shown.length ? (
              <ul className={s.gateList} aria-label="Issues to look at">
                {shown.map((f: Finding) => (
                  <li key={f.id}>
                    {f.patch?.length ? (
                      <input type="checkbox" className={s.pick} aria-label={`Fix: ${f.title}`} checked={picked.has(f.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} />
                    ) : <span className={s.sev} data-sev={f.severity} aria-label={f.severity} />}
                    <div className={s.ellipsisBox}>
                      <span>{f.severity === "critical" ? <b className={s.blocker}>Blocker · </b> : null}{f.title}</span> <code>{f.file}:{f.line}</code>
                      <p className={`${s.dim} ${s.note}`}>{f.fix}</p>
                      {picked.has(f.id) ? <FindingDiff f={f} /> : null}
                    </div>
                  </li>
                ))}
                {important.length > shown.length ? <li><span /><span className={s.dim}>…and {important.length - shown.length} more in the Critic.</span></li> : null}
              </ul>
            ) : <p className={`${s.dim} ${s.noteLg}`}>No blockers or major issues. {report.findings.length ? `${report.findings.length} minor note${report.findings.length === 1 ? "" : "s"} in the Critic.` : ""}</p>}
          </>
        ) : <p className={s.dim}>No report for this version{err ? "" : " yet"}. You can still publish.</p>}

        {err ? <p role="alert" className={s.errText}>{err}</p> : null}
    </Dialog>
  );
}
