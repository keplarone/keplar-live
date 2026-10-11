import { assertSameOrigin } from "@/lib/security/origin";
import { errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireBusiness } from "@/lib/business/require";
import { dashboard } from "@/lib/business/dashboard";
import { businessCompletion, BUSINESS_MODELS } from "@/lib/business/ai";
import { summaries } from "@/lib/business/workspace-data";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You write a short executive summary for a business owner from their own dashboard numbers. Use only the numbers given; never invent figures, trends or causes. If a number is zero or missing, say what it means plainly (for example that payments are not connected yet). Three to five short sentences, then one line starting "Next:" with the single most useful action. Plain text, no headings, no markdown.`;

/** Today's AI executive summary (cached per day; POST with ?refresh=1 regenerates, metered in credits). */
export async function GET(req: Request) {
  try {
    const ws = await requireBusiness(req);
    const day = new Date().toISOString().slice(0, 10);
    const row = await summaries().get(ws.id, `${ws.id}:${day}`);
    return json({ summary: row ? { text: row.text, createdAt: row.createdAt } : null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    await rateLimit(`acct:${ws.id}:biz_summary`, 6, 3600);
    const d = await dashboard(ws);
    const facts = {
      revenueLast30Usd: d.revenue.last30 / 100, revenueTotalUsd: d.revenue.total / 100, refundedUsd: d.revenue.refunded / 100,
      paidOrdersLast30: d.orders.last30, pendingOrders: d.orders.pending, leadsLast30: d.leads.last30, siteViewsLast14Days: d.traffic.last14,
      conversionRate: d.conversion.rate, paymentsConnected: Boolean(d.payments), activeAgents: d.agents.active, agentsHalted: d.agents.halted,
      pendingApprovals: d.approvals.pending, creditsUsedThisPeriod: d.compute.used, creditsIncluded: d.compute.total,
    };
    const { text, units } = await businessCompletion(ws, { model: BUSINESS_MODELS.fast, system: SYSTEM, user: `Dashboard numbers (JSON):\n${JSON.stringify(facts)}`, maxTokens: 400, action: "business.summary" });
    const day = new Date().toISOString().slice(0, 10);
    const id = `${ws.id}:${day}`;
    const now = new Date().toISOString();
    if (await summaries().get(ws.id, id)) await summaries().update(ws.id, id, { text, createdAt: now });
    else await summaries().insert({ id, workspaceId: ws.id, day, text, createdAt: now });
    return json({ summary: { text, createdAt: now }, units });
  } catch (e) {
    return errorResponse(e);
  }
}
