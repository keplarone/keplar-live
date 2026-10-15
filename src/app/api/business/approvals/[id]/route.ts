import { body, errorResponse, json } from "@/lib/create/platform/http";
import { decide } from "@/lib/business/agents";
import { requireBusinessRole } from "@/lib/business/team";
import { owner } from "../../_owner";

export const runtime = "nodejs";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await owner(req);
    requireBusinessRole(ws, "approve or reject actions", ["owner", "admin"]);
    const { id } = await ctx.params;
    const b = await body<{ decision: "approve" | "reject"; edits?: { body?: string; text?: string } }>(req);
    return json({ approval: await decide(ws, id, b.decision === "approve" ? "approve" : "reject", b.edits) });
  } catch (e) {
    return errorResponse(e);
  }
}
