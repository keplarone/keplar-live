/** Dashboard aggregate: revenue, orders, leads, traffic, agent activity, approvals. */
import { meter } from "@/lib/create/platform/compute";
import type { Workspace } from "@/lib/create/platform/workspace";
import { agents, approvals, contacts, orders, pageViews, runs } from "./repo";
import { getAccount, inCurrentMode, paymentsPaused, stripeConfigured, stripeMode } from "./stripe";
import { getSettings } from "./agents";

/** Paid amount net of partial refunds (fully refunded orders are no longer "paid"). */
const net = (o: { amount: number; refundedAmount?: number }) => o.amount - (o.refundedAmount ?? 0);

export async function dashboard(ws: Workspace) {
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const [os, cs, pvs, rs, aps, ags, acct, compute, settings] = await Promise.all([
    orders().list(ws.id, inCurrentMode),
    contacts().list(ws.id),
    pageViews().list(ws.id, (v) => v.at >= new Date(Date.now() - 14 * 864e5).toISOString()),
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
    days.push({ day, views: pvs.filter((v) => v.day === day).length });
  }
  const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
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
    traffic: { last14: pvs.length, days },
    /** Paid orders per site view over the same 14 days. null (not 0%) until there are views to divide by. */
    conversion: { windowDays: 14, orders: paid14, views: pvs.length, rate: pvs.length > 0 ? paid14 / pvs.length : null },
    agents: { active: ags.filter((a) => a.status === "active").length, total: ags.length, halted: settings.agentsHalted, recentRuns: rs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6).map((r) => ({ ...r, agentName: ags.find((a) => a.id === r.agentId)?.name ?? "Agent" })) },
    approvals: { pending: aps.length },
    compute,
  };
}
