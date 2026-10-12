"use client";
/**
 * The live code panel: one tab per document (scripts Keplar read or edits, commands it runs), the active tab following the
 * action being proposed or run unless the person picked a tab (pinned; "Follow" unpins). Shows the path, the status, the code
 * (read-only, line numbers, syntax highlighting, the changing lines marked) or the diff, and the real tool errors.
 *
 * Feed it `a.code` from useStudioAgent and wire the handlers to the hook (see codePanelProps in ./index.ts).
 */
import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { CodeDocument, CodeModel, ScriptChange } from "./documents";
import { CodeViewer } from "./CodeViewer";
import { DiffView, type DiffMode } from "./DiffView";
import { Head, statusLabel, useCollapse } from "./parts";
import s from "./code.module.css";

export type CodeView = "code" | "diff";

export type CodePanelProps = {
  /** a.code from useStudioAgent (or deriveDocuments(events) directly). */
  model: CodeModel;
  /** The real approval: (key) => a.decide(key, true). Rendered only when the document's action is waiting. */
  onApprove?: (actionKey: string) => void;
  onDecline?: (actionKey: string) => void;
  /** (changeId) => a.revert(changeId). Rendered only when that change can be reverted. */
  onRevert?: (changeId: string) => void;
  /** (actionKey) => a.retry(actionKey). Rendered only for a failed action that can be retried. */
  onRetry?: (actionKey: string) => void;
  /** Controlled pinned document (null = follow the active one). Uncontrolled when omitted. */
  pinned?: string | null;
  onPinnedChange?: (id: string | null) => void;
  view?: CodeView;
  onViewChange?: (v: CodeView) => void;
  diffMode?: DiffMode;
  onDiffModeChange?: (m: DiffMode) => void;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
  title?: string;
  emptyText?: string;
  wrap?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** The change a diff should show for a document (the newest, or the chosen one), when before and after are both known. */
function diffable(c: ScriptChange | undefined): c is ScriptChange & { before: string } {
  return Boolean(c && c.before != null && (c.applied ?? c.after) != null);
}

export function CodePanel(p: CodePanelProps) {
  const { model } = p;
  const [ownPin, setOwnPin] = useState<string | null>(null);
  const pinned = p.pinned !== undefined ? p.pinned : ownPin;
  const setPinned = (id: string | null) => { if (p.pinned === undefined) setOwnPin(id); p.onPinnedChange?.(id); };
  const [collapsed, setCollapsed] = useCollapse(p.collapsed, p.onCollapsedChange, p.defaultCollapsed);
  // Per-document choices (which change, code or diff); they reset when another document is shown.
  const [choice, setChoice] = useState<{ doc: string | null; change: string | null; view: CodeView | null }>({ doc: null, change: null, view: null });
  const [ownDiffMode, setOwnDiffMode] = useState<DiffMode>("inline");
  const bodyId = useId();

  const docs = model.documents;
  const current: CodeDocument | undefined = docs.find((d) => d.id === pinned) ?? docs.find((d) => d.id === model.activeId) ?? docs[docs.length - 1];
  const following = !pinned || !docs.some((d) => d.id === pinned);

  const mine = choice.doc === (current?.id ?? null) ? choice : { doc: current?.id ?? null, change: null, view: null };
  const changeSel = mine.change;
  const ownView = mine.view;
  const setChangeSel = (c: string) => setChoice({ ...mine, change: c });
  const setOwnView = (v: CodeView) => setChoice({ ...mine, view: v });

  const change = useMemo(() => {
    if (!current?.changes.length) return undefined;
    return current.changes.find((c) => c.id === changeSel) ?? current.changes[current.changes.length - 1];
  }, [current, changeSel]);
  const live = current?.status === "proposed" || current?.status === "applying";
  const canDiff = diffable(change);
  const autoView: CodeView = canDiff && live ? "diff" : "code";
  const view: CodeView = canDiff ? (p.view ?? ownView ?? autoView) : "code";
  const setView = (v: CodeView) => { if (p.view === undefined) setOwnView(v); p.onViewChange?.(v); };
  const diffMode = p.diffMode ?? ownDiffMode;
  const setDiffMode = (m: DiffMode) => { if (p.diffMode === undefined) setOwnDiffMode(m); p.onDiffModeChange?.(m); };

  const entry = current?.action ? model.changes.find((x) => x.id === current.action) : undefined;
  const waitingKey = current?.awaitingApproval ? current.action : null;
  const approve = waitingKey && p.onApprove ? () => p.onApprove!(waitingKey) : undefined;
  // Destructive steps are named as such wherever they can be approved (never a plain "Approve").
  const destructive = waitingKey ? model.changes.find((x) => x.id === waitingKey)?.risk === "destructive" : false;
  const decline = waitingKey && p.onDecline ? () => p.onDecline!(waitingKey) : undefined;
  const revert = change?.revert.ok && p.onRevert ? () => p.onRevert!(change.id) : undefined;
  const retryKey = change ? (change.retry.ok ? change.id : null) : entry?.retry.ok ? entry.id : null;
  const retry = retryKey && p.onRetry ? () => p.onRetry!(retryKey) : undefined;
  const lastVersion = current?.versions[current.versions.length - 1];
  const errors = current?.diagnostics.filter((d) => d.severity !== "info") ?? [];
  const infos = current?.diagnostics.filter((d) => d.severity === "info").slice(-1) ?? [];

  const meta = current ? `${docs.length} file${docs.length === 1 ? "" : "s"}${following ? " · following" : " · pinned"}` : undefined;

  return (
    <section className={`${s.root} ${s.panel} ${p.className ?? ""}`} style={{ height: collapsed ? undefined : "100%", ...p.style }} data-collapsed={collapsed ? "true" : "false"} aria-label={p.title ?? "Code"}>
      <Head title={p.title ?? "Code"} meta={meta} collapsed={collapsed} onToggle={setCollapsed} controls={bodyId}>
        {!following ? <button type="button" className={s.act} onClick={() => setPinned(null)} title="Show the file Keplar is working on">Follow</button> : null}
      </Head>
      {collapsed ? null : !current ? (
        <div id={bodyId} className={s.empty}>{p.emptyText ?? "Code Keplar reads, writes or runs shows here as it happens."}</div>
      ) : (
        <div id={bodyId} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className={s.tabs} role="tablist" aria-label="Files" onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            // WAI-ARIA tabs: arrows, Home and End move between files (and pin the one chosen, like a click).
            const i = docs.findIndex((d) => d.id === current.id);
            const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? docs.length - 1 : null;
            if (next === null || !docs.length) return;
            e.preventDefault();
            const d = docs[(next + docs.length) % docs.length]!;
            setPinned(d.id);
            (e.currentTarget.querySelector(`[data-doc="${CSS.escape(d.id)}"]`) as HTMLElement | null)?.focus();
          }}>
            {docs.map((d) => (
              <button key={d.id} type="button" role="tab" className={s.fileTab} aria-selected={d.id === current.id} aria-controls={`${bodyId}-panel`} tabIndex={d.id === current.id ? 0 : -1} data-doc={d.id}
                title={`${d.path} · ${statusLabel(d.status, d.kind, d.awaitingApproval)}`}
                onClick={() => setPinned(d.id === model.activeId && following ? null : d.id)}>
                <span className={s.dot} data-status={d.status} data-waiting={d.awaitingApproval ? "true" : undefined} aria-hidden="true" />
                <span>{d.title}</span>
              </button>
            ))}
          </div>
          <div id={`${bodyId}-panel`} role="tabpanel" aria-label={current.path} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className={s.bar}>
            <nav className={s.crumbs} aria-label="Path">
              {current.crumbs.map((c, i) => (
                <span key={`${c}-${i}`}>{i ? <span className={s.sep} aria-hidden="true">› </span> : null}{c}</span>
              ))}
            </nav>
            <span className={s.grow} />
            {current.changes.length > 1 ? (
              <select aria-label="Change" value={change?.id ?? ""} onChange={(e) => setChangeSel(e.target.value)} className={s.act}>
                {current.changes.map((c, i) => <option key={c.id} value={c.id}>{c.origin === "revert" ? "Revert" : `Edit ${i + 1}`} · {statusLabel(c.status, "script")}</option>)}
              </select>
            ) : null}
            {canDiff ? (
              <span className={s.seg} role="group" aria-label="View">
                <button type="button" aria-pressed={view === "code"} onClick={() => setView("code")}>Code</button>
                <button type="button" aria-pressed={view === "diff"} onClick={() => setView("diff")}>Diff</button>
              </span>
            ) : null}
            <span className={s.status} data-status={current.status}>
              <span className={s.dot} data-status={current.status} data-waiting={current.awaitingApproval ? "true" : undefined} aria-hidden="true" />
              {statusLabel(current.status, current.kind, current.awaitingApproval)}
            </span>
          </div>
          {current.note ? <div className={s.note}>{current.note}</div> : null}
          {view === "code" && (approve || decline || revert || retry || lastVersion) ? (
            <div className={s.bar}>
              <span className={s.headMeta}>{lastVersion ? `${versionWord(lastVersion.label)}${lastVersion.actionName ? ` · ${lastVersion.actionName}` : ""}${lastVersion.turn ? ` · request ${lastVersion.turn}` : ""} · ${new Date(lastVersion.at).toLocaleTimeString()}` : ""}</span>
              <span className={s.grow} />
              {decline ? <button type="button" className={s.act} onClick={decline}>Decline</button> : null}
              {approve ? <button type="button" className={`${s.act} ${s.lead}`} data-destructive={destructive ? "" : undefined} onClick={approve}>{destructive ? "Approve this change" : "Approve"}</button> : null}
              {retry ? <button type="button" className={s.act} onClick={retry}>Retry</button> : null}
              {revert ? <button type="button" className={s.act} onClick={revert}>Revert</button> : null}
            </div>
          ) : null}
          {view === "diff" && canDiff && change ? (
            <DiffView bare before={change.before} after={(change.applied ?? change.after)!} language={current.language} mode={diffMode} onModeChange={setDiffMode}
              beforeLabel={change.beforeFrom === "before" ? "Before (read right before the edit)" : "Before (read when proposed)"}
              afterLabel={change.applied != null ? "Applied (read after the edit)" : "Proposed"}
              onApprove={approve} onDecline={decline} onRevert={revert} destructive={destructive}
              revertUnavailable={change.status === "proposed" || change.status === "applying" ? undefined : change.revert.reason} />
          ) : (
            <CodeViewer content={current.content} language={current.language} activeLines={current.activeLines} wrap={p.wrap} label={current.path} />
          )}
          {errors.length || infos.length ? (
            <div className={s.diags} role="region" aria-label="Diagnostics">
              {[...errors, ...infos].map((d, i) => (
                <div key={i} className={s.diag} data-severity={d.severity}>
                  <span className={s.sev}>{d.severity === "info" ? "result" : d.severity}</span>
                  <pre>{d.message}</pre>
                </div>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function versionWord(l: CodeDocument["versions"][number]["label"]): string {
  return { read: "Read", before: "Read before the edit", proposed: "Proposed", applied: "Read after the edit", command: "Sent", raw: "Sent" }[l];
}
