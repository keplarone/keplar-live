"use client";

import { siteUrl } from "@/lib/site";
import { BusinessMark } from "@/components/business-site/BusinessMark";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { MediaInput } from "@/lib/orchestration/media";
import { Analyst } from "./Analyst";
import { Ask } from "./Ask";
import { CommandPalette, type Command } from "./CommandPalette";
import { Dashboard } from "./Dashboard";
import { Home, type HomeMode, type HomePlace } from "./Home";
import { Projects } from "./Projects";
import { count, usePulse, type Pulse } from "./pulse";
import { useBusinessNavigation } from "./useBusinessNavigation";
import { SIGN_OUT_FAILED, signOutOfBusiness } from "@/components/business-site/sign-out";
import { isSettingsSection, SETTINGS_SECTIONS, type SettingsSection } from "./settings-sections";
import c from "./cursor.module.css";
import s from "./workspace.module.css";

/** The Business operating system (orders, CRM, inbox, agents, approvals, connectors, audit) and Create, loaded only when opened. */
type OsTab = "overview" | "orders" | "crm" | "inbox" | "agents" | "approvals" | "connectors" | "apps" | "audit";
const OS_TABS: readonly OsTab[] = ["overview", "orders", "crm", "inbox", "agents", "approvals", "connectors", "apps", "audit"];
const Loading = () => <div className={s.center}><span className={s.spinner} aria-label="Loading" /></div>;
const BusinessOS = dynamic(() => import("@/components/business/BusinessOS").then((m) => m.BusinessOS), { ssr: false, loading: Loading });
const DesignCanvas = dynamic(() => import("./DesignCanvas").then((m) => m.DesignCanvas), { ssr: false, loading: Loading });
const Settings = dynamic(() => import("./Settings").then((m) => m.Settings), { ssr: false, loading: Loading });
const CreateStudio = dynamic(() => import("@/components/create/CreateStudio").then((m) => m.CreateStudio), { ssr: false, loading: Loading });

type Account = { signedIn: boolean; email?: string | null; account?: { company: string } | null; active?: boolean; plan?: { name: string } | null };
type Project = { id: string; name: string; createdAt: string };
type Recent = { id: string; kind: "research" | "reason"; title: string; createdAt: string };
type View =
  | { at: "home" }
  | { at: "ask"; q: string; projectId: string | null; key: string }
  | { at: "dashboard" }
  | { at: "projects"; projectId: string | null }
  | { at: "create" }
  | { at: "canvas" }
  | { at: "settings"; section: SettingsSection }
  | { at: "os"; tab: OsTab }
  | { at: "research" | "reason"; seed?: string; openId?: string; projectId?: string; key: string };

/** This is the Business app (business.keplar.one): "/" is its storefront. Keplar One is a separate app on keplar.one. */
const STORE = "/";
const ONE = `${siteUrl}/app`;
const SIDE_KEY = "keplar-biz-side";
const k = () => Math.random().toString(36).slice(2, 9);

function readView(): View {
  if (typeof window === "undefined") return { at: "home" };
  const q = new URLSearchParams(window.location.search);
  const v = q.get("v");
  if (v === "projects") return { at: "projects", projectId: q.get("p") };
  if (v === "dashboard") return { at: "dashboard" };
  if (v === "create") return { at: "create" };
  if (v === "canvas") return { at: "canvas" };
  if (v === "settings") { const sec = q.get("s"); return { at: "settings", section: isSettingsSection(sec) ? sec : "general" }; }
  if (v === "os") { const tab = q.get("t") as OsTab | null; return { at: "os", tab: tab && OS_TABS.includes(tab) ? tab : "overview" }; }
  if (v === "research" || v === "reason") return { at: v, openId: q.get("r") ?? undefined, key: k() };
  return { at: "home" };
}

