"use client";

import { siteUrl } from "@/lib/site";
import { useCallback, useEffect, useState } from "react";
import { Analyst } from "./Analyst";
import { Ask } from "./Ask";
import { Dashboard } from "./Dashboard";
import { Home, type HomeMode } from "./Home";
import { Projects } from "./Projects";
import c from "./cursor.module.css";
import s from "./workspace.module.css";

type Account = { signedIn: boolean; email?: string | null; account?: { company: string } | null; active?: boolean; plan?: { name: string } | null };
type Project = { id: string; name: string; createdAt: string };
type Recent = { id: string; kind: "research" | "reason"; title: string; createdAt: string };
type View =
  | { at: "home" }
  | { at: "ask"; q: string; projectId: string | null; key: string }
  | { at: "dashboard" }
  | { at: "projects"; projectId: string | null }
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
  if (v === "research" || v === "reason") return { at: v, openId: q.get("r") ?? undefined, key: k() };
  return { at: "home" };
}

function writeView(v: View) {
  const q = new URLSearchParams();
  if (v.at === "projects") { q.set("v", "projects"); if (v.projectId) q.set("p", v.projectId); }
  else if (v.at === "dashboard") q.set("v", "dashboard");
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  const f = filter.trim().toLowerCase();
  const shownProjects = projects.filter((p) => !f || p.name.toLowerCase().includes(f)).slice(0, f ? 20 : 6);
  const shownRecent = recent.filter((r) => !f || r.title.toLowerCase().includes(f)).slice(0, f ? 30 : 12);
  const is = (at: View["at"]) => view.at === at;

  const PLACES = [
    { at: "dashboard" as const, label: "Dashboard", icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></> },
    { at: "research" as const, label: "Deep Research", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></> },
    { at: "reason" as const, label: "Reason", icon: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></> },
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
              <button key={p.at} type="button" className={c.item} aria-current={is(p.at) ? "page" : undefined} onClick={() => go(p.at === "dashboard" ? { at: "dashboard" } : { at: p.at, key: k() })}>
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
          </div>
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
              : <Analyst key={view.key} kind={view.at} seed={view.seed} openId={view.openId} projectSeed={view.projectId} onSaved={loadSide} />}
          </div>
        </section>
      </div>
    </div>
  );
}
