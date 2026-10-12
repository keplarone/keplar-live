"use client";
/**
 * Before/after of one change, inline (unified) or side by side (@codemirror/merge). Additions green, deletions red, unchanged
 * neutral; long unchanged stretches collapse. Approve/Decline/Revert render only when a real handler is given; when revert is
 * not possible the reason is shown as text instead of a disabled control.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocLanguage } from "./documents";
import type { DiffHandle } from "./cm";
import { diffLines } from "./line-diff";
import { Counts, Head, useCollapse } from "./parts";
import s from "./code.module.css";

export type DiffMode = "inline" | "split";

export type DiffViewProps = {
  before: string;
  after: string;
  language: DocLanguage;
  /** Header title (e.g. the script path). */
  title?: string;
  /** What the two sides are, e.g. "Before (read 12:01)" / "Proposed". Shown in the header. */
  beforeLabel?: string;
  afterLabel?: string;
  /** Controlled mode; uncontrolled from `defaultMode` (inline) when omitted. */
  mode?: DiffMode;
  defaultMode?: DiffMode;
  onModeChange?: (m: DiffMode) => void;
  collapseUnchanged?: boolean;
  /** Wired to the real approval (a.decide(key, true/false)); rendered only when given. */
  onApprove?: () => void;
  onDecline?: () => void;
  /** Wired to a.revert(changeId) when the change can be reverted. */
  onRevert?: () => void;
  /** Why revert is not available (shown as text when onRevert is absent). */
  revertUnavailable?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
  /** The waiting action is destructive: Approve reads "Approve this change" and is styled as a danger action. */
  destructive?: boolean;
  /** Render without its own frame and header (inside CodePanel). */
  bare?: boolean;
  className?: string;
};

export function DiffView(p: DiffViewProps) {
  const [ownMode, setOwnMode] = useState<DiffMode>(p.defaultMode ?? "inline");
  const mode = p.mode ?? ownMode;
  const setMode = (m: DiffMode) => { if (p.mode === undefined) setOwnMode(m); p.onModeChange?.(m); };
  const [collapsed, setCollapsed] = useCollapse(p.collapsed, p.onCollapsedChange, p.defaultCollapsed);
  const counts = useMemo(() => diffLines(p.before, p.after), [p.before, p.after]);
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (collapsed || !host.current) return;
    let dead = false;
    let h: DiffHandle | null = null;
    setReady(false);
    import("./cm").then((m) => {
      if (dead || !host.current) return;
      h = m.createDiff(host.current, { before: p.before, after: p.after, language: p.language, mode, collapseUnchanged: p.collapseUnchanged });
      setReady(true);
    }).catch((e: unknown) => { if (!dead) setError(e instanceof Error ? e.message : "The diff could not load."); });
    return () => { dead = true; h?.destroy(); };
  }, [p.before, p.after, p.language, mode, p.collapseUnchanged, collapsed]);

  const actions = (
    <>
      <span className={s.seg} role="group" aria-label="Diff layout">
        <button type="button" aria-pressed={mode === "inline"} onClick={() => setMode("inline")}>Inline</button>
        <button type="button" aria-pressed={mode === "split"} onClick={() => setMode("split")}>Side by side</button>
      </span>
      {p.onDecline ? <button type="button" className={s.act} onClick={p.onDecline}>Decline</button> : null}
      {p.onApprove ? <button type="button" className={`${s.act} ${s.lead}`} data-destructive={p.destructive ? "" : undefined} onClick={p.onApprove}>{p.destructive ? "Approve this change" : "Approve"}</button> : null}
      {p.onRevert ? <button type="button" className={s.act} onClick={p.onRevert}>Revert</button> : null}
    </>
  );
  const sides = [p.beforeLabel, p.afterLabel].filter(Boolean).join(" → ");
  const meta = <>{sides ? <span>{sides} · </span> : null}<Counts added={counts.added} removed={counts.removed} />{!counts.added && !counts.removed ? "No differences" : null}{mode === "inline" ? " · line numbers: after" : ""}</>;
  const body = collapsed ? null : (
    <>
      {!p.onRevert && p.revertUnavailable ? <div className={s.note}>Revert unavailable: {p.revertUnavailable}</div> : null}
      <div className={s.editor} data-diff-mode={mode} data-ready={ready ? "true" : "false"}>
        <div ref={host} style={{ height: "100%" }} />
        {!ready ? <pre className={s.fallback} style={{ position: "absolute", inset: 0 }}>{error ?? "Loading the diff…"}</pre> : null}
      </div>
    </>
  );
  if (p.bare) {
    return (
      <div className={`${s.root} ${p.className ?? ""}`} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <div className={s.bar}><span className={s.headMeta}>{meta}</span><span className={s.grow} />{actions}</div>
        {body}
      </div>
    );
  }
  return (
    <section className={`${s.root} ${s.panel} ${p.className ?? ""}`} data-collapsed={collapsed ? "true" : "false"} aria-label={p.title ? `Changes to ${p.title}` : "Changes"}>
      <Head title={p.title ?? "Changes"} meta={meta} collapsed={collapsed} onToggle={setCollapsed}>{actions}</Head>
      {body}
    </section>
  );
}