function writeView(v: View) {
  const q = new URLSearchParams();
  if (v.at === "projects") { q.set("v", "projects"); if (v.projectId) q.set("p", v.projectId); }
  else if (v.at === "dashboard") q.set("v", "dashboard");
  else if (v.at === "create") q.set("v", "create");
  else if (v.at === "canvas") q.set("v", "canvas");
  else if (v.at === "settings") { q.set("v", "settings"); if (v.section !== "general") q.set("s", v.section); }
  else if (v.at === "os") { q.set("v", "os"); if (v.tab !== "overview") q.set("t", v.tab); }
  else if (v.at === "research" || v.at === "reason") { q.set("v", v.at); if (v.openId) q.set("r", v.openId); }
  const qs = q.toString();
  window.history.pushState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

const Icon = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/**
 * The live status bar over the main area: agents running, approvals waiting and credits used, from the account's own data
 * (usePulse), plus the local time and the command palette. Each reading opens the place it is about.
 */
function StatusBar({ pulse, onAgents, onApprovals, onUsage, onPalette }: { pulse: Pulse | null; onAgents: () => void; onApprovals: () => void; onUsage: () => void; onPalette: () => void }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const show = () => setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
    show();
    const t = window.setInterval(show, 20_000);
    return () => window.clearInterval(t);
  }, []);
  const pct = pulse?.compute.total ? Math.min(100, Math.round((pulse.compute.used / pulse.compute.total) * 100)) : null;
  return (
    <div className={c.status}>
      {pulse ? (
        <>
          <button type="button" className={c.statusItem} onClick={onAgents} title="Agents">
            <span className={c.statusDot} data-on={pulse.agents.active > 0 && !pulse.agents.halted ? "" : undefined} data-tone={pulse.agents.halted ? "off" : undefined} aria-hidden="true" />
            <span><strong>{count(pulse.agents.active)}</strong> {pulse.agents.halted ? "agents paused" : pulse.agents.active === 1 ? "agent live" : "agents live"}</span>
          </button>
          <button type="button" className={c.statusItem} onClick={onApprovals} data-alert={pulse.approvals.pending ? "" : undefined} title="Approvals">
            <span className={c.statusDot} data-tone={pulse.approvals.pending ? "warn" : undefined} aria-hidden="true" />
            <span><strong>{count(pulse.approvals.pending)}</strong> to approve</span>
          </button>
          <button type="button" className={c.statusItem} data-optional="" onClick={onUsage} title="Plan and usage">
            <span>Credits <strong>{count(pulse.compute.used)}</strong>{pulse.compute.total ? ` / ${count(pulse.compute.total)}` : ""}</span>
            {pct !== null ? <span className={c.statusMeter} aria-hidden="true"><i style={{ width: `${pct}%` }} /></span> : null}
          </button>
        </>
      ) : null}
      <span className={c.statusClock} aria-hidden="true">{time}</span>
      <button type="button" className={c.kbdBtn} onClick={onPalette} aria-label="Open the command palette" aria-keyshortcuts="Control+K Meta+K">Jump to<kbd>⌘K</kbd></button>
    </div>
  );
}

/**
 * Keplar Business workspace (business.keplar.one/work; the desktop app opens it for Business accounts), laid out like Cursor's
 * agent window: a compact sidebar (new chat, search, the main places, Projects, Recent, account) and a quiet main area with
 * one centered composer. Dark Geist; none of Keplar One's consumer navigation. Only built modules are shown.
 */
