"use client";

/**
 * Agents on a schedule: the real Business OS agents (src/lib/business) as a first-class page in the app. Daily briefs, page monitors (BETA)
 * and lead follow-ups run on the server on a cron-like schedule, with run history, pause/resume and run-now. Anything that would leave
 * Keplar (an email) is a draft that waits in Approvals; a brief or a monitor alert stays inside Keplar.
 */
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { buildCron, formFromCron, type CronMode as Mode } from "@/lib/business/cron-form";
import { activeScopeHeaders } from "./state/scope";
import s from "./Panels.module.css";

type Trigger = { type: "event"; event: string } | { type: "schedule"; cron: string; label: string; tz?: string } | { type: "manual"; label: string };
type Agent = {
  id: string; name: string; template: string; trigger: Trigger; autoSend: boolean; status: "active" | "paused" | "killed";
  caps: { monthlyUnits: number; runsPerDay: number; outboundPerDay: number; spendUsdPerMonth: number };
  lastRunAt: string | null; unitsThisMonth: number; next: string | null; scheduleError?: string;
  monitor?: { url: string; keyword?: string; checkedAt?: string; lastChangeAt?: string };
  question?: string;
  event?: { source: "email" | "webhook"; allowFrom?: string[]; slackChannel?: string; instructions: string };
  inboxAddress?: string;
};
type Run = { id: string; trigger: string; status: string; units: number; startedAt: string; error?: string; needs?: { label: string; problem: string }[]; steps: { at: string; text: string }[]; approvals: { id: string; type: string; status: string }[] };
type Data = {
  settings: { agentsHalted: boolean };
  templates: Record<string, { name: string; description: string; outbound: string }>;
  offered?: string[];
  inboundEmail?: boolean;
  limit: number;
  agents: Agent[];
  schedule: { driver: "inngest" | "vercel-cron"; note: string; precisionMinutes: number; fastestAllowed: string | null; scheduledRunsPerDay: number };
};

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...activeScopeHeaders() }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

/** Templates that make sense on a schedule, in the order they are offered. */
const SCHEDULED = ["daily-brief", "scheduled-question", "event-reply", "monitor", "lead-sweep", "invoice-reminder", "weekly-report"] as const;
const BETA = new Set(["monitor"]);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

const ZONES: string[] = (() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; } })();

