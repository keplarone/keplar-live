/**
 * Improve the idea behind a brief. Returns the improved description for the owner to accept or ignore; changes nothing by itself.
 * Free plan: free models, $0. Paid: a cheap model, metered. When no model answers the response says so (no fake "improvement").
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { normalizeBrief } from "@/lib/site-builder/brief";
import { enhanceBrief } from "@/lib/site-builder/enhance";
import { checkPrompt } from "@/lib/site-builder/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:enhance:${ws.id}`, 12, 60, { shared: true });
    await rateLimit(`sb:enhance:day:${ws.id}`, ws.plan === "free" ? 20 : 120, 86_400, { shared: true });
    const input = await body<{ brief?: unknown }>(req);
    const brief = normalizeBrief(input.brief);
    if (brief.idea.length < 3) throw new HttpError(400, "Describe what you want to build first.");
    const problem = await checkPrompt(`${brief.idea}\n${brief.purpose}\n${brief.content}`);
    if (problem) throw new HttpError(422, problem, "refused");
    if (!process.env.OPENROUTER_API_KEY?.trim()) return json({ available: false, message: "Prompt improvement isn't connected to a model yet. Your original description is used as it is." });
    await assertCanSpend(ws, ws.plan === "free" ? 0 : 2);
    const out = await enhanceBrief(ws.plan, brief);
    if (!out) return json({ available: true, enhanced: null, message: "The model didn't return an improvement this time. Your original description is kept; you can try again." });
    const credits = out.usd > 0 ? await charge(ws, "site.enhance", { usd: Math.max(out.usd, 0.0003), ref: "enhance" }).catch(() => 0) : 0;
    return json({ available: true, enhanced: out.enhanced, credits, free: out.usd === 0 });
  } catch (e) {
    return errorResponse(e);
  }
}
