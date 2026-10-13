"use client";
/**
 * The floating overlay (/app/studio/overlay): Keplar Studio in a small always-on-top desktop window over Roblox Studio or
 * Blender (keplar-desktop src/main/studio/overlay.ts; 440×760, frameless, transparent window). Never four columns:
 * - a compact title bar: the drag handle (the desktop's spring drag when available, else -webkit-app-region: drag), the Solar
 *   selector, the Studio | Blender switch (when the Blender bridge exists), Look again, see-through, collapse, close;
 * - the control strip (task, operation, elapsed, credits, approvals, connection; expandable);
 * - one content area switched by Chat | Code | Changes;
 * - the composer pinned at the bottom.
 * Collapsed, it is a pill with the status and the approvals count. The panel is an opaque token surface.
 *
 * Bridge logic is StudioOverlay's, unchanged: two agents (Studio and Blender, so switching never loses a run), the target
 * from the opener (setOverlayTarget) with cross-window sync through the `storage` event, the account from /api/compute,
 * auto-connect, place selection, and the overlay window API (state, collapse, see-through, close).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { blenderBridge, STUDIO_PLANS, studioBridge, type BlenderStatus, type OverlayState, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { Badge, Dialog, Icon, IconButton, MorphIcon, SegmentedControl, StatusDot, StudioRoot, ToastProvider } from "../ui";
import { OVERLAY_TARGET_KEY, overlayTarget, setOverlayTarget, useStudioAgent } from "../useStudioAgent";
import { Composer } from "./Composer";
import { ControlCenter } from "./ControlCenter";
import { Conversation } from "./Conversation";
import { Inspector } from "./Inspector";
import { SolarSelector, useSolarMode } from "./SolarSelector";
import { useAccount, useBlenderConnection, useRobloxConnection, useSpringDrag } from "./layout/hooks";
import { operationText, runDot, type Connection } from "./layout/run-status";
import { SessionsPanel } from "./panels/SessionsPanel";
import { TopUpPanel } from "./panels/TopUpPanel";
import { BlenderNotRunning, Connecting, NotConnected, NotInDesktop, PlanRequired, SignedOut } from "./StatusScreens";
import s from "./shell.module.css";

const noSubscribe = () => () => {};
type Target = "studio" | "blender";
type View = "chat" | "code" | "changes";

export function OverlayShell() {
  const bridge = useSyncExternalStore(noSubscribe, studioBridge, () => null);
  const bb = useSyncExternalStore(noSubscribe, blenderBridge, () => null);
  const [target, setTarget] = useState<Target>(() => (typeof window === "undefined" ? "studio" : overlayTarget()));
  const account = useAccount();
  const [win, setWin] = useState<OverlayState>({ open: true, collapsed: false, seeThrough: false });
  const [mode, setMode] = useSolarMode();
  const studio = useStudioAgent(bridge, "studio", { solarMode: mode });
  const blender = useStudioAgent(bb, "blender", { solarMode: mode });
  const isBlender = target === "blender" && Boolean(bb);
  const a = isBlender ? blender : studio;
  const allowed = !!account?.signedIn && STUDIO_PLANS.has(account.plan);
  // Studio connects by itself while it is the app this overlay works in; Blender the same.
  const studioConn = useRobloxConnection(bridge, allowed, studio.setPlace, studio.place, !isBlender);
  const blenderConn = useBlenderConnection(bb, allowed, blender.setPlace, isBlender);
  const studioStatus: StudioStatus | null = studioConn.status;
  const blenderStatus: BlenderStatus | null = blenderConn.status;
  const status = isBlender ? blenderStatus : studioStatus;
  const connection: Connection = { state: status?.state ?? "idle", message: status?.message };
  const connected = connection.state === "connected";
  const [view, setView] = useState<View>("chat");
  const [focusAction, setFocusAction] = useState<string | null>(null);
  const [topUp, setTopUp] = useState(false);
  const [sessions, setSessions] = useState(false);
  const drag = useSpringDrag(bridge?.overlay);

  // The window is see-through: no page background, no site chrome.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-overlay", "");
    return () => root.removeAttribute("data-overlay");
  }, []);

  // The main window picked the other app ("Float over Blender" / "Float over Studio") while this overlay was open.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === OVERLAY_TARGET_KEY) setTarget(overlayTarget()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => bridge?.overlay?.onState((o) => setWin(o)), [bridge]);

  const pick = (t: Target) => { if (a.running) return; setOverlayTarget(t); setTarget(t); };
  const env = isBlender ? "blender" : "roblox";
  const op = operationText(a, env, connection);
  const dot = runDot(a, connection);

  if (win.collapsed) {
    return (
      <StudioRoot className={s.overlayRoot} data-collapsed="">
        <div className={s.capsule}>
          <span className={s.capsuleDrag} {...drag.handleProps}>
            <Icon name="drag-handle" size={14} />
            <span aria-hidden="true"><StatusDot status={dot} label={op} hideLabel /></span>
            <span className={s.capsuleText}>{op}</span>
            {a.pending ? <Badge tone="warning">{a.pending} to approve</Badge> : null}
          </span>
          <IconButton size="sm" label="Open the overlay" icon={<MorphIcon icon="expand" state="expand" />} onClick={() => void bridge?.overlay?.collapse(false)} />
        </div>
      </StudioRoot>
    );
  }

  const gate = !bridge ? <NotInDesktop env={env} compact />
    : account && !allowed ? (account.signedIn ? <PlanRequired env={env} compact /> : <SignedOut env={env} compact />)
      : isBlender && blenderStatus && blenderStatus.state !== "connected" && blenderStatus.state !== "connecting"
        ? <BlenderNotRunning compact status={blenderStatus} note={blenderConn.note} busy={blenderConn.busy} onConnect={() => void blenderConn.connect()} onSetup={() => void blenderConn.setup()} />
        : !isBlender && studioStatus && studioStatus.state !== "connected" && studioStatus.state !== "connecting"
          ? <NotConnected env={env} compact status={studioStatus} busy={studioConn.busy} onConnect={() => void studioConn.connect()} />
          : !connected && connection.state === "connecting" ? <Connecting env={env} compact /> : null;

  return (
    <StudioRoot className={s.overlayRoot}>
      <ToastProvider placement="bottom-center">
        <div className={s.overlay} data-see-through={win.seeThrough ? "" : undefined}>
          <header className={s.titleBar} {...drag.handleProps}>
            <Icon name="drag-handle" size={14} className={s.grip} />
            <SolarSelector value={mode} onChange={setMode} env={env} compact />
            {bb ? (
              <div className={s.pressGroup} data-compact="" role="group" aria-label="Work in" title={a.running ? "Finish or stop this build first" : undefined}>
                <button type="button" aria-pressed={!isBlender} disabled={a.running} onClick={() => pick("studio")}>Studio</button>
                <button type="button" aria-pressed={isBlender} disabled={a.running} onClick={() => pick("blender")}>Blender</button>
              </div>
            ) : null}
            <span className={s.titleSpacer} />
            <IconButton size="sm" label="See-through" pressed={win.seeThrough} icon={<MorphIcon icon="eye" state={win.seeThrough ? "hidden" : "visible"} />} onClick={() => void bridge?.overlay?.seeThrough(!win.seeThrough)} />
            <IconButton size="sm" label="Collapse to a pill" icon={<MorphIcon icon="expand" state="collapse" />} onClick={() => void bridge?.overlay?.collapse(true)} />
            <IconButton size="sm" label="Close the overlay and go back to Keplar" icon={<Icon name="close" />} onClick={() => void bridge?.overlay?.close()} />
          </header>

          {gate ? (
            <div className={s.overlayGate}>{gate}</div>
          ) : (
            <>
              <ControlCenter
                a={a}
                env={env}
                mode={mode}
                connection={connection}
                compact
                onOpenTopUp={() => setTopUp(true)}
                onOpenSessions={() => setSessions(true)}
                onShowApprovals={() => setView("chat")}
                actions={!isBlender ? (
                  <IconButton size="sm" label="Let Keplar look at Studio again" icon={<MorphIcon icon="refresh" state={a.looking ? "active" : "idle"} />} onClick={() => void a.refreshViewport()} disabled={!connected || a.looking} />
                ) : null}
              />
              <div className={s.overlaySwitch}>
                <SegmentedControl
                  size="sm"
                  fullWidth
                  label="Show"
                  value={view}
                  onValueChange={setView}
                  options={[
                    { value: "chat", label: "Chat" },
                    { value: "code", label: "Code" },
                    { value: "changes", label: a.code.changes.length ? `Changes ${a.code.changes.length}` : "Changes", ariaLabel: "Changes" },
                  ]}
                />
              </div>
              <div className={s.overlayContent}>
                {view === "chat" ? (
                  <Conversation key={isBlender ? "blender" : "studio"} a={a} env={env} compact onOpenCode={(k) => { setFocusAction(k); setView("code"); }} />
                ) : (
                  <Inspector key={isBlender ? "blender" : "studio"} a={a} env={env} compact tab={view} onTab={(t) => { if (t === "code" || t === "changes") setView(t); }} focusAction={focusAction} />
                )}
              </div>
              <div className={s.overlayComposer}>
                <Composer key={isBlender ? "blender" : "studio"} a={a} env={env} compact mode={mode} canPlayTest={!isBlender} />
              </div>
            </>
          )}
        </div>
        <Dialog open={topUp} onOpenChange={setTopUp} size="sm" title="Auto top-up">
          <TopUpPanel compact />
        </Dialog>
        <Dialog open={sessions} onOpenChange={setSessions} size="sm" title="Sessions">
          <SessionsPanel a={a} env={env} compact />
        </Dialog>
      </ToastProvider>
    </StudioRoot>
  );
}
