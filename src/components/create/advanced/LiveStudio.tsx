"use client";
/**
 * /app/create/live/<id>: the full-screen live session with its Critic and Deploy tabs. Opening an invite link (#join=<token>)
 * redeems it first; if you are signed out, the token waits in this tab while you sign in, then is redeemed on return.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityIndicator, Tabs, notify, tabId, tabPanelId } from "@/components/kit";
import { SignInGate } from "@/components/app-ui/SignInGate";
import { api } from "../api";
import { CriticPane } from "./CriticPane";
import { DeployPane } from "./DeployPane";
import { LivePane, type OpenRequest } from "./LivePane";
import { useLiveSession } from "./useLiveSession";
import s from "./advanced.module.css";

type Tab = "live" | "critic" | "deploy";
const TAB_LABEL: Record<Tab, string> = { live: "Live", critic: "Critic", deploy: "Deploy" };
const joinKey = (id: string) => `keplar:join:${id}`;
/** The kit Tabs id of the session's view switch. */
const VIEW_TABS = "live-view";

/** One line of feedback as a kit toast (UI v2: notify(), no hand-rolled toast). Stable, so effects can depend on it. */
const toast = (x: string) => notify({ title: x });

export function LiveStudio({ siteId }: { siteId: string }) {
  const [phase, setPhase] = useState<"joining" | "ready" | "signin">("joining");
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const next = `/app/create/live/${siteId}`;

  useEffect(() => {
    let token: string | null = null;
    try {
      token = new URLSearchParams(window.location.hash.slice(1)).get("join");
      if (token) {
        sessionStorage.setItem(joinKey(siteId), token);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } else token = sessionStorage.getItem(joinKey(siteId));
    } catch { /* storage blocked: the hash token still works this once */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the invite token lives in the URL hash, readable only after mount
    if (!token) { setPhase("ready"); return; }
    api<{ role: string; site: { name: string } }>("/api/collab/join", { method: "POST", body: JSON.stringify({ siteId, token }) }).then(
      (r) => {
        try { sessionStorage.removeItem(joinKey(siteId)); } catch { /* ignore */ }
        toast(`You joined “${r.site.name}” as ${r.role === "viewer" ? "a viewer" : r.role === "editor" ? "an editor" : r.role}.`);
        setPhase("ready");
      },
      (e: Error & { status?: number }) => {
        if (e.status === 401) { setPhase("signin"); return; }
        try { sessionStorage.removeItem(joinKey(siteId)); } catch { /* ignore */ }
        setJoinNote(e.message);
        setPhase("ready");
      },
    );
  }, [siteId]);

  return (
    <div className={`${s.root} ${s.studio}`}>
      {phase === "joining" ? <div className={s.center}><ActivityIndicator label="Joining the session" showLabel /></div>
        : phase === "signin" ? <div className={s.center}><SignInGate title="Sign in to join this live session" body="Someone invited you to build with them. Sign in (or create a free account with a verified email) and you will land back here with the invite applied." next={next} /></div>
        : <Session siteId={siteId} joinNote={joinNote} next={next} />}
    </div>
  );
}

function Session({ siteId, joinNote, next }: { siteId: string; joinNote: string | null; next: string }) {
  const session = useLiveSession(siteId);
  const { info, error, setLocal } = session;
  const [tab, setTab] = useState<Tab>("live");
  const [request, setRequest] = useState<OpenRequest | null>(null);
  useEffect(() => { setLocal({ tab }); }, [tab, setLocal]);
  const panel = (t: Tab) => ({ id: tabPanelId(VIEW_TABS, t), role: "tabpanel", "aria-labelledby": tabId(VIEW_TABS, t), hidden: tab !== t });

  if (error) {
    if (error.status === 401) return <div className={s.center}><SignInGate title="Sign in to open this live session" body="Live sessions belong to a Keplar account. Sign in to edit together, review with the critic and deploy." next={next} /></div>;
    return (
      <div className={s.center}>
        <div>
          <h1>{error.status === 404 ? "No such project" : error.status === 403 ? "You don't have access to this project" : "The session didn't open"}</h1>
          <p>{error.status === 404 ? "It may have been deleted, or the link is mistyped." : error.status === 403 ? joinNote ?? "Ask the owner for an invite link. Links name a role (editor or viewer) and can expire." : error.message}</p>
          <Link className={s.linkBtn} href="/app/create">Back to Create</Link>
        </div>
      </div>
    );
  }
  if (!info) return <div className={s.center}><ActivityIndicator label="Opening the live session" showLabel /></div>;

  return (
    <>
      <header className={s.studioTop}>
        <Link className={s.quiet} href="/app/create" aria-label="Back to Create">←<span className={s.wideOnly}> Create</span></Link>
        <span className={s.studioName}>{info.site.name}</span>
        <Tabs id={VIEW_TABS} label="Session views" value={tab} onValueChange={setTab} className={s.tabs} items={(Object.keys(TAB_LABEL) as Tab[]).map((t) => ({ value: t, label: TAB_LABEL[t] }))} />
        <span className={s.grow} />
        {joinNote ? <span className={`${s.dim} ${s.note}`}>{joinNote}</span> : null}
      </header>
      <div className={s.tabBody} {...panel("live")}>
        <LivePane session={session} toast={toast} request={request} onOpenCritic={() => setTab("critic")} onDeployed={() => void session.refresh()} />
      </div>
      {tab === "critic" ? (
        <div className={s.tabBody} {...panel("critic")}>
          <CriticPane siteId={siteId} headVersion={info.site.headVersion} session={session} canRun={session.can("run")} canEdit={session.can("edit")} toast={toast}
            onShow={(file, line) => { setRequest({ file, line, at: Date.now() }); setTab("live"); }} />
        </div>
      ) : null}
      {tab === "deploy" ? (
        <div className={s.tabBody} {...panel("deploy")}>
          <DeployPane siteId={siteId} toast={toast} onChanged={() => void session.refresh()} />
        </div>
      ) : null}
    </>
  );
}
