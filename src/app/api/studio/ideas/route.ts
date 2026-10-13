import { body, errorResponse, json } from "@/lib/create/platform/http";
import { CreditLimitError } from "@/lib/create/platform/compute";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { IDEA_LIMITS } from "@/lib/studio/idea-market";
import { generateIdeas, ideasCreditCeiling } from "@/lib/studio/ideas";

export const runtime = "nodejs";
export const maxDuration = 300;

const gate = async (req: Request) => {
  const ws = await currentWorkspace(req);
  if (!STUDIO_PLANS.has(ws.plan)) throw new EntitlementError("Game ideas come with Keplar Lite, Plus and Pro.", "lite");
  return ws;
};

/** The most a set of ideas can cost right now, in credits (a true ceiling, from the same prices the charge uses). */
export async function GET(req: Request) {
  try {
    await gate(req);
    return json({ maxCredits: await ideasCreditCeiling() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** One set of game ideas (src/lib/studio/ideas.ts): Studio plans only, rate limited, credits checked before and charged after. */
export async function POST(req: Request) {
  try {
    const ws = await gate(req);
    await rateLimit(`studio-ideas:${ws.id}`, 10, 60, { shared: true });
    const b = await body<{ brief?: unknown; scope?: unknown }>(req);
    const brief = typeof b.brief === "string" ? b.brief.slice(0, IDEA_LIMITS.briefChars) : "";
    const scope = b.scope === "full" ? "full" : "weekend";
    return json(await generateIdeas(ws, { brief, scope }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof CreditLimitError) return json({ error: e.message, code: "studio_credits" }, { status: 402 });
    return errorResponse(e);
  }
}
