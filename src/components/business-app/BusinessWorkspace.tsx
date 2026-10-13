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
import { usePulse } from "./pulse";
import { listChats, newChatId, type ChatMeta } from "./chats";
import { useBusinessNavigation } from "./useBusinessNavigation";
import { SIGN_OUT_FAILED, signOutOfBusiness } from "@/components/business-site/sign-out";
import { SETTINGS_SECTIONS, SIDE_KEY, settingsSectionFrom, type SettingsSection } from "./settings-sections";
import c from "./cursor.module.css";
import s from "./workspace.module.css";

/** The Business operating system (orders, CRM, inbox, agents, approvals, connectors, audit) and Create, loaded only when opened. */
type OsTab = "overview" | "orders" | "crm" | "inbox" | "agents" | "approvals" | "connectors" | "apps" | "audit";
const OS_TABS: readonly OsTab[] = ["overview", "orders", "crm", "inbox", "agents", "approvals", "connectors", "apps", "audit"];
const Loading = () => <div className={s.center}><span className={s.spinner} aria-label="Loading" /></div>;
const BusinessOS = dynamic(() => import("@/components/business/BusinessOS").then((m) => m.BusinessOS), { ssr: false, loading: Loading });
const DesignCanvas = dynamic(() => import("./DesignCanvas").then((m) => m.DesignCanvas), { ssr: false, loading: Loading });
const Settings = dynamic(() => import("./Settings").then((m) => m.Settings), { ssr: false });
const Computer = dynamic(() => import("./Computer").then((m) => m.Computer), { ssr: false, loading: Loading });
const CreateStudio = dynamic(() => import("@/components/create/CreateStudio").then((m) => m.CreateStudio), { ssr: false, loading: Loading });

type Account = { signedIn: boolean; email?: string | null; account?: { company: string } | null; active?: boolean; plan?: { name: string } | null };
type Project = { id: string; name: string; createdAt: string };
type Recent = { id: string; kind: "research" | "reason"; title: string; createdAt: string };
type View =
  | { at: "home" }
  | { at: "ask"; q?: string; projectId: string | null; key: string; chatId: string; resume?: boolean }
  | { at: "dashboard" }
  | { at: "projects"; projectId: string | null }
  | { at: "create" }
  | { at: "canvas" }
  | { at: "computer" }
  | { at: "os"; tab: OsTab }
  | { at: "research" | "reason"; seed?: string; openId?: string; projectId?: string; key: string };

/** This is the Business app (business.keplar.one): "/" is its storefront. Keplar One is a separate app on keplar.one. */
const STORE = "/";
const ONE = `${siteUrl}/app`;
const k = () => Math.random().toString(36).slice(2, 9);

function readView(): View {
  if (typeof window === "undefined") return { at: "home" };
  const q = new URLSearchParams(window.location.search);
  const v = q.get("v");
  if (v === "projects") return { at: "projects", projectId: q.get("p") };
  if (v === "chat") { const c = q.get("c"); if (c && /^[A-Za-z0-9_-]{4,64}$/.test(c)) return { at: "ask", chatId: c, resume: true, projectId: null, key: k() }; }
  if (v === "dashboard") return { at: "dashboard" };
  if (v === "create") return { at: "create" };
  if (v === "canvas") return { at: "canvas" };
  if (v === "computer") return { at: "computer" };
  if (v === "os") { const tab = q.get("t") as OsTab | null; return { at: "os", tab: tab && OS_TABS.includes(tab) ? tab : "overview" }; }
  if (v === "research" || v === "reason") return { at: v, openId: q.get("r") ?? undefined, key: k() };
  return { at: "home" };
}

/** Settings is a popover over whatever is open. Old links (?v=settings&s=plan) open it over the home screen. */
function readSettings(): SettingsSection | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  return q.get("v") === "settings" ? settingsSectionFrom(q.get("s")) : null;
}

