import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { estimateUnits } from "@/lib/create/platform/compute";
import { createAgent, getSettings, TEMPLATES } from "@/lib/business/agents";
import { agents, runs } from "@/lib/business/repo";
import type { WorkflowTemplate } from "@/lib/business/types";
import { offeredTemplates, templateOffered } from "@/lib/business/visibility";
import { inngestEnabled } from "@/lib/inngest/client";
import { nextRunFor } from "@/lib/business/scheduler";
import { SCHEDULED_RUNS_PER_DAY, effectiveCadence, minIntervalFor, scheduleDriver, cadenceName } from "@/lib/business/schedule-limits";
import { owner } from "../_owner";
import { reapSoon } from "@/lib/create/platform/queue";
import { inboundEmailConfig, inboxAddress } from "@/lib/business/event-agents";
import type { Agent } from "@/lib/business/types";

/** Never send the webhook token hash to the browser; show the incoming-email address when email is set up. */
const agentView = <A extends Agent>({ hookHash: _h, ...a }: A) => { const cfg = inboundEmailConfig(); return { ...a, ...(a.inboxRoute && cfg ? { inboxAddress: inboxAddress(a.inboxRoute, cfg.domain) } : {}) }; };

export const runtime = "nodejs";
/** Queued background jobs (platform/queue.ts) started or resumed here run after the response, within this limit. */
export const maxDuration = 120;
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    reapSoon(ws.id); // event-triggered runs (form.submitted, order.paid) queued without Inngest whose instance died are resumed after the response
    const [ags, rs, settings, nexts] = await Promise.all([agents().list(ws.id), runs().list(ws.id), getSettings(ws.id), nextRunFor(ws.id)]);
    const driver = scheduleDriver(inngestEnabled());
    const minInterval = minIntervalFor(ws.plan);
    const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    return json({
      settings,
      templates: TEMPLATES,
      offered: offeredTemplates(Object.keys(TEMPLATES)), // templates whose connectors are not available here are not offered
      runEstimateUnits: estimateUnits("agent.run.base") + estimateUnits("agent.step"),
      autoSendAllowed: ws.entitlements.autoSendAllowed,
      limit: ws.entitlements.agents,
      // What scheduling can honestly do on this plan and this server (src/lib/business/schedule-limits.ts).
      schedule: {
        driver,
        ...effectiveCadence(driver),
        fastestAllowed: Number.isFinite(minInterval) ? cadenceName(minInterval) : null,
        minIntervalMinutes: Number.isFinite(minInterval) ? minInterval : null,
        scheduledRunsPerDay: SCHEDULED_RUNS_PER_DAY[ws.plan] ?? 0,
      },
      inboundEmail: Boolean(inboundEmailConfig()),
      agents: ags.map((a) => ({ ...agentView(a), next: nexts.find((n) => n.agentId === a.id)?.next ?? null, scheduleError: nexts.find((n) => n.agentId === a.id)?.error, unitsThisMonth: rs.filter((r) => r.agentId === a.id && r.startedAt >= month).reduce((s, r) => s + r.units, 0) })),
      runs: rs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ template: WorkflowTemplate; name?: string; mcp?: unknown; schedule?: { cron?: unknown; tz?: unknown }; monitor?: { url?: unknown; keyword?: unknown }; question?: unknown; event?: unknown }>(req);
    if (b.template in TEMPLATES && !templateOffered(b.template)) throw new HttpError(409, "This workflow isn't available right now.", "not_available");
    return json({ agent: agentView(await createAgent(ws, b.template, b.name, b.mcp, { schedule: b.schedule, monitor: b.monitor, question: b.question, event: b.event })) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
