"use client";
/**
 * /app/create/live/<id>: the full-screen live session with its Critic and Deploy tabs. Opening an invite link (#join=<token>)
 * redeems it first; if you are signed out, the token waits in this tab while you sign in, then is redeemed on return.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignInGate } from "@/components/app-ui/SignInGate";
import { api } from "../api";
import { CriticPane } from "./CriticPane";
import { DeployPane } from "./DeployPane";
import { LivePane, type OpenRequest } from "./LivePane";
import { useLiveSession } from "./useLiveSession";
import s from "./advanced.module.css";
import { usePresence } from "@/components/motion/usePresence";
import { useTabIndicator } from "@/components/motion/useTabIndicator";

type Tab = "live" | "critic" | "deploy";
const TAB_LABEL: Record<Tab, string> = { live: "Live", critic: "Critic", deploy: "Deploy" };
const joinKey = (id: string) => `keplar:join:${id}`;

function useToast() {
  const [text, setText] = useState("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((x: string) => { setText(x); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setText(""), 4200); }, []);
  return { text, toast };
}

export function LiveStudio({ siteId }: { siteId: string }) {
  const [phase, setPhase] = useState<"joining" | "ready" | "signin">("joining");
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const { text, toast } = useToast();
  // The toast rises in and sinks out; the live region stays in the DOM and keeps the last line while it leaves.
  const toastBox = usePresence(Boolean(text));
  const [lastText, setLastText] = useState(text);
  if (text && text !== lastText) setLastText(text);
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
  }, [siteId, toast]);

  return (
    <div className={`${s.root} ${s.studio}`}>
      {phase === "joining" ? <div className={s.center}><p>Joining the session…</p></div>
        : phase === "signin" ? <div className={s.center}><SignInGate title="Sign in to join this live session" body="Someone invited you to build with them. Sign in (or create a free account with a verified email) and you will land back here with the invite applied." next={next} /></div>
        : <Session siteId={siteId} toast={toast} joinNote={joinNote} next={next} />}
      <div className={s.toast} role="status" aria-live="polite" hidden={!toastBox.mounted} {...toastBox.motion("toast")}>{text || (toastBox.mounted ? lastText : "")}</div>
    </div>
  );
}

function Session({ siteId, toast, joinNote, next }: { siteId: string; toast: (t: string) => void; joinNote: string | null; next: string }) {
  const session = useLiveSession(siteId);
  const { info, error, setLocal } = session;
  const [tab, setTab] = useState<Tab>("live");
  const [request, setRequest] = useState<OpenRequest | null>(null);
  // The underline slides between Live, Critic and Deploy (placed once the tab bar renders with the session).
  const tabsRef = useRef<HTMLElement>(null);
  useTabIndicator(tabsRef, info ? tab : null);
  useEffect(() => { setLocal({ tab }); }, [tab, setLocal]);

  if (error) {
    if (error.status === 401) return <div className={s.center}><SignInGate title="Sign in to open this live session" body="Live sessions belong to a Keplar account. Sign in to edit together, review with the critic and deploy." next={next} /></div>;
    return (
      <div className={s.center}>
        <div>
          <h1>{error.status === 404 ? "No such project" : error.status === 403 ? "You don't have access to this project" : "The session didn't open"}</h1>
          <p>{error.status === 404 ? "It may have been deleted, or the link is mistyped." : error.status === 403 ? joinNote ?? "Ask the owner for an invite link. Links name a role (editor or viewer) and can expire." : error.message}</p>
          <Link className={s.btn} href="/app/create">Back to Create</Link>
        </div>
      </div>
    );
  }
  if (!info) return <div className={s.center}><p className={s.dim}>Opening the live session…</p></div>;

  return (
    <>
      <header className={s.studioTop}>
        <Link className={s.quiet} href="/app/create" aria-label="Back to Create">←<span className={s.wideOnly}> Create</span></Link>
        <span className={s.studioName}>{info.site.name}</span>
        <nav ref={tabsRef} className={s.tabs} role="tablist" aria-label="Session views">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" className={s.tab} aria-selected={tab === t} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
          ))}
          <span className="m-tab-indicator" aria-hidden="true" />
        </nav>
        <span className={s.grow} />
        {joinNote ? <span className={s.dim} style={{ fontSize: "var(--t-label)" }}>{joinNote}</span> : null}
      </header>
      <div className={s.tabBody} hidden={tab !== "live"}>
        <LivePane session={session} toast={toast} request={request} onOpenCritic={() => setTab("critic")} onDeployed={() => void session.refresh()} />
      </div>
      {tab === "critic" ? (
        <div className={s.tabBody}>
          <CriticPane siteId={siteId} headVersion={info.site.headVersion} session={session} canRun={session.can("run")} canEdit={session.can("edit")} toast={toast}
            onShow={(file, line) => { setRequest({ file, line, at: Date.now() }); setTab("live"); }} />
        </div>
      ) : null}
      {tab === "deploy" ? (
        <div className={s.tabBody}>
          <DeployPane siteId={siteId} toast={toast} onChanged={() => void session.refresh()} />
        </div>
      ) : null}
    </>
  );
}
