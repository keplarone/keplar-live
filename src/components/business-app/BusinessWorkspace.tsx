"use client";

import { siteUrl } from "@/lib/site";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Analyst } from "./Analyst";
import { Ask } from "./Ask";
import { Dashboard } from "./Dashboard";
import { Home, type HomeMode } from "./Home";
import { Projects } from "./Projects";
import { SIGN_OUT_FAILED, signOutOfBusiness } from "@/components/business-site/sign-out";
import c from "./cursor.module.css";
import s from "./workspace.module.css";

/** The Business operating system (orders, CRM, inbox, agents, approvals, connectors, audit) and Create, loaded only when opened. */
type OsTab = "overview" | "orders" | "crm" | "inbox" | "agents" | "approvals" | "connectors" | "apps" | "audit";
const OS_TABS: readonly OsTab[] = ["overview", "orders", "crm", "inbox", "agents", "approvals", "connectors", "apps", "audit"];
const Loading = () => <div className={s.center}><span className={s.spinner} aria-label="Loading" /></div>;
const BusinessOS = dynamic(() => import("@/components/business/BusinessOS").then((m) => m.BusinessOS), { ssr: false, loading: Loading });
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
  if (v === "os") { const tab = q.get("t") as OsTab | null; return { at: "os", tab: tab && OS_TABS.includes(tab) ? tab : "overview" }; }
  if (v === "research" || v === "reason") return { at: v, openId: q.get("r") ?? undefined, key: k() };
  return { at: "home" };
}

function writeView(v: View) {
  const q = new URLSearchParams();
  if (v.at === "projects") { q.set("v", "projects"); if (v.projectId) q.set("p", v.projectId); }
  else if (v.at === "dashboard") q.set("v", "dashboard");
  else if (v.at === "create") q.set("v", "create");
  else if (v.at === "os") { q.set("v", "os"); if (v.tab !== "overview") q.set("t", v.tab); }
  else if (v.at === "research" || v.at === "reason") { q.set("v", v.at); if (v.openId) q.set("r", v.openId); }
  const qs = q.toString();
  window.history.pushState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const TONES = ["#4ade80", "#f472b6", "#f87171", "#60a5fa", "#fbbf24", "#a78bfa"];
const tone = (id: string) => TONES[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length];

const Icon = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/**
 * Keplar Business workspace (business.keplar.one/work; the desktop app opens it for Business accounts), laid out like Cursor's
 * agent window: a compact sidebar (new chat, search, the main places, Projects, Recent, account) and a quiet main area with
 * one centered composer. Dark Geist; none of Keplar One's consumer navigation. Only built modules are shown.
 */
export function BusinessWorkspace({ fontClass }: { fontClass: string }) {
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

  const go = (v: View) => { setView(v); writeView(v); };
  const toggleSide = () => setCollapsed((x) => { try { localStorage.setItem(SIDE_KEY, x ? "open" : "closed"); } catch { /* ignore */ } return !x; });
  const onSend = (mode: HomeMode, text: string, projectId: string | null) => {
    if (mode === "ask") go({ at: "ask", q: text, projectId, key: k() });
    else go({ at: mode, seed: text, projectId: projectId ?? undefined, key: k() });
  };

  if (!acct) return <div className={`${s.root} ${c.cursor} ${fontClass}`}><div className={s.center}><span className={s.spinner} aria-label="Loading" /></div></div>;

  if (!active) {
    return (
      <div className={`${s.root} ${c.cursor} ${fontClass}`}>
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
    { id: "agents", label: "Agents", icon: I.agents, view: () => ({ at: "os", tab: "agents" }), current: osAt("agents") },
    { id: "approvals", label: "Approvals", icon: I.approvals, view: () => ({ at: "os", tab: "approvals" }), current: osAt("approvals") },
    { id: "operations", label: "Operations", icon: I.operations, view: () => ({ at: "os", tab: "overview" }), current: osAt("overview", "orders", "crm", "inbox", "audit") },
    { id: "integrations", label: "Integrations", icon: I.integrations, view: () => ({ at: "os", tab: "connectors" }), current: osAt("connectors", "apps") },
    { id: "research", label: "Deep Research", icon: I.research, view: () => ({ at: "research", key: k() }), current: is("research") },
    { id: "reason", label: "Reason", icon: I.reason, view: () => ({ at: "reason", key: k() }), current: is("reason") },
  ];

  return (
    <div className={`${s.root} ${c.cursor} ${fontClass}`}>
      <div className={c.shell} data-collapsed={collapsed || undefined}>
        <aside className={c.side} aria-label="Business workspace">
          <div className={c.sideTop}>
            <button type="button" className={c.iconBtn} onClick={toggleSide} aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={!collapsed}>
              <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} />
            </button>
            <span className={c.grow} />
            <button type="button" className={c.iconBtn} onClick={() => history.back()} aria-label="Back"><Icon d={<path d="M19 12H5M11 6l-6 6 6 6" />} /></button>
            <button type="button" className={c.iconBtn} onClick={() => history.forward()} aria-label="Forward"><Icon d={<path d="M5 12h14M13 6l6 6-6 6" />} /></button>
          </div>

          <nav className={c.nav}>
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
                <span className={c.projIcon} style={{ color: tone(p.id) }} aria-hidden="true"><Icon d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} size={14} /></span>
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
            <a className={c.iconBtn} href={`${siteUrl}/account`} aria-label="Keplar account settings" title="Keplar account settings"><Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} /></a>
            <button type="button" className={c.iconBtn} onClick={() => void signOut()} disabled={signingOut} aria-label={signingOut ? "Signing out" : `Sign out${acct.email ? ` of ${acct.email}` : ""}`} title="Sign out"><Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>} /></button>
          </div>
          {signOutError ? <p className={c.empty} role="alert">{signOutError}</p> : null}
        </aside>

        <section className={c.main}>
          <header className={c.mainTop}>
            {collapsed ? <button type="button" className={c.iconBtn} onClick={toggleSide} aria-label="Show sidebar"><Icon d={<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>} /></button> : null}
            <span className={c.grow} />
            <a className={c.topLink} href={ONE}>Keplar One <Icon d={<path d="M7 17L17 7M9 7h8v8" />} size={12} /></a>
          </header>
          <div className={c.mainBody}>
            {view.at === "home" ? <Home projects={projects} onSend={onSend} onNewProject={() => go({ at: "projects", projectId: null })} />
              : view.at === "ask" ? <Ask key={view.key} first={view.q} projectId={view.projectId} />
              : view.at === "dashboard" ? <Dashboard onOpenProject={(id) => go({ at: "projects", projectId: id })} />
              : view.at === "projects" ? <Projects projectId={view.projectId} onOpen={(id) => { go({ at: "projects", projectId: id }); loadSide(); }} />
              : view.at === "create" ? <div className={s.module}><CreateStudio signedIn plan="business" /></div>
              : view.at === "os" ? <div className={s.module}><BusinessOS key={view.tab} initialTab={view.tab} embedded /></div>
              : <Analyst key={view.key} kind={view.at} seed={view.seed} openId={view.openId} projectSeed={view.projectId} onSaved={loadSide} />}
          </div>
        </section>
      </div>
    </div>
  );
}
