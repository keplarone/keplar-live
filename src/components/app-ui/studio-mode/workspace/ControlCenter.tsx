"use client";
/**
 * The control center: one compact strip with what is happening now (connection, current operation, elapsed, credits,
 * approvals, errors), expandable for the details (active task, current file, mode, target environment, plan, latest
 * warning, and in the overlay the latest Studio screenshot). Every value is the run's real state: elapsed comes from the
 * event log, credits from a.units (what the server charged), approvals from the waiting actions.
 */
import { useId, useState, type ReactNode } from "react";
import { Badge, Button, Icon, MorphIcon, Progress, StatusDot, Switch } from "@/components/kit";
import type { StudioAgent } from "../useStudioAgent";
import type { SolarModeId } from "@/lib/studio/solar-modes";
import { useNow } from "./layout/hooks";
import {
  activeTask, connectionDot, connectionLabel, elapsedMs, ENV_LABEL, failedActions, formatCredits, formatElapsed, isCreditStop, lastWarning, operationText, planProgress, runDot, type Connection, type Env,
} from "./layout/run-status";
import { solarLabel } from "./SolarSelector";
import s from "./shell.module.css";

export type ControlCenterProps = {
  a: StudioAgent;
  env: Env;
  mode: SolarModeId;
  connection: Connection;
  compact?: boolean;
  /** Opens Auto top-up (offered when the run stopped for credits). */
  onOpenTopUp?: () => void;
  /** Opens the saved sessions for this place (the overlay has no nav). */
  onOpenSessions?: () => void;
  /** Shows the waiting approvals (the conversation). */
  onShowApprovals?: () => void;
  /** Extra controls at the end of the strip (the overlay's Look again). */
  actions?: ReactNode;
};

export function ControlCenter({ a, env, mode, connection, compact, onOpenTopUp, onOpenSessions, onShowApprovals, actions }: ControlCenterProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const now = useNow(a.running, 1000);
  const elapsed = elapsedMs(a.events, a.running, now);
  const op = operationText(a, env, connection);
  const dot = runDot(a, connection);
  const warning = lastWarning(a.items);
  const errors = Math.max(a.stats.errors, failedActions(a.items));
  const { done, total } = planProgress(a.plan);
  const task = activeTask(a.items);
  const activeDoc = a.code.documents.find((d) => d.id === a.code.activeId) ?? null;
  const file = activeDoc && (a.running || activeDoc.awaitingApproval) ? activeDoc.path : null;

  return (
    <section className={s.control} data-compact={compact ? "" : undefined} data-open={open ? "" : undefined} aria-label="Control center">
      <div className={s.controlStrip}>
        <button type="button" className={s.controlToggle} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((v) => !v)}>
          <span aria-hidden="true"><StatusDot status={dot} label={op} hideLabel /></span>
          <span className={s.controlOp} aria-live="polite">{op}</span>
          {total && !compact ? <span className={s.controlPlan}>{done}/{total}</span> : null}
          <MorphIcon icon="chevron" state={open ? "expanded" : "collapsed"} size={12} />
        </button>
        <span className={s.controlFields}>
          {total && compact ? <span className={s.controlField} title="Plan steps done">Plan <b>{done}/{total}</b></span> : null}
          {elapsed !== null ? <span className={s.controlField} title="Elapsed in this run"><b className={s.mono}>{formatElapsed(elapsed)}</b></span> : null}
          <span className={s.controlField} title="Credits used in this chat">{formatCredits(a.units)}<span className={s.unit}> cr</span></span>
          {a.pending ? (
            onShowApprovals ? (
              <button type="button" className={s.controlLink} onClick={onShowApprovals}><Badge tone="warning">{a.pending} to approve</Badge></button>
            ) : <Badge tone="warning">{a.pending} to approve</Badge>
          ) : null}
          {errors ? <Badge tone="danger">{errors} {errors === 1 ? "error" : "errors"}</Badge> : null}
          {actions}
        </span>
      </div>
      {open ? (
        <div id={detailsId} className={s.controlDetails}>
          <dl className={s.controlGrid}>
            <div><dt>Task</dt><dd title={task ?? undefined}>{task ?? "None yet"}</dd></div>
            <div><dt>Now</dt><dd>{file ? <>{op} · <code className={s.path}>{file}</code></> : op}</dd></div>
            <div><dt>Mode</dt><dd>Solar 5.8 · {solarLabel(mode)}</dd></div>
            <div><dt>Target</dt><dd>{ENV_LABEL[env]}{a.place ? ` · ${a.place.name}` : ""}</dd></div>
            <div><dt>Connection</dt><dd><StatusDot status={connectionDot(connection)} label={connection.state === "connected" ? connectionLabel(env, connection) : connection.message ?? connectionLabel(env, connection)} /></dd></div>
            <div><dt>This chat</dt><dd>{a.stats.steps} steps · {a.stats.changes} changes · {errors} errors · {formatCredits(a.units)} credits</dd></div>
            <div><dt>Approvals</dt><dd>{a.pending ? `${a.pending} waiting` : "None waiting"} · {a.autoApprove ? "safe changes auto-approved" : "every change asks"}</dd></div>
          </dl>
          {total ? (
            <div className={s.controlPlanBlock}>
              <Progress value={done} max={total} label="Plan progress" valueText={`${done}/${total}`} />
              {compact ? <ol className={s.planList} data-compact="">
                {a.plan.map((p, i) => <li key={i} data-state={p.state}><span className={s.planMark} aria-hidden="true">{i + 1}</span><span>{p.text}</span></li>)}
              </ol> : null}
            </div>
          ) : null}
          {warning ? (
            <p className={s.controlWarn} role="status">
              {warning}
            </p>
          ) : null}
          {compact ? (
            // The overlay's composer has no room for this switch; it must stay reachable to turn auto-approve back off.
            <div className={s.controlActions}>
              <Switch checked={a.autoApprove} onCheckedChange={a.setAuto} label="Auto-approve safe changes" />
            </div>
          ) : null}
          {onOpenSessions || onOpenTopUp ? (
            <div className={s.controlActions}>
              {onOpenSessions ? <Button size="sm" variant="secondary" leadingIcon={<Icon name="history" />} onClick={onOpenSessions}>Sessions</Button> : null}
              {onOpenTopUp ? <Button size="sm" variant="secondary" leadingIcon={<Icon name="credit" />} onClick={onOpenTopUp}>Auto top-up</Button> : null}
            </div>
          ) : null}
          {compact && env === "roblox" && a.viewport ? (
            <figure className={s.controlShot}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio */}
              <img src={a.viewport.image} alt="What Keplar sees in Studio" />
            </figure>
          ) : null}
        </div>
      ) : warning && isCreditStop(warning) && onOpenTopUp ? (
        <p className={s.controlWarn} role="status">
          Paused for credits.
          <Button size="sm" variant="secondary" onClick={onOpenTopUp}>Auto top-up</Button>
        </p>
      ) : null}
    </section>
  );
}
