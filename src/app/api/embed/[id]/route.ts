/**
 * One embed widget: PATCH update, DELETE revoke.
 */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { embedSnippet, publicWidget, revokeWidget, updateWidget } from "@/lib/embed/store";
import { originFor } from "@/lib/referrals/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function owner(req: Request) {
  assertSameOrigin(req);
  const ws = await requireAccount(req);
  await limitRequest(req, "embed-admin", { perIp: 60, perAccount: 30, accountId: ws.id });
  return ws;
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    const b = await body<{ name?: unknown; theme?: unknown; size?: unknown; accent?: unknown; models?: unknown; origins?: unknown }>(req);
    const row = await updateWidget(ws.id, id, { ...b, plan: ws.plan });
    if (!row) return json({ error: "Widget not found." }, { status: 404 });
    const origin = originFor(req);
    return json({ widget: { ...publicWidget(row), snippet: embedSnippet(origin, row) } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    const ok = await revokeWidget(ws.id, id);
    if (!ok) return json({ error: "Widget not found." }, { status: 404 });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