function writeView(v: View) {
  const q = new URLSearchParams();
  if (v.at === "projects") { q.set("v", "projects"); if (v.projectId) q.set("p", v.projectId); }
  else if (v.at === "ask") { q.set("v", "chat"); q.set("c", v.chatId); }
  else if (v.at === "dashboard") q.set("v", "dashboard");
  else if (v.at === "create") q.set("v", "create");
  else if (v.at === "canvas") q.set("v", "canvas");
  else if (v.at === "computer") q.set("v", "computer");
  else if (v.at === "os") { q.set("v", "os"); if (v.tab !== "overview") q.set("t", v.tab); }
  else if (v.at === "research" || v.at === "reason") { q.set("v", v.at); if (v.openId) q.set("r", v.openId); }
  const qs = q.toString();
  window.history.pushState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || Boolean(t.closest(".cm-editor")));

const Icon = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/**
 * Keplar Business workspace (business.keplar.one/work; the desktop app opens it for Business accounts), laid out like a modern
 * AI coding tool (Codex, Cursor, Claude Code): a collapsible sidebar grouped by what you do (build, agents, research, business),
 * one quiet top bar, and a centered composer. Settings is a popover from the account button, so it never replaces the work
 * underneath. Ctrl+K jumps anywhere, Ctrl+, opens settings, Ctrl+B toggles the sidebar. Only built modules are shown.
 */
