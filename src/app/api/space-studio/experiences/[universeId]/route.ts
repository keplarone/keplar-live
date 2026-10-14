import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { spaceOwner } from "@/lib/space-studio/account";
import { removeExperience } from "@/lib/space-studio/experiences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ universeId: string }> };

/** DELETE -> { ok: true }. Stops tracking and deletes the experience's beacon, samples and sales in this workspace. 404 when not tracked. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    await limitRequest(req, "space-experiences", { perIp: 20 });
    const ws = await spaceOwner(req, true, 20);
    const { universeId } = await params;
    if (!/^\d{1,20}$/.test(universeId)) throw new HttpError(404, "You don't track that experience.", "experience_not_found");
    await removeExperience(ws.id, universeId);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
