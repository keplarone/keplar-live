/** One specialist: PATCH (edit any field) or DELETE. Owner only. */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { personalOwner } from "@/lib/personalize/owner";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { deleteSpecialist, getSpecialist, sanitizeSpecialist, updateSpecialist } from "@/lib/personalize/specialists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await personalOwner(req);
    const sp = await getSpecialist(ws.id, (await ctx.params).id);
    if (!sp) throw new HttpError(404, "No such specialist.", "not_found");
    const { workspaceId: _w, ...specialist } = sp;
    return json({ specialist });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    const patch = sanitizeSpecialist(await body<unknown>(req), true);
    if (typeof patch === "string") throw new HttpError(400, patch, "invalid");
    const sp = await updateSpecialist(ws.id, (await ctx.params).id, patch);
    if (!sp) throw new HttpError(404, "No such specialist.", "not_found");
    const { workspaceId: _w, ...specialist } = sp;
    return json({ specialist });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    if (!(await deleteSpecialist(ws.id, (await ctx.params).id))) throw new HttpError(404, "No such specialist.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
