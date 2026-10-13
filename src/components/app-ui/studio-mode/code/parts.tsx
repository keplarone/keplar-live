"use client";
/** Small shared pieces of the code engine UI: collapse state, the section header, status labels. */
import { useCallback, useState, type ReactNode } from "react";
import type { CodeDocument, DocStatus } from "./documents";
import s from "./code.module.css";

/** Expand/collapse that is controlled when `collapsed` is given, else uncontrolled from `defaultCollapsed`. */
export function useCollapse(collapsed: boolean | undefined, onChange: ((c: boolean) => void) | undefined, defaultCollapsed = false) {
  const [own, setOwn] = useState(defaultCollapsed);
  const value = collapsed ?? own;
  const set = useCallback((c: boolean) => { if (collapsed === undefined) setOwn(c); onChange?.(c); }, [collapsed, onChange]);
  return [value, set] as const;
}

export function Head({ title, meta, collapsed, onToggle, children, controls }: { title: ReactNode; meta?: ReactNode; collapsed: boolean; onToggle?: (c: boolean) => void; children?: ReactNode; controls?: string }) {
  return (
    <div className={s.head}>
      {onToggle ? (
        <button type="button" className={s.toggle} aria-expanded={!collapsed} aria-controls={controls} aria-label={collapsed ? "Expand" : "Collapse"} onClick={() => onToggle(!collapsed)}>
          <span className={s.chev} aria-hidden="true">▾</span>
        </button>
      ) : null}
      <span className={s.headTitle}>{title}</span>
      {meta ? <span className={s.headMeta}>{meta}</span> : null}
      <span className={s.grow} />
      {collapsed ? null : children}
    </div>
  );
}

/** The words for a status, by document kind (a command "ran", a script edit is "applied"). */
export function statusLabel(status: DocStatus, kind: CodeDocument["kind"] | "script" | "command" | "object", waiting = false): string {
  if (waiting) return "Waiting for approval";
  const cmd = kind === "command" || kind === "raw";
  switch (status) {
    case "read": return "Read";
    case "proposed": return "Proposed";
    case "applying": return cmd ? "Running" : "Applying";
    case "applied": return kind === "script" ? "Applied · confirmed" : cmd ? "Ran" : "Done";
    case "differs": return "Applied · differs from proposal";
    case "unconfirmed": return "Applied · not confirmed";
    case "failed": return "Failed";
    case "declined": return "Declined";
  }
}

export function Counts({ added, removed }: { added: number; removed: number }) {
  if (!added && !removed) return null;
  return (
    <span className={s.counts} aria-label={`${added} lines added, ${removed} removed`}>
      <span className={s.add}>+{added}</span> <span className={s.del}>−{removed}</span>
    </span>
  );
}