function ScheduleForm({ initial, busy, onSave, onCancel }: { initial: { cron: string; tz: string }; busy: boolean; onSave: (v: { cron: string; tz: string }) => void; onCancel: () => void }) {
  const id = useId();
  const start = formFromCron(initial.cron);
  const [mode, setMode] = useState<Mode>(start.mode);
  const [time, setTime] = useState(start.time);
  const [dow, setDow] = useState(start.dow);
  const [every, setEvery] = useState(start.every);
  const [custom, setCustom] = useState(initial.cron);
  const [tz, setTz] = useState(initial.tz);
  const zones = ZONES;
  const cron = buildCron(mode, time, dow, every, custom);
  return (
    <form className={s.card} onSubmit={(e) => { e.preventDefault(); onSave({ cron, tz }); }} aria-label="Edit schedule">
      <div className={s.row}>
        <label htmlFor={`${id}-m`}>Repeat</label>
        <select id={`${id}-m`} className={s.field} style={{ width: "auto" }} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Once a week</option><option value="hours">Every N hours</option><option value="custom">Custom cron</option>
        </select>
        {mode === "daily" || mode === "weekdays" || mode === "weekly" ? (<><label htmlFor={`${id}-t`}>at</label><input id={`${id}-t`} type="time" className={s.field} style={{ width: "auto" }} value={time} onChange={(e) => setTime(e.target.value)} /></>) : null}
        {mode === "weekly" ? (<select aria-label="Day of the week" className={s.field} style={{ width: "auto" }} value={dow} onChange={(e) => setDow(e.target.value)}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={d} value={i}>{d}</option>)}</select>) : null}
        {mode === "hours" ? (<><label htmlFor={`${id}-n`}>every</label><input id={`${id}-n`} type="number" min={1} max={23} className={s.field} style={{ width: "5rem" }} value={every} onChange={(e) => setEvery(e.target.value)} /><span>hours</span></>) : null}
        {mode === "custom" ? (<><label htmlFor={`${id}-c`}>Cron</label><input id={`${id}-c`} className={`${s.field} ${s.mono}`} style={{ width: "12rem" }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="minute hour day month weekday" /></>) : null}
      </div>
      <div className={s.row}>
        <label htmlFor={`${id}-z`}>Time zone</label>
        <input id={`${id}-z`} className={s.field} style={{ width: "16rem" }} list={`${id}-zl`} value={tz} onChange={(e) => setTz(e.target.value)} />
        <datalist id={`${id}-zl`}>{zones.slice(0, 700).map((z) => <option key={z} value={z} />)}</datalist>
      </div>
      <p className={s.muted}>Cron: <span className={s.mono}>{cron}</span>. The time follows the wall clock of that zone, including daylight saving.</p>
      <div className={s.row}>
        <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={busy || !cron}>Save schedule</button>
        <button type="button" className={s.btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function History({ agentId }: { agentId: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api<{ runs: Run[] }>(`/api/business/agents/${agentId}/runs?limit=20`).then((r) => live && setRuns(r.runs)).catch((e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [agentId]);
  if (err) return <p className={s.err}>{err}</p>;
  if (!runs) return <p className={s.muted}>Loading history…</p>;
  if (!runs.length) return <p className={s.muted}>No runs yet. The first one happens at its next scheduled time, or press Run now.</p>;
  return (
    <ul className={s.list} aria-label="Run history">
      {runs.map((r) => (
        <li key={r.id} className={s.item}>
          <span className={s.itemText}>
            <span className={`${s.badge} ${r.status === "succeeded" ? s.badgeOn : r.status === "failed" ? s.badgeWarn : ""}`}>{r.status.replace("_", " ")}</span>{" "}
            {when(r.startedAt)} <span className={s.muted}>· {r.trigger.startsWith("schedule:") ? "scheduled" : r.trigger}</span>
            <span className={s.itemMeta}>{r.error ?? r.steps.map((x) => x.text).filter((t) => !/^Started/.test(t)).slice(0, 3).join(" · ")}</span>
            {r.approvals.length ? <span className={s.itemMeta}>{r.approvals.length} draft{r.approvals.length === 1 ? "" : "s"}: {r.approvals.map((a) => a.status).join(", ")}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AgentsPanel({ signedIn, onOpenApprovals }: { signedIn: boolean; onOpenApprovals: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [openHist, setOpenHist] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState<string | null>(null);
  const [tpl, setTpl] = useState<string>("daily-brief");
  const [url, setUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [keyword, setKeyword] = useState("");
  const [ev, setEv] = useState<{ source: "webhook" | "email"; allowFrom: string; slackChannel: string; instructions: string }>({ source: "webhook", allowFrom: "", slackChannel: "", instructions: "" });
  const [hookUrl, setHookUrl] = useState<{ agentId: string; url: string } | null>(null);
  const showHook = (a: { id: string; hookToken?: string }) => { if (a.hookToken) setHookUrl({ agentId: a.id, url: `${window.location.origin}/api/webhooks/agents/${a.hookToken}` }); };
  const browserTz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api<Data>("/api/business/agents").then((r) => { if (live) { setD(r); setErr(""); } }).catch((e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [signedIn, tick]);

  const act = useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); if (done) setMsg(done); setTick((t) => t + 1); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);

  if (!signedIn) return <p className={s.notice}>Scheduled agents run on Keplar&apos;s servers for your account, so they need you to be signed in. <Link href="/signin">Sign in</Link></p>;
  if (!d) return err ? <p className={s.err} role="alert">{err}</p> : <p className={s.muted}>Loading agents…</p>;

  const live = d.agents.filter((a) => a.status !== "killed");
  const offered = SCHEDULED.filter((t) => d.templates[t] && (!d.offered || d.offered.includes(t)));
  const canAdd = d.limit > 0 && live.length < d.limit;

  return (
    <div className={s.wrap}>
      <div aria-live="polite">
        {err ? <p className={s.err} role="alert">{err}</p> : null}
        {msg ? <p className={s.ok}>{msg}</p> : null}
      </div>

      <section className={s.card} aria-labelledby="ag-how">
        <h2 className={s.h3} id="ag-how">How scheduled agents run</h2>
        <p className={s.help}>{d.schedule.note}</p>
        <dl className={s.kv}>
          <div><dt>Agents on your plan</dt><dd>{live.length} of {d.limit}</dd></div>
          <div><dt>Fastest schedule</dt><dd>{d.schedule.fastestAllowed ?? "—"}</dd></div>
          <div><dt>Scheduled runs a day</dt><dd>{d.schedule.scheduledRunsPerDay}</dd></div>
        </dl>
        <p className={s.help}><strong>You approve anything that leaves Keplar.</strong> Email drafts wait in Approvals, even if an agent has auto-send on; scheduled runs never send on their own. Briefs and monitor alerts stay in your Keplar inbox.</p>
        <div className={s.row}>
          <button type="button" className={s.btn} onClick={onOpenApprovals}>Open Approvals</button>
          <button type="button" className={`${s.btn} ${d.settings.agentsHalted ? "" : s.btnDanger}`} disabled={busy} onClick={() => act(() => api("/api/business/agents/halt", "POST", { halted: !d.settings.agentsHalted }), d.settings.agentsHalted ? "Agents resumed." : "All agents stopped. Nothing runs until you resume.")}>{d.settings.agentsHalted ? "Resume all agents" : "Stop all agents"}</button>
        </div>
      </section>

      {d.limit === 0 ? <p className={s.notice}>Scheduled agents are on Plus and up. Free and Lite don&apos;t run agents, so nothing here uses the shared Free allowance. <Link href="/pricing?from=feature">See plans</Link></p> : null}

      {live.length === 0 && d.limit > 0 ? <p className={s.muted}>No agents yet. Add one below.</p> : null}
      <div className={s.cards}>
        {live.map((a) => {
          const sched = a.trigger.type === "schedule" ? a.trigger : null;
          return (
            <article key={a.id} className={s.card} aria-label={a.name}>
              <h3 className={s.h3}>
                {a.name}
                <span className={`${s.badge} ${a.status === "active" ? s.badgeOn : ""}`}>{a.status}</span>
                {BETA.has(a.template) ? <span className={s.badge}>Beta</span> : null}
              </h3>
              <p className={s.help}>{d.templates[a.template]?.description}</p>
              <p className={s.muted}>
                {sched ? <>Schedule: {sched.label}<br />Next run: {a.status === "active" ? when(a.next) : "paused"}</> : a.trigger.type === "event" ? (a.event?.source === "email" ? <>Runs when an email arrives at <span className={s.mono}>{a.inboxAddress ?? "(incoming email isn't set up)"}</span>{a.event.allowFrom?.length ? ` from ${a.event.allowFrom.join(", ")}` : " from anyone"}</> : a.event?.source === "webhook" ? <>Runs when its webhook URL receives a POST{a.event.slackChannel ? `; summaries can go to #${a.event.slackChannel} after you approve` : ""}</> : `Runs when: ${a.trigger.event}`) : "Runs when you press Run now"}
                <br />Last run: {when(a.lastRunAt)}
                {a.question ? <><br />Asks: {a.question}</> : null}
                {a.monitor ? <><br />Watching: <span className={s.mono}>{a.monitor.url}</span>{a.monitor.keyword ? ` (word: ${a.monitor.keyword})` : ""}{a.monitor.lastChangeAt ? <><br />Last change seen: {when(a.monitor.lastChangeAt)}</> : null}</> : null}
                {a.scheduleError ? <><br /><span className={s.err}>Schedule problem: {a.scheduleError}</span></> : null}
              </p>
              <p className={s.muted}>Caps: {a.caps.runsPerDay} runs a day, {a.caps.monthlyUnits.toLocaleString()} usage units and ${a.caps.spendUsdPerMonth} a month. Used this month: {a.unitsThisMonth.toLocaleString()} units.</p>
              <div className={s.row}>
                <button type="button" className={s.btn} disabled={busy || d.settings.agentsHalted} onClick={() => act(async () => { await api(`/api/business/agents/${a.id}`, "PATCH", { status: a.status === "active" ? "paused" : "active" }); }, a.status === "active" ? "Paused." : "Resumed.")}>{a.status === "active" ? "Pause" : "Resume"}</button>
                <button type="button" className={s.btn} disabled={busy || a.status !== "active" || d.settings.agentsHalted} onClick={() => act(async () => { await api(`/api/business/agents/${a.id}`, "POST"); setOpenHist(a.id); }, "Ran once. See the history below.")}>Run now</button>
                {sched ? <button type="button" className={s.btn} onClick={() => setEditing(editing === a.id ? null : a.id)}>Edit schedule</button> : null}
                {a.event?.source === "webhook" ? <button type="button" className={s.btn} disabled={busy} onClick={() => act(async () => { const r = await api<{ agent: { id: string; hookToken?: string } }>(`/api/business/agents/${a.id}`, "PATCH", { rotateHook: true }); showHook(r.agent); }, "New webhook URL made. The old one no longer works.")}>New webhook URL</button> : null}
                <button type="button" className={s.btn} aria-expanded={openHist === a.id} onClick={() => setOpenHist(openHist === a.id ? null : a.id)}>History</button>
                {confirmKill === a.id ? (
                  <span className={s.confirm} role="alertdialog" aria-label={`Stop ${a.name} for good`}>
                    <p>Stop this agent for good? It can&apos;t be restarted, and its waiting drafts are cancelled.</p>
                    <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={() => act(async () => { await api(`/api/business/agents/${a.id}`, "PATCH", { status: "killed" }); setConfirmKill(null); }, "Agent stopped.")}>Stop it</button>
                    <button type="button" className={s.btn} onClick={() => setConfirmKill(null)}>Keep</button>
                  </span>
                ) : <button type="button" className={`${s.btn} ${s.btnQuiet} ${s.btnDanger}`} onClick={() => setConfirmKill(a.id)}>Stop for good</button>}
              </div>
              {editing === a.id && sched ? <ScheduleForm initial={{ cron: sched.cron, tz: sched.tz ?? "UTC" }} busy={busy} onCancel={() => setEditing(null)} onSave={(v) => act(async () => { await api(`/api/business/agents/${a.id}`, "PATCH", { schedule: v }); setEditing(null); }, "Schedule saved.")} /> : null}
              {hookUrl?.agentId === a.id ? (
                <div className={s.card} role="status">
                  <p className={s.help}><strong>Webhook URL (shown once).</strong> Anyone with it can start this agent, so keep it secret. POST JSON or text, up to 32 KB.</p>
                  <input className={`${s.field} ${s.mono}`} readOnly value={hookUrl.url} aria-label="Webhook URL" onFocus={(e) => e.currentTarget.select()} />
                  <div className={s.row}><button type="button" className={s.btn} onClick={() => { void navigator.clipboard?.writeText(hookUrl.url); }}>Copy</button><button type="button" className={s.btn} onClick={() => setHookUrl(null)}>Done</button></div>
                </div>
              ) : null}
              {openHist === a.id ? <History key={`${a.id}-${tick}`} agentId={a.id} /> : null}
            </article>
          );
        })}
      </div>

      {canAdd ? (
        <section className={s.card} aria-labelledby="ag-add">
          <h2 className={s.h3} id="ag-add">Add an agent <span className={s.muted}>{live.length} of {d.limit}</span></h2>
          <div className={s.row}>
            <label htmlFor="ag-tpl" className="visually-hidden">What the agent does</label>
            <select id="ag-tpl" className={s.field} style={{ width: "auto", maxWidth: "100%" }} value={tpl} onChange={(e) => setTpl(e.target.value)}>
              {offered.map((t) => <option key={t} value={t}>{d.templates[t].name}</option>)}
            </select>
          </div>
          <p className={s.help}>{d.templates[tpl]?.description}</p>
          <p className={s.muted}>Sends outside Keplar: {d.templates[tpl]?.outbound}</p>
          {tpl === "monitor" ? (
            <div className={s.row}>
              <label htmlFor="ag-url" className="visually-hidden">Page to watch</label>
              <input id="ag-url" className={s.field} style={{ flex: "2 1 16rem", width: "auto" }} placeholder="https://example.com/pricing" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
              <label htmlFor="ag-kw" className="visually-hidden">Only watch lines with this word (optional)</label>
              <input id="ag-kw" className={s.field} style={{ flex: "1 1 10rem", width: "auto" }} placeholder="Only lines with… (optional)" value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={60} />
            </div>
          ) : null}
          {tpl === "scheduled-question" ? (
            <div className={s.row}>
              <label htmlFor="ag-q" className="visually-hidden">The question to ask on each run</label>
              <textarea id="ag-q" className={s.field} style={{ flex: "1 1 100%", minHeight: 80 }} placeholder="e.g. What changed in US interest-rate expectations since yesterday, and why?" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} />
            </div>
          ) : null}
          {tpl === "event-reply" ? (
            <div className={s.row} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label htmlFor="ag-ev-src">Starts when</label>
              <select id="ag-ev-src" className={s.field} style={{ width: "auto" }} value={ev.source} onChange={(e) => setEv({ ...ev, source: e.target.value as "webhook" | "email" })}>
                <option value="webhook">Its own webhook URL receives a POST</option>
                <option value="email" disabled={!d.inboundEmail}>An email arrives at its own address{d.inboundEmail ? "" : " (not set up yet)"}</option>
              </select>
              {ev.source === "email" ? (<>
                <label htmlFor="ag-ev-allow">Only from these senders (optional; addresses or @domain, comma-separated)</label>
                <input id="ag-ev-allow" className={s.field} value={ev.allowFrom} onChange={(e) => setEv({ ...ev, allowFrom: e.target.value })} placeholder="@yourcompany.com, client@example.com" />
              </>) : (<>
                <label htmlFor="ag-ev-slack">Slack channel for summaries (optional; each post waits for your approval)</label>
                <input id="ag-ev-slack" className={s.field} value={ev.slackChannel} onChange={(e) => setEv({ ...ev, slackChannel: e.target.value })} placeholder="alerts" maxLength={80} />
              </>)}
              <label htmlFor="ag-ev-ins">Standing instructions (optional)</label>
              <textarea id="ag-ev-ins" className={s.field} style={{ minHeight: 70 }} maxLength={1000} value={ev.instructions} onChange={(e) => setEv({ ...ev, instructions: e.target.value })} placeholder={ev.source === "email" ? "e.g. We reply within one business day. Never quote prices." : "e.g. Flag failed payments and anything over $500."} />
              <p className={s.muted}>What arrives is treated as untrusted data: it&apos;s recorded in your Keplar inbox, and any reply or post is a draft waiting in Approvals. Auto-send can&apos;t be turned on for this agent.</p>
            </div>
          ) : null}
          <p className={s.muted}>Time zone for the default schedule is America/New_York; change it after adding with Edit schedule (your browser says {browserTz}). Emailing or Slack-posting a brief is <span className={s.badge}>Coming soon</span> and would arrive as a draft for your approval.</p>
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy || (tpl === "monitor" && !url.trim()) || (tpl === "scheduled-question" && question.trim().length < 8)} onClick={() => act(async () => { const r = await api<{ agent: { id: string; hookToken?: string } }>("/api/business/agents", "POST", { template: tpl, ...(tpl === "monitor" ? { monitor: { url, keyword } } : {}), ...(tpl === "scheduled-question" ? { question } : {}), ...(tpl === "event-reply" ? { event: ev } : {}) }); showHook(r.agent); setUrl(""); setKeyword(""); setQuestion(""); setEv({ source: "webhook", allowFrom: "", slackChannel: "", instructions: "" }); }, "Agent added.")}>Add agent</button>
          </div>
        </section>
      ) : d.limit > 0 ? <p className={s.muted}>Your plan includes {d.limit} agents. Stop one to add another.</p> : null}
    </div>
  );
}
