import { assertSameOrigin } from "@/lib/security/origin";
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { requireBusiness } from "@/lib/business/require";
import { tasks, updateTask } from "@/lib/business/workspace-data";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    const { id } = await ctx.params;
    return json({ task: await updateTask(ws.id, id, await body(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    const { id } = await ctx.params;
    return json({ deleted: await tasks().remove(ws.id, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
