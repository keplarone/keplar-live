/**
 * Agent mode in the chat: set up (or reuse) the workflow the message asked for and run it once now, streaming the
 * run's steps as NDJSON so the chat card fills in Schedule → data → Draft → Owner approval as it happens.
 * The run is the normal agent run with forceApproval: every outbound action is queued for the owner, who approves
 * it from the card through the existing POST /api/business/approvals/[id]. Nothing is sent from here.
 *
 *   → {"type":"agent","agent":{id,name,template,trigger,reused}}
 *   → {"type":"step","text":"…"}               (each, as it happens)
 *   → {"type":"done","run":{id,status,error,needs,units},"approvals":[…]}
 *   → {"type":"error","error":"…","code":"…"}  (a cap or halt that stopped the run)
 */
import { body, errorResponse, HttpError } from "@/lib/create/platform/http";
import { createAgent, runAgent, TEMPLATES } from "@/lib/business/agents";
import { agents, approvals } from "@/lib/business/repo";
import { templateOffered } from "@/lib/business/visibility";
import { CHAT_TEMPLATES, previewAction, type ChatTemplate, type FlowApproval } from "@/lib/business/chat-flow";
import { EntitlementError } from "@/lib/create/platform/plans";
import { owner } from "../../_owner";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ template?: unknown; monitor?: { url?: unknown; keyword?: unknown } }>(req);
    const template = (CHAT_TEMPLATES as string[]).includes(String(b.template)) ? (b.template as ChatTemplate) : null;
    if (!template) throw new HttpError(400, "Pick one of the workflows Keplar can run from the chat.");
    if (!templateOffered(template)) throw new HttpError(409, "This workflow isn't available right now.", "not_available");
    // Reuse the owner's active agent for this workflow (one per page for monitors) instead of stacking duplicates.
    const monitorUrl = template === "monitor" && typeof b.monitor?.url === "string" ? b.monitor.url.trim() : "";
    const existing = (await agents().list(ws.id, (a) => a.template === template && a.status === "active" && (template !== "monitor" || a.monitor?.url === monitorUrl)))[0];
    const agent = existing ?? (await createAgent(ws, template, undefined, undefined, template === "monitor" ? { monitor: b.monitor ?? {} } : {}));
    const trigger = agent.trigger.type === "schedule" || agent.trigger.type === "manual" ? agent.trigger.label : TEMPLATES[template].trigger.type === "schedule" ? (TEMPLATES[template].trigger as { label: string }).label : "When it happens";

    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        let open = true;
        const send = (o: unknown) => { if (open) { try { ctl.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { open = false; } } };
        send({ type: "agent", agent: { id: agent.id, name: agent.name, template, trigger, reused: Boolean(existing) } });
        try {
          const run = await runAgent(ws, agent.id, "chat", {}, { forceApproval: true, onStep: (st) => send({ type: "step", text: st.text }) });
          const aps: FlowApproval[] = (await approvals().list(ws.id, (a) => a.runId === run.id)).map((a) => ({ id: a.id, status: a.status, risk: a.risk, result: a.result, preview: previewAction(a.action) }));
          send({ type: "done", run: { id: run.id, status: run.status, error: run.error, needs: run.needs?.map((n) => ({ connector: n.connector, label: n.label, problem: n.problem })), units: run.units, steps: run.steps.map((x) => x.text) }, approvals: aps });
        } catch (e) {
          const err = e instanceof EntitlementError ? { error: e.message, code: "entitlement", upgradeTo: e.upgradeTo } : e instanceof HttpError ? { error: e.message, code: e.code } : { error: "The run didn't finish. Nothing was sent.", code: "internal" };
          send({ type: "error", ...err });
        }
        if (open) ctl.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (e) {
    return errorResponse(e);
  }
}
