"use client";
/**
 * Every change of the session: scripts edited (with +/− line counts), commands run, objects inserted or generated. Each row opens
 * its document when there is one; Revert and Retry appear only where they really work (ChangeEntry.revert / .retry).
 */
import { useMemo } from "react";
import type { ChangeEntry } from "./documents";
import { Counts, Head, statusLabel, useCollapse } from "./parts";
import s from "./code.module.css";

export type ChangesListProps = {
  changes: readonly ChangeEntry[];
  /** Opens the change's document: e.g. (docId) => setPinned(docId) with a controlled CodePanel `pinned`. */
  onSelect?: (docId: string, changeId: string) => void;
  onRevert?: (changeId: string) => void;
  onRetry?: (actionKey: string) => void;
  /** Show declined and still-proposed actions too (default: only those that ran or are running). */
  includePending?: boolean;
  title?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
  className?: string;
  maxHeight?: string;
};

const KIND = { script: "Script", command: "Command", object: "Object" } as const;

export function ChangesList({ changes, onSelect, onRevert, onRetry, includePending = false, title = "Changes", collapsed: c, defaultCollapsed, onCollapsedChange, className, maxHeight = "280px" }: ChangesListProps) {
  const [collapsed, setCollapsed] = useCollapse(c, onCollapsedChange, defaultCollapsed);
  const rows = useMemo(() => changes.filter((x) => includePending || (x.status !== "declined" && x.status !== "proposed")), [changes, includePending]);
  const totals = useMemo(() => rows.reduce((t, x) => (x.kind === "script" ? { a: t.a + x.added, r: t.r + x.removed } : t), { a: 0, r: 0 }), [rows]);
  const scripts = new Set(rows.filter((x) => x.kind === "script").map((x) => x.target)).size;
  const meta = rows.length ? <>{rows.length} change{rows.length === 1 ? "" : "s"}{scripts ? ` · ${scripts} script${scripts === 1 ? "" : "s"} ` : " "}<Counts added={totals.a} removed={totals.r} /></> : "Nothing changed yet";
  return (
    <section className={`${s.root} ${s.panel} ${className ?? ""}`} data-collapsed={collapsed ? "true" : "false"} aria-label={title}>
      <Head title={title} meta={meta} collapsed={collapsed} onToggle={setCollapsed} />
      {collapsed || !rows.length ? null : (
        <ul className={s.list} style={{ maxHeight }}>
          {rows.map((x) => (
            <li key={x.id} className={s.item} data-status={x.status}>
              <button type="button" className={s.itemMain} disabled={!x.docId || !onSelect} onClick={() => x.docId && onSelect?.(x.docId, x.id)} title={x.title}>
                <span className={s.dot} data-status={x.status} aria-hidden="true" />
                <span className={s.kind}>{x.origin === "revert" ? "Revert" : x.origin === "retry" ? "Retry" : KIND[x.kind]}</span>
                <span className={s.target}>{x.target}</span>
              </button>
              {x.kind === "script" ? <Counts added={x.added} removed={x.removed} /> : null}
              <span className={s.why}>{statusLabel(x.status, x.kind)}</span>
              {onRevert && x.revert.ok ? <button type="button" className={s.act} onClick={() => onRevert(x.id)}>Revert</button> : null}
              {onRetry && x.retry.ok ? <button type="button" className={s.act} onClick={() => onRetry(x.id)}>Retry</button> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
