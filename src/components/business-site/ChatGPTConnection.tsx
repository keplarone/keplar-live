"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BusinessMark } from "./BusinessMark";
import { BusinessFooter } from "./BusinessFooter";
import s from "./chatgpt-connection.module.css";

const PLUGIN_URL = "https://chatgpt.com/plugins/Plugin_38c836e2a8208191b11831771deabbc9";
type ConnectionState =
  | { state: "loading" }
  | { state: "signed_out" }
  | { state: "unverified" }
  | { state: "error"; message: string }
  | { state: "ready"; email: string | null; connected: boolean; count: number; eligible: boolean };

export function ChatGPTConnection() {
  const [status, setStatus] = useState<ConnectionState>({ state: "loading" });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/chatgpt/status", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(r.status === 503 ? "The connection service is temporarily unavailable. Try again shortly." : "Couldn’t check your connection. Try again.");
        if (!["signed_out", "unverified", "ready"].includes(d.state)) throw new Error("Couldn’t check your connection. Try again.");
        if (!controller.signal.aborted) setStatus(d as ConnectionState);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setStatus({ state: "error", message: e instanceof Error ? e.message : "Couldn’t check your connection." });
      });
    return () => controller.abort();
  }, [refresh]);

  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Link href="/" className={s.brand}><BusinessMark size={30} /><span>Keplar Business</span></Link>
        <Link href="/work">Open workspace <span aria-hidden="true">↗</span></Link>
      </header>
      <main className={s.main}>
        <p className={s.eyebrow}>Keplar Business + ChatGPT</p>
        <h1>Your business.<br />In the conversation.</h1>
        <p className={s.intro}>Bring your Keplar projects, tasks and saved reports into ChatGPT. Keep making progress with the same Keplar account.</p>
        <div className={s.actions}>
          <a href={PLUGIN_URL} target="_blank" rel="noopener noreferrer" className={s.primary}>Open plugin in ChatGPT <span aria-hidden="true">↗</span></a>
          <a href="#setup" className={s.secondary}>How to connect</a>
        </div>
        <p className={s.caption}>Installation and permission approval happen in ChatGPT. This website cannot install it for you.</p>

        <section className={s.status} aria-labelledby="connection-status-title">
          <div>
            <p className={s.eyebrow}>Your connection</p>
            <h2 id="connection-status-title">{status.state === "ready" ? status.connected ? "Connected account" : "Not connected yet" : status.state === "signed_out" ? "Sign in to check" : status.state === "unverified" ? "Verify your email" : status.state === "error" ? "Status unavailable" : "Checking connection…"}</h2>
            <div aria-live="polite">
              {status.state === "loading" && <p>Checking this Keplar account for an active ChatGPT connection.</p>}
              {status.state === "signed_out" && <p>Sign in with the Keplar account you want to use in ChatGPT.</p>}
              {status.state === "unverified" && <p>Open the verification email from Keplar, then check again.</p>}
              {status.state === "error" && <p role="alert">{status.message}</p>}
              {status.state === "ready" && <>
                <p>{status.email}{status.connected ? ` · ${status.count} active ${status.count === 1 ? "connection" : "connections"}` : " · No active connection saved for this account."}</p>
                {!status.eligible && <p className={s.notice}>ChatGPT access isn’t enabled for this account. The current connector requires an active Keplar Business plan or an administrator account. Contact Keplar support if you already have a Business subscription.</p>}
                {status.connected && status.eligible && <p>In ChatGPT, select Keplar Business and ask: “Show my projects.”</p>}
              </>}
            </div>
          </div>
          <div className={s.statusActions}>
            {/* Full navigation is required for the Business sign-in handoff route. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            {status.state === "signed_out" && <a href="/signin?next=%2Fchatgpt" className={s.primary}>Sign in to Keplar</a>}
            <button type="button" className={s.secondary} onClick={() => { setStatus({ state: "loading" }); setRefresh((n) => n + 1); }} disabled={status.state === "loading"}>Check connection</button>
            {status.state === "ready" && status.connected && <a href="https://keplar.one/api/chatgpt/connections" target="_blank" rel="noopener noreferrer" className={s.manage}>Manage connections ↗</a>}
          </div>
        </section>

        <section id="setup" className={s.setup} aria-labelledby="setup-title">
          <p className={s.eyebrow}>A few quick steps</p>
          <h2 id="setup-title">Connect once. Pick up where you left off.</h2>
          <ol className={s.steps}>
            <li><span>01</span><div><h3>Open Keplar Business in ChatGPT</h3><p>Use the plugin link above. Sign in to ChatGPT and choose the workspace where the private plugin is available.</p></div></li>
            <li><span>02</span><div><h3>Install and connect your Keplar account</h3><p>Choose Install, then follow the account connection flow. Sign in to Keplar, review the requested permissions and choose Connect.</p></div></li>
            <li><span>03</span><div><h3>Start with your saved projects</h3><p>Ask “Show my Keplar Business projects.” Return here and select Check connection to confirm the account link.</p></div></li>
          </ol>
        </section>

        <section className={s.permissions} aria-labelledby="permissions-title">
          <div><p className={s.eyebrow}>Your permission, your projects</p><h2 id="permissions-title">Continue your work from ChatGPT.</h2></div>
          <div><ul><li>Read your projects, tasks, reports and agent status.</li><li>Create projects and tasks, update progress and save report drafts.</li><li>Open the same projects in your Keplar workspace.</li></ul><p>The current connector cannot build or publish a website, send email, take payments or start overnight jobs. Those actions need their own website integrations.</p></div>
        </section>
        <section className={s.help} aria-labelledby="help-title">
          <h2 id="help-title">Seeing “Couldn’t connect”?</h2>
          <p>Open the plugin directly using the button above. Confirm that you are in the ChatGPT workspace that owns this private plugin. If Keplar sign-in opens, use the same verified owner account as your Business workspace. After approving the connection, return here and check its status.</p>
          <p>A link opening successfully does not confirm account access. The status above checks for a saved account grant; your first project request in ChatGPT verifies tool access.</p>
        </section>
      </main>
      <BusinessFooter />
    </div>
  );
}
