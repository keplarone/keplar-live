"use client";
/**
 * Keplar Studio, full page (Create > Keplar Studio, /app/studio). Four regions:
 * - left: the nav (collapsible): sessions for this place, environment (Roblox Studio | Blender), game ideas and Roblox Cloud
 *   or Blender Cloud, auto top-up, Blender add-on, settings;
 * - center: the Solar conversation;
 * - right: the development inspector (Code | Viewport | Changes | Plan | Activity), resizable and collapsible;
 * - bottom: the control center strip and the command composer.
 * Focus presets (Conversation / Code / Viewport), Simple vs Advanced, and save / restore / reset layout.
 *
 * Bridge logic is StudioView's and BlenderView's, unchanged in behaviour: gates (desktop bridge, sign-in, plan), status
 * subscriptions, Connect / Try again / Disconnect, the place list (list_roblox_studios) or the open .blend file, the floating
 * overlay ("Float over …", "Bring it back here"). The selected Solar mode goes with every turn (useStudioAgent solarMode).
 */
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { blenderBridge, STUDIO_PLANS, studioBridge } from "@/lib/desktop/studio-bridge";
import { studioHref } from "@/components/create/studio/keplar-studio-nav";
import {
  Button, Dialog, Icon, IconButton, Menu, MenuItem, MenuSeparator, MorphIcon, ResizableSplit, SegmentedControl, StatusDot, StudioRoot, ToastProvider, Tooltip, useToast, type InspectorTab,
} from "../ui";
import { overlayTarget, setOverlayTarget, useStudioAgent } from "../useStudioAgent";
import { Composer } from "./Composer";
import { ControlCenter } from "./ControlCenter";
import { Conversation } from "./Conversation";
import { offerDraft } from "./draft";
import { Inspector } from "./Inspector";
import { SolarSelector, useSolarMode } from "./SolarSelector";
import { useBlenderConnection, useOverlayWindow, useRobloxConnection } from "./layout/hooks";
import {
  applyPreset, DEFAULT_LAYOUT, FOCUS_PRESETS, layoutFromSnapshot, LAYOUT_SAVED_KEY, liveSnapshot, parseLayout, presetOf, readStore, serializeLayout, SPLIT_BOUNDS, SPLIT_KEY, subscribeStore,
  writeLive, writeStore, type FocusPreset, type ViewMode, type WorkspaceLayout,
} from "./layout/layout-state";
import { connectionDot, connectionLabel, ENV_LABEL, type Connection, type Env } from "./layout/run-status";
import { BlenderCloudPanel } from "./panels/BlenderCloudPanel";
import { BlenderSetup } from "./panels/BlenderSetup";
import { IdeasPanel } from "./panels/IdeasPanel";
import { RobloxCloudPanel } from "./panels/RobloxCloudPanel";
import { SessionsPanel } from "./panels/SessionsPanel";
import { SettingsDialog } from "./panels/SettingsDialog";
import { TopUpPanel } from "./panels/TopUpPanel";
import { BlenderNotRunning, Connecting, NotConnected, NotInDesktop, PlanRequired, SignedOut } from "./StatusScreens";
import s from "./shell.module.css";

const noSubscribe = () => () => {};
const nullSnapshot = () => null;

export type WorkspaceProps = {
  env: Env;
  plan?: string;
  signedIn?: boolean | null;
  /** Switch environment in place (Create keeps both mounted). Without it the nav links to the other environment's page. */
  onEnvChange?: (env: Env) => void;
};

export function Workspace(props: WorkspaceProps) {
  return (
    <StudioRoot paint className={s.workspaceRoot}>
      <ToastProvider placement="bottom-right">
        <WorkspaceBody key={props.env} {...props} />
      </ToastProvider>
    </StudioRoot>
  );
}

type NavDialog = "ideas" | "cloud" | "topup" | "blender" | "settings" | null;

