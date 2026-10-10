import { body, errorResponse, json } from "@/lib/create/platform/http";
import { decide } from "@/lib/business/agents";
import { owner } from "../../_owner";

export const runtime = "nodejs";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    const b = await body<{ decision: "approve" | "reject"; edits?: { body?: string; text?: string } }>(req);
    return json({ approval: await decide(ws, id, b.decision === "approve" ? "approve" : "reject", b.edits) });
  } catch (e) {
    return errorResponse(e);
  }
}
