/** Dashboard aggregate: revenue, orders, leads, traffic, agent activity, approvals. */
import { meter } from "@/lib/create/platform/compute";
import type { Workspace } from "@/lib/create/platform/workspace";
import { agents, approvals, contacts, orders, runs } from "./repo";
import { viewsByDay as trafficByDay } from "./traffic";
import { getAccount, inCurrentMode, paymentsPaused, stripeConfigured, stripeMode } from "./stripe";
import { getSettings } from "./agents";

/** Paid amount net of partial refunds (fully refunded orders are no longer "paid"). */
const net = (o: { amount: number; refundedAmount?: number }) => o.amount - (o.refundedAmount ?? 0);

export async function dashboard(ws: Workspace) {
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const firstDay = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10); // the oldest of the 14 days shown
  const [os, cs, viewsByDay, rs, aps, ags, acct, compute, settings] = await Promise.all([
    orders().list(ws.id, inCurrentMode),
    contacts().list(ws.id),
    // Views per day over the last 14 days: per-day counters plus legacy per-view rows (counted by the store) until they age out.
    trafficByDay(ws.id, firstDay, since14),
    runs().list(ws.id),
    approvals().list(ws.id, (a) => a.status === "pending"),
    agents().list(ws.id),
    getAccount(ws.id),
    meter(ws),
    getSettings(ws.id),
  ]);
  // Partially refunded orders stay "paid" (net of the refund); fully refunded ones leave the totals.
  const paid = os.filter((o) => o.status === "paid");
  const paid30 = paid.filter((o) => (o.paidAt ?? "") >= since30);
  const days: { day: string; views: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ day, views: viewsByDay.get(day) ?? 0 });
  }
  const views14 = [...viewsByDay.values()].reduce((s, n) => s + n, 0);
  const paid14 = paid.filter((o) => (o.paidAt ?? "") >= since14).length;
  return {
    configured: { payments: stripeConfigured() },
    mode: stripeMode(),
    paymentsPaused: await paymentsPaused(),
    payments: acct ? { mode: acct.mode, status: acct.status, chargesEnabled: acct.chargesEnabled, payoutsEnabled: acct.payoutsEnabled, accountId: acct.stripeAccountId, requirementsDue: acct.requirementsDue ?? [] } : null,
    revenue: {
      last30: paid30.reduce((s, o) => s + net(o), 0),
      total: paid.reduce((s, o) => s + net(o), 0),
      currency: "usd",
      /** Keplar's application fees on paid orders (what the seller was charged on top of Stripe's card fees). */
      fees: paid.reduce((s, o) => s + o.applicationFeeAmount, 0),
      refunded: os.reduce((s, o) => s + (o.refundedAmount ?? 0), 0),
    },
    orders: { last30: paid30.length, pending: os.filter((o) => o.status === "pending").length, recent: os.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5) },
    leads: { last30: cs.filter((c) => c.createdAt >= since30).length, total: cs.length },
    traffic: { last14: views14, days },
    /** Paid orders per site view over the same 14 days. null (not 0%) until there are views to divide by. */
    conversion: { windowDays: 14, orders: paid14, views: views14, rate: views14 > 0 ? paid14 / views14 : null },
    agents: { active: ags.filter((a) => a.status === "active").length, total: ags.length, halted: settings.agentsHalted, recentRuns: rs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6).map((r) => ({ ...r, agentName: ags.find((a) => a.id === r.agentId)?.name ?? "Agent" })) },
    approvals: { pending: aps.length },
    compute,
  };
}
