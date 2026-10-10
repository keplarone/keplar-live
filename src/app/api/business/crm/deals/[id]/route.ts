import { body, errorResponse, json } from "@/lib/create/platform/http";
import { updateDeal } from "@/lib/business/crm";
import type { DealStage } from "@/lib/business/types";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    const b = await body<{ stage?: DealStage; value?: number; title?: string }>(req);
    return json({ deal: await updateDeal(ws.id, id, b) });
  } catch (e) {
    return errorResponse(e);
  }
}