export function BusinessWorkspace({ fontClass }: { fontClass: string }) {
  const { mobile, open: drawerOpen, sideRef, menuRef, close: closeNavigation, toggle: toggleNavigation } = useBusinessNavigation();
  const [acct, setAcct] = useState<Account | null>(null);
  const [view, setView] = useState<View>(readView);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const signOut = async () => {
    setSigningOut(true);
    setSignOutError("");
    if (!(await signOutOfBusiness())) {
      setSigningOut(false);
      setSignOutError(SIGN_OUT_FAILED);
    }
  };

  useEffect(() => {
    let live = true;
    fetch("/api/business/account", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Account) => { if (live) setAcct(d); })
      .catch(() => { if (live) setAcct({ signedIn: false }); });
    const onPop = () => setView(readView());
    window.addEventListener("popstate", onPop);
    try { if (localStorage.getItem(SIDE_KEY) === "closed") queueMicrotask(() => setCollapsed(true)); } catch { /* storage blocked */ }
    return () => { live = false; window.removeEventListener("popstate", onPop); };
  }, []);

  // Business is permanently dark: while the workspace is open the page (and so the desktop title bar and window controls) is dark.
  // The person's saved Keplar One theme is not changed; the previous value comes back when the workspace closes.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    root.setAttribute("data-business-app", "");
    return () => {
      if (prev) root.setAttribute("data-theme", prev);
      root.removeAttribute("data-business-app");
    };
  }, []);

  const loadSide = useCallback(() => {
    fetch("/api/projects", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { projects: [] })).then((d: { projects: Project[] }) => setProjects(d.projects.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))).catch(() => undefined);
    fetch("/api/business/reports", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { reports: [] })).then((d: { reports: Recent[] }) => setRecent(d.reports)).catch(() => undefined);
  }, []);
  const active = Boolean(acct?.signedIn && acct.active);
  useEffect(() => { if (active) queueMicrotask(loadSide); }, [active, loadSide]);
  const { pulse } = usePulse(active);

  // Ctrl+K (Cmd+K on a Mac) opens the command palette anywhere in the workspace.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((x) => !x); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const go = (v: View) => { setView(v); writeView(v); closeNavigation(); };
  const toggleSide = () => { if (mobile) { toggleNavigation(); return; } setCollapsed((x) => { try { localStorage.setItem(SIDE_KEY, x ? "open" : "closed"); } catch { /* ignore */ } return !x; }); };
  // Attached images and video go to the opened chat or report in memory only (the view itself is saved in the address).
  const [sentMedia, setSentMedia] = useState<{ key: string; media: MediaInput } | null>(null);
  const onSend = (mode: HomeMode, text: string, projectId: string | null, media?: MediaInput) => {
    const key = k();
    setSentMedia(media ? { key, media } : null);
    if (mode === "ask") go({ at: "ask", q: text, projectId, key });
    else go({ at: mode, seed: text, projectId: projectId ?? undefined, key });
  };

  if (!acct) return <div className={`${s.root} ${c.cursor} ${fontClass}`} data-kb=""><div className={s.center}><span className={s.spinner} aria-label="Loading" /></div></div>;

  if (!active) {
    return (
      <div className={`${s.root} ${c.cursor} ${fontClass}`} data-kb="">
        <div className={s.center}>
          <div className={s.gate}>
            <h1 className={s.h1}>Keplar Business</h1>
            <p className={s.muted}>{!acct.signedIn ? "Sign in with the account that has your Business plan." : "This workspace comes with a Keplar Business plan."}</p>
            <div className={s.row}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /signin is a route handler (the sign-in handoff from keplar.one): it needs a full page load */}
              {!acct.signedIn ? <a className={s.btnPrimary} href="/signin?next=%2Fwork">Sign in</a> : <a className={s.btnPrimary} href={STORE}>See Business plans</a>}
              <a className={s.btnGhost} href={ONE}>Open Keplar One</a>
              {/* Signed in with an account that has no Business plan: let them switch to the right one. */}
              {acct.signedIn ? <button type="button" className={s.btnGhost} onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button> : null}
            </div>
            {acct.signedIn && acct.email ? <p className={s.muted}>Signed in as {acct.email}.</p> : null}
            {signOutError ? <p className={s.muted} role="alert">{signOutError}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const f = filter.trim().toLowerCase();
  const shownProjects = projects.filter((p) => !f || p.name.toLowerCase().includes(f)).slice(0, f ? 20 : 6);
  const shownRecent = recent.filter((r) => !f || r.title.toLowerCase().includes(f)).slice(0, f ? 30 : 12);
  const is = (at: View["at"]) => view.at === at;
  const osAt = (...tabs: OsTab[]) => view.at === "os" && tabs.includes(view.tab);

  const I = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    create: <><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M19 15l.8 1.9L21.7 18l-1.9.8L19 20.7l-.8-1.9-1.9-.8 1.9-1.1z" /></>,
    canvas: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M12 18v3" /><path d="M7 9h5M7 12.5h3" /><path d="M14.5 8.5l2.5 2.5-3 3h-2.5v-2.5z" /></>,
    agents: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4M9.5 13h.01M14.5 13h.01" /><path d="M2.5 13.5v2M21.5 13.5v2" /></>,
    approvals: <><path d="M9 11l2 2 4-4" /><path d="M5 4h14v13l-7 4-7-4z" /></>,
    operations: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9h18M9 20v-6h6v6" /></>,
    integrations: <><path d="M9 7V3M15 7V3" /><path d="M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></>,
    research: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
    reason: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></>,
  };
  /** Sidebar places: each opens a real module. Business OS sections share one component, opened at their own tab. */
  const PLACES: { id: string; label: string; icon: React.ReactNode; view: () => View; current: boolean }[] = [
    { id: "dashboard", label: "Dashboard", icon: I.dashboard, view: () => ({ at: "dashboard" }), current: is("dashboard") },
    { id: "create", label: "Create", icon: I.create, view: () => ({ at: "create" }), current: is("create") },
    { id: "canvas", label: "Design Canvas", icon: I.canvas, view: () => ({ at: "canvas" }), current: is("canvas") },
    { id: "agents", label: "Agents", icon: I.agents, view: () => ({ at: "os", tab: "agents" }), current: osAt("agents") },
    { id: "approvals", label: "Approvals", icon: I.approvals, view: () => ({ at: "os", tab: "approvals" }), current: osAt("approvals") },
    { id: "operations", label: "Operations", icon: I.operations, view: () => ({ at: "os", tab: "overview" }), current: osAt("overview", "orders", "crm", "inbox", "audit") },
    { id: "integrations", label: "Integrations", icon: I.integrations, view: () => ({ at: "os", tab: "connectors" }), current: osAt("connectors", "apps") },
    { id: "research", label: "Deep Research", icon: I.research, view: () => ({ at: "research", key: k() }), current: is("research") },
    { id: "reason", label: "Reason", icon: I.reason, view: () => ({ at: "reason", key: k() }), current: is("reason") },
  ];
  const openPlace = (p: HomePlace) => go(p === "dashboard" ? { at: "dashboard" } : p === "settings" ? { at: "settings", section: "plan" } : { at: "os", tab: p });
  /** Everything the command palette can do: the places, quick actions, projects, recent reports, settings and the account. */
  const COMMANDS: Command[] = [
    ...PLACES.map((p) => ({ id: `place-${p.id}`, label: p.label, section: "Go to", icon: <Icon d={p.icon} />, run: () => go(p.view()) })),
    { id: "new-chat", label: "New chat", section: "Actions", keywords: "ask home", icon: <Icon d={<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />} />, run: () => go({ at: "home" }) },
    { id: "new-project", label: "New project", section: "Actions", icon: <Icon d={<path d="M12 5v14M5 12h14" />} />, run: () => go({ at: "projects", projectId: null }) },
    { id: "keplar-one", label: "Open Keplar One", section: "Actions", icon: <Icon d={<path d="M7 17L17 7M9 7h8v8" />} />, run: () => { window.location.href = ONE; } },
    ...projects.map((p) => ({ id: `project-${p.id}`, label: p.name, section: "Projects", keywords: "project", icon: <Icon d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} />, run: () => go({ at: "projects", projectId: p.id }) })),
    ...recent.map((r) => ({ id: `report-${r.id}`, label: r.title, section: "Recent reports", hint: ago(r.createdAt), keywords: r.kind === "research" ? "deep research report" : "reason decision", icon: <Icon d={r.kind === "research" ? I.research : I.reason} />, run: () => go({ at: r.kind, openId: r.id, key: k() }) })),
    ...SETTINGS_SECTIONS.map((x) => ({ id: `settings-${x.id}`, label: `Settings: ${x.label}`, section: "Settings", keywords: "settings preferences", run: () => go({ at: "settings", section: x.id }) })),
    { id: "sign-out", label: "Sign out", section: "Account", keywords: "log out leave", run: () => void signOut() },
  ];

  return (
    <div className={`${s.root} ${c.cursor} ${fontClass}`} data-kb="">
      <div className={c.shell} data-collapsed={collapsed || undefined} data-menu-open={drawerOpen || undefined}>
        {drawerOpen ? <button type="button" className={c.backdrop} onClick={closeNavigation} aria-label="Close navigation" tabIndex={-1} /> : null}
        <aside id="business-navigation" ref={sideRef} className={c.side} aria-label="Business workspace" role={drawerOpen ? "dialog" : undefined} aria-modal={drawerOpen || undefined} tabIndex={-1}>
          <div className={c.sideTop}>
            <button type="button" className={c.iconBtn} onClick={toggleSide} aria-label={mobile ? "Close navigation" : collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={mobile ? drawerOpen : !collapsed} aria-controls="business-navigation">
              <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} />
            </button>
            <span className={c.grow} />
            <button type="button" className={c.iconBtn} onClick={() => history.back()} aria-label="Back"><Icon d={<path d="M19 12H5M11 6l-6 6 6 6" />} /></button>
            <button type="button" className={c.iconBtn} onClick={() => history.forward()} aria-label="Forward"><Icon d={<path d="M5 12h14M13 6l6 6-6 6" />} /></button>
          </div>

          <div className={c.sideBrand}><BusinessMark size={24} /><span className={c.wordmark}>Keplar <span>Business</span></span></div>
          <button type="button" className={c.jump} onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Control+K Meta+K">
            <Icon d={<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>} size={14} />Jump to…<kbd>⌘K</kbd>
          </button>
          <nav className={c.nav} aria-label="Workspace modules">
            <button type="button" className={c.item} aria-current={is("home") || is("ask") ? "page" : undefined} onClick={() => go({ at: "home" })}>
              <Icon d={<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />} />New chat
            </button>
            <button type="button" className={c.item} aria-pressed={searching} onClick={() => { setSearching((x) => !x); setFilter(""); }}>
              <Icon d={<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>} />Search
            </button>
            {searching ? (
              <input className={c.search} autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setSearching(false); setFilter(""); } }} placeholder="Search projects and reports" aria-label="Search projects and reports" />
            ) : null}
            {PLACES.map((p) => (
              <button key={p.id} type="button" className={c.item} aria-current={p.current ? "page" : undefined} onClick={() => go(p.view())}>
                <Icon d={p.icon} />{p.label}
              </button>
            ))}
          </nav>

          <section className={c.group} aria-labelledby="side-projects">
            <div className={c.groupHead}>
              <button type="button" id="side-projects" className={c.groupTitle} onClick={() => go({ at: "projects", projectId: null })}>Projects</button>
              <button type="button" className={c.iconBtn} onClick={() => go({ at: "projects", projectId: null })} aria-label="New project"><Icon d={<path d="M12 5v14M5 12h14" />} size={14} /></button>
            </div>
            {shownProjects.length ? shownProjects.map((p) => (
              <button key={p.id} type="button" className={c.item} aria-current={view.at === "projects" && view.projectId === p.id ? "page" : undefined} onClick={() => go({ at: "projects", projectId: p.id })}>
                <span className={c.projIcon} aria-hidden="true"><Icon d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} size={14} /></span>
                <span className={c.ellipsis}>{p.name}</span>
              </button>
            )) : <p className={c.empty}>{f ? "No matching projects." : "No projects yet."}</p>}
          </section>

          <section className={c.group} aria-labelledby="side-recent">
            <div className={c.groupHead}><span id="side-recent" className={c.groupTitle} data-static="">Recent</span></div>
            {shownRecent.length ? shownRecent.map((r) => (
              <button key={r.id} type="button" className={c.recent} onClick={() => go({ at: r.kind, openId: r.id, key: k() })}>
                <span className={c.dot} data-kind={r.kind} aria-hidden="true" />
                <span className={c.ellipsis}>{r.title}</span>
                <span className={c.when}>{ago(r.createdAt)}</span>
              </button>
            )) : <p className={c.empty}>{f ? "No matching reports." : "Your research and decisions appear here."}</p>}
          </section>

          <div className={c.sideFoot}>
            <span className={c.avatar} aria-hidden="true">{(acct.account?.company ?? acct.email ?? "K").slice(0, 1).toUpperCase()}</span>
            <span className={c.footText}>
              <span className={c.ellipsis}>{acct.account?.company ?? acct.email}</span>
              <span className={c.footPlan}>{acct.plan?.name ?? "Keplar Business"}</span>
            </span>
            <button type="button" className={c.iconBtn} onClick={() => go({ at: "settings", section: "general" })} aria-label="Settings" title="Settings" aria-current={view.at === "settings" ? "page" : undefined}><Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} /></button>
            <button type="button" className={c.iconBtn} onClick={() => void signOut()} disabled={signingOut} aria-label={signingOut ? "Signing out" : `Sign out${acct.email ? ` of ${acct.email}` : ""}`} title="Sign out"><Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>} /></button>
          </div>
          {signOutError ? <p className={c.empty} role="alert">{signOutError}</p> : null}
        </aside>

        <section className={c.main} inert={drawerOpen || undefined}>
          <header className={c.mainTop}>
            {collapsed || mobile ? <button ref={menuRef} type="button" className={c.iconBtn} onClick={toggleSide} aria-label={mobile ? "Open navigation" : "Show sidebar"} aria-expanded={mobile ? drawerOpen : !collapsed} aria-controls="business-navigation"><Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} /></button> : null}
            <span className={c.grow} />
            <span className={c.viewName}>{PLACES.find((place) => place.current)?.label ?? (view.at === "projects" ? "Projects" : view.at === "ask" ? "Chat" : view.at === "settings" ? "Settings" : "Mission control")}</span>
            <StatusBar pulse={pulse} onAgents={() => openPlace("agents")} onApprovals={() => openPlace("approvals")} onUsage={() => openPlace("settings")} onPalette={() => setPaletteOpen(true)} />
            <a className={c.topLink} href={ONE}>Keplar One <Icon d={<path d="M7 17L17 7M9 7h8v8" />} size={12} /></a>
          </header>
          <div className={c.mainBody}>
            {view.at === "home" ? <Home projects={projects} onSend={onSend} onNewProject={() => go({ at: "projects", projectId: null })} company={acct.account?.company ?? null} pulse={pulse} onOpen={openPlace} />
              : view.at === "ask" ? <Ask key={view.key} first={view.q} firstMedia={sentMedia?.key === view.key ? sentMedia.media : undefined} projectId={view.projectId} />
              : view.at === "dashboard" ? <Dashboard onOpenProject={(id) => go({ at: "projects", projectId: id })} />
              : view.at === "projects" ? <Projects projectId={view.projectId} onOpen={(id) => { go({ at: "projects", projectId: id }); loadSide(); }} />
              : view.at === "create" ? <div className={s.module}><CreateStudio signedIn plan="business" /></div>
              : view.at === "canvas" ? <div className={s.module}><DesignCanvas /></div>
              : view.at === "settings" ? <Settings section={view.section} onSection={(section) => go({ at: "settings", section })} />
              : view.at === "os" ? <div className={s.module}><BusinessOS key={view.tab} initialTab={view.tab} embedded /></div>
              : <Analyst key={view.key} kind={view.at} seed={view.seed} seedMedia={sentMedia?.key === view.key ? sentMedia.media : undefined} openId={view.openId} projectSeed={view.projectId} onSaved={loadSide} />}
          </div>
        </section>
      </div>
      <CommandPalette open={paletteOpen} commands={COMMANDS} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