export function BusinessWorkspace({ fontClass }: { fontClass: string }) {
  const { mobile, open: drawerOpen, sideRef, menuRef, close: closeNavigation, toggle: toggleNavigation } = useBusinessNavigation();
  const [acct, setAcct] = useState<Account | null>(null);
  const [view, setView] = useState<View>(readView);
  const [settings, setSettings] = useState<SettingsSection | null>(readSettings);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [chatList, setChatList] = useState<ChatMeta[]>([]);
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
    void listChats().then((c) => setChatList(c.slice().sort((a, b) => b.updatedAt - a.updatedAt)));
  }, []);
  const active = Boolean(acct?.signedIn && acct.active);
  useEffect(() => { if (active) queueMicrotask(loadSide); }, [active, loadSide]);
  const { pulse } = usePulse(active);

  const toggleSide = useCallback(() => {
    if (mobile) { toggleNavigation(); return; }
    setCollapsed((x) => { try { localStorage.setItem(SIDE_KEY, x ? "open" : "closed"); } catch { /* ignore */ } return !x; });
  }, [mobile, toggleNavigation]);

  // Ctrl+K (⌘K) jumps anywhere, Ctrl+, (⌘,) opens settings, Ctrl+B (⌘B) shows or hides the sidebar outside text fields.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") { e.preventDefault(); setPaletteOpen((x) => !x); }
      else if (key === ",") { e.preventDefault(); setSettings((x) => (x ? null : "general")); }
      else if (key === "b" && !editable(e.target)) { e.preventDefault(); toggleSide(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, toggleSide]);

  const go = (v: View) => { setView(v); writeView(v); closeNavigation(); };
  const openSettings = (section: SettingsSection) => { setSettings(section); closeNavigation(); };
  const closeSettings = useCallback(() => setSettings(null), []);
  // Attached images and video go to the opened chat or report in memory only (the view itself is saved in the address).
  const [sentMedia, setSentMedia] = useState<{ key: string; media: MediaInput } | null>(null);
  const onSend = (mode: HomeMode, text: string, projectId: string | null, media?: MediaInput) => {
    const key = k();
    setSentMedia(media ? { key, media } : null);
    if (mode === "ask") go({ at: "ask", q: text, projectId, key, chatId: newChatId() });
    else go({ at: mode, seed: text, projectId: projectId ?? undefined, key });
  };

  if (!acct) return <div className={`${s.root} ${c.cursor} ${fontClass}`} data-kb=""><div className={s.center}><span className={s.spinner} aria-label="Loading" /></div></div>;

  if (!active) {
    return (
      <div className={`${s.root} ${c.cursor} ${fontClass}`} data-kb="">
        <div className={s.center}>
          <div className={c.gate}>
            <BusinessMark size={36} />
            <h1 className={c.gateTitle}>Keplar Business</h1>
            <p className={c.gateText}>{!acct.signedIn ? "Sign in with the account that has your Business plan." : "This workspace comes with a Keplar Business plan."}</p>
            <div className={c.gateActions}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /signin is a route handler (the sign-in handoff from keplar.one): it needs a full page load */}
              {!acct.signedIn ? <a className={c.pillPrimary} href="/signin?next=%2Fwork">Sign in</a> : <a className={c.pillPrimary} href={STORE}>See Business plans</a>}
              <a className={c.pillGhost} href={ONE}>Open Keplar One</a>
              {/* Signed in with an account that has no Business plan: let them switch to the right one. */}
              {acct.signedIn ? <button type="button" className={c.pillGhost} onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button> : null}
            </div>
            {acct.signedIn && acct.email ? <p className={c.gateText}>Signed in as {acct.email}.</p> : null}
            {signOutError ? <p className={c.gateText} role="alert">{signOutError}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const f = filter.trim().toLowerCase();
  const shownProjects = projects.filter((p) => !f || p.name.toLowerCase().includes(f)).slice(0, f ? 20 : 6);
  const shownRecent = recent.filter((r) => !f || r.title.toLowerCase().includes(f)).slice(0, f ? 30 : 8);
  const shownChats = chatList.filter((c) => !f || c.title.toLowerCase().includes(f)).slice(0, f ? 30 : 8);
  const openChat = (id: string) => go({ at: "ask", chatId: id, resume: true, projectId: null, key: k() });
  const is = (at: View["at"]) => view.at === at;
  const osAt = (...tabs: OsTab[]) => view.at === "os" && tabs.includes(view.tab);
  const pending = pulse?.approvals.pending ?? 0;

  const I = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    create: <><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></>,
    canvas: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M12 18v3" /><path d="M14.5 8.5l2.5 2.5-3 3h-2.5v-2.5z" /></>,
    agents: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4M9.5 13h.01M14.5 13h.01" /><path d="M2.5 13.5v2M21.5 13.5v2" /></>,
    approvals: <><path d="M9 11l2 2 4-4" /><path d="M5 4h14v13l-7 4-7-4z" /></>,
    computer: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M10 8l4 2-4 2z" /></>,
    operations: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9h18M9 20v-6h6v6" /></>,
    integrations: <><path d="M9 7V3M15 7V3" /><path d="M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></>,
    research: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
    reason: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></>,
  };
  /** Sidebar places, grouped by what you do: each opens a real module. Business OS sections share one component, opened at their own tab. */
  const PLACES: { id: string; group: string; label: string; icon: React.ReactNode; view: () => View; current: boolean; badge?: number }[] = [
    { id: "create", group: "Build", label: "Create", icon: I.create, view: () => ({ at: "create" }), current: is("create") },
    { id: "canvas", group: "Build", label: "Design Canvas", icon: I.canvas, view: () => ({ at: "canvas" }), current: is("canvas") },
    { id: "agents", group: "Agents", label: "Agents", icon: I.agents, view: () => ({ at: "os", tab: "agents" }), current: osAt("agents") },
    { id: "computer", group: "Agents", label: "Computer use", icon: I.computer, view: () => ({ at: "computer" }), current: is("computer") },
    { id: "approvals", group: "Agents", label: "Approvals", icon: I.approvals, view: () => ({ at: "os", tab: "approvals" }), current: osAt("approvals"), badge: pending },
    { id: "research", group: "Research", label: "Deep Research", icon: I.research, view: () => ({ at: "research", key: k() }), current: is("research") },
    { id: "reason", group: "Research", label: "Reason", icon: I.reason, view: () => ({ at: "reason", key: k() }), current: is("reason") },
    { id: "dashboard", group: "Business", label: "Dashboard", icon: I.dashboard, view: () => ({ at: "dashboard" }), current: is("dashboard") },
    { id: "operations", group: "Business", label: "Operations", icon: I.operations, view: () => ({ at: "os", tab: "overview" }), current: osAt("overview", "orders", "crm", "inbox", "audit") },
    { id: "integrations", group: "Business", label: "Integrations", icon: I.integrations, view: () => ({ at: "os", tab: "connectors" }), current: osAt("connectors", "apps") },
  ];
  const groups = [...new Set(PLACES.map((p) => p.group))];
  const openPlace = (p: HomePlace) => (p === "settings" ? openSettings("billing") : go(p === "dashboard" ? { at: "dashboard" } : { at: "os", tab: p }));
  /** Everything the command palette can do: the places, quick actions, projects, recent reports, settings and the account. */
  const COMMANDS: Command[] = [
    ...PLACES.map((p) => ({ id: `place-${p.id}`, label: p.label, section: "Go to", keywords: p.group, icon: <Icon d={p.icon} />, run: () => go(p.view()) })),
    { id: "new-chat", label: "New chat", section: "Actions", keywords: "ask home composer", icon: <Icon d={<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />} />, run: () => go({ at: "home" }) },
    { id: "new-project", label: "New project", section: "Actions", icon: <Icon d={<path d="M12 5v14M5 12h14" />} />, run: () => go({ at: "projects", projectId: null }) },
    { id: "toggle-side", label: collapsed ? "Show sidebar" : "Hide sidebar", section: "Actions", hint: "Ctrl B", icon: <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} />, run: toggleSide },
    { id: "keplar-one", label: "Open Keplar One", section: "Actions", icon: <Icon d={<path d="M7 17L17 7M9 7h8v8" />} />, run: () => window.location.assign(ONE) },
    ...projects.map((p) => ({ id: `project-${p.id}`, label: p.name, section: "Projects", keywords: "project", icon: <Icon d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} />, run: () => go({ at: "projects", projectId: p.id }) })),
    ...chatList.slice(0, 30).map((c) => ({ id: `chat-${c.id}`, label: c.title, section: "Chats", hint: ago(new Date(c.updatedAt).toISOString()), keywords: "chat conversation", icon: <Icon d={<path d="M4 5h16v11H8l-4 4z" />} />, run: () => openChat(c.id) })),
    ...recent.map((r) => ({ id: `report-${r.id}`, label: r.title, section: "Recent reports", hint: ago(r.createdAt), keywords: r.kind === "research" ? "deep research report" : "reason decision", icon: <Icon d={r.kind === "research" ? I.research : I.reason} />, run: () => go({ at: r.kind, openId: r.id, key: k() }) })),
    ...SETTINGS_SECTIONS.map((x) => ({ id: `settings-${x.id}`, label: `Settings: ${x.label}`, section: "Settings", keywords: "settings preferences", run: () => openSettings(x.id) })),
    { id: "sign-out", label: "Sign out", section: "Account", keywords: "log out leave", run: () => void signOut() },
  ];
  const title = PLACES.find((place) => place.current)?.label ?? (view.at === "projects" ? "Projects" : view.at === "ask" ? "Chat" : "Home");
  const who = acct.account?.company ?? acct.email ?? "Keplar Business";

  return (
    <div className={`${s.root} ${c.cursor} ${fontClass}`} data-kb="">
      <div className={c.shell} data-collapsed={collapsed || undefined} data-menu-open={drawerOpen || undefined}>
        {drawerOpen ? <button type="button" className={c.backdrop} onClick={closeNavigation} aria-label="Close navigation" tabIndex={-1} /> : null}
        <aside id="business-navigation" ref={sideRef} className={c.side} aria-label="Business workspace" role={drawerOpen ? "dialog" : undefined} aria-modal={drawerOpen || undefined} tabIndex={-1}>
          <div className={c.sideTop}>
            <span className={c.sideBrand}><BusinessMark size={22} /><span className={c.wordmark}>Keplar <span>Business</span></span></span>
            <button type="button" className={c.iconBtn} onClick={toggleSide} aria-label={mobile ? "Close navigation" : "Hide sidebar"} title={mobile ? undefined : "Hide sidebar (Ctrl+B)"} aria-expanded={mobile ? drawerOpen : !collapsed} aria-controls="business-navigation">
              <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} />
            </button>
          </div>

          <nav className={c.nav} aria-label="Workspace modules">
            <button type="button" className={c.item} data-strong="" aria-current={is("home") || is("ask") ? "page" : undefined} onClick={() => go({ at: "home" })}>
              <Icon d={<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />} />New chat
            </button>
            <button type="button" className={c.item} onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Control+K Meta+K">
              <Icon d={<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>} />Search<kbd className={c.kbd}>⌘K</kbd>
            </button>
          </nav>

          <div className={c.sideScroll}>
            {groups.map((g) => (
              <section key={g} className={c.group} aria-label={g}>
                <p className={c.groupTitle} data-static="">{g}</p>
                {PLACES.filter((p) => p.group === g).map((p) => (
                  <button key={p.id} type="button" className={c.item} aria-current={p.current ? "page" : undefined} onClick={() => go(p.view())}>
                    <Icon d={p.icon} />{p.label}
                    {p.badge ? <span className={c.badge} aria-label={`${p.badge} waiting`}>{p.badge}</span> : null}
                  </button>
                ))}
              </section>
            ))}

            <section className={c.group} aria-labelledby="side-projects">
              <div className={c.groupHead}>
                <button type="button" id="side-projects" className={c.groupTitle} onClick={() => go({ at: "projects", projectId: null })}>Projects</button>
                <button type="button" className={c.iconBtn} data-small="" onClick={() => go({ at: "projects", projectId: null })} aria-label="New project"><Icon d={<path d="M12 5v14M5 12h14" />} size={13} /></button>
                <button type="button" className={c.iconBtn} data-small="" aria-pressed={searching} onClick={() => { setSearching((x) => !x); setFilter(""); }} aria-label="Filter projects, chats and reports"><Icon d={<path d="M4 6h16M7 12h10M10 18h4" />} size={13} /></button>
              </div>
              {searching ? (
                <input className={c.search} autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setSearching(false); setFilter(""); } }} placeholder="Filter projects, chats and reports" aria-label="Filter projects, chats and reports" />
              ) : null}
              {shownProjects.length ? shownProjects.map((p) => (
                <button key={p.id} type="button" className={c.item} aria-current={view.at === "projects" && view.projectId === p.id ? "page" : undefined} onClick={() => go({ at: "projects", projectId: p.id })}>
                  <span className={c.projIcon} aria-hidden="true"><Icon d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} size={14} /></span>
                  <span className={c.ellipsis}>{p.name}</span>
                </button>
              )) : <p className={c.empty}>{f ? "No matching projects." : "No projects yet."}</p>}
            </section>

            <section className={c.group} aria-labelledby="side-chats">
              <div className={c.groupHead}><span id="side-chats" className={c.groupTitle} data-static="">Chats</span></div>
              {shownChats.length ? shownChats.map((ch) => (
                <button key={ch.id} type="button" className={c.recent} aria-current={view.at === "ask" && view.chatId === ch.id ? "page" : undefined} onClick={() => openChat(ch.id)}>
                  <span className={c.ellipsis}>{ch.title}</span>
                  <span className={c.when}>{ago(new Date(ch.updatedAt).toISOString())}</span>
                </button>
              )) : <p className={c.empty}>{f ? "No matching chats." : "Your chats are saved here."}</p>}
            </section>

            <section className={c.group} aria-labelledby="side-recent">
              <div className={c.groupHead}><span id="side-recent" className={c.groupTitle} data-static="">Recent</span></div>
              {shownRecent.length ? shownRecent.map((r) => (
                <button key={r.id} type="button" className={c.recent} onClick={() => go({ at: r.kind, openId: r.id, key: k() })}>
                  <span className={c.ellipsis}>{r.title}</span>
                  <span className={c.when}>{ago(r.createdAt)}</span>
                </button>
              )) : <p className={c.empty}>{f ? "No matching reports." : "Research and decisions appear here."}</p>}
            </section>
          </div>

          <div className={c.sideFoot}>
            <button type="button" className={c.account} onClick={() => openSettings("general")} aria-haspopup="dialog" aria-expanded={Boolean(settings)} title={acct.email ?? undefined}>
              <span className={c.avatar} aria-hidden="true">{who.slice(0, 1).toUpperCase()}</span>
              <span className={c.footText}>
                <span className={c.ellipsis}>{who}</span>
                <span className={c.footPlan}>{acct.plan?.name ?? "Keplar Business"}</span>
              </span>
            </button>
            <button type="button" className={c.iconBtn} onClick={() => openSettings("general")} aria-label="Settings" title="Settings (Ctrl+,)" aria-haspopup="dialog"><Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} /></button>
            <button type="button" className={c.iconBtn} onClick={() => void signOut()} disabled={signingOut} aria-label={signingOut ? "Signing out" : `Sign out${acct.email ? ` of ${acct.email}` : ""}`} title="Sign out"><Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>} /></button>
          </div>
          {signOutError ? <p className={c.empty} role="alert">{signOutError}</p> : null}
        </aside>

        <section className={c.main} inert={drawerOpen || undefined}>
          <header className={c.mainTop}>
            {collapsed || mobile ? <button ref={menuRef} type="button" className={c.iconBtn} onClick={toggleSide} aria-label={mobile ? "Open navigation" : "Show sidebar"} title={mobile ? undefined : "Show sidebar (Ctrl+B)"} aria-expanded={mobile ? drawerOpen : !collapsed} aria-controls="business-navigation"><Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} /></button> : null}
            <span className={c.viewName}>{title}</span>
            <span className={c.grow} />
            <button type="button" className={c.kbdBtn} onClick={() => setPaletteOpen(true)} aria-label="Open the command palette" aria-keyshortcuts="Control+K Meta+K"><Icon d={<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>} size={13} />Jump to<kbd>⌘K</kbd></button>
            <a className={c.topLink} href={ONE}>Keplar One <Icon d={<path d="M7 17L17 7M9 7h8v8" />} size={12} /></a>
          </header>
          <div className={c.mainBody}>
            {view.at === "home" ? <Home projects={projects} onSend={onSend} onNewProject={() => go({ at: "projects", projectId: null })} onOpenProject={(id) => go({ at: "projects", projectId: id })} onBuild={() => go({ at: "create" })} company={acct.account?.company ?? null} pulse={pulse} onOpen={openPlace} />
              : view.at === "ask" ? <Ask key={view.key} chatId={view.chatId} resume={view.resume} first={view.q} firstMedia={sentMedia?.key === view.key ? sentMedia.media : undefined} projectId={view.projectId} onSaved={loadSide} />
              : view.at === "dashboard" ? <Dashboard onOpenProject={(id) => go({ at: "projects", projectId: id })} />
              : view.at === "projects" ? <Projects projectId={view.projectId} onOpen={(id) => { go({ at: "projects", projectId: id }); loadSide(); }} />
              : view.at === "create" ? <div className={s.module}><CreateStudio signedIn plan="business" /></div>
              : view.at === "canvas" ? <div className={s.module}><DesignCanvas /></div>
              : view.at === "computer" ? <Computer onOpenSettings={() => openSettings("computer")} />
              : view.at === "os" ? <div className={s.module}><BusinessOS key={view.tab} initialTab={view.tab} embedded /></div>
              : <Analyst key={view.key} kind={view.at} seed={view.seed} seedMedia={sentMedia?.key === view.key ? sentMedia.media : undefined} openId={view.openId} projectSeed={view.projectId} onSaved={loadSide} />}
          </div>
        </section>
      </div>
      <CommandPalette open={paletteOpen} commands={COMMANDS} onClose={() => setPaletteOpen(false)} />
      {settings ? <Settings section={settings} onSection={setSettings} onClose={closeSettings} onOpenPlace={(p) => { setSettings(null); go(p === "computer" ? { at: "computer" } : p === "integrations" ? { at: "os", tab: "connectors" } : { at: "os", tab: p }); }} /> : null}
    </div>
  );
}
