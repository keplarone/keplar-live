import { errorResponse, json } from "@/lib/create/platform/http";
import { dashboard } from "@/lib/business/dashboard";
import { owner } from "../_owner";
import { reapSoon } from "@/lib/create/platform/queue";
import "@/lib/business/agents"; // registers the agent.run job the reaper may resume

export const runtime = "nodejs";
/** Queued background jobs (platform/queue.ts) started or resumed here run after the response, within this limit. */
export const maxDuration = 120;
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    reapSoon(ws.id);
    return json({ plan: ws.plan, entitlements: ws.entitlements, ...(await dashboard(ws)) });
  } catch (e) {
    return errorResponse(e);
  }
}
