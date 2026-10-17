"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LAYOUT, type LayoutItem, type WidgetId, type WidgetSize } from "@/lib/business/layout";
import { Button, SegmentedControl } from "@/components/ui/space";
import { dayStart } from "./chart";
import { RollIn } from "./RollIn";
import { TimeChart } from "./TimeChart";
import s from "./workspace.module.css";
import d from "./dashboard.module.css";

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
/** Colour per card: blue is traffic and people, green is money, violet is Keplar's own work. */
const TONE: Partial<Record<WidgetId, "blue" | "green" | "violet">> = { revenue: "green", orders: "green", conversion: "green", traffic: "blue", leads: "blue", usage: "violet", summary: "violet" };
/** Site views come per day for the last 14 days; the timeframe shows the last 7 or all 14 of them. */
type Range = "7" | "14";
const RANGES = [{ value: "7" as const, label: "7 days" }, { value: "14" as const, label: "14 days" }];
const n = (x: number) => x.toLocaleString("en-US");
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

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
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("14");

  useEffect(() => {
    let live = true;
    const get = (u: string) => fetch(u, { cache: "no-store" }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? "Couldn't load this."))));
    get("/api/business/dashboard").then((d) => { if (live) { setDash(d); setLoadedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })); } }).catch((e: Error) => { if (live) setErr(e.message); });
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

  const traffic = useMemo(() => (dash?.traffic.days ?? []).slice(range === "7" ? -7 : -14).map((x) => ({ t: dayStart(x.day), v: x.views })), [dash, range]);
  const trafficTotal = traffic.reduce((sum, p) => sum + p.v, 0);
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  const body = (id: WidgetId) => {
    if (!dash) return <span className={s.skel} />;
    switch (id) {
      case "summary":
        return (
          <div className={d.summary}>
            {summary ? <p className={d.summaryText}>{summary.text}</p> : <p className={d.muted}>A short read of your numbers, written by Keplar from the data below. It uses a few credits.</p>}
            {summaryErr ? <p className={s.error} role="alert">{summaryErr}</p> : null}
            <div className={d.summaryRow}>
              <Button size="sm" variant="secondary" status={summaryBusy ? "loading" : "idle"} onClick={() => void writeSummary()} disabled={summaryBusy}>{summaryBusy ? "Writing…" : summary ? "Refresh" : "Write today's summary"}</Button>
              {summary ? <span className={d.muted}>Written {ago(summary.createdAt)}</span> : null}
            </div>
          </div>
        );
      case "revenue":
        return (
          <>
            <p className={d.big} data-tone="green"><RollIn value={dash.revenue.last30} format={usd} /></p>
            <div className={d.chips}>
              <span className={d.chip}><b>{usd(dash.revenue.total)}</b> all time</span>
              {dash.revenue.refunded ? <span className={d.chip}><b>{usd(dash.revenue.refunded)}</b> refunded</span> : null}
            </div>
            {!dash.payments ? <p className={d.muted}>Payments aren&apos;t connected yet.</p> : null}
            {dash.revenue.total > 0 ? (
              <div className={d.split}>
                <div className={d.splitBar} aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((dash.revenue.last30 / dash.revenue.total) * 100))}%` }} /></div>
                <p className={d.muted}>{Math.min(100, Math.round((dash.revenue.last30 / dash.revenue.total) * 100))}% of all-time revenue came in the last 30 days</p>
              </div>
            ) : null}
          </>
        );
      case "orders":
        return <><p className={d.big}><RollIn value={dash.orders.last30} /></p><div className={d.chips}><span className={d.chip}><b>{n(dash.orders.pending)}</b> pending</span></div></>;
      case "leads":
        return <><p className={d.big}><RollIn value={dash.leads.last30} /></p><div className={d.chips}><span className={d.chip}><b>{n(dash.leads.total)}</b> all time</span></div></>;
      case "conversion":
        return <><p className={d.big}>{dash.conversion.rate === null ? <span className={d.none}>—</span> : <RollIn value={dash.conversion.rate} format={pct} />}</p><p className={d.muted}>{n(dash.conversion.orders)} orders from {n(dash.conversion.views)} views</p></>;
      case "traffic":
        return (
          <>
            <p className={d.big} data-tone="blue"><RollIn value={trafficTotal} /> <span className={d.unit}>views</span></p>
            <div className={d.chartBox}>
              <TimeChart points={traffic} tone="blue" seriesKey={range} label={`Site views per day, last ${range} days`} describe={(v) => `${n(v)} ${v === 1 ? "view" : "views"}`} delay={250} />
            </div>
          </>
        );
      case "agents":
        return (
          <>
            <p className={d.big}><RollIn value={dash.agents.active} /> <span className={d.unit}>active of {n(dash.agents.total)}</span></p>
            {dash.agents.halted ? <p className={d.warn}>All agents are paused.</p> : null}
            <ul className={d.list}>{dash.agents.recentRuns.slice(0, 4).map((r) => <li key={r.id}><span>{r.agentName}</span><span className={s.tag} data-tone={r.status}>{r.status.replace("_", " ")}</span><span className={d.muted}>{ago(r.startedAt)}</span></li>)}</ul>
            {!dash.agents.recentRuns.length ? <p className={d.muted}>No agent runs yet.</p> : null}
          </>
        );
      case "approvals":
        return approvals.length ? <ul className={d.list}>{approvals.map((a) => <li key={a.id}><span>{a.title ?? a.summary ?? a.kind ?? "Action"}</span><span className={d.muted}>{a.agentName} · {ago(a.createdAt)}</span></li>)}</ul> : <p className={d.muted}>Nothing is waiting for you.</p>;
      case "usage": {
        const total = dash.compute.total;
        const used = total ? Math.min(100, Math.round((dash.compute.used / total) * 100)) : null;
        return <><p className={d.big}><RollIn value={dash.compute.used} /> <span className={d.unit}>{total ? `of ${n(total)} credits` : "credits"}</span></p>{used !== null ? <div className={d.meter}><i style={{ width: `${used}%` }} /></div> : null}{dash.compute.resetsAt ? <p className={d.muted}>Resets {new Date(dash.compute.resetsAt).toLocaleDateString()}</p> : null}</>;
      }
      case "projects":
        return projects.length ? <ul className={d.list}>{projects.map((p) => <li key={p.id}><button type="button" className={s.linkBtn} onClick={() => onOpenProject(p.id)}>{p.name}</button><span className={d.muted}>{p.counts.files} files · {p.counts.notes} notes</span></li>)}</ul> : <p className={d.muted}>No projects yet.</p>;
      case "integrations":
        return connectors.length ? <ul className={d.list}>{connectors.map((c) => <li key={c.id}><span>{c.label}</span><span className={s.tag} data-tone={c.connection ? "ok" : "off"}>{c.connection ? "Connected" : "Not connected"}</span></li>)}</ul> : <p className={d.muted}>No integrations are available yet.</p>;
    }
  };

  return (
    <div className={`${s.page} ${d.dash}`}>
      <header className={d.head}>
        <div className={d.headL}>
          <p className={d.eyebrow}><span className={d.dot} data-busy={!dash || undefined} aria-hidden="true" />{loadedAt ? `Updated ${loadedAt}` : "Loading your numbers…"}</p>
          <h1 className={d.title}>Dashboard</h1>
          <p className={d.lead}>From your connected payments, site, agents and usage.</p>
        </div>
        <div className={d.headR}>
          <Button size="sm" variant={editing ? "primary" : "secondary"} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>{editing ? "Done" : "Customize"}</Button>
        </div>
      </header>
      {err ? <p className={d.error} role="alert">{err}</p> : null}
      <div className={d.grid} data-editing={editing || undefined}>
        {(layout ?? []).map((w, i) => (
          <article
            key={w.id}
            className={d.card}
            data-size={w.size}
            data-id={w.id}
            data-tone={TONE[w.id]}
            data-dragging={dragId === w.id || undefined}
            style={{ ["--d" as string]: `${Math.min(i, 8) * 60}ms` }}
            draggable={editing}
            onDragStart={() => setDragId(w.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => { if (editing && dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, w.id); setDragId(null); }}
            aria-label={TITLE[w.id]}
          >
            <header className={d.cardHead}>
              <h2 className={d.cardTitle}>{w.id === "traffic" ? `Site views, ${range} days` : TITLE[w.id]}</h2>
              {editing ? (
                <div className={d.tools}>
                  <button type="button" onClick={() => nudge(w.id, -1)} disabled={i === 0} aria-label={`Move ${TITLE[w.id]} earlier`}>←</button>
                  <button type="button" onClick={() => nudge(w.id, 1)} disabled={i === (layout?.length ?? 0) - 1} aria-label={`Move ${TITLE[w.id]} later`}>→</button>
                  {(["s", "m", "l"] as const).map((sz) => <button key={sz} type="button" aria-pressed={w.size === sz} onClick={() => resize(w.id, sz)} aria-label={`${TITLE[w.id]} size ${sz === "s" ? "small" : sz === "m" ? "medium" : "large"}`}>{sz.toUpperCase()}</button>)}
                </div>
              ) : w.id === "traffic" && dash ? (
                <SegmentedControl size="sm" label="Site views timeframe" segments={RANGES} value={range} onChange={setRange} />
              ) : null}
            </header>
            <div className={d.cardBody}>{body(w.id)}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