function WorkspaceBody({ env, plan = "free", signedIn = null, onEnvChange }: WorkspaceProps) {
  // The desktop bridges are fixed for the page's life; the server render (and the first client render) see none.
  const studio = useSyncExternalStore(noSubscribe, studioBridge, nullSnapshot);
  const bb = useSyncExternalStore(noSubscribe, blenderBridge, nullSnapshot);
  const isBlender = env === "blender";
  const bridge = isBlender ? bb : studio;
  const allowed = signedIn === true && STUDIO_PLANS.has(plan);
  const [mode, setMode] = useSolarMode();
  const a = useStudioAgent(bridge, isBlender ? "blender" : "studio", { solarMode: mode });
  const roblox = useRobloxConnection(isBlender ? null : studio, allowed, a.setPlace, a.place, false);
  const blender = useBlenderConnection(isBlender ? bb : null, allowed, a.setPlace, false);
  // The floating overlay (desktop app 0.1.7+) lives on the Studio bridge; it can work in Blender too.
  const overlay = studio?.overlay ?? null;
  const overlayState = useOverlayWindow(overlay);
  const floating = Boolean(overlayState?.open) && overlayTarget() === (isBlender ? "blender" : "studio");
  const toast = useToast();

  const status = isBlender ? blender.status : roblox.status;
  const connection: Connection = { state: status?.state ?? "idle", message: status?.message };
  const connected = connection.state === "connected";

  /* Layout (live in storage; ResizableSplit persists the split itself). */
  const snap = useSyncExternalStore(subscribeStore, liveSnapshot, nullSnapshot);
  const layout = layoutFromSnapshot(snap);
  const saved = parseLayout(useSyncExternalStore(subscribeStore, () => readStore(LAYOUT_SAVED_KEY), nullSnapshot));
  const [epoch, setEpoch] = useState(0);
  const apply = (next: WorkspaceLayout, splitChanged: boolean) => {
    writeLive(next);
    if (splitChanged) setEpoch((n) => n + 1);
  };
  const setView = (view: ViewMode) => apply({ ...layout, view }, false);
  const setTab = (tab: InspectorTab) => apply({ ...layout, tab }, false);
  const preset = presetOf(layout, env);
  const choosePreset = (p: FocusPreset) => apply(applyPreset(layout, p, env), true);
  const [focusAction, setFocusAction] = useState<string | null>(null);
  const openCode = (key: string) => {
    setFocusAction(key);
    apply({ ...layout, view: "advanced", tab: "code", split: { ...layout.split, collapsed: false } }, layout.split.collapsed);
  };
  const saveLayout = () => { writeStore(LAYOUT_SAVED_KEY, serializeLayout(layout)); toast.show({ title: "Layout saved", tone: "success", duration: 2500 }); };
  const restoreLayout = () => { if (saved) { apply(saved, true); toast.show({ title: "Saved layout restored", duration: 2500 }); } };
  const resetLayout = () => { apply(DEFAULT_LAYOUT, true); toast.show({ title: "Layout reset", duration: 2500 }); };
  const navCollapsed = layout.navCollapsed;

  const [dialog, setDialog] = useState<NavDialog>(null);
  const close = (open: boolean) => { if (!open) setDialog(null); };

  const floatHere = () => {
    if (!overlay) return;
    if (isBlender) { setOverlayTarget("blender"); void overlay.open(); }
    else { setOverlayTarget("studio"); void overlay.open(); }
  };

  /* ── What the main area shows ── */
  let screen: ReactNode = null;
  if (!bridge) screen = <NotInDesktop env={env} />;
  else if (signedIn === false) screen = <SignedOut env={env} />;
  else if (signedIn === true && !allowed) screen = <PlanRequired env={env} />;
  else if (!connected) {
    screen = isBlender
      ? (connection.state === "connecting"
        ? <Connecting env={env} />
        : <BlenderNotRunning status={blender.status} note={blender.note} busy={blender.busy} onConnect={() => void blender.connect()} onSetup={() => void blender.setup()} />)
      : (connection.state === "connecting"
        ? <Connecting env={env} />
        : <NotConnected env={env} status={roblox.status} busy={roblox.busy} onConnect={() => void roblox.connect()} />);
  }

  const places = roblox.places;
  const head = connected && bridge ? (
    <div className={s.mainHead}>
      <div className={s.headPlace}>
        <StatusDot status={connectionDot(connection)} label={connectionLabel(env, connection)} hideLabel />
        {isBlender ? (
          <span className={s.placeText}>
            <span className={s.placeKind}>Blender {blender.status?.blender ?? ""}</span>
            {blender.status?.file ? <span className={s.placeName}>{blender.status.file}</span> : null}
          </span>
        ) : places && places.length > 1 ? (
          <select className={s.placeSelect} value={a.place?.id ?? ""} onChange={(e) => a.setPlace(places.find((p) => p.id === e.target.value) ?? null)} aria-label="Place to build in" disabled={a.running}>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span className={s.placeText}><span className={s.placeName}>{a.place?.name ?? places?.[0]?.name ?? "No place open"}</span></span>
        )}
        {!isBlender ? (
          <IconButton size="sm" label="Refresh the list of open places" icon={<MorphIcon icon="refresh" state={roblox.refreshing ? "active" : "idle"} />} onClick={() => void roblox.refreshPlaces()} disabled={roblox.refreshing} />
        ) : null}
      </div>
      {overlay ? (
        <Button size="sm" variant="ghost" leadingIcon={<Icon name="external" />} disabled={a.running} onClick={floatHere}>
          {isBlender ? <>Float over Blender</> : <>Float over Studio</>}
        </Button>
      ) : null}
      <div className={s.headTools}>
        <SolarSelector value={mode} onChange={setMode} env={env} />
        {layout.view === "advanced" && !floating ? (
          <div className={s.pressGroup} role="group" aria-label="Focus">
            {FOCUS_PRESETS.map((p) => (
              <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}>{p.label}</button>
            ))}
          </div>
        ) : null}
        <SegmentedControl size="sm" label="View" value={layout.view} onValueChange={setView} options={[{ value: "simple", label: "Simple" }, { value: "advanced", label: "Advanced" }]} />
        <Menu
          label="Layout and connection"
          align="end"
          trigger={(p) => <IconButton {...p} size="sm" label="More" tooltip={!p.open} icon={<Icon name="more" />} />}
        >
          {FOCUS_PRESETS.map((p) => <MenuItem key={p.id} checked={preset === p.id} onSelect={() => choosePreset(p.id)}>Focus: {p.label}</MenuItem>)}
          <MenuSeparator />
          <MenuItem icon={<Icon name="close" />} disabled={(isBlender ? blender.busy : roblox.busy) || a.running} onSelect={() => void (isBlender ? blender.disconnect() : roblox.disconnect())}>Disconnect</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={saveLayout}>Save layout</MenuItem>
          <MenuItem disabled={!saved} onSelect={restoreLayout}>Restore saved layout</MenuItem>
          <MenuItem onSelect={resetLayout}>Reset layout</MenuItem>
        </Menu>
      </div>
    </div>
  ) : null;

  let content: ReactNode;
  if (screen) content = <div className={s.screen}>{screen}</div>;
  else if (floating) {
    content = (
      <div className={s.screen}>
        <div className={s.floating} role="status">
          <Icon name="external" />
          <span>Keplar is floating over {isBlender ? "Blender" : "Studio"}</span>
          <Button variant="primary" size="sm" onClick={() => void overlay?.close()}>Bring it back here</Button>
        </div>
      </div>
    );
  } else {
    const conversation = (
      <div className={s.center}>
        {!isBlender && places && places.length === 0 ? <p className={s.warnLine} role="status"><Icon name="warning" size={14} />No place is open. Open a place in Roblox Studio, then refresh.</p> : null}
        <Conversation a={a} env={env} onOpenCode={openCode} />
      </div>
    );
    content = layout.view === "simple" ? conversation : (
      <ResizableSplit key={epoch} label="Resize inspector" defaultSize={DEFAULT_LAYOUT.split.size} minSize={SPLIT_BOUNDS.min} maxSize={SPLIT_BOUNDS.max} collapsible="end" storageKey={SPLIT_KEY} className={s.split}>
        {[conversation, <Inspector key="inspector" a={a} env={env} tab={layout.tab} onTab={setTab} focusAction={focusAction} />]}
      </ResizableSplit>
    );
  }

  const ready = !screen && !floating;
  return (
    <div className={s.workspace} data-nav={navCollapsed ? "rail" : "open"} data-view={layout.view} data-env={env}>
      <nav className={s.nav} aria-label="Keplar Studio">
        <div className={s.navHead}>
          <IconButton
            size="sm"
            label={navCollapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            icon={<MorphIcon icon="expand" state={navCollapsed ? "expand" : "collapse"} />}
            onClick={() => apply({ ...layout, navCollapsed: !navCollapsed }, false)}
            aria-expanded={!navCollapsed}
          />
          <span className={s.navTitle}>Keplar Studio</span>
        </div>

        <NavGroup label="Environment" collapsed={navCollapsed}>
          {(["roblox", "blender"] as const).map((e) => (
            <NavEntry key={e} collapsed={navCollapsed} icon={<Icon name={e === "blender" ? "blender" : "roblox-studio"} />} label={ENV_LABEL[e]} current={e === env}
              href={onEnvChange ? undefined : studioHref(e)} onClick={onEnvChange && e !== env ? () => onEnvChange(e) : undefined}
              trailing={e === env ? <StatusDot status={connectionDot(connection)} label={connectionLabel(env, connection)} hideLabel /> : null} />
          ))}
        </NavGroup>

        {ready || (bridge && allowed) ? (
          <NavGroup label="Sessions" collapsed={navCollapsed} grow>
            {navCollapsed ? (
              <NavEntry collapsed icon={<Icon name="history" />} label="Sessions" onClick={() => apply({ ...layout, navCollapsed: false }, false)} />
            ) : <SessionsPanel a={a} env={env} />}
          </NavGroup>
        ) : <div className={s.navGrow} />}

        <NavGroup label="Tools" collapsed={navCollapsed}>
          {/* Cloud, add-on and top-up sit behind the same gates as the workspace (desktop bridge, signed in, Lite and up). */}
          {!(bridge && allowed) ? null : isBlender ? (
            <>
              <NavEntry collapsed={navCollapsed} icon={<Icon name="cube" />} label="Blender Cloud" onClick={() => setDialog("cloud")} />
              <NavEntry collapsed={navCollapsed} icon={<Icon name="blender" />} label="Blender add-on" onClick={() => setDialog("blender")} />
            </>
          ) : (
            <>
              <NavEntry collapsed={navCollapsed} icon={<Icon name="plan" />} label="Game ideas" onClick={() => setDialog("ideas")} />
              <NavEntry collapsed={navCollapsed} icon={<Icon name="cube" />} label="Roblox Cloud" onClick={() => setDialog("cloud")} />
            </>
          )}
          {bridge && allowed ? <NavEntry collapsed={navCollapsed} icon={<Icon name="credit" />} label="Auto top-up" onClick={() => setDialog("topup")} /> : null}
          <NavEntry collapsed={navCollapsed} icon={<MorphIcon icon="settings" state={dialog === "settings" ? "open" : "closed"} />} label="Settings" onClick={() => setDialog("settings")} />
        </NavGroup>
      </nav>

      <main className={s.main} aria-label={`${ENV_LABEL[env]} workspace`}>
        {head}
        <div className={s.body}>{content}</div>
        {ready ? (
          <div className={s.bottom}>
            <ControlCenter a={a} env={env} mode={mode} connection={connection} onOpenTopUp={() => setDialog("topup")} />
            <Composer a={a} env={env} mode={mode} canPlayTest={!isBlender} />
          </div>
        ) : null}
      </main>

      <Dialog open={dialog === "cloud"} onOpenChange={close} size="lg" title={isBlender ? "Blender Cloud" : "Roblox Cloud"} description={isBlender ? "Render on Keplar's servers while you're away." : "Script jobs that run while you're away."}>
        {isBlender ? <BlenderCloudPanel busy={a.running} /> : <RobloxCloudPanel bridge={studio} place={a.place} busy={a.running} />}
      </Dialog>
      {!isBlender ? (
        <Dialog open={dialog === "ideas"} onOpenChange={close} size="lg" title="Game ideas" description="Original ideas aimed at gaps and trends on Roblox right now, each ready to hand to Solar.">
          <IdeasPanel busy={a.running} onBuild={(prompt) => { offerDraft("roblox", prompt); setDialog(null); }} />
        </Dialog>
      ) : null}
      <Dialog open={dialog === "topup"} onOpenChange={close} size="md" title="Auto top-up">
        <TopUpPanel />
      </Dialog>
      {isBlender ? (
        <Dialog open={dialog === "blender"} onOpenChange={close} size="md" title="Blender add-on">
          <BlenderSetup status={blender.status} note={blender.note} busy={blender.busy} onSetup={() => void blender.setup()} onConnect={() => void blender.connect()} />
        </Dialog>
      ) : null}
      <SettingsDialog
        open={dialog === "settings"}
        onOpenChange={close}
        a={a}
        env={env}
        view={layout.view}
        onViewChange={setView}
        onResetLayout={resetLayout}
        onSaveLayout={saveLayout}
        onRestoreLayout={restoreLayout}
        hasSavedLayout={Boolean(saved)}
      />
    </div>
  );
}

/* ── Nav parts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

function NavGroup({ label, collapsed, grow, children }: { label: string; collapsed: boolean; grow?: boolean; children: ReactNode }) {
  return (
    <section className={s.navGroup} data-grow={grow ? "" : undefined} aria-label={label}>
      {collapsed ? null : <h2 className={s.navLabel}>{label}</h2>}
      <div className={s.navItems}>{children}</div>
    </section>
  );
}

function NavEntry({ icon, label, collapsed, current, href, onClick, trailing }: { icon: ReactNode; label: string; collapsed: boolean; current?: boolean; href?: string; onClick?: () => void; trailing?: ReactNode }) {
  const inner = (
    <>
      <span className={s.navIcon}>{icon}</span>
      {collapsed ? null : <span className={s.navText}>{label}</span>}
      {collapsed ? null : trailing}
    </>
  );
  const el = href && !current ? (
    <Link href={href} className={s.navEntry} aria-label={label}>{inner}</Link>
  ) : (
    <button type="button" className={s.navEntry} aria-current={current ? "page" : undefined} aria-label={label} onClick={onClick}>{inner}</button>
  );
  return collapsed ? <Tooltip content={label} side="right">{el}</Tooltip> : el;
}
