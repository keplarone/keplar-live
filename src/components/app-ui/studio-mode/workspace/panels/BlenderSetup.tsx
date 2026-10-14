"use client";
/**
 * The Blender add-on (rendered inside the "Blender add-on" dialog, and reused by StatusScreens' BlenderNotRunning). Set up
 * Blender installs or updates the Keplar add-on (BlenderBridge.setup(); the note shows "Installing…" and then its message),
 * Connect / Try again reconnects. The version warnings are feature checks, not guesses: the Blender bridge exists from
 * desktop app 0.1.8, the cloud packer from 0.1.10 (blenderCloud()).
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { blenderCloud, type BlenderStatus } from "@/lib/desktop/studio-bridge";
import { Button, Icon, StatusDot } from "@/components/kit";
import { connectionDot, connectionLabel } from "../layout/run-status";
import s from "./panels.module.css";

const noSubscribe = () => () => {};

export type BlenderSetupProps = {
  status: BlenderStatus | null;
  /** The setup's progress or result, from useBlenderConnection. */
  note: string;
  busy: boolean;
  onSetup: () => void;
  onConnect: () => void;
  compact?: boolean;
};

export function BlenderSetup({ status, note, busy, onSetup, onConnect, compact = false }: BlenderSetupProps) {
  const cloudReady = useSyncExternalStore(noSubscribe, () => blenderCloud() !== null, () => true);
  const st = status?.state ?? "idle";
  const connected = st === "connected";
  const connection = { state: st, message: status?.message };
  const label = connected ? `Blender ${status?.blender ?? ""}`.trim() : connectionLabel("blender", connection);

  return (
    <div className={s.stack} data-compact={compact ? "" : undefined}>
      <div className={s.row}>
        <StatusDot status={connectionDot(connection)} label={label} />
        {connected && status?.file ? <span className={s.meta}>· {status.file}</span> : null}
      </div>
      {!connected && status?.message ? <p className={s.meta}>{status.message}</p> : null}

      <dl className={s.facts}>
        <dt>Add-on</dt>
        <dd>Keplar add-on for Blender 4.2 or newer. It only listens on this computer.</dd>
        <dt>Cloud</dt>
        <dd>{cloudReady ? "This desktop app can pack scenes for Blender Cloud." : "Blender Cloud needs desktop app 0.1.10 or newer."}</dd>
      </dl>
      {!cloudReady ? (
        <p className={s.notice} data-tone="warning"><Icon name="warning" size={14} /><span>Update the desktop app, then press Set up Blender once. <Link className={s.inlineLink} href="/download">Download</Link></span></p>
      ) : null}

      {note ? <p className={s.notice} role="status"><Icon name="info" size={14} />{note}</p> : null}

      <div className={s.row}>
        <Button variant={connected ? "secondary" : "primary"} loading={busy && note.startsWith("Installing")} disabled={busy} leadingIcon={<Icon name="blender" size={14} />} onClick={onSetup}>
          Set up Blender
        </Button>
        {connected ? null : (
          <Button variant="secondary" loading={busy && st === "connecting"} disabled={busy || st === "connecting"} onClick={onConnect}>
            {st === "connecting" ? "Connecting…" : st === "missing" || st === "error" ? "Try again" : "Connect to Blender"}
          </Button>
        )}
      </div>
    </div>
  );
}
