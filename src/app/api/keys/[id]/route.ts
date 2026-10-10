/** DELETE -> revoke a key. Immediate: the next request with it is refused. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { revokeKey } from "@/lib/api/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const ws = await requireAccount(req);
    await limitRequest(req, "api-keys", { perIp: 60, perAccount: 30, accountId: ws.id });
    const { id } = await params;
    if (!(await revokeKey(ws.id, id))) throw new HttpError(404, "That key was not found, or is already revoked.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
