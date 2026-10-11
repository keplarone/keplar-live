"use client";
/**
 * Business OS: dashboard, orders + payments, CRM, inbox, agents,
 * approvals, connectors, audit log. Talks to /api/business/*.
 */
import Link from "next/link";
import { ApprovalFlow } from "./ApprovalFlow";
import { SignInGate } from "@/components/app-ui/SignInGate";
import { McpConnections } from "./McpConnections";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/create/api";
import s from "./business.module.css";
import { usePresence } from "@/components/motion/usePresence";
import { UnverifiedNote } from "./UnverifiedNote";
import { UNVERIFIED_LABEL, isLiveVerified } from "@/lib/business/verification";

type Tab = "overview" | "orders" | "crm" | "inbox" | "agents" | "approvals" | "connectors" | "apps" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "crm", label: "CRM" },
  { id: "inbox", label: "Inbox" },
  { id: "agents", label: "Agents" },
  { id: "approvals", label: "Approvals" },
  { id: "connectors", label: "Connectors" },
  { id: "apps", label: "Connected apps" },
  { id: "audit", label: "Audit log" },
];

/** Minimal pass: four sections stay visible; Agents, Approvals, Connectors, Connected apps and Audit log open from More. */
const MAIN_TABS: Tab[] = ["overview", "orders", "crm", "inbox"];

/**
 * Inside the Keplar Business workspace the sidebar already picks the section (Agents, Approvals, Operations, Integrations),
 * so this component shows a page like the workspace's own (Dashboard, Reason): the section's title, one line about it, and
 * underline tabs for that section's pages only. Keplar One keeps the tab rail above.
 */
const SECTIONS: { id: string; title: string; lead: string; tabs: Tab[] }[] = [
  { id: "operations", title: "Operations", lead: "Revenue, orders, customers and messages from your sites, with a log of every change.", tabs: ["overview", "orders", "crm", "inbox", "audit"] },
  { id: "agents", title: "Agents", lead: "Agents that work inside spend caps and ask before they send anything.", tabs: ["agents"] },
  { id: "approvals", title: "Approvals", lead: "Everything an agent wants to send or change waits here for your decision.", tabs: ["approvals"] },
  { id: "integrations", title: "Integrations", lead: "The services and apps your agents and reports can read from and act in.", tabs: ["connectors", "apps"] },
];
const sectionOf = (t: Tab) => SECTIONS.find((x) => x.tabs.includes(t)) ?? SECTIONS[0]!;

