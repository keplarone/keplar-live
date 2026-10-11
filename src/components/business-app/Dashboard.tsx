"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LAYOUT, type LayoutItem, type WidgetId, type WidgetSize } from "@/lib/business/layout";
import s from "./workspace.module.css";

type Dash = {
  revenue: { last30: number; total: number; refunded: number };
  orders: { last30: number; pending: number };
  leads: { last30: number; total: number };
  traffic: { last14: number; days: { day: string; views: number }[] };
  conversion: { rate: number | null; orders: number; views: number };
  agents: { active: number; total: number; halted: boolean; recentRuns: { id: string; agentName: string; status: string; startedAt: string }[] };
  approvals: { pending: number };
  payments: unknown;
  compute: { used: number; total: number | null; resetsAt?: string };
};
type Approval = { id: string; agentName: string; summary?: string; title?: string; kind?: string; status: string; createdAt: string };
type Project = { id: string; name: string; createdAt: string; counts: { notes: number; files: number; chats: number } };
type Connector = { id: string; label: string; connection?: unknown };

const TITLE: Record<WidgetId, string> = {
  summary: "Executive summary", revenue: "Revenue, 30 days", orders: "Orders, 30 days", traffic: "Site views, 14 days", conversion: "Conversion",
  leads: "Leads, 30 days", agents: "Agents", approvals: "Waiting for approval", usage: "AI usage", projects: "Recent projects", integrations: "Integrations",
};

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
const n = (x: number) => x.toLocaleString("en-US");
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function Spark({ days }: { days: { day: string; views: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.views));
  return (
    <div className={s.bars} role="img" aria-label={`Site views per day: ${days.map((d) => d.views).join(", ")}`}>
      {days.map((d) => <span key={d.day} style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }} title={`${d.day}: ${d.views}`} />)}
    </div>
  );
}

