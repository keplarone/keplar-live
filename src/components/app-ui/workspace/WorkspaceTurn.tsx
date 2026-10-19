"use client";
/**
 * Workspace cards in the chat: the Apps, Approvals, Business (CRM, leads, dashboard), Agents, Projects, Deployments and History
 * tabs, inline in the thread. Each card loads live from the same API its tab uses (nothing is copied into the chat, so it is never
 * stale after a reload), offers the same actions, and links to the same object in its tab ("Open in ..."). Anything that leaves
 * Keplar still waits for the owner: approving here is the owner's click, through the same approvals route as the tab.
 * The "choose" card is the router's "did you mean": a tool, or a normal answer.
 */
import Link from "next/link";
import { SignInLink } from "../SignInLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { previewAction } from "@/lib/business/chat-flow";
import type { OutboundAction } from "@/lib/business/types";
import { isAgentAct, type Intent } from "@/lib/chat-actions/intent";
import { activeScopeHeaders } from "../state/scope";
import type { KeplarMessage, Ledger, Project, Thread, UserMessage, WorkspaceCard } from "../state/types";
import type { OpResult } from "./project-ops";
import { buildCron, formFromCron, type CronForm, type CronMode } from "@/lib/business/cron-form";
import { approveBody, CAP_MAX, capsPatch, editableDraft, filterOrders, matchName, money, orderSummary, relDay, historyHits, type OrderFilter, type OrderRow } from "./workspace-data";
import { Confirm } from "./Confirm";
import { Button, SegmentedControl, notify } from "@/components/kit";
import s from "./workspace.module.css";
import la from "../link-action.module.css";

export type TabTarget =
  | { view: "create"; appId?: string }
  | { view: "approvals" }
  | { view: "business"; tab: "overview" | "crm" | "orders" }
  | { view: "agents" }
  | { view: "projects"; projectId?: string }
  | { view: "deployments" }
  | { view: "history"; projectId?: string; query?: string };

type Props = {
  message: KeplarMessage;
  user?: UserMessage;
  ledger: Ledger;
  isLast: boolean;
  onPatch: (patch: Partial<WorkspaceCard>) => void;
  onSettled: () => void;
  onOpenTab: (t: TabTarget) => void;
  /** Post a follow-up into the chat that does `intent` (null = answer normally). */
  onAct: (text: string, intent: Intent | null) => void;
  /** Put text in the composer (e.g. "/edit BikeFix: ") for the person to finish. */
  onSeed: (text: string) => void;
  projects: Project[];
  threads: Thread[];
  activeThreadId: string | null;
  onOpenThread: (id: string) => void;
  onCreateProject: (name: string) => { ok: true; project: Project } | { ok: false; error: string };
  onNewInProject: (id: string) => void;
  onMoveThread: (id: string, projectId: string | null) => void;
  onRenameProject: (id: string, name: string) => Promise<OpResult>;
  onDeleteProject: (id: string, chats: "keep" | "delete") => Promise<OpResult>;
  onMergeProjects: (from: string, into: string) => Promise<OpResult>;
  onRenameThread: (id: string, title: string) => void;
  /** Deletes a chat (with the app's usual undo window). */
  onDeleteThread: (id: string) => void;
};

type ApiErr = Error & { status?: number; code?: string };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...activeScopeHeaders(), ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? (res.status === 401 ? "Sign in to see this." : "That didn't load. Try again in a moment.")), { status: res.status, code: data.code }) as ApiErr;
  return data;
}

/** Load once per mount (and again on `reload()`); the card is always the server's current state. */
function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiErr | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let on = true;
    api<T>(url).then((d) => { if (on) { setData(d); setError(null); } }).catch((e: ApiErr) => on && setError(e));
    return () => { on = false; };
  }, [url, n]);
  return { data, error, reload: () => setN((x) => x + 1), setData };
}

const TITLES: Record<WorkspaceCard["kind"], string> = { apps: "Your apps", approvals: "Approvals", crm: "CRM", leads: "Leads", dashboard: "Business dashboard", orders: "Orders", agents: "Agents", projects: "Projects", deployments: "Deployments", history: "History", choose: "What would you like?" };

export function WorkspaceTurn(props: Props) {
  const w = props.message.workspace!;
  if (w.kind === "choose") return <ChooseCard {...props} />;
  const needsAccount = w.kind !== "projects" && w.kind !== "history";
  if (needsAccount && props.ledger.synced && !props.ledger.signedIn) {
    return (
      <Card kind={w.kind} title={TITLES[w.kind]}>
        <p className={s.note}>Sign in to see {w.kind === "apps" || w.kind === "deployments" ? "the apps and sites you built" : "your business workspace"} here. Everything the {TAB_NAME[w.kind]} tab shows also works in the chat once you are signed in.</p>
        <div className={s.actions}><SignInLink className={la.act} data-variant="primary">Sign in</SignInLink><SignInLink page="signup" className={la.act} data-variant="secondary">Create a free account</SignInLink></div>
      </Card>
    );
  }
  switch (w.kind) {
    case "apps": return <AppsCard {...props} />;
    case "approvals": return <ApprovalsCard {...props} />;
    case "crm": return <CrmCard {...props} />;
    case "leads": return <LeadsCard {...props} />;
    case "dashboard": return <DashboardCard {...props} />;
    case "orders": return <OrdersCard {...props} />;
    case "agents": return <AgentsCard {...props} />;
    case "projects": return <ProjectsCard {...props} />;
    case "deployments": return <DeploymentsCard {...props} />;
    case "history": return <HistoryCard {...props} />;
  }
}

const TAB_NAME: Record<WorkspaceCard["kind"], string> = { apps: "Create", approvals: "Approvals", crm: "Business", leads: "Business", dashboard: "Business", orders: "Business", agents: "Agents", projects: "Projects", deployments: "Deployments", history: "History", choose: "" };

