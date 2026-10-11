"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Analyst } from "./Analyst";
import { Dashboard } from "./Dashboard";
import { Projects } from "./Projects";
import s from "./workspace.module.css";

type Account = { signedIn: boolean; email?: string | null; account?: { company: string } | null; active?: boolean; plan?: { name: string } | null };
type View = { at: "dashboard" } | { at: "projects"; projectId: string | null } | { at: "research" } | { at: "reason" };

const STORE = "https://business.keplar.one";

function readView(): View {
  if (typeof window === "undefined") return { at: "dashboard" };
  const q = new URLSearchParams(window.location.search);
  const v = q.get("v");
  if (v === "projects") return { at: "projects", projectId: q.get("p") };
  if (v === "research" || v === "reason") return { at: v };
  return { at: "dashboard" };
}

function writeView(v: View) {
  const q = new URLSearchParams();
  if (v.at !== "dashboard") q.set("v", v.at);
  if (v.at === "projects" && v.projectId) q.set("p", v.projectId);
  const qs = q.toString();
  window.history.pushState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

const NAV = [
  { at: "dashboard", label: "Dashboard", icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></> },
  { at: "projects", label: "Projects", icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
  { at: "research", label: "Deep Research", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></> },
  { at: "reason", label: "Reason", icon: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4" /></> },
] as const;

/**
 * Keplar Business workspace (keplar.one/app/work; the desktop app opens it for Business accounts). Dark Geist chrome of its
 * own, none of Keplar One's consumer navigation. Built so far: Dashboard, Projects, Deep Research and Reason. Other modules join the sidebar as
 * they ship; nothing unbuilt is shown.
 */
export function BusinessWorkspace({ fontClass }: { fontClass: string }) {
  const [acct, setAcct] = useState<Account | null>(null);
  const [view, setView] = useState<View>(readView);

  useEffect(() => {
    let live = true;
    fetch("/api/business/account", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Account) => { if (live) setAcct(d); })
      .catch(() => { if (live) setAcct({ signedIn: false }); });
    const onPop = () => setView(readView());
    window.addEventListener("popstate", onPop);
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

  const go = (v: View) => { setView(v); writeView(v); };

  if (!acct) return <div className={`${s.root} ${fontClass}`}><div className={s.center}><span className={s.spinner} aria-label="Loading" /></div></div>;

  if (!acct.signedIn || !acct.active) {
    return (
      <div className={`${s.root} ${fontClass}`}>
        <div className={s.center}>
          <div className={s.gate}>
            <h1 className={s.h1}>Keplar Business</h1>
            <p className={s.muted}>{!acct.signedIn ? "Sign in with the account that has your Business plan." : "This workspace comes with a Keplar Business plan."}</p>
            <div className={s.row}>
              {!acct.signedIn ? <Link className={s.btnPrimary} href="/signin?next=/app/work">Sign in</Link> : <a className={s.btnPrimary} href={STORE}>See Business plans</a>}
              <Link className={s.btnGhost} href="/app/ask?stay=1">Open Keplar One</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${s.root} ${fontClass}`}>
      <div className={s.shell}>
        <aside className={s.side} aria-label="Business workspace">
          <div className={s.brand}>
            <svg viewBox="0 0 398 398" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="229" height="229" rx="70" /><path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" /><circle cx="281" cy="281" r="117" /></svg>
            <span>{acct.account?.company ?? "Keplar Business"}</span>
          </div>
          <nav className={s.nav}>
            {NAV.map((n) => (
              <button key={n.at} type="button" className={s.navItem} aria-current={view.at === n.at ? "page" : undefined} onClick={() => go(n.at === "projects" ? { at: "projects", projectId: null } : { at: n.at })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">{n.icon}</svg>
                {n.label}
              </button>
            ))}
          </nav>
          <div className={s.sideFoot}>
            <span className={s.plan}>{acct.plan?.name ?? "Keplar Business"}</span>
            <span className={s.muted}>{acct.email}</span>
            <Link className={s.textLink} href="/app/ask?stay=1">Switch to Keplar One</Link>
          </div>
        </aside>
        <section className={s.main}>
          {view.at === "dashboard" ? <Dashboard onOpenProject={(id) => go({ at: "projects", projectId: id })} />
            : view.at === "projects" ? <Projects projectId={view.projectId} onOpen={(id) => go({ at: "projects", projectId: id })} />
            : <Analyst key={view.at} kind={view.at} />}
        </section>
      </div>
    </div>
  );
}