export function Dashboard({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [dash, setDash] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [layout, setLayout] = useState<LayoutItem[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [summary, setSummary] = useState<{ text: string; createdAt: string } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryErr, setSummaryErr] = useState("");

  useEffect(() => {
    let live = true;
    const get = (u: string) => fetch(u, { cache: "no-store" }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? "Couldn't load this."))));
    get("/api/business/dashboard").then((d) => { if (live) setDash(d); }).catch((e: Error) => { if (live) setErr(e.message); });
    get("/api/business/approvals").then((d) => { if (live) setApprovals((d.approvals ?? []).filter((a: Approval) => a.status === "pending").slice(0, 6)); }).catch(() => undefined);
    get("/api/projects").then((d) => { if (live) setProjects((d.projects ?? []).slice().sort((a: Project, b: Project) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)); }).catch(() => undefined);
    get("/api/business/connectors").then((d) => { if (live) setConnectors(d.connectors ?? []); }).catch(() => undefined);
    get("/api/business/layout").then((d) => { if (live) setLayout(d.items); }).catch(() => { if (live) setLayout(DEFAULT_LAYOUT); });
    get("/api/business/summary").then((d) => { if (live) setSummary(d.summary); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const saveLayout = useCallback((items: LayoutItem[]) => {
    setLayout(items);
    void fetch("/api/business/layout", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
  }, []);

  const move = (from: WidgetId, to: WidgetId) => {
    if (!layout || from === to) return;
    const items = layout.slice();
    const a = items.findIndex((x) => x.id === from);
    const b = items.findIndex((x) => x.id === to);
    const [it] = items.splice(a, 1);
    items.splice(b, 0, it!);
    saveLayout(items);
  };
  const nudge = (id: WidgetId, dir: -1 | 1) => {
    if (!layout) return;
    const i = layout.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= layout.length) return;
    move(id, layout[j]!.id);
  };
  const resize = (id: WidgetId, size: WidgetSize) => layout && saveLayout(layout.map((x) => (x.id === id ? { ...x, size } : x)));

  const writeSummary = async () => {
    setSummaryBusy(true);
    setSummaryErr("");
    try {
      const r = await fetch("/api/business/summary", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't write the summary.");
      setSummary(d.summary);
    } catch (e) {
      setSummaryErr(e instanceof Error ? e.message : "Couldn't write the summary.");
    } finally {
      setSummaryBusy(false);
    }
  };

  const body = (id: WidgetId) => {
    if (!dash) return <span className={s.skel} />;
    switch (id) {
      case "summary":
        return (
          <div className={s.summary}>
            {summary ? <p className={s.summaryText}>{summary.text}</p> : <p className={s.muted}>A short read of your numbers, written by Keplar from the data below. It uses a few credits.</p>}
            {summaryErr ? <p className={s.error} role="alert">{summaryErr}</p> : null}
            <div className={s.row}>
              <button type="button" className={s.btnGhost} onClick={() => void writeSummary()} disabled={summaryBusy}>{summaryBusy ? "Writing…" : summary ? "Refresh" : "Write today's summary"}</button>
              {summary ? <span className={s.muted}>Written {ago(summary.createdAt)}</span> : null}
            </div>
          </div>
        );
      case "revenue":
        return <><p className={s.big}>{usd(dash.revenue.last30)}</p><p className={s.muted}>{usd(dash.revenue.total)} all time{dash.revenue.refunded ? ` · ${usd(dash.revenue.refunded)} refunded` : ""}</p>{!dash.payments ? <p className={s.muted}>Payments aren&apos;t connected yet.</p> : null}</>;
      case "orders":
        return <><p className={s.big}>{n(dash.orders.last30)}</p><p className={s.muted}>{n(dash.orders.pending)} pending</p></>;
      case "leads":
        return <><p className={s.big}>{n(dash.leads.last30)}</p><p className={s.muted}>{n(dash.leads.total)} all time</p></>;
      case "conversion":
        return <><p className={s.big}>{dash.conversion.rate === null ? "—" : `${(dash.conversion.rate * 100).toFixed(1)}%`}</p><p className={s.muted}>{n(dash.conversion.orders)} orders from {n(dash.conversion.views)} views</p></>;
      case "traffic":
        return <><p className={s.big}>{n(dash.traffic.last14)}</p><Spark days={dash.traffic.days} /></>;
      case "agents":
        return (
          <>
            <p className={s.big}>{n(dash.agents.active)} <span className={s.unit}>active of {n(dash.agents.total)}</span></p>
            {dash.agents.halted ? <p className={s.error}>All agents are paused.</p> : null}
            <ul className={s.list}>{dash.agents.recentRuns.slice(0, 4).map((r) => <li key={r.id}><span>{r.agentName}</span><span className={s.tag} data-tone={r.status}>{r.status}</span><span className={s.muted}>{ago(r.startedAt)}</span></li>)}</ul>
            {!dash.agents.recentRuns.length ? <p className={s.muted}>No agent runs yet.</p> : null}
          </>
        );
      case "approvals":
        return approvals.length ? <ul className={s.list}>{approvals.map((a) => <li key={a.id}><span>{a.title ?? a.summary ?? a.kind ?? "Action"}</span><span className={s.muted}>{a.agentName} · {ago(a.createdAt)}</span></li>)}</ul> : <p className={s.muted}>Nothing is waiting for you.</p>;
      case "usage": {
        const total = dash.compute.total;
        const pct = total ? Math.min(100, Math.round((dash.compute.used / total) * 100)) : null;
        return <><p className={s.big}>{n(dash.compute.used)} <span className={s.unit}>{total ? `of ${n(total)} credits` : "credits"}</span></p>{pct !== null ? <div className={s.meter}><span style={{ width: `${pct}%` }} /></div> : null}{dash.compute.resetsAt ? <p className={s.muted}>Resets {new Date(dash.compute.resetsAt).toLocaleDateString()}</p> : null}</>;
      }
      case "projects":
        return projects.length ? <ul className={s.list}>{projects.map((p) => <li key={p.id}><button type="button" className={s.linkBtn} onClick={() => onOpenProject(p.id)}>{p.name}</button><span className={s.muted}>{p.counts.files} files · {p.counts.notes} notes</span></li>)}</ul> : <p className={s.muted}>No projects yet.</p>;
      case "integrations":
        return connectors.length ? <ul className={s.list}>{connectors.map((c) => <li key={c.id}><span>{c.label}</span><span className={s.tag} data-tone={c.connection ? "ok" : "off"}>{c.connection ? "Connected" : "Not connected"}</span></li>)}</ul> : <p className={s.muted}>No integrations are available yet.</p>;
    }
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>Dashboard</h1>
          <p className={s.muted}>From your connected payments, site, agents and usage.</p>
        </div>
        <button type="button" className={editing ? s.btnPrimary : s.btnGhost} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>{editing ? "Done" : "Customize"}</button>
      </header>
      {err ? <p className={s.error} role="alert">{err}</p> : null}
      <div className={s.grid} data-editing={editing || undefined}>
        {(layout ?? []).map((w, i) => (
          <article
            key={w.id}
            className={s.widget}
            data-size={w.size}
            data-dragging={dragId === w.id || undefined}
            draggable={editing}
            onDragStart={() => setDragId(w.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => { if (editing && dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, w.id); setDragId(null); }}
            aria-label={TITLE[w.id]}
          >
            <header className={s.widgetHead}>
              <h2>{TITLE[w.id]}</h2>
              {editing ? (
                <div className={s.tools}>
                  <button type="button" onClick={() => nudge(w.id, -1)} disabled={i === 0} aria-label={`Move ${TITLE[w.id]} earlier`}>←</button>
                  <button type="button" onClick={() => nudge(w.id, 1)} disabled={i === (layout?.length ?? 0) - 1} aria-label={`Move ${TITLE[w.id]} later`}>→</button>
                  {(["s", "m", "l"] as const).map((sz) => <button key={sz} type="button" aria-pressed={w.size === sz} onClick={() => resize(w.id, sz)} aria-label={`${TITLE[w.id]} size ${sz === "s" ? "small" : sz === "m" ? "medium" : "large"}`}>{sz.toUpperCase()}</button>)}
                </div>
              ) : null}
            </header>
            <div className={s.widgetBody}>{body(w.id)}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