function Card({ kind, title, chip, busy, children }: { kind: string; title: string; chip?: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <section className={s.card} data-workspace={kind} aria-label={title} aria-busy={busy || undefined}>
      <header className={s.head}>
        <KeplarSymbol size={16} className={s.sym} />
        <span className={s.label} data-busy={busy || undefined}>{title}</span>
        {chip ? <span className={s.chip}>{chip}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Problem({ error, retry }: { error: ApiErr; retry: () => void }) {
  const plan = error.code === "entitlement" || error.code === "plan_required" || error.status === 402;
  return (
    <p className={s.note} role="alert">
      {error.message}{" "}
      {plan ? <Link href="/pricing" className={s.inline}>See plans</Link> : error.status === 401 ? <SignInLink className={s.inline}>Sign in</SignInLink> : <Button size="sm" variant="ghost" className={s.quiet} onClick={retry}>Try again</Button>}
    </p>
  );
}

/** A destructive action waits for this click (delete, merge, kill). */
const Skeleton = () => <div className={s.skeleton} aria-hidden="true"><i /><i /><i /></div>;

function Footer({ label, onOpen, children }: { label: string; onOpen: () => void; children?: React.ReactNode }) {
  return (
    <div className={s.actions}>
      <Button variant="secondary" onClick={onOpen}>{label}</Button>
      {children}
    </div>
  );
}

/* ───────────── Apps ───────────── */

type AppRow = { id: string; name: string; appName?: string; kind?: string | null; previewUrl: string | null; thumb: string | null; publishedVersion: number | null; headVersion: number; publishedUrl: string | null; updatedAt: string; takenDown?: boolean };

function AppsCard({ onOpenTab, onAct, onSeed, onSettled }: Props) {
  const { data, error, reload } = useLoad<{ apps: AppRow[] }>("/api/apps");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const setLive = async (a: AppRow, on: boolean) => {
    setBusy(a.id);
    setNote("");
    try {
      await api(`/api/sites/${a.id}/publish`, { method: on ? "POST" : "DELETE" });
      setNote(on ? `${a.appName ?? a.name} is live.` : `${a.appName ?? a.name} is offline.`);
      reload();
      onSettled();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };
  if (error) return <Card kind="apps" title={TITLES.apps}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="apps" title={TITLES.apps} busy><Skeleton /></Card>;
  const apps = data.apps;
  return (
    <Card kind="apps" title={TITLES.apps} chip={`${apps.length} ${apps.length === 1 ? "app" : "apps"}`}>
      {apps.length === 0 ? <p className={s.note}>No apps yet. Say &ldquo;build me an app that…&rdquo; (or type /create) and Keplar builds it here.</p> : (
        <ul className={s.rows}>
          {apps.map((a) => {
            const name = a.appName ?? a.name;
            const live = a.publishedVersion !== null && !a.takenDown;
            const ahead = live && a.headVersion > (a.publishedVersion ?? 0);
            return (
              <li key={a.id} className={s.row} data-app={a.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a screenshot the build already saved; no resizing needed */}
                <span className={s.thumb} aria-hidden="true">{a.thumb ? <img src={a.thumb} alt="" loading="lazy" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}</span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{name}</span>
                  <span className={s.rowMeta}>{live ? `Live · v${a.publishedVersion}` : a.headVersion ? `Draft · v${a.headVersion}` : "Not built yet"}{ahead ? ` · unpublished changes` : ""}{a.kind ? ` · ${a.kind}` : ""} · {relDay(a.updatedAt)}</span>
                </span>
                <span className={s.rowActions}>
                  {a.headVersion ? <Button size="sm" variant="secondary" onClick={() => onAct(`Show my ${name} app`, { type: "create.show", appId: a.id })}>Show here</Button> : null}
                  {a.headVersion ? <Button size="sm" variant="secondary" onClick={() => onSeed(`/edit ${name}: `)}>Edit</Button> : null}
                  {a.headVersion ? (live && !ahead ? <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => void setLive(a, false)}>Unpublish</Button> : <Button size="sm" variant="primary" disabled={busy === a.id} onClick={() => void setLive(a, true)}>{ahead ? "Publish changes" : "Publish"}</Button>) : null}
                  {live && a.publishedUrl ? <a className={la.act} data-variant="secondary" data-size="sm" href={a.publishedUrl} target="_blank" rel="noreferrer noopener">Open live</a> : null}
                  <Button size="sm" variant="secondary" onClick={() => onOpenTab({ view: "create", appId: a.id })}>Open in Create</Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {note ? <p className={s.meta} role="status">{note}</p> : null}
      <Footer label="Open in Create" onOpen={() => onOpenTab({ view: "create" })}><span className={s.meta}>Say &ldquo;edit my {apps[0]?.appName ?? apps[0]?.name ?? "BikeFix"} app to…&rdquo; to change one.</span></Footer>
    </Card>
  );
}

/* ───────────── Approvals ───────────── */

type ApprovalRow = { id: string; agentName: string; action: OutboundAction; status: "pending" | "approved" | "rejected" | "cancelled" | "sent" | "failed"; createdAt: string; risk?: "low" | "medium" | "high"; result?: string };

function ApprovalsCard({ onOpenTab, onSettled }: Props) {
  const { data, error, reload, setData } = useLoad<{ approvals: ApprovalRow[] }>("/api/business/approvals");
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  /** The draft being edited before approval: its id and the owner's text (sent as the route's `edits`). */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  // The outcome is a kit toast (one at a time, replaced in place); the row's own status chip keeps the result on the card.
  const say = (title: string, tone: "success" | "danger" | "neutral") => notify({ id: "approvals-card", title, tone, duration: tone === "danger" ? 0 : 5000 });
  const decide = async (a: ApprovalRow, decision: "approve" | "reject") => {
    setBusy(a.id);
    const edited = decision === "approve" && editing?.id === a.id ? editing.text : null;
    const req = decision === "approve" ? approveBody(a.action, edited) : { decision };
    try {
      const r = await api<{ approval: { status: ApprovalRow["status"]; result?: string; action?: ApprovalRow["action"] } }>(`/api/business/approvals/${a.id}`, { method: "POST", body: JSON.stringify(req) });
      setData((d) => (d ? { approvals: d.approvals.map((x) => (x.id === a.id ? { ...x, status: r.approval.status, result: r.approval.result, action: r.approval.action ?? x.action } : x)) } : d));
      if (editing?.id === a.id) setEditing(null);
      const ed = "edits" in req && req.edits ? " with your edits" : "";
      if (decision === "reject") say("Rejected · nothing was sent", "neutral");
      else if (r.approval.status === "failed") say(`Not sent: ${r.approval.result ?? "the app refused it"}`, "danger");
      else say(`Approved · sent${ed}`, "success");
      onSettled();
    } catch (e) { say((e as Error).message, "danger"); } finally { setBusy(null); }
  };
  if (error) return <Card kind="approvals" title={TITLES.approvals}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="approvals" title={TITLES.approvals} busy><Skeleton /></Card>;
  const pending = data.approvals.filter((a) => a.status === "pending");
  const list = showAll ? data.approvals.slice(0, 20) : pending;
  return (
    <Card kind="approvals" title={pending.length ? "Pending approvals" : TITLES.approvals} chip={`${pending.length} pending`}>
      {list.length === 0 ? <p className={s.note}>{pending.length === 0 && !showAll ? "Nothing is waiting for you. When an agent drafts an email, post or event, it waits here until you approve it." : "No approvals yet."}</p> : (
        <ul className={s.drafts}>
          {list.map((a) => {
            const p = previewAction(a.action);
            const ed = a.status === "pending" ? editableDraft(a.action) : null;
            return (
              <li key={a.id} className={s.draft} data-status={a.status}>
                <div className={s.draftHead}>
                  <span className={s.rowTitle}>{p.title}</span>
                  <span className={s.rowMeta}>{a.agentName} · {relDay(a.createdAt)}</span>
                  {a.risk ? <span className={s.risk} data-risk={a.risk}>{a.risk[0].toUpperCase() + a.risk.slice(1)} risk</span> : null}
                  {a.status !== "pending" ? <span className={s.status} data-status={a.status}>{a.status === "sent" ? "Sent" : a.status === "failed" ? "Not sent" : a.status[0].toUpperCase() + a.status.slice(1)}</span> : null}
                </div>
                {p.to ? <div className={s.rowMeta}>To {p.to}</div> : null}
                {editing?.id === a.id && ed ? (
                  <label className={s.field}>
                    <span>{ed.label} · edit before you approve. Only this text changes; {ed.key === "body" ? "the recipient and subject stay" : "where it goes stays"} as shown.</span>
                    <textarea className={s.textarea} rows={6} maxLength={ed.max} value={editing.text} autoFocus onChange={(e) => setEditing({ id: a.id, text: e.target.value })} data-draft-edit="" />
                  </label>
                ) : <p className={s.draftBody}>{p.body}</p>}
                {a.status === "failed" && a.result ? <p className={s.note} role="alert">{a.result}</p> : null}
                {a.status === "pending" ? (
                  <div className={s.actions}>
                    <Button variant="secondary" disabled={busy !== null} onClick={() => void decide(a, "reject")}>{busy === a.id ? "…" : "Reject"}</Button>
                    {ed ? (editing?.id === a.id
                      ? <Button variant="secondary" disabled={busy !== null} onClick={() => setEditing(null)}>Discard edits</Button>
                      : <Button variant="secondary" disabled={busy !== null} onClick={() => setEditing({ id: a.id, text: ed.value })} data-edit-draft="">Edit</Button>) : null}
                    <Button variant="primary" disabled={busy !== null || (editing?.id === a.id && !editing.text.trim())} onClick={() => void decide(a, "approve")} data-approve="">{busy === a.id ? "Sending…" : editing?.id === a.id ? "Approve and send edited" : "Approve and send"}</Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Footer label="Open in Approvals" onOpen={() => onOpenTab({ view: "approvals" })}>
        <Button size="sm" variant="ghost" className={s.quiet} onClick={() => setShowAll((v) => !v)}>{showAll ? "Only pending" : "Show recent decisions"}</Button>
        <span className={s.meta}>You approve anything that leaves Keplar. Edit an email or post here before you approve it.</span>
      </Footer>
    </Card>
  );
}

/* ───────────── CRM and leads ───────────── */

type Contact = { id: string; name: string; email: string; source: "form" | "checkout" | "manual" | "import"; createdAt: string; lastActivityAt: string; tags: string[] };
type Deal = { id: string; contactId: string; title: string; value: number; currency: string; stage: "new" | "qualified" | "proposal" | "won" | "lost"; updatedAt: string };
type Crm = { contacts: Contact[]; deals: Deal[] };
const STAGES: Deal["stage"][] = ["new", "qualified", "proposal", "won", "lost"];

function CrmCard({ onOpenTab }: Props) {
  const { data, error, reload, setData } = useLoad<Crm>("/api/business/crm");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      const r = await api<{ contact: Contact }>("/api/business/crm", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim() }) });
      setData((d) => (d ? { ...d, contacts: [r.contact, ...d.contacts.filter((c) => c.id !== r.contact.id)] } : d));
      setName(""); setEmail(""); setMsg(`Added ${r.contact.name || r.contact.email}.`);
    } catch (err) { setMsg((err as Error).message); }
  };
  const move = async (d: Deal, stage: Deal["stage"]) => {
    try {
      const r = await api<{ deal: Deal }>(`/api/business/crm/deals/${d.id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      setData((x) => (x ? { ...x, deals: x.deals.map((y) => (y.id === d.id ? r.deal : y)) } : x));
    } catch (err) { setMsg((err as Error).message); }
  };
  if (error) return <Card kind="crm" title={TITLES.crm}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="crm" title={TITLES.crm} busy><Skeleton /></Card>;
  const open = data.deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const who = (id: string) => data.contacts.find((c) => c.id === id)?.name || data.contacts.find((c) => c.id === id)?.email || "Contact";
  return (
    <Card kind="crm" title={TITLES.crm} chip={`${data.contacts.length} contacts · ${open.length} open deals`}>
      <div className={s.pipeline} aria-label="Pipeline">
        {STAGES.map((st) => {
          const ds = data.deals.filter((d) => d.stage === st);
          return (
            <div key={st} className={s.stage}>
              <span className={s.stageName}>{st[0].toUpperCase() + st.slice(1)}</span>
              <span className={s.stageNum}>{ds.length}</span>
              <span className={s.rowMeta}>{money(ds.reduce((a, d) => a + d.value, 0), ds[0]?.currency)}</span>
            </div>
          );
        })}
      </div>
      {data.deals.length ? (
        <ul className={s.rows} aria-label="Deals">
          {data.deals.slice(0, 6).map((d) => (
            <li key={d.id} className={s.row}>
              <span className={s.rowMain}><span className={s.rowTitle}>{d.title}</span><span className={s.rowMeta}>{who(d.contactId)}{d.value ? ` · ${money(d.value, d.currency)}` : ""} · {relDay(d.updatedAt)}</span></span>
              <label className="visually-hidden" htmlFor={`cs-${d.id}`}>Stage for {d.title}</label>
              <select id={`cs-${d.id}`} className={s.select} value={d.stage} onChange={(e) => void move(d, e.target.value as Deal["stage"])}>
                {STAGES.map((st) => <option key={st} value={st}>{st[0].toUpperCase() + st.slice(1)}</option>)}
              </select>
            </li>
          ))}
        </ul>
      ) : null}
      <ContactList contacts={data.contacts.slice(0, 8)} empty="No contacts yet. Form messages and checkouts on your published sites land here." />
      <form className={s.inlineForm} onSubmit={(e) => { if (!email.trim()) { e.preventDefault(); return; } void add(e); }}>
        <label className="visually-hidden" htmlFor="crm-name">Name</label>
        <input spellCheck={false} id="crm-name" className={s.input} placeholder="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <label className="visually-hidden" htmlFor="crm-email">Email</label>
        <input id="crm-email" className={s.input} placeholder="Email" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} required />
        <Button type="submit" size="sm" variant="secondary" disabled={!email.trim()}>Add contact</Button>
      </form>
      {msg ? <p className={s.meta} role="status">{msg}</p> : null}
      <Footer label="Open in Business" onOpen={() => onOpenTab({ view: "business", tab: "crm" })} />
    </Card>
  );
}

function ContactList({ contacts, empty }: { contacts: Contact[]; empty: string }) {
  if (!contacts.length) return <p className={s.note}>{empty}</p>;
  return (
    <ul className={s.rows} aria-label="Contacts">
      {contacts.map((c) => (
        <li key={c.id} className={s.row}>
          <span className={s.avatar} aria-hidden="true">{(c.name || c.email).slice(0, 1).toUpperCase()}</span>
          <span className={s.rowMain}><span className={s.rowTitle}>{c.name || c.email}</span><span className={s.rowMeta}>{c.name ? `${c.email} · ` : ""}{c.source === "form" ? "Site form" : c.source === "checkout" ? "Checkout" : c.source === "import" ? "Imported" : "Added by you"} · {relDay(c.lastActivityAt)}</span></span>
        </li>
      ))}
    </ul>
  );
}

function LeadsCard({ onOpenTab, onAct }: Props) {
  const { data, error, reload } = useLoad<Crm>("/api/business/crm");
  const [now] = useState(() => Date.now());
  if (error) return <Card kind="leads" title={TITLES.leads}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="leads" title={TITLES.leads} busy><Skeleton /></Card>;
  const leads = data.contacts.filter((c) => c.source === "form" || c.source === "checkout").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const since = new Date(now - 30 * 864e5).toISOString();
  const recent = leads.filter((c) => c.createdAt >= since).length;
  return (
    <Card kind="leads" title={TITLES.leads} chip={`${recent} in the last 30 days · ${leads.length} total`}>
      <ContactList contacts={leads.slice(0, 10)} empty="No leads yet. When someone fills in a form or checks out on one of your published sites, they show up here." />
      <Footer label="Open in Business" onOpen={() => onOpenTab({ view: "business", tab: "crm" })}>
        {leads.length ? <Button size="sm" variant="secondary" onClick={() => onAct("Set up an agent that follows up with new leads", { type: "agent.new" })}>Follow up with an agent</Button> : null}
        <span className={s.meta}>Follow-up emails are drafted for your approval; nothing is sent on its own.</span>
      </Footer>
    </Card>
  );
}

/* ───────────── Dashboard ───────────── */

type Dash = {
  revenue: { last30: number; total: number; currency: string };
  orders: { last30: number; pending: number };
  leads: { last30: number; total: number };
  traffic: { last14: number; days: { day: string; views: number }[] };
  conversion: { rate: number | null; windowDays: number };
  agents: { active: number; total: number; halted: boolean };
  approvals: { pending: number };
  mode?: string;
};

function DashboardCard({ onOpenTab, onAct }: Props) {
  const { data, error, reload } = useLoad<Dash>("/api/business/dashboard");
  if (error) return <Card kind="dashboard" title={TITLES.dashboard}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="dashboard" title={TITLES.dashboard} busy><Skeleton /></Card>;
  const max = Math.max(1, ...data.traffic.days.map((d) => d.views));
  const stats: { k: string; v: string; sub: string }[] = [
    { k: "Revenue", v: money(data.revenue.last30, data.revenue.currency), sub: `last 30 days · ${money(data.revenue.total, data.revenue.currency)} all time` },
    { k: "Orders", v: String(data.orders.last30), sub: `last 30 days${data.orders.pending ? ` · ${data.orders.pending} pending` : ""}` },
    { k: "Leads", v: String(data.leads.last30), sub: `last 30 days · ${data.leads.total} total` },
    { k: "Visits", v: String(data.traffic.last14), sub: "last 14 days" },
    { k: "Conversion", v: data.conversion.rate === null ? "–" : `${(data.conversion.rate * 100).toFixed(1)}%`, sub: data.conversion.rate === null ? "no visits yet" : `orders per visit, ${data.conversion.windowDays} days` },
    { k: "Agents", v: `${data.agents.active} of ${data.agents.total}`, sub: data.agents.halted ? "all halted" : "active" },
  ];
  return (
    <Card kind="dashboard" title={TITLES.dashboard} chip={data.mode === "test" ? "Test mode" : undefined}>
      <div className={s.stats}>
        {stats.map((x) => <div key={x.k} className={s.stat}><span className={s.statK}>{x.k}</span><span className={s.statV}>{x.v}</span><span className={s.rowMeta}>{x.sub}</span></div>)}
      </div>
      <div className={s.spark} role="img" aria-label={`Site visits per day for 14 days: ${data.traffic.days.map((d) => d.views).join(", ")}`}>
        {data.traffic.days.map((d) => <i key={d.day} style={{ height: `${Math.max(4, Math.round((d.views / max) * 100))}%` }} title={`${d.day}: ${d.views}`} />)}
      </div>
      <Footer label="Open in Business" onOpen={() => onOpenTab({ view: "business", tab: "overview" })}>
        {data.approvals.pending ? <Button size="sm" variant="primary" onClick={() => onAct("Show my pending approvals", { type: "workspace", card: "approvals" })}>{data.approvals.pending} waiting for approval</Button> : null}
        <Button size="sm" variant="secondary" onClick={() => onAct("Show my orders", { type: "workspace", card: "orders" })}>Orders</Button>
        <Button size="sm" variant="secondary" onClick={() => onAct("Show my leads", { type: "workspace", card: "leads" })}>Leads</Button>
        <Button size="sm" variant="secondary" onClick={() => onAct("Open my CRM", { type: "workspace", card: "crm" })}>CRM</Button>
      </Footer>
    </Card>
  );
}

/* ───────────── Orders ───────────── */

const ORDER_FILTERS: [OrderFilter, string][] = [["all", "All"], ["paid", "Paid"], ["pending", "Pending"], ["refunded", "Refunded"]];

/** Orders from the shops built in Create, as in Business › Orders (read-only there too): status, refunds, disputes and the paid total. */
function OrdersCard({ onOpenTab }: Props) {
  const { data, error, reload } = useLoad<{ orders: OrderRow[] }>("/api/business/orders");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [more, setMore] = useState(false);
  if (error) return <Card kind="orders" title={TITLES.orders}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="orders" title={TITLES.orders} busy><Skeleton /></Card>;
  const sum = orderSummary(data.orders);
  const list = filterOrders(data.orders, filter);
  const shown = more ? list.slice(0, 50) : list.slice(0, 8);
  return (
    <Card kind="orders" title={TITLES.orders} chip={`${sum.counts.all} ${sum.counts.all === 1 ? "order" : "orders"} · ${money(sum.net, sum.currency)} paid`}>
      {data.orders.length === 0 ? <p className={s.note}>No orders yet. When someone buys from a shop you built in Create, the order shows up here and in Business.</p> : (
        <>
          <SegmentedControl
            label="Show orders"
            size="sm"
            className={s.seg}
            value={filter}
            onValueChange={(f) => { setFilter(f); setMore(false); }}
            options={ORDER_FILTERS.map(([f, label]) => ({ value: f, label: `${label} · ${sum.counts[f]}` }))}
          />
          {list.length === 0 ? <p className={s.note}>No {filter} orders.</p> : (
            <ul className={s.rows} aria-label="Orders">
              {shown.map((o) => (
                <li key={o.id} className={s.row} data-order={o.status}>
                  <div className={s.rowMain}>
                    <span className={s.rowTitle}>{o.productName}</span>
                    <span className={s.rowMeta}>{o.customerEmail ?? "No email"} · {relDay(o.createdAt)}</span>
                  </div>
                  <span className={s.amount}>{money(o.amount, o.currency)}</span>
                  <span className={s.status} data-status={o.status === "paid" ? "sent" : o.status === "cancelled" ? "failed" : o.status}>{o.status[0].toUpperCase() + o.status.slice(1)}</span>
                  {o.refundedAmount && o.status !== "refunded" ? <span className={s.risk} data-risk="medium">{money(o.refundedAmount, o.currency)} refunded</span> : null}
                  {o.disputedAt ? <span className={s.risk} data-risk="high">Disputed</span> : null}
                </li>
              ))}
            </ul>
          )}
          {list.length > shown.length ? <Button size="sm" variant="ghost" className={s.quiet} onClick={() => setMore(true)}>Show {Math.min(list.length, 50) - shown.length} more</Button> : null}
        </>
      )}
      <Footer label="Open in Business" onOpen={() => onOpenTab({ view: "business", tab: "orders" })}>
        <span className={s.meta}>You handle refunds and disputes in your Stripe account; Keplar shows them here.</span>
      </Footer>
    </Card>
  );
}

/* ───────────── Agents ───────────── */

type AgentCaps = { monthlyUnits: number; runsPerDay: number; outboundPerDay: number; spendUsdPerMonth: number };
type AgentRow = {
  id: string; name: string; template: string; status: "active" | "paused" | "killed"; trigger: { type: string; label?: string; event?: string; cron?: string; tz?: string };
  next: string | null; unitsThisMonth: number; autoSend: boolean; caps?: AgentCaps; monitor?: { url: string; keyword?: string }; scheduleError?: string;
};
type AgentsData = { agents: AgentRow[]; runEstimateUnits: number; settings?: { agentsHalted?: boolean }; schedule?: { fastestAllowed?: string | null } };

function AgentsCard({ message: m, onPatch, onOpenTab, onAct, onSettled }: Props) {
  const w = m.workspace!;
  const { data, error, reload, setData } = useLoad<AgentsData>("/api/business/agents");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [needsApproval, setNeedsApproval] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const acting = useRef(false);

  const setStatus = async (a: AgentRow, status: "active" | "paused") => {
    setBusy(a.id);
    try {
      const r = await api<{ agent: AgentRow }>(`/api/business/agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setData((d) => (d ? { ...d, agents: d.agents.map((x) => (x.id === a.id ? { ...x, ...r.agent } : x)) } : d));
      const text = status === "paused" ? `Paused ${a.name}. It won't run until you resume it.` : `Resumed ${a.name}.`;
      setNote(text);
      return { ok: true, text };
    } catch (e) { const text = (e as Error).message; setNote(text); return { ok: false, text }; } finally { setBusy(null); }
  };
  /** Settings saved with the Agents tab's PATCH (schedule, page watched, caps, or stop for good); the card shows the saved agent. */
  const patchAgent = async (a: AgentRow, body: Record<string, unknown>, done: (x: AgentRow) => string) => {
    setBusy(a.id);
    try {
      const r = await api<{ agent: AgentRow }>(`/api/business/agents/${a.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setData((d) => (d ? { ...d, agents: d.agents.map((x) => (x.id === a.id ? { ...x, ...r.agent } : x)) } : d));
      const text = done({ ...a, ...r.agent });
      setNote(text);
      return { ok: true, text };
    } catch (e) { const text = (e as Error).message; setNote(text); return { ok: false, text }; } finally { setBusy(null); }
  };
  const runNow = async (a: AgentRow) => {
    setBusy(a.id);
    setNeedsApproval(false);
    try {
      const r = await api<{ run: { status: string; error?: string } }>(`/api/business/agents/${a.id}`, { method: "POST" });
      const text = r.run.status === "waiting_approval" ? `${a.name} ran. Its drafts are waiting for your approval.` : r.run.status === "succeeded" ? `${a.name} ran and finished.` : r.run.status === "failed" ? `${a.name} didn't finish: ${r.run.error ?? "the run failed"}.` : `${a.name} is running.`;
      setNote(text);
      setNeedsApproval(r.run.status === "waiting_approval");
      onSettled();
      return { ok: r.run.status !== "failed", text };
    } catch (e) { const text = (e as Error).message; setNote(text); return { ok: false, text }; } finally { setBusy(null); }
  };

  // Asked in words ("pause my lead follow-up agent"): pausing / resuming happens at once (it only stops or restarts the
  // schedule); running costs credits, so it waits for a click. The outcome is saved, so a reload never repeats it.
  const act = isAgentAct(w.act) ? w.act : null;
  const target = useMemo(() => (act && data ? matchName(data.agents.filter((a) => a.status !== "killed"), act.name) : null), [act, data]);
  useEffect(() => {
    if (!act || w.acted || !data || acting.current) return;
    if (!target || "choices" in target) return;
    if (act.type === "run") return;
    acting.current = true;
    const a = data.agents.find((x) => x.id === target.id)!;
    if (act.type === "schedule") {
      // A new schedule only changes when it runs (nothing is sent or charged), so it is saved at once, in the agent's own time zone.
      if (a.trigger.type !== "schedule") { onPatch({ acted: { ok: false, text: `${a.name} runs ${a.trigger.type === "event" ? `when ${a.trigger.event ?? "something happens"}` : "when you press Run now"}, not on a schedule, so nothing changed.` } }); return; }
      const tz = a.trigger.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      void Promise.resolve().then(() => patchAgent(a, { schedule: { cron: act.cron, tz } }, (x) => `${x.name} now runs ${(x.trigger.label ?? act.words).replace(/^Every/, "every")}.`)).then((r) => onPatch({ acted: r }));
      return;
    }
    void Promise.resolve().then(() => setStatus(a, act.type === "pause" ? "paused" : "active")).then((r) => onPatch({ acted: r }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, w.acted, data, target]);

  if (error) return <Card kind="agents" title={TITLES.agents}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="agents" title={TITLES.agents} busy><Skeleton /></Card>;
  const agents = data.agents.filter((a) => a.status !== "killed");
  const pick = act && target && "id" in target ? agents.find((a) => a.id === target.id) : null;
  return (
    <Card kind="agents" title={TITLES.agents} chip={`${agents.filter((a) => a.status === "active").length} active · ${agents.length} total`}>
      {act && !w.acted && target && "choices" in target ? <p className={s.note}>{target.choices.length ? `No agent matches “${act.name}”. Pick one below.` : `You have no agent called “${act.name}”.`}</p> : null}
      {act?.type === "run" && pick && !w.acted ? (
        <div className={s.confirm} role="group" aria-label={`Run ${pick.name} now?`}>
          <span>Run {pick.name} now? About {data.runEstimateUnits.toLocaleString("en-US")} credits. Anything it drafts waits for your approval.</span>
          <Button variant="primary" disabled={busy !== null} onClick={() => void runNow(pick).then((r) => onPatch({ acted: r }))}>Run now</Button>
          <Button variant="secondary" onClick={() => onPatch({ acted: { ok: false, text: "Not run." } })}>Not now</Button>
        </div>
      ) : null}
      {w.acted ? <p className={s.result} role="status" data-ok={w.acted.ok || undefined}>{w.acted.text}</p> : null}
      {agents.length === 0 ? <p className={s.note}>No agents yet. An agent runs a workflow on a schedule (a lead sweep, a daily brief, a weekly report) and anything it would send waits for your approval.</p> : (
        <ul className={s.rows}>
          {agents.map((a) => (
            <li key={a.id} className={s.rowStack} data-status={a.status}><div className={s.row}>
              <span className={s.dot} data-on={a.status === "active" || undefined} aria-hidden="true" />
              <span className={s.rowMain}>
                <span className={s.rowTitle}>{a.name}</span>
                <span className={s.rowMeta}>{a.status === "paused" ? "Paused" : a.trigger.label ?? (a.trigger.type === "event" ? `On ${a.trigger.event}` : "By hand")}{a.next && a.status === "active" ? ` · next ${relDay(a.next)}` : ""} · {a.unitsThisMonth.toLocaleString("en-US")} credits this month</span>
              </span>
              <span className={s.rowActions}>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void runNow(a)}>Run now</Button>
                {a.status === "active" ? <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void setStatus(a, "paused")}>Pause</Button> : <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void setStatus(a, "active")}>Resume</Button>}
                <Button size="sm" variant="secondary" aria-pressed={open === a.id} aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)} data-agent-settings="">Settings</Button>
              </span>
            </div>
            {open === a.id ? <AgentSettings key={a.id} agent={a} busy={busy === a.id} fastest={data.schedule?.fastestAllowed ?? null} onSave={(body, done) => void patchAgent(a, body, done)} onStop={() => void patchAgent(a, { status: "killed" }, (x) => `Stopped ${x.name} for good. Its waiting drafts were cancelled.`).then((r) => { if (r.ok) setOpen(null); })} /> : null}
            </li>
          ))}
        </ul>
      )}
      {note && note !== w.acted?.text ? <p className={s.meta} role="status">{note}</p> : null}
      <Footer label="Open in Agents" onOpen={() => onOpenTab({ view: "agents" })}>
        <Button size="sm" variant="primary" onClick={() => onAct("Set up a new agent", { type: "agent.new" })}>New agent</Button>
        {needsApproval ? <Button size="sm" variant="secondary" onClick={() => onAct("Show my pending approvals", { type: "workspace", card: "approvals" })}>Review drafts</Button> : null}
      </Footer>
    </Card>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One agent's settings, as in the Agents tab: when it runs (presets or cron, time zone), the page a monitor watches, its caps, stop for good. */
function AgentSettings({ agent: a, busy, fastest, onSave, onStop }: { agent: AgentRow; busy: boolean; fastest: string | null; onSave: (body: Record<string, unknown>, done: (x: AgentRow) => string) => void; onStop: () => void }) {
  const [form, setForm] = useState<CronForm>(() => formFromCron(a.trigger.cron ?? "0 8 * * *"));
  const [tz, setTz] = useState(a.trigger.tz ?? "UTC");
  const [url, setUrl] = useState(a.monitor?.url ?? "");
  const [keyword, setKeyword] = useState(a.monitor?.keyword ?? "");
  const caps0 = a.caps;
  const [caps, setCaps] = useState({ runsPerDay: String(caps0?.runsPerDay ?? ""), outboundPerDay: String(caps0?.outboundPerDay ?? ""), spendUsdPerMonth: String(caps0?.spendUsdPerMonth ?? "") });
  const [confirmStop, setConfirmStop] = useState(false);
  const cron = buildCron(form.mode, form.time, form.dow, form.every, form.custom);
  const capBody = capsPatch(caps0, caps);
  return (
    <div className={s.editBlock} data-agent-edit={a.id}>
      {a.trigger.type === "schedule" ? (
        <form className={s.inlineForm} onSubmit={(e) => { e.preventDefault(); if (busy || !cron) return; onSave({ schedule: { cron, tz: tz.trim() || "UTC" } }, (x) => `Saved. ${x.name} now runs ${(x.trigger.label ?? cron).replace(/^Every/, "every")}.`); }} aria-label={`When ${a.name} runs`}>
          <select className={s.select} aria-label="Repeat" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as CronMode })}>
            <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Once a week</option><option value="hours">Every N hours</option><option value="custom">Custom cron</option>
          </select>
          {form.mode === "weekly" ? <select className={s.select} aria-label="Day of the week" value={form.dow} onChange={(e) => setForm({ ...form, dow: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select> : null}
          {form.mode === "daily" || form.mode === "weekdays" || form.mode === "weekly" ? <input className={s.input} style={{ flex: "0 1 120px" }} type="time" aria-label="Time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /> : null}
          {form.mode === "hours" ? <input className={s.input} style={{ flex: "0 1 90px" }} type="number" min={1} max={23} aria-label="Every how many hours" value={form.every} onChange={(e) => setForm({ ...form, every: e.target.value })} /> : null}
          {form.mode === "custom" ? <input className={s.input} aria-label="Cron" value={form.custom} onChange={(e) => setForm({ ...form, custom: e.target.value })} placeholder="minute hour day month weekday" /> : null}
          <input className={s.input} style={{ flex: "1 1 150px" }} aria-label="Time zone" value={tz} onChange={(e) => setTz(e.target.value)} />
          <Button type="submit" size="sm" variant="primary" disabled={busy || !cron}>Save schedule</Button>
        </form>
      ) : <p className={s.meta}>{a.trigger.type === "event" ? `Runs when ${a.trigger.event ?? "something happens"}` : "Runs when you press Run now"}, so it has no schedule to change.</p>}
      {a.trigger.type === "schedule" ? <p className={s.meta}>Now: {a.trigger.label ?? a.trigger.cron}{fastest ? ` · fastest your plan allows: ${fastest}` : ""}. The time follows that zone&rsquo;s clock, including daylight saving.</p> : null}
      {a.scheduleError ? <p className={s.note} role="alert">Schedule problem: {a.scheduleError}</p> : null}
      {a.template === "monitor" ? (
        <form className={s.inlineForm} onSubmit={(e) => { e.preventDefault(); if (busy || !url.trim()) return; onSave({ monitor: { url: url.trim(), keyword: keyword.trim() } }, (x) => `Saved. ${x.name} watches ${x.monitor?.url ?? url}${x.monitor?.keyword ? ` for “${x.monitor.keyword}”` : ""}.`); }} aria-label="Page to watch">
          <input className={s.input} type="url" aria-label="Page to watch" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" />
          <input className={s.input} style={{ flex: "0 1 160px" }} aria-label="Word to look for (optional)" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Word (optional)" />
          <Button type="submit" size="sm" variant="primary" disabled={busy || !url.trim()}>Save page</Button>
        </form>
      ) : null}
      {caps0 ? (
        <form className={s.inlineForm} onSubmit={(e) => { e.preventDefault(); if (capBody && !busy) onSave({ caps: capBody }, (x) => `Saved. ${x.name}: up to ${x.caps?.runsPerDay} runs a day, ${x.caps?.outboundPerDay} sends a day, $${x.caps?.spendUsdPerMonth} a month.`); }} aria-label="Limits">
          <label className={s.field}><span>Runs a day</span><input className={s.input} type="number" min={0} max={CAP_MAX.runsPerDay} value={caps.runsPerDay} onChange={(e) => setCaps({ ...caps, runsPerDay: e.target.value })} /></label>
          <label className={s.field}><span>Sends a day</span><input className={s.input} type="number" min={0} max={CAP_MAX.outboundPerDay} value={caps.outboundPerDay} onChange={(e) => setCaps({ ...caps, outboundPerDay: e.target.value })} /></label>
          <label className={s.field}><span>Spend a month ($)</span><input className={s.input} type="number" min={0} max={CAP_MAX.spendUsdPerMonth} step="0.5" value={caps.spendUsdPerMonth} onChange={(e) => setCaps({ ...caps, spendUsdPerMonth: e.target.value })} /></label>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !capBody}>Save limits</Button>
        </form>
      ) : null}
      <p className={s.meta}>Auto-send is {a.autoSend ? "on (set in Business); scheduled runs still queue everything for your approval" : "off: everything this agent drafts waits for your approval"}.</p>
      {confirmStop
        ? <Confirm text={`Stop ${a.name} for good? It can't be restarted, and its waiting drafts are cancelled.`} yes="Stop for good" busy={busy} onYes={onStop} onNo={() => setConfirmStop(false)} />
        : <div className={s.actions}><Button size="sm" variant="ghost" className={s.quiet} onClick={() => setConfirmStop(true)} data-stop-agent="">Stop for good…</Button></div>}
    </div>
  );
}

/* ───────────── Projects ───────────── */

type ProjectEdit = { id: string; mode: "rename" | "merge" | "delete"; into?: string; chats?: "keep" | "delete"; name?: string };

function ProjectsCard(props: Props) {
  const { message: m, onPatch, onOpenTab, projects, threads, onCreateProject, onNewInProject, onRenameProject, onDeleteProject, onMergeProjects } = props;
  const w = m.workspace!;
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<ProjectEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const did = useRef(false);
  const chatsIn = (id: string) => threads.filter((t) => t.projectId === id).length;
  // Asked in words: create and rename happen at once; delete and merge wait for a confirm click below.
  const ask = w.act && !w.acted && (w.act.type === "delete-project" || w.act.type === "merge-projects") ? w.act : null;
  const askFrom = ask ? matchName(projects, ask.name) : null;
  const askInto = ask?.type === "merge-projects" ? matchName(projects, ask.into) : null;
  useEffect(() => {
    if (!w.act || w.acted || did.current) return;
    if (w.act.type === "create-project") {
      did.current = true;
      const r = onCreateProject(w.act.name);
      onPatch({ acted: r.ok ? { ok: true, text: `Made the project “${r.project.name}”.` } : { ok: false, text: r.error } });
    } else if (w.act.type === "rename-project") {
      did.current = true;
      const hit = matchName(projects, w.act.name);
      const to = w.act.to;
      void Promise.resolve()
        .then(() => ("id" in hit ? onRenameProject(hit.id, to) : { ok: false as const, text: hit.choices.length ? `No project matches “${w.act && "name" in w.act ? w.act.name : ""}”.` : "You have no projects yet." }))
        .then((r) => onPatch({ acted: r }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.act, w.acted]);
  const run = async (f: () => Promise<OpResult>, fromAsk: boolean) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setEdit(null);
    if (fromAsk) onPatch({ acted: r }); else setMsg(r.text);
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const r = onCreateProject(name);
    setMsg(r.ok ? `Made “${r.project.name}”.` : r.error);
    if (r.ok) setName("");
  };
  const mergeText = (from: string, into: string) => {
    const a = projects.find((p) => p.id === from)?.name ?? "";
    const b = projects.find((p) => p.id === into)?.name ?? "";
    const n = chatsIn(from);
    return `Merge “${a}” into “${b}”? ${n === 1 ? "Its chat" : `Its ${n} chats`} and saved notes move to “${b}”, then “${a}” is deleted. Uploaded files are not moved.`;
  };
  const deleteText = (id: string, chats: "keep" | "delete") => {
    const p = projects.find((x) => x.id === id);
    const n = chatsIn(id);
    return `Delete “${p?.name ?? ""}”? Its notes and files are deleted.${n ? (chats === "delete" ? ` Its ${n === 1 ? "chat is" : `${n} chats are`} deleted too.` : ` ${n === 1 ? "Its chat stays" : `Its ${n} chats stay`}, outside any project.`) : ""}`;
  };
  return (
    <Card kind="projects" title={TITLES.projects} chip={`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}>
      {w.acted ? <p className={s.result} role="status" data-ok={w.acted.ok || undefined}>{w.acted.text}</p> : null}
      {ask && askFrom && !("id" in askFrom) ? <p className={s.note}>{`No project matches “${ask.name}”.`}</p> : null}
      {ask?.type === "merge-projects" && askInto && !("id" in askInto) ? <p className={s.note}>{`No project matches “${ask.into}”.`}</p> : null}
      {ask?.type === "delete-project" && askFrom && "id" in askFrom ? (
        <Confirm text={deleteText(askFrom.id, "keep")} yes="Delete project" busy={busy} onYes={() => void run(() => onDeleteProject(askFrom.id, "keep"), true)} onNo={() => onPatch({ acted: { ok: false, text: "Left as it was." } })} />
      ) : null}
      {ask?.type === "merge-projects" && askFrom && "id" in askFrom && askInto && "id" in askInto ? (
        askFrom.id === askInto.id ? <p className={s.note}>Those are the same project.</p> :
        <Confirm text={mergeText(askFrom.id, askInto.id)} yes="Merge" busy={busy} onYes={() => void run(() => onMergeProjects(askFrom.id, askInto.id), true)} onNo={() => onPatch({ acted: { ok: false, text: "Left as it was." } })} />
      ) : null}
      {projects.length === 0 ? <p className={s.note}>No projects yet. A project keeps related chats, files, instructions and memory together.</p> : (
        <ul className={s.rows}>
          {projects.map((p) => {
            const n = chatsIn(p.id);
            const e = edit?.id === p.id ? edit : null;
            return (
              <li key={p.id} className={s.rowStack} data-project={p.id}>
                <div className={s.row}>
                  <span className={s.avatar} aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className={s.rowMain}><span className={s.rowTitle}>{p.name}</span><span className={s.rowMeta}>{n === 1 ? "1 chat" : `${n} chats`}</span></span>
                  <span className={s.rowActions}>
                    <Button size="sm" variant="secondary" onClick={() => onOpenTab({ view: "history", projectId: p.id })}>Chats</Button>
                    <Button size="sm" variant="secondary" onClick={() => onNewInProject(p.id)}>New chat</Button>
                    <Button size="sm" variant="secondary" aria-pressed={e?.mode === "rename"} onClick={() => setEdit(e?.mode === "rename" ? null : { id: p.id, mode: "rename", name: p.name })}>Rename</Button>
                    {projects.length > 1 ? <Button size="sm" variant="secondary" aria-pressed={e?.mode === "merge"} onClick={() => setEdit(e?.mode === "merge" ? null : { id: p.id, mode: "merge", into: projects.find((x) => x.id !== p.id)!.id })}>Merge</Button> : null}
                    <Button size="sm" variant="secondary" aria-pressed={e?.mode === "delete"} onClick={() => setEdit(e?.mode === "delete" ? null : { id: p.id, mode: "delete", chats: "keep" })}>Delete</Button>
                    <Button size="sm" variant="secondary" onClick={() => onOpenTab({ view: "projects", projectId: p.id })}>Open in Projects</Button>
                  </span>
                </div>
                {e?.mode === "rename" ? (
                  <form className={s.inlineForm} onSubmit={(ev) => { ev.preventDefault(); if (busy || !(e.name ?? "").trim()) return; void run(() => onRenameProject(p.id, e.name ?? ""), false); }}>
                    <label className="visually-hidden" htmlFor={`pr-${p.id}`}>New name for {p.name}</label>
                    <input id={`pr-${p.id}`} className={s.input} value={e.name ?? ""} maxLength={60} autoFocus onChange={(ev) => setEdit({ ...e, name: ev.target.value })} />
                    <Button type="submit" size="sm" variant="primary" disabled={busy || !(e.name ?? "").trim()}>Save name</Button>
                  </form>
                ) : null}
                {e?.mode === "merge" ? (
                  <div className={s.editBlock}>
                    <div className={s.inlineForm}>
                      <label className={s.meta} htmlFor={`pm-${p.id}`}>Merge into</label>
                      <select id={`pm-${p.id}`} className={s.select} value={e.into} onChange={(ev) => setEdit({ ...e, into: ev.target.value })}>
                        {projects.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </div>
                    <Confirm text={mergeText(p.id, e.into!)} yes="Merge" busy={busy} onYes={() => void run(() => onMergeProjects(p.id, e.into!), false)} onNo={() => setEdit(null)} />
                  </div>
                ) : null}
                {e?.mode === "delete" ? (
                  <div className={s.editBlock}>
                    {n ? (
                      <SegmentedControl
                        label="Its chats"
                        size="sm"
                        className={s.seg}
                        value={e.chats ?? "keep"}
                        onValueChange={(chats) => setEdit({ ...e, chats })}
                        options={[{ value: "keep", label: "Keep its chats" }, { value: "delete", label: "Delete its chats too" }]}
                      />
                    ) : null}
                    <Confirm text={deleteText(p.id, e.chats ?? "keep")} yes="Delete project" busy={busy} onYes={() => void run(() => onDeleteProject(p.id, e.chats ?? "keep"), false)} onNo={() => setEdit(null)} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <form className={s.inlineForm} onSubmit={(e) => { if (!name.trim()) { e.preventDefault(); return; } add(e); }}>
        <label className="visually-hidden" htmlFor={`pj-${m.id}`}>New project name</label>
        <input spellCheck={false} id={`pj-${m.id}`} className={s.input} placeholder="New project name" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setMsg(""); }} />
        <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()}>Create project</Button>
      </form>
      {msg ? <p className={s.meta} role="status">{msg}</p> : null}
      <Footer label="Open in Projects" onOpen={() => onOpenTab({ view: "projects" })} />
    </Card>
  );
}

/* ───────────── Deployments ───────────── */

type Site = { id: string; name: string; slug: string; headVersion: number; publishedVersion: number | null; publishedUrl: string | null; needsReview: boolean; takenDown: boolean; leadCount: number; updatedAt: string };

function DeploymentsCard({ onOpenTab, onSettled }: Props) {
  const { data, error, reload } = useLoad<{ sites: Site[] }>("/api/sites");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const setLive = async (x: Site, on: boolean) => {
    setBusy(x.id);
    setNote("");
    try {
      await api(`/api/sites/${x.id}/publish`, { method: on ? "POST" : "DELETE" });
      setNote(on ? `${x.name} is live.` : `${x.name} is offline.`);
      reload();
      onSettled();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };
  if (error) return <Card kind="deployments" title={TITLES.deployments}><Problem error={error} retry={reload} /></Card>;
  if (!data) return <Card kind="deployments" title={TITLES.deployments} busy><Skeleton /></Card>;
  const live = data.sites.filter((x) => x.publishedVersion !== null && !x.takenDown);
  return (
    <Card kind="deployments" title={TITLES.deployments} chip={`${live.length} live · ${data.sites.length} total`}>
      {data.sites.length === 0 ? <p className={s.note}>Nothing deployed yet. Build an app here (&ldquo;build me a site for…&rdquo;) and publish it.</p> : (
        <ul className={s.rows}>
          {data.sites.map((x) => {
            const isLive = x.publishedVersion !== null && !x.takenDown;
            const ahead = isLive && x.headVersion > (x.publishedVersion ?? 0);
            return (
              <li key={x.id} className={s.row}>
                <span className={s.dot} data-on={isLive || undefined} aria-hidden="true" />
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{x.name}</span>
                  <span className={s.rowMeta}>{x.takenDown ? "Taken down" : isLive ? `Live · v${x.publishedVersion}` : `Draft · v${x.headVersion}`}{ahead ? ` · unpublished changes (v${x.headVersion})` : ""}{x.needsReview ? " · needs review" : ""}{x.leadCount ? ` · ${x.leadCount} form ${x.leadCount === 1 ? "message" : "messages"}` : ""} · {relDay(x.updatedAt)}</span>
                </span>
                <span className={s.rowActions}>
                  {isLive && x.publishedUrl ? <a className={la.act} data-variant="secondary" data-size="sm" href={x.publishedUrl} target="_blank" rel="noreferrer noopener">{x.publishedUrl.replace(/^https?:\/\//, "")}</a> : null}
                  {x.takenDown ? null : ahead || !isLive ? <Button size="sm" variant="primary" disabled={busy === x.id || !x.headVersion} onClick={() => void setLive(x, true)}>{ahead ? "Publish changes" : "Publish"}</Button> : <Button size="sm" variant="secondary" disabled={busy === x.id} onClick={() => void setLive(x, false)}>Unpublish</Button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {note ? <p className={s.meta} role="status">{note}</p> : null}
      <Footer label="Open in Deployments" onOpen={() => onOpenTab({ view: "deployments" })} />
    </Card>
  );
}

/* ───────────── History ───────────── */

function HistoryCard({ message: m, onPatch, onOpenTab, threads, projects, activeThreadId, onOpenThread, onMoveThread, onRenameThread, onDeleteThread }: Props) {
  const w = m.workspace!;
  const [q, setQ] = useState(w.query ?? "");
  const [edit, setEdit] = useState<{ id: string; mode: "rename" | "delete"; title?: string } | null>(null);
  const [msg, setMsg] = useState("");
  const did = useRef(false);
  const act = w.act && (w.act.type === "rename-chat" || w.act.type === "delete-chat") ? w.act : null;
  // The request that made this card holds its own words ("delete my chat about sourdough"), so it never counts as a match.
  const skip = useMemo(() => {
    const own = threads.find((t) => t.messages.some((x) => x.id === m.id))?.messages ?? [];
    const i = own.findIndex((x) => x.id === m.id);
    const ask = own.slice(0, Math.max(i, 0)).reverse().find((x) => x.role === "user");
    return new Set([m.id, ...(ask ? [ask.id] : [])]);
  }, [threads, m.id]);
  const lookup = act?.type === "delete-chat" && !!act.query && q === act.query;
  const hits = useMemo(() => historyHits(threads, q, { skip, preferTitles: lookup }), [threads, q, skip, lookup]);
  // "rename this chat to X" happens at once (the chat you are in); "delete ..." waits for a confirm click.
  useEffect(() => {
    if (act?.type !== "rename-chat" || w.acted || did.current || !activeThreadId) return;
    did.current = true;
    const to = act.to.trim().slice(0, 120);
    void Promise.resolve().then(() => { onRenameThread(activeThreadId, to); onPatch({ acted: { ok: true, text: `Renamed this chat to “${to}”.` } }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, w.acted, activeThreadId]);
  const delTarget = act?.type === "delete-chat" && !w.acted ? (act.query ? (hits.length === 1 ? hits[0] : null) : threads.find((t) => t.id === activeThreadId) ?? null) : null;
  const title = (id: string) => threads.find((t) => t.id === id)?.title ?? "this chat";
  return (
    <Card kind="history" title={TITLES.history} chip={q ? `${hits.length} ${hits.length === 1 ? "match" : "matches"}` : `${threads.length} chats`}>
      {w.acted ? <p className={s.result} role="status" data-ok={w.acted.ok || undefined}>{w.acted.text}</p> : null}
      {delTarget ? (
        <Confirm text={`Delete “${delTarget.title}”${delTarget.id === activeThreadId ? " (the chat you are in)" : ""}? You can undo for a few seconds.`} yes="Delete chat" onYes={() => { const t = delTarget; onPatch({ acted: { ok: true, text: `Deleted “${t.title}”.` } }); onDeleteThread(t.id); }} onNo={() => onPatch({ acted: { ok: false, text: "Left as it was." } })} />
      ) : act?.type === "delete-chat" && act.query && !w.acted && hits.length > 1 ? <p className={s.note}>{hits.length} chats mention “{act.query}”. Pick the one to delete below.</p> : null}
      <div className={s.inlineForm}>
        <label className="visually-hidden" htmlFor={`hq-${m.id}`}>Filter chats</label>
        <input id={`hq-${m.id}`} className={s.input} type="search" placeholder="Filter chats" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {hits.length === 0 ? <p className={s.note}>{q ? `No chat mentions “${q}”.` : "No chats yet."}</p> : (
        <ul className={s.rows}>
          {hits.map((t) => {
            const e = edit?.id === t.id ? edit : null;
            return (
              <li key={t.id} className={s.rowStack} data-thread={t.id}>
                <div className={s.row}>
                  <button type="button" className={s.rowBtn} onClick={() => onOpenThread(t.id)} disabled={t.id === activeThreadId}>
                    <span className={s.rowTitle}>{t.title}</span>
                    <span className={s.rowMeta}>{t.id === activeThreadId ? "This chat" : relDay(new Date(t.updatedAt).toISOString())} · {t.remote ? "saved in your account" : `${t.messages.filter((x) => x.role === "user").length} questions`}{t.projectId ? ` · ${projects.find((p) => p.id === t.projectId)?.name ?? "project"}` : ""}</span>
                  </button>
                  {projects.length ? (
                    <>
                      <label className="visually-hidden" htmlFor={`hp-${t.id}`}>Project for {t.title}</label>
                      <select id={`hp-${t.id}`} className={s.select} value={t.projectId ?? ""} onChange={(ev) => onMoveThread(t.id, ev.target.value || null)}>
                        <option value="">No project</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </>
                  ) : null}
                  <span className={s.rowActions}>
                    <Button size="sm" variant="secondary" aria-pressed={e?.mode === "rename"} onClick={() => setEdit(e?.mode === "rename" ? null : { id: t.id, mode: "rename", title: t.title })}>Rename</Button>
                    <Button size="sm" variant="secondary" aria-pressed={e?.mode === "delete"} onClick={() => setEdit(e?.mode === "delete" ? null : { id: t.id, mode: "delete" })}>Delete</Button>
                  </span>
                </div>
                {e?.mode === "rename" ? (
                  <form className={s.inlineForm} onSubmit={(ev) => { ev.preventDefault(); const v = (e.title ?? "").trim().slice(0, 120); if (!v) return; onRenameThread(t.id, v); setMsg(`Renamed to “${v}”.`); setEdit(null); }}>
                    <label className="visually-hidden" htmlFor={`hr-${t.id}`}>New title for {t.title}</label>
                    <input id={`hr-${t.id}`} className={s.input} value={e.title ?? ""} maxLength={120} autoFocus onChange={(ev) => setEdit({ ...e, title: ev.target.value })} />
                    <Button type="submit" size="sm" variant="primary" disabled={!(e.title ?? "").trim()}>Save title</Button>
                  </form>
                ) : null}
                {e?.mode === "delete" ? <Confirm text={`Delete “${title(t.id)}”? You can undo for a few seconds.`} yes="Delete chat" onYes={() => { setMsg(`Deleted “${t.title}”.`); setEdit(null); onDeleteThread(t.id); }} onNo={() => setEdit(null)} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {msg ? <p className={s.meta} role="status">{msg}</p> : null}
      <Footer label="Open in All chats" onOpen={() => onOpenTab({ view: "history", query: q })} />
    </Card>
  );
}

/* ───────────── Choice ───────────── */

function ChooseCard({ message: m, user, isLast, onPatch, onAct }: Props) {
  const w = m.workspace!;
  return (
    <Card kind="choose" title={w.topic ? `“${w.topic}”: what would you like?` : TITLES.choose}>
      <div className={s.choices}>
        {(w.choices ?? []).map((c, i) => (
          <button key={c.label} type="button" className={s.choice} aria-pressed={w.picked === i} disabled={w.picked !== undefined || !isLast} onClick={() => { onPatch({ picked: i }); onAct(user?.text ?? w.topic ?? "", c.intent); }}>
            <span className={s.choiceName}>{c.label}</span>
            <span className={s.rowMeta}>{c.hint}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
