"use client";
/**
 * The gate and connection screens of Keplar Studio (full page and overlay). One title, one line, one action each. The gates
 * are the old StudioView / BlenderView / StudioOverlay ones: the desktop bridge (Blender: desktop app 0.1.8+), sign-in, and
 * a plan in STUDIO_PLANS (Lite, Plus, Pro, Business: "Lite and up"). In the overlay (`compact`) there are no links: the
 * overlay window cannot navigate, so it points at the main window instead, as before.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { BlenderStatus, StudioStatus } from "@/lib/desktop/studio-bridge";
import { studioHref } from "@/components/create/studio/keplar-studio-nav";
import { ActivityIndicator, Button, Icon, StatusDot, type IconName } from "../ui";
import { connectionDot, connectionLabel, ENV_LABEL, type Env } from "./layout/run-status";
import s from "./panels/panels.module.css";

type ScreenProps = { env: Env; compact?: boolean };

function Screen({ icon, tone, title, line, compact, children, label }: { icon: IconName; tone?: "danger" | "warning"; title: string; line?: ReactNode; compact?: boolean; children?: ReactNode; label?: string }) {
  return (
    <section className={s.screen} data-compact={compact ? "" : undefined} aria-label={label ?? title}>
      <span className={s.screenIcon} data-tone={tone}><Icon name={icon} size={16} /></span>
      <h2 className={s.screenTitle}>{title}</h2>
      {line ? <p className={s.screenLine}>{line}</p> : null}
      {children ? <div className={s.row}>{children}</div> : null}
    </section>
  );
}

function LinkAction({ href, children, outline }: { href: string; children: ReactNode; outline?: boolean }) {
  return <Link className={s.linkAct} data-variant={outline ? "outline" : "solid"} href={href}>{children}</Link>;
}

/** No desktop bridge: this page is in a browser tab, or the desktop app is too old for this environment. */
export function NotInDesktop({ env, compact }: ScreenProps) {
  if (compact) return <Screen compact icon="external" title="Open this from the Keplar desktop app." />;
  return (
    <Screen
      icon="external"
      title="Open this in the Keplar desktop app"
      line={env === "blender"
        ? "Blender needs the Keplar desktop app 0.1.8 or newer. If the app is open and you don't see it, update the app."
        : "Keplar Studio works with Roblox Studio on your computer, so it runs in the desktop app."}
    >
      <LinkAction href="/download">Download Keplar for desktop</LinkAction>
    </Screen>
  );
}

export function SignedOut({ env, compact }: ScreenProps) {
  if (compact) return <Screen compact icon="info" title={`Sign in to Keplar in the main window to use ${ENV_LABEL[env]}.`} />;
  return (
    <Screen icon="info" title="Sign in to use Keplar Studio" line="Keplar Studio comes with Keplar Lite and up.">
      <LinkAction href={`/signin?next=${encodeURIComponent(studioHref(env))}`}>Sign in</LinkAction>
    </Screen>
  );
}

export function PlanRequired({ env, compact }: ScreenProps) {
  if (compact) return <Screen compact icon="credit" title={`${ENV_LABEL[env]} comes with Keplar Lite, Plus, Pro and Business.`} />;
  return (
    <Screen icon="credit" title="Keplar Studio comes with Lite and up" line={`Upgrade to build in ${ENV_LABEL[env]} with Keplar.`}>
      <LinkAction href="/pricing">See plans</LinkAction>
    </Screen>
  );
}

/** A real connect() is in flight. */
export function Connecting({ env, compact }: ScreenProps) {
  return (
    <section className={s.screen} data-compact={compact ? "" : undefined} aria-label={`Connecting to ${ENV_LABEL[env]}`}>
      <ActivityIndicator label={`Connecting to ${ENV_LABEL[env]}…`} showLabel />
    </section>
  );
}

export type NotConnectedProps = ScreenProps & { status: StudioStatus | null; busy: boolean; onConnect: () => void };

/** Roblox Studio is not connected: idle, missing, error, or unsupported (no Connect then). */
export function NotConnected({ env, compact, status, busy, onConnect }: NotConnectedProps) {
  const st = status?.state ?? "idle";
  const connection = { state: st, message: status?.message };
  const app = ENV_LABEL[env];
  return (
    <Screen
      compact={compact}
      icon={st === "error" || st === "missing" ? "warning" : "roblox-studio"}
      tone={st === "error" || st === "missing" ? "warning" : undefined}
      title={st === "unsupported" ? `${app} is not available here` : `Connect to ${app}`}
      line={<><StatusDot status={connectionDot(connection)} label={connectionLabel(env, connection)} /> · {status?.message ?? `Open ${app}, then connect.`}</>}
    >
      {st === "unsupported" ? null : (
        <Button variant="primary" loading={busy || st === "connecting"} disabled={busy || st === "connecting"} onClick={onConnect}>
          {st === "connecting" ? "Connecting…" : st === "missing" || st === "error" ? "Try again" : `Connect to ${app}`}
        </Button>
      )}
    </Screen>
  );
}

export type BlenderNotRunningProps = { status: BlenderStatus | null; note: string; busy: boolean; onConnect: () => void; onSetup: () => void; compact?: boolean };

/** Blender is not connected: Connect / Try again, and Set up Blender (installs the add-on once). */
export function BlenderNotRunning({ status, note, busy, onConnect, onSetup, compact }: BlenderNotRunningProps) {
  const st = status?.state ?? "idle";
  const connection = { state: st, message: status?.message };
  const failed = st === "missing" || st === "error";
  return (
    <Screen
      compact={compact}
      icon={failed ? "warning" : "blender"}
      tone={failed ? "warning" : undefined}
      title={failed ? "Blender is not running" : "Connect to Blender"}
      line={<><StatusDot status={connectionDot(connection)} label={connectionLabel("blender", connection)} /> · {note || status?.message || "Open Blender with the Keplar add-on on."}</>}
    >
      <Button variant="primary" loading={busy && st === "connecting"} disabled={busy || st === "connecting"} onClick={onConnect}>
        {st === "connecting" ? "Connecting…" : failed || compact ? "Try again" : "Connect to Blender"}
      </Button>
      <Button variant="secondary" loading={busy && note.startsWith("Installing")} disabled={busy} onClick={onSetup}>Set up Blender</Button>
    </Screen>
  );
}

export type StatusErrorProps = { title?: string; message: string; onRetry?: () => void; retryLabel?: string; compact?: boolean };

/** Anything else that stopped the screen; Retry only when there is a real retry. */
export function StatusError({ title = "Something went wrong", message, onRetry, retryLabel = "Try again", compact }: StatusErrorProps) {
  return (
    <Screen compact={compact} icon="error" tone="danger" title={title} line={message}>
      {onRetry ? <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button> : null}
    </Screen>
  );
}

/** The contract's name for the generic error screen. */
export const GenericError = StatusError;