function EmbeddedHead({ tab, onTab, pending, usage }: { tab: Tab; onTab: (t: Tab) => void; pending: number; usage: React.ReactNode }) {
  const sec = sectionOf(tab);
  return (
    <>
      <header className={s.eHead}>
        <div>
          <h1 className={s.eTitle}>{sec.title}</h1>
          <p className={s.eLead}>{sec.lead}</p>
        </div>
        {usage}
      </header>
      {sec.tabs.length > 1 ? (
        <div className={s.eTabs} role="tablist" aria-label={`${sec.title} pages`}>
          {sec.tabs.map((id) => (
            <button key={id} type="button" role="tab" data-tab={id} aria-selected={tab === id} className={s.eTab} onClick={() => onTab(id)}>
              {TABS.find((t) => t.id === id)!.label}
              {id === "approvals" && pending > 0 ? <span className={s.badge} aria-label={`${pending} pending`}>{pending}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** The less-used Business sections in one small menu (the open one shows as a tab). */
function MoreSections({ tabs, pending, onPick }: { tabs: { id: Tab; label: string }[]; pending: number; onPick: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pop = usePresence(open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLElement>("button")?.focus(); } };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!tabs.length) return null;
  const showPending = pending > 0 && tabs.some((t) => t.id === "approvals");
  return (
    <div className={s.more} ref={ref}>
      <button type="button" className={s.tab} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-business-more="">
        More
        {showPending ? <span className={s.badge} aria-label={`${pending} pending approvals`}>{pending}</span> : null}
        <svg width="10" height="10" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {pop.mounted ? (
        <div className={s.moreMenu} role="menu" aria-label="More sections" {...pop.motion("pop")}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="menuitem" data-tab={t.id} className={s.moreItem} onClick={() => { onPick(t.id); setOpen(false); }}>
              {t.label}
              {t.id === "approvals" && pending > 0 ? <span className={s.badge} aria-label={`${pending} pending`}>{pending}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Order = { id: string; productName: string; amount: number; currency: string; status: string; customerEmail: string | null; createdAt: string; applicationFeeAmount: number; refundedAmount?: number; disputedAt?: string | null };
type Run = { id: string; agentId: string; agentName?: string; trigger: string; status: string; units: number; startedAt: string; steps: { at: string; text: string }[]; error?: string };
type Dash = {
  plan: string;
  entitlements: { commerce: boolean; agents: number; label: string };
  configured: { payments: boolean };
  mode?: "test" | "live";
  paymentsPaused?: boolean;
  payments: { mode?: string; status: string; chargesEnabled: boolean; payoutsEnabled?: boolean; accountId: string; requirementsDue?: string[] } | null;
  revenue: { last30: number; total: number; currency: string; fees?: number; refunded?: number };
  orders: { last30: number; pending: number; recent: Order[] };
  leads: { last30: number; total: number };
  traffic: { last14: number; days: { day: string; views: number }[] };
  conversion: { windowDays: number; orders: number; views: number; rate: number | null };
  agents: { active: number; total: number; halted: boolean; recentRuns: Run[] };
  approvals: { pending: number };
  compute: { used: number; total: number | null };
};

const money = (a: number, c = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: c.toUpperCase() }).format(a / 100);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const SIGN_IN_ERROR = "Sign in to use Business.";
const errMsg = (e: unknown) => ((e as { status?: number })?.status === 401 ? SIGN_IN_ERROR : e instanceof Error ? e.message : "Something went wrong.");

function Pill({ tone, children }: { tone?: "on" | "warn" | "attn"; children: React.ReactNode }) {
  return <span className={`${s.pill} ${tone === "on" ? s.on : tone === "warn" ? s.warn : tone === "attn" ? s.attn : ""}`}>{children}</span>;
}

export function BusinessOS({ initialTab = "overview", embedded = false }: { initialTab?: Tab; embedded?: boolean }) {
  const [tab, setTab] = useState<Tab>(() => (peekConnectorBack() ? "connectors" : initialTab));
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let on = true;
    api<Dash>("/api/business/dashboard")
      .then((d) => on && setDash(d))
      .catch((e) => on && setError(errMsg(e)));
    return () => {
      on = false;
    };
  }, [tick]);

  const pending = dash?.approvals.pending ?? 0;
  const usage = dash ? (
    <span className={s.meter} title="Usage this billing period (shared across Keplar)">
      <span className={s.label}>{dash.entitlements.label}</span>
      {dash.compute.total ? (
        <span className={s.label}>
          {dash.compute.used.toLocaleString()} / {dash.compute.total.toLocaleString()}
        </span>
      ) : null}
    </span>
  ) : null;
  return (
    <div className={s.shell} data-embedded={embedded || undefined}>
      {embedded ? null : <div className={s.bar}>
        <span className={s.title}>Business</span>
        <div className={s.tabs} role="tablist" aria-label="Business sections">
          {TABS.filter((t) => MAIN_TABS.includes(t.id) || t.id === tab).map((t) => (
            <button key={t.id} role="tab" data-tab={t.id} aria-selected={tab === t.id} className={s.tab} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "approvals" && pending > 0 ? <span className={s.badge} aria-label={`${pending} pending`}>{pending}</span> : null}
            </button>
          ))}
        </div>
        <MoreSections tabs={TABS.filter((t) => !MAIN_TABS.includes(t.id) && t.id !== tab)} pending={pending} onPick={setTab} />
        <span className={s.spacer} />
        {usage}
      </div>}
      <div className={s.body} role="tabpanel">
        {embedded && error !== SIGN_IN_ERROR ? <EmbeddedHead tab={tab} onTab={setTab} pending={pending} usage={usage} /> : null}
        {error === SIGN_IN_ERROR ? (
          <SignInGate
            title="Sign in to use Business"
            body="Business is optional. It gives you orders, a CRM, an inbox and agents that work inside spend caps and approval gates, all tied to your account. Sign in to set it up."
            next="/app"
            tone="attention"
          />
        ) : error ? <div className={`${s.notice} ${s.error}`} role="alert">{error}</div> : null}
        {error === SIGN_IN_ERROR ? null : (
          <>
          {tab === "overview" ? <Overview dash={dash} go={setTab} /> : null}
          {tab === "orders" ? <Orders dash={dash} onChange={reload} /> : null}
          {tab === "crm" ? <Crm /> : null}
          {tab === "inbox" ? <Inbox /> : null}
          {tab === "agents" ? <Agents onChange={reload} /> : null}
          {tab === "approvals" ? <Approvals onChange={reload} /> : null}
          {tab === "connectors" ? <Connectors go={setTab} /> : null}
          {tab === "apps" ? <McpConnections go={(t) => setTab(t)} onChange={reload} /> : null}
          {tab === "audit" ? <Audit /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Overview({ dash, go }: { dash: Dash | null; go: (t: Tab) => void }) {
  if (!dash) return <p className={s.muted}>Loading…</p>;
  const max = Math.max(1, ...dash.traffic.days.map((d) => d.views));
  return (
    <>
      {dash.approvals.pending > 0 ? (
        <div className={s.notice}>
          <span className={s.grow}>
            {dash.approvals.pending} agent action{dash.approvals.pending === 1 ? "" : "s"} waiting for your approval.
          </span>
          <button className={s.btn} onClick={() => go("approvals")}>Review</button>
        </div>
      ) : null}
      <div className={s.grid}>
        <div className={s.card}>
          <span className={s.label}>Revenue · 30 days</span>
          <span className={s.stat}>{money(dash.revenue.last30, dash.revenue.currency)}</span>
        </div>
        <div className={s.card}>
          <span className={s.label}>Orders · 30 days</span>
          <span className={s.stat}>{dash.orders.last30}</span>
        </div>
        <div className={s.card}>
          <span className={s.label}>New leads · 30 days</span>
          <span className={s.stat}>{dash.leads.last30}</span>
        </div>
        <div className={s.card}>
          <span className={s.label}>Site views · 14 days</span>
          <span className={s.stat}>{dash.traffic.last14}</span>
        </div>
        <div className={s.card}>
          <span className={s.label}>Conversion · 14 days</span>
          <span className={s.stat}>{dash.conversion.rate === null ? "—" : `${(dash.conversion.rate * 100).toFixed(1)}%`}</span>
          <span className={s.muted}>{dash.conversion.rate === null ? "No site views yet, so there is nothing to divide by." : `${dash.conversion.orders} paid order${dash.conversion.orders === 1 ? "" : "s"} from ${dash.conversion.views} view${dash.conversion.views === 1 ? "" : "s"}`}</span>
        </div>
        <div className={s.card}>
          <span className={s.label}>Pending approvals</span>
          <span className={s.stat}>{dash.approvals.pending}</span>
        </div>
      </div>
      <div className={s.two}>
        <div className={s.card}>
          <span className={s.label}>Traffic · last 14 days</span>
          <div className={s.bars} role="img" aria-label={`Site views per day, ${dash.traffic.last14} total`}>
            {dash.traffic.days.map((d) => (
              <div key={d.day} className={s.barCol} title={`${d.day}: ${d.views}`}>
                <span style={{ height: `${(d.views / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <span className={s.muted}>Counted on published sites. No cookies.</span>
        </div>
        <div className={s.card}>
          <div className={s.row}>
            <span className={s.label}>Agent activity</span>
            <span className={s.spacer} />
            {dash.agents.halted ? <Pill tone="warn">All halted</Pill> : <Pill tone="on">{dash.agents.active} active</Pill>}
          </div>
          <div className={s.list}>
            {dash.agents.recentRuns.length === 0 ? <span className={s.muted}>No runs yet. Open Agents to run one.</span> : null}
            {dash.agents.recentRuns.map((r) => (
              <div key={r.id} className={s.item}>
                <span className={s.grow}>
                  {r.agentName} <span className={s.muted}>· {r.trigger}</span>
                </span>
                <RunPill status={r.status} />
                <span className={s.mono}>{r.units} u</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={s.card}>
        <div className={s.row}>
          <span className={s.label}>Recent orders</span>
          <span className={s.spacer} />
          <span className={s.muted}>
            Usage: {dash.compute.used.toLocaleString()}
            {dash.compute.total ? ` / ${dash.compute.total.toLocaleString()}` : ""} units
          </span>
        </div>
        <OrderTable orders={dash.orders.recent} />
      </div>
    </>
  );
}

function RunPill({ status }: { status: string }) {
  const tone = status === "succeeded" ? "on" : status === "failed" || status === "stopped" ? "warn" : /approval|pending|waiting/.test(status) ? "attn" : undefined;
  return <Pill tone={tone}>{status.replace("_", " ")}</Pill>;
}

function OrderTable({ orders }: { orders: Order[] }) {
  if (!orders.length) return <p className={s.muted}>No orders yet. Shops built in Create send orders here.</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr><th>Product</th><th>Amount</th><th>Customer</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.productName}</td>
              <td className={s.mono}>{money(o.amount, o.currency)}</td>
              <td>{o.customerEmail ?? <span className={s.muted}>—</span>}</td>
              <td>
                <Pill tone={o.status === "paid" ? "on" : o.status === "cancelled" ? "warn" : undefined}>{o.status}</Pill>
                {o.refundedAmount && o.status !== "refunded" ? <> <Pill tone="attn">{money(o.refundedAmount, o.currency)} refunded</Pill></> : null}
                {o.disputedAt ? <> <Pill tone="warn">disputed</Pill></> : null}
              </td>
              <td className={s.muted}>{when(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PayInfo = {
  configured: boolean;
  mode: "test" | "live";
  paused: boolean;
  platformFeeBps: number;
  limits: { minOrder: number; maxOrder: number };
  payoutsError: string | null;
  payouts: { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[]; recent: { id: string; amount: number; currency: string; status: string; arrivalDate: string }[] } | null;
  admin?: { problem: string | null; secretEnv: string; webhook: { url: string; events: string[]; thinEvents: string[] } };
};

function Orders({ dash, onChange }: { dash: Dash | null; onChange: () => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    api<{ orders: Order[] }>("/api/business/orders").then((d) => on && setOrders(d.orders)).catch((e) => on && setErr(errMsg(e)));
    api<PayInfo>("/api/business/payments?details=1").then((d) => on && setInfo(d)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, [dash]);
  // Back from Stripe's hosted onboarding (?stripe_connect=return): pull the account's status once.
  const pStatus = dash?.payments?.status;
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !dash?.configured.payments || !dash.payments || pStatus === "active") return;
    synced.current = true;
    api("/api/business/payments/refresh", { method: "POST", body: "{}" }).then(onChange).catch(() => undefined);
  }, [dash, pStatus, onChange]);
  async function onboard(create: boolean) {
    setBusy(true);
    setErr(null);
    try {
      if (create) await api("/api/business/payments", { method: "POST", body: JSON.stringify({}) });
      const d = await api<{ url: string }>("/api/business/payments/onboarding", { method: "POST", body: "{}" });
      window.location.assign(d.url);
    } catch (e) {
      setErr(errMsg(e));
      onChange();
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/business/payments/refresh", { method: "POST", body: "{}" });
      onChange();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const p = dash?.payments;
  const live = (info?.mode ?? dash?.mode) === "live";
  const feePct = info && info.platformFeeBps > 0 ? `${(info.platformFeeBps / 100).toFixed(2).replace(/\.?0+$/, "")}%` : null;
  return (
    <>
      <div className={s.card} id="payments">
        <div className={s.row}>
          <span className={s.label}>Payments</span>
          <span className={s.spacer} />
          {dash?.configured.payments ? <Pill tone={live ? "on" : "warn"}>{live ? "Live" : "Test mode"}</Pill> : null}
          {dash?.paymentsPaused ? <Pill tone="warn">Paused</Pill> : null}
          {p ? <Pill tone={p.chargesEnabled ? "on" : "attn"}>{p.chargesEnabled ? "Accepting payments" : p.status === "restricted" ? "Needs attention" : live ? "Live onboarding needed" : "Onboarding"}</Pill> : <Pill>Not set up</Pill>}
        </div>
        {!dash?.entitlements.commerce ? (
          <p>Selling on your site is available on Plus and up.</p>
        ) : !dash.configured.payments ? (
          <p className={s.muted}>
            Not configured: seller payments aren&apos;t set up yet. They open soon.
          </p>
        ) : !p ? (
          <div className={s.row}>
            <p className={s.grow}>Connect a Stripe account to take payments on your sites. Payouts go straight to you; Stripe handles card fees and disputes.{feePct ? ` Keplar adds a ${feePct} platform fee per sale.` : ""}</p>
            <button className={s.btn} disabled={busy} onClick={() => onboard(true)}>Set up payments</button>
          </div>
        ) : !p.chargesEnabled ? (
          <div className={s.row}>
            <p className={s.grow}>
              {p.status === "restricted" ? "Stripe needs more information before you can take payments." : "Finish verification with Stripe to take payments."}
              {p.requirementsDue?.length ? ` Still needed: ${p.requirementsDue.slice(0, 4).join(", ")}.` : ""}
            </p>
            <button className={s.btn} disabled={busy} onClick={() => onboard(false)}>Continue with Stripe</button>
            <button className={s.btn} disabled={busy} onClick={() => refresh()}>Check status</button>
          </div>
        ) : (
          <>
            <p className={s.muted}>
              <span className={s.mono}>{p.accountId}</span> · {live ? "Live" : "Test mode"} · Payouts {p.payoutsEnabled ? "on" : "not enabled yet"}
              {feePct ? ` · ${feePct} platform fee` : ""}
            </p>
            {info?.payouts ? (
              <p className={s.muted}>
                Available {info.payouts.available.map((m) => money(m.amount, m.currency)).join(", ") || money(0)} · Pending {info.payouts.pending.map((m) => money(m.amount, m.currency)).join(", ") || money(0)}
                {info.payouts.recent[0] ? ` · Last payout ${money(info.payouts.recent[0].amount, info.payouts.recent[0].currency)} (${info.payouts.recent[0].status})` : ""}
              </p>
            ) : info?.payoutsError ? (
              <p className={s.muted}>{info.payoutsError}</p>
            ) : null}
            {live && !p.payoutsEnabled ? <p className={s.muted}>Payouts to your bank are not enabled yet. Open &ldquo;Update details&rdquo; and finish Stripe&apos;s verification.</p> : null}
            <div className={s.row}>
              <button className={s.btn} disabled={busy} onClick={() => onboard(false)}>Update details</button>
            </div>
          </>
        )}
        {dash?.configured.payments && dash.entitlements.commerce ? (
          <p className={s.muted}>
            You are the seller. Your Stripe account is the merchant of record: you set your prices, collect and pay any sales tax or VAT, handle refunds, disputes and chargebacks, and follow the laws that apply to what you sell. Keplar is not the merchant of record and does not give tax or legal advice.
            {info ? ` Orders from ${money(info.limits.minOrder)} to ${money(info.limits.maxOrder)}.` : ""} See the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </p>
        ) : null}
        {dash?.paymentsPaused ? <p className={s.error} role="status">Payments are paused by Keplar for now. New checkouts are off; existing orders and refunds are unaffected.</p> : null}
        {info?.admin?.problem ? <p className={s.error} role="status">Admin: {info.admin.problem}</p> : null}
        {info?.admin ? <p className={s.muted}>Admin: webhook secret env {info.admin.secretEnv}; endpoint <span className={s.mono}>{info.admin.webhook.url}</span></p> : null}
        {err ? <p className={s.error} role="alert">{err}</p> : null}
      </div>
      <div className={s.card}>
        <span className={s.label}>Orders</span>
        {orders ? <OrderTable orders={orders} /> : <p className={s.muted}>Loading…</p>}
      </div>
    </>
  );
}

type Contact = { id: string; name: string; email: string; source: string; lastActivityAt: string };
type Deal = { id: string; contactId: string; title: string; value: number; currency: string; stage: string };
type Activity = { id: string; kind: string; text: string; at: string; contactId: string | null };
const STAGES = ["new", "qualified", "proposal", "won", "lost"];

function Crm() {
  const [data, setData] = useState<{ contacts: Contact[]; deals: Deal[]; activities: Activity[] } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    api<{ contacts: Contact[]; deals: Deal[]; activities: Activity[] }>("/api/business/crm").then((d) => on && setData(d)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, [tick]);
  async function move(id: string, stage: string) {
    await api(`/api/business/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
    setTick((t) => t + 1);
  }
  if (!data) return <p className={s.muted}>Loading…</p>;
  const name = (cid: string) => data.contacts.find((c) => c.id === cid)?.name ?? "Contact";
  return (
    <>
      <div className={s.card}>
        <span className={s.label}>Pipeline</span>
        <div className={s.kanban}>
          {STAGES.map((st) => (
            <div key={st} className={s.col}>
              <span className={s.label}>{st} · {data.deals.filter((d) => d.stage === st).length}</span>
              {data.deals.filter((d) => d.stage === st).map((d) => (
                <div key={d.id} className={s.deal}>
                  <span>{d.title}</span>
                  <span className={s.muted}>{name(d.contactId)}{d.value ? ` · ${money(d.value, d.currency)}` : ""}</span>
                  <label className="visually-hidden" htmlFor={`stage-${d.id}`}>Stage</label>
                  <select id={`stage-${d.id}`} className={s.select} value={d.stage} onChange={(e) => move(d.id, e.target.value)}>
                    {STAGES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={s.two}>
        <div className={s.card}>
          <span className={s.label}>Contacts · {data.contacts.length}</span>
          {data.contacts.length === 0 ? <p className={s.muted}>Contact forms on your sites add people here.</p> : null}
          <div className={s.list}>
            {data.contacts.map((c) => (
              <div key={c.id} className={s.item}>
                <span className={s.grow}>{c.name}<br /><span className={s.muted}>{c.email}</span></span>
                <Pill>{c.source}</Pill>
              </div>
            ))}
          </div>
        </div>
        <div className={s.card}>
          <span className={s.label}>Activity</span>
          <div className={s.list}>
            {data.activities.slice(0, 20).map((a) => (
              <div key={a.id} className={s.item}>
                <span className={s.grow}>{a.text}</span>
                <span className={s.muted}>{when(a.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

type Msg = { id: string; channel: string; direction: string; from: string; to: string; subject: string; body: string; at: string; mock: boolean };
function Inbox() {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    api<{ messages: Msg[] }>("/api/business/inbox").then((d) => on && setMsgs(d.messages)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, []);
  if (!msgs) return <p className={s.muted}>Loading…</p>;
  return (
    <div className={s.card}>
      <span className={s.label}>Inbox · forms, orders, and sent email</span>
      {msgs.length === 0 ? <p className={s.muted}>Nothing yet.</p> : null}
      <div className={s.list}>
        {msgs.map((m) => (
          <div key={m.id} className={s.item}>
            <Pill tone={m.direction === "in" ? "on" : undefined}>{m.direction === "in" ? m.channel : "sent"}</Pill>
            <div className={s.grow}>
              <button className={s.tab} style={{ padding: 0, height: "auto", textAlign: "left" }} aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                <strong style={{ fontWeight: 500 }}>{m.subject}</strong>
              </button>
              <div className={s.muted}>{m.direction === "in" ? m.from : `to ${m.to}`}</div>
              {open === m.id ? <pre className={s.pre}>{m.body}</pre> : null}
            </div>
            <span className={s.muted}>{when(m.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Agent = { id: string; name: string; template: string; trigger: { type: string; event?: string; label?: string }; autoSend: boolean; status: string; caps: { monthlyUnits: number; runsPerDay: number; outboundPerDay: number; spendUsdPerMonth: number }; lastRunAt: string | null; unitsThisMonth: number };
type AgentsData = { settings: { agentsHalted: boolean }; templates: Record<string, { name: string; description: string; outbound: string }>; offered?: string[]; runEstimateUnits: number; autoSendAllowed: boolean; limit: number; agents: Agent[]; runs: Run[] };

function Agents({ onChange }: { onChange: () => void }) {
  const [d, setD] = useState<AgentsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    api<AgentsData>("/api/business/agents").then((x) => on && setD(x)).catch((e) => on && setErr(errMsg(e)));
    return () => {
      on = false;
    };
  }, [tick]);
  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
      setTick((t) => t + 1);
      onChange();
    }
  }
  if (!d) return err ? <p className={s.error}>{err}</p> : <p className={s.muted}>Loading…</p>;
  const live = d.agents.filter((a) => a.status !== "killed");
  const used = new Set(live.map((a) => a.template));
  return (
    <>
      <div className={`${s.notice} ${d.settings.agentsHalted ? s.error : ""}`}>
        <span className={s.grow}>
          {d.settings.agentsHalted ? "All agents are halted. Nothing runs or sends until you resume." : "Agents ask before sending anything unless you turn on auto-send for that agent."}
        </span>
        <button className={`${s.btn} ${d.settings.agentsHalted ? "" : s.danger}`} disabled={busy !== null} onClick={() => act("halt", () => api("/api/business/agents/halt", { method: "POST", body: JSON.stringify({ halted: !d.settings.agentsHalted }) }))}>
          {d.settings.agentsHalted ? "Resume agents" : "Stop all agents"}
        </button>
      </div>
      {err ? <div className={`${s.notice} ${s.error}`} role="alert">{err}</div> : null}
      {d.limit === 0 ? <div className={s.notice}>Agents are available on Plus and up.</div> : null}
      <div className={s.two}>
        {live.map((a) => (
          <div key={a.id} className={s.card}>
            <div className={s.row}>
              <strong style={{ fontWeight: 500 }} className={s.grow}>{a.name}</strong>
              <Pill tone={a.status === "active" ? "on" : "warn"}>{a.status}</Pill>
            </div>
            <span className={s.muted}>{d.templates[a.template]?.description}</span>
            <div className={s.row}>
              <span className={s.label}>{a.trigger.type === "event" ? `On ${a.trigger.event}` : a.trigger.label}</span>
              <span className={s.label}>→ {d.templates[a.template]?.outbound}</span>
            </div>
            <div className={s.row}>
              <span className={s.mono}>{a.unitsThisMonth} / {a.caps.monthlyUnits} units</span>
              <span className={s.mono}>{a.caps.runsPerDay} runs/day</span>
              <span className={s.mono}>{a.caps.outboundPerDay} sends/day</span>
            </div>
            <label className={s.switch}>
              <input type="checkbox" checked={a.autoSend} disabled={!d.autoSendAllowed || busy !== null} onChange={(e) => act(a.id + "auto", () => api(`/api/business/agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ autoSend: e.target.checked }) }))} />
              Auto-send without asking
            </label>
            <div className={s.row}>
              <button className={s.btn} disabled={busy !== null || a.status !== "active" || d.settings.agentsHalted} onClick={() => act(a.id + "run", () => api(`/api/business/agents/${a.id}`, { method: "POST" }))}>
                {busy === a.id + "run" ? "Running…" : "Run now"}
              </button>
              <span className={s.muted}>~{d.runEstimateUnits} units</span>
              <span className={s.spacer} />
              <button className={`${s.btn} ${s.ghost}`} disabled={busy !== null} onClick={() => act(a.id + "pause", () => api(`/api/business/agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: a.status === "active" ? "paused" : "active" }) }))}>
                {a.status === "active" ? "Pause" : "Resume"}
              </button>
              <button className={`${s.btn} ${s.danger}`} disabled={busy !== null} onClick={() => act(a.id + "kill", () => api(`/api/business/agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "killed" }) }))}>
                Kill
              </button>
            </div>
          </div>
        ))}
      </div>
      {d.limit > 0 ? (
        <div className={s.card}>
          <span className={s.label}>Add an agent · {live.length} of {d.limit}</span>
          <div className={s.list}>
            {Object.entries(d.templates).filter(([id]) => id !== "mcp-task" && (!d.offered || d.offered.includes(id))).map(([id, t]) => ( // connected-app tasks are created from Connected apps, where the tool and arguments are chosen
              <div key={id} className={s.item}>
                <span className={s.grow}>{t.name}<br /><span className={s.muted}>{t.description}</span></span>
                <button className={`${s.btn} ${s.ghost}`} disabled={busy !== null || live.length >= d.limit} onClick={() => act("new" + id, () => api("/api/business/agents", { method: "POST", body: JSON.stringify({ template: id }) }))}>
                  {used.has(id) ? "Add another" : "Add"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className={s.card}>
        <span className={s.label}>Recent runs</span>
        {d.runs.length === 0 ? <p className={s.muted}>No runs yet.</p> : null}
        <div className={s.list}>
          {d.runs.slice(0, 10).map((r) => (
            <details key={r.id} className={s.item} style={{ display: "block" }}>
              <summary className={s.row} style={{ cursor: "pointer" }}>
                <span className={s.grow}>{d.agents.find((a) => a.id === r.agentId)?.name ?? "Agent"} <span className={s.muted}>· {r.trigger} · {when(r.startedAt)}</span></span>
                <RunPill status={r.status} />
                <span className={s.mono}>{r.units} u</span>
              </summary>
              <ol className={s.muted} style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {r.steps.map((st, i) => <li key={i}>{st.text}</li>)}
              </ol>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}

type Approval = { id: string; agentName: string; status: string; createdAt: string; result?: string; risk?: "low" | "medium" | "high"; riskReasons?: string[]; runUsd?: number; action: { type: string; serverName?: string; tool?: string; args?: unknown; to?: string; subject?: string; body?: string; channel?: string; text?: string; network?: string; at?: string; sheet?: string; row?: unknown[] } };

function Approvals({ onChange }: { onChange: () => void }) {
  const [list, setList] = useState<Approval[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    api<{ approvals: Approval[] }>("/api/business/approvals").then((d) => on && setList(d.approvals)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, [tick]);
  async function decide(a: Approval, decision: "approve" | "reject") {
    setErr(null);
    const e = edits[a.id];
    try {
      await api(`/api/business/approvals/${a.id}`, { method: "POST", body: JSON.stringify({ decision, edits: e === undefined ? undefined : a.action.type === "email.send" ? { body: e } : { text: e } }) });
    } catch (x) {
      setErr(errMsg(x));
    }
    setTick((t) => t + 1);
    onChange();
  }
  if (!list) return <p className={s.muted}>Loading…</p>;
  const pending = list.filter((a) => a.status === "pending");
  const done = list.filter((a) => a.status !== "pending");
  const label = (a: Approval) =>
    a.action.type === "email.send" ? `Email to ${a.action.to}: ${a.action.subject}` : a.action.type === "slack.post" ? `Slack message to ${a.action.channel}` : a.action.type === "social.schedule" ? `${a.action.network} post` : a.action.type === "mcp.call" ? `Call ${a.action.tool} on ${a.action.serverName}` : `Add row to ${a.action.sheet}`;
  return (
    <>
      {err ? <div className={`${s.notice} ${s.error}`} role="alert">{err}</div> : null}
      <div className={s.card}>
        <span className={s.label}>Awaiting you · {pending.length}</span>
        {pending.length === 0 ? <p className={s.muted}>Nothing to approve.</p> : null}
        {pending.map((a) => {
          const editable = a.action.type === "email.send" ? a.action.body : a.action.type === "slack.post" || a.action.type === "social.schedule" ? a.action.text : undefined;
          return (
            <div key={a.id} className={s.card}>
              <div className={s.row}>
                <span className={s.grow}>{label(a)}</span>
                <span className={s.muted}>{a.agentName} · {when(a.createdAt)}</span>
              </div>
              <ApprovalFlow approval={a} />
              {a.risk ? (
                <p className={s.muted} data-risk={a.risk}>
                  <b>{a.risk === "high" ? "High risk" : a.risk === "medium" ? "Medium risk" : "Low risk"}</b>
                  {a.riskReasons?.length ? `: ${a.riskReasons.join("; ")}.` : "."}
                  {typeof a.runUsd === "number" && a.runUsd > 0 ? ` Run cost about $${a.runUsd.toFixed(3)}.` : ""} Nothing is sent until you approve.
                </p>
              ) : null}
              {editable !== undefined ? (
                <>
                  <label className="visually-hidden" htmlFor={`edit-${a.id}`}>Message</label>
                  <textarea id={`edit-${a.id}`} className={s.textarea} value={edits[a.id] ?? editable} onChange={(e) => setEdits({ ...edits, [a.id]: e.target.value })} />
                </>
              ) : (
                <pre className={s.pre}>{a.action.type === "mcp.call" ? JSON.stringify({ tool: a.action.tool, arguments: a.action.args }, null, 2) : JSON.stringify(a.action.row)}</pre>
              )}
              {a.action.type === "social.schedule" && a.action.at ? <span className={s.muted}>Scheduled for {when(a.action.at)}</span> : null}
              <div className={s.row}>
                <button className={s.btn} onClick={() => decide(a, "approve")}>{a.action.type === "mcp.call" ? "Approve and run" : "Approve and send"}</button>
                <button className={`${s.btn} ${s.ghost}`} onClick={() => decide(a, "reject")}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={s.card}>
        <span className={s.label}>History</span>
        <div className={s.list}>
          {done.slice(0, 20).map((a) => (
            <div key={a.id} className={s.item}>
              <span className={s.grow}>{label(a)}<br /><span className={s.muted}>{a.result ?? a.agentName}</span></span>
              <Pill tone={a.status === "sent" ? "on" : a.status === "failed" ? "warn" : undefined}>{a.status}</Pill>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

type ToolInfo = { id: string; label: string; what: string; enabled: boolean };
type Conn = {
  id: string;
  label: string;
  what: string;
  live: string;
  tools: ToolInfo[];
  connection: { status: string; account: string } | null;
};
/** Admin-only: connectors whose server keys are missing. The server sends this list to admin accounts only. */
type SetupItem = { id: string; label: string; what: string; needsEnv: string[]; setup: string | null; redirectUri: string | null; note: string | null };
const CONNECTOR_BACK = /^(?:conn_(ok|no)(?:_(\w+))?|(bank)_done)$/;
/** Result word stashed by the app shell after an OAuth redirect (see /api/business/connectors/oauth/callback). */
function peekConnectorBack(): { ok: boolean; connector: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("keplar.mcp.oauth");
    const m = raw ? CONNECTOR_BACK.exec((JSON.parse(raw) as { result?: string }).result ?? "") : null;
    return m ? { ok: m[3] ? true : m[1] === "ok", connector: m[3] ? "bank" : m[2] ?? null } : null;
  } catch {
    return null;
  }
}
function Connectors({ go }: { go: (t: Tab) => void }) {
  const [list, setList] = useState<Conn[] | null>(null);
  const [setupNeeded, setSetupNeeded] = useState<SetupItem[]>([]);
  const [bank, setBank] = useState<{ shown: boolean; setup: SetupItem[] } | null>(null); // null until the bank check answers
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [back] = useState(peekConnectorBack);
  useEffect(() => {
    if (!back) return;
    try {
      sessionStorage.removeItem("keplar.mcp.oauth");
    } catch {
      /* storage unavailable */
    }
  }, [back]);
  useEffect(() => {
    let on = true;
    api<{ connectors: Conn[]; setupNeeded?: SetupItem[] }>("/api/business/connectors").then((d) => {
      if (!on) return;
      setList(d.connectors);
      setSetupNeeded(d.setupNeeded ?? []);
    }).catch(() => undefined);
    return () => {
      on = false;
    };
  }, []);
  async function post(path: string, payload: unknown) {
    setErr(null);
    try {
      return await api<{ connectors?: Conn[]; setupNeeded?: SetupItem[]; url?: string }>(path, { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      setErr(errMsg(e));
      return null;
    }
  }
  async function toggle(c: Conn) {
    const on = c.connection?.status === "connected";
    setBusy(c.id);
    if (!on && c.tools.length) {
      const d = await post("/api/business/connectors/oauth/start", { connector: c.id });
      if (d?.url) window.location.assign(d.url);
    } else {
      const d = await post("/api/business/connectors", { connector: c.id, action: on ? "disconnect" : "connect" });
      if (d?.connectors) setList(d.connectors);
      if (d?.setupNeeded) setSetupNeeded(d.setupNeeded);
    }
    setBusy(null);
  }
  async function tool(c: Conn, t: ToolInfo) {
    setBusy(`${c.id}:${t.id}`);
    const d = await post("/api/business/connectors/tools", { connector: c.id, tool: t.id, enabled: !t.enabled });
    if (d?.connectors) setList(d.connectors);
    if (d?.setupNeeded) setSetupNeeded(d.setupNeeded);
    setBusy(null);
  }
  if (!list) return <p className={s.muted}>Loading…</p>;
  return (
    <>
      {back ? (
        <div className={`${s.notice} ${back.ok ? "" : s.error}`} role="status">
          {back.ok ? `${back.connector ?? "The app"} is connected. Its tools start off: switch on only the ones you want agents to use.` : "That sign-in didn't complete, so nothing was connected. Try again."}
        </div>
      ) : null}
      {err ? <div className={`${s.notice} ${s.error}`} role="alert">{err}</div> : null}
      <UnverifiedNote className={s.notice} />
      {list.length === 0 && bank && !bank.shown ? (
        <div className={s.card} data-testid="connectors-empty">
          <strong style={{ fontWeight: 500 }}>Nothing to connect yet</strong>
          <span className={s.muted}>New connections will show up here as they become available.</span>
        </div>
      ) : null}
      <div className={s.two}>
        {list.map((c) => {
          const on = c.connection?.status === "connected";
          const oauth = c.tools.length > 0;
          return (
            <div key={c.id} className={s.card} data-connector={c.id}>
              <div className={s.row}>
                <strong style={{ fontWeight: 500 }} className={s.grow}>{c.label}</strong>
                {!isLiveVerified(c.id) ? <Pill tone="warn">{UNVERIFIED_LABEL}</Pill> : null}
                <Pill tone={on ? "on" : undefined}>{on ? "Connected" : "Not connected"}</Pill>
              </div>
              <span className={s.muted}>{c.what}</span>
              {on ? <span className={s.mono}>{c.connection?.account}</span> : null}
              {oauth && on
                ? c.tools.map((t) => (
                    <label key={t.id} className={s.row} style={{ gap: 8, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={t.enabled} disabled={busy === `${c.id}:${t.id}`} onChange={() => tool(c, t)} aria-label={`${t.label} on ${c.label}`} />
                      <span className={s.grow}>
                        <span>{t.label}</span> <span className={s.muted}>· {t.what}. Writes outside Keplar; each use waits for your approval.</span>
                      </span>
                    </label>
                  ))
                : null}
              <div className={s.row}>
                <button className={`${s.btn} ${on ? s.ghost : ""}`} onClick={() => toggle(c)} disabled={busy === c.id}>
                  {on ? "Disconnect" : "Connect"}
                </button>
              </div>
            </div>
          );
        })}
        {[["Notion", "Read and write pages. Connects as a connected app over OAuth (BETA)."], ["Linear", "Read and create issues. Connects as a connected app over OAuth (BETA)."]].map(([name, what]) => (
          <div key={name} className={s.card} data-connector={name.toLowerCase()}>
            <div className={s.row}>
              <strong style={{ fontWeight: 500 }} className={s.grow}>{name}</strong>
              <Pill tone="warn">BETA</Pill>
              {!isLiveVerified(name.toLowerCase()) ? <Pill tone="warn">{UNVERIFIED_LABEL}</Pill> : null}
            </div>
            <span className={s.muted}>{what}</span>
            <div className={s.row}>
              <button className={`${s.btn} ${s.ghost}`} onClick={() => go("apps")}>Open Connected apps</button>
            </div>
          </div>
        ))}
      </div>
      <Banks back={back?.connector === "bank"} onState={setBank} />
      {setupNeeded.length + (bank?.setup.length ?? 0) > 0 ? (
        <div className={s.card} data-testid="setup-needed" style={{ marginTop: 12 }}>
          <div className={s.row}>
            <strong style={{ fontWeight: 500 }} className={s.grow}>Setup needed</strong>
            <Pill tone="warn">Admin only</Pill>
          </div>
          <span className={s.muted}>Only admin accounts see this. These connections stay hidden from everyone else until their server keys are set.</span>
          {[...setupNeeded, ...(bank?.setup ?? [])].map((x) => (
            <div key={x.id} className={s.item} data-setup={x.id} style={{ display: "block" }}>
              <strong style={{ fontWeight: 500 }}>{x.label}</strong> <span className={s.muted}>· {x.what}</span>
              {x.needsEnv.length ? <div className={s.muted}>Needs {x.needsEnv.join(" and ")} in the server environment.</div> : null}
              {x.setup ? <div className={s.muted}>{x.setup}</div> : null}
              {x.redirectUri ? <div className={s.muted}>Redirect URI: <span className={s.mono}>{x.redirectUri}</span></div> : null}
              {x.note ? <div className={s.muted}>{x.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

type BankData = {
  hidden?: boolean; setupNeeded?: SetupItem[];
  configured: boolean; plaid?: boolean; stripe?: boolean; env: string; stripeEnv?: string; pending: number;
  items: { id: string; provider?: string; institution: string; status: string; note: string | null; accounts: { id: string; name: string; mask: string | null; subtype: string | null; available: number | null; current: number | null; currency: string }[]; transactions: { id: string; name: string; amount: number; currency: string; date: string; pending: boolean }[] }[];
};
const dollars = (n: number | null, c = "USD") => (n === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n));

type StripeJs = (pk: string) => { collectFinancialConnectionsAccounts?: (args: { clientSecret: string }) => Promise<{ error?: { message?: string } }> };
function loadStripeJs(): Promise<StripeJs> {
  const w = window as Window & { Stripe?: StripeJs };
  if (w.Stripe) return Promise.resolve(w.Stripe);
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
  const wait = (el: HTMLScriptElement) => new Promise<StripeJs>((resolve, reject) => {
    const done = () => (w.Stripe ? resolve(w.Stripe) : reject(new Error("Stripe's bank window didn't load.")));
    if (w.Stripe) return done();
    el.addEventListener("load", done, { once: true });
    el.addEventListener("error", () => reject(new Error("Stripe's bank window didn't load.")), { once: true });
  });
  if (existing) return wait(existing);
  const s = document.createElement("script");
  s.src = "https://js.stripe.com/v3/";
  s.async = true;
  document.head.appendChild(s);
  return wait(s);
}

function Banks({ back, onState }: { back: boolean; onState: (v: { shown: boolean; setup: SetupItem[] }) => void }) {
  const [d, setD] = useState<BankData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setD(await api<BankData>("/api/business/banks?data=1"));
    } catch (e) {
      setMsg(errMsg(e));
    }
  }, []);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        if (back) {
          const r = await api<{ connected: number; waiting: number }>("/api/business/banks/plaid/complete", { method: "POST", body: "{}" });
          if (on) setMsg(r.connected ? "Bank connected." : r.waiting ? "Plaid hasn't finished yet. Finish in the Plaid window, then press Check again." : null);
        }
        if (on) setD(await api<BankData>("/api/business/banks?data=1"));
      } catch (e) {
        if (on) setMsg(errMsg(e));
      }
    })();
    return () => {
      on = false;
    };
  }, [back]);
  async function startPlaid() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ url: string }>("/api/business/banks/plaid/start", { method: "POST", body: "{}" });
      window.location.assign(r.url);
    } catch (e) {
      setMsg(errMsg(e));
      setBusy(false);
    }
  }
  async function startStripe() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ clientSecret: string; publishableKey: string; sessionId: string }>("/api/business/banks/stripe/session", { method: "POST", body: "{}" });
      const Stripe = await loadStripeJs();
      const stripe = Stripe(r.publishableKey);
      if (!stripe.collectFinancialConnectionsAccounts) throw new Error("Stripe's bank window didn't load.");
      const result = await stripe.collectFinancialConnectionsAccounts({ clientSecret: r.clientSecret });
      if (result.error) {
        setMsg(result.error.message || "The bank window closed before a bank was linked.");
        await load();
        return;
      }
      const done = await api<{ connected: number; waiting: number }>("/api/business/banks/stripe/complete", { method: "POST", body: JSON.stringify({ sessionId: r.sessionId }) });
      setMsg(done.connected ? "Bank connected." : done.waiting ? "Stripe hasn't finished linking that bank." : "No account was linked.");
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    try {
      let connected = 0;
      let waiting = 0;
      if (d?.plaid) {
        const r = await api<{ connected: number; waiting: number }>("/api/business/banks/plaid/complete", { method: "POST", body: "{}" });
        connected += r.connected;
        waiting += r.waiting;
      }
      if (d?.stripe) {
        const r = await api<{ connected: number; waiting: number }>("/api/business/banks/stripe/complete", { method: "POST", body: "{}" });
        connected += r.connected;
        waiting += r.waiting;
      }
      setMsg(connected ? "Bank connected." : waiting ? "The bank link hasn't finished yet." : "Nothing waiting.");
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function drop(id: string) {
    setBusy(true);
    try {
      await api("/api/business/banks", { method: "DELETE", body: JSON.stringify({ id }) });
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const hidden = Boolean(d?.hidden);
  useEffect(() => {
    if (d) onState({ shown: !d.hidden, setup: d.setupNeeded ?? [] });
  }, [d, onState]);
  if (!d || hidden) return null;
  return (
    <div className={s.card} data-connector="bank" style={{ marginTop: 12 }}>
      <div className={s.row}>
        <strong style={{ fontWeight: 500 }} className={s.grow}>Bank accounts</strong>
        <Pill tone="warn">BETA</Pill>
        {!isLiveVerified("stripe-fc") ? <Pill tone="warn">{UNVERIFIED_LABEL}</Pill> : null}
        {d.stripe ? <Pill tone="on">{d.stripeEnv === "live" ? "Stripe live" : "Stripe test"}</Pill> : null}
        {d.plaid ? <Pill tone="on">{d.env === "sandbox" ? "Plaid sandbox" : "Plaid live"}</Pill> : null}
      </div>
      <span className={s.muted}>Read-only balances and recent transactions from a US bank. Keplar cannot move money or charge the account.</span>
      {msg ? <span role="status">{msg}</span> : null}
      {d.items.map((b) => (
        <div key={b.id} className={s.card}>
          <div className={s.row}><strong style={{ fontWeight: 500 }} className={s.grow}>{b.institution}</strong><span className={s.muted}>{b.provider === "stripe" ? "Stripe" : "Plaid"}</span><button className={`${s.btn} ${s.ghost}`} onClick={() => drop(b.id)} disabled={busy}>Disconnect</button></div>
          {b.note ? <span className={s.muted}>{b.note}</span> : null}
          {b.accounts.map((a) => <div key={a.id} className={s.row}><span className={s.grow}>{a.name}{a.mask ? ` ••${a.mask}` : ""}</span><span className={s.mono}>{dollars(a.available ?? a.current, a.currency)}</span></div>)}
          {b.transactions.length ? (
            <details>
              <summary className={s.muted}>Recent transactions ({b.transactions.length})</summary>
              {b.transactions.map((t) => <div key={t.id} className={s.row}><span className={s.grow}>{t.name}{t.pending ? " (pending)" : ""}</span><span className={s.mono}>{t.date}</span><span className={s.mono}>{dollars(t.amount, t.currency)}</span></div>)}
            </details>
          ) : null}
        </div>
      ))}
      <div className={s.row}>
        {d.stripe ? <button className={s.btn} onClick={startStripe} disabled={busy}>Connect with Stripe</button> : null}
        {d.plaid ? <button className={s.btn} onClick={startPlaid} disabled={busy}>Connect with Plaid</button> : null}
        {d.pending ? <button className={`${s.btn} ${s.ghost}`} onClick={check} disabled={busy}>Check again</button> : null}
      </div>
    </div>
  );
}

type Entry = { id: string; actor: string; action: string; target?: string; detail?: string; at: string };
function Audit() {
  const [list, setList] = useState<Entry[] | null>(null);
  useEffect(() => {
    let on = true;
    api<{ entries: Entry[] }>("/api/business/audit").then((d) => on && setList(d.entries)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, []);
  if (!list) return <p className={s.muted}>Loading…</p>;
  return (
    <div className={s.card}>
      <span className={s.label}>Audit log · every agent step and owner decision</span>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td className={s.muted} style={{ whiteSpace: "nowrap" }}>{when(e.at)}</td>
                <td className={s.mono}>{e.actor}</td>
                <td className={s.mono}>{e.action}</td>
                <td>{e.detail ?? e.target ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
