import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { spaceOwner } from "@/lib/space-studio/account";
import { rotateBeacon } from "@/lib/space-studio/experiences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ universeId: string }> };

/** POST -> { token, script }: a new beacon token (shown once); the previous token stops working immediately. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    await limitRequest(req, "space-experiences", { perIp: 20 });
    const ws = await spaceOwner(req, true, 20);
    const { universeId } = await params;
    if (!/^\d{1,20}$/.test(universeId)) throw new HttpError(404, "You don't track that experience.", "experience_not_found");
    return json(await rotateBeacon(ws.id, universeId));
  } catch (e) {
    return errorResponse(e);
  }
}
