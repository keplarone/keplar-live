/**
 * Specialists (the person's saved assistants), signed-in personal workspace only.
 *   GET  -> { specialists, limit }
 *   POST { name, description?, instructions, knowledge?, starters? } -> { specialist }
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { personalOwner } from "@/lib/personalize/owner";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { createSpecialist, listSpecialists, sanitizeSpecialist, SPECIALIST_LIMITS, SpecialistLimitError, type SpecialistInput } from "@/lib/personalize/specialists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    const paid = ws.plan !== "free";
    return json({ specialists: (await listSpecialists(ws.id)).map(({ workspaceId: _w, ...s }) => s), limit: paid ? SPECIALIST_LIMITS.perPlan.paid : SPECIALIST_LIMITS.perPlan.free, knowledgeUsed: paid });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    const input = sanitizeSpecialist(await body<unknown>(req));
    if (typeof input === "string") throw new HttpError(400, input, "invalid");
    try {
      const { workspaceId: _w, ...specialist } = await createSpecialist(ws.id, input as SpecialistInput, { paid: ws.plan !== "free" });
      return json({ specialist }, { status: 201 });
    } catch (e) {
      if (e instanceof SpecialistLimitError) throw new HttpError(429, e.message, "specialist_limit");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
