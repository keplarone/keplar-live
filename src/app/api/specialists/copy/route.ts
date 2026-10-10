/** Add a copy of a shared specialist to your own. POST { token } -> { specialist }. Signed in; plan caps apply. */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { personalOwner } from "@/lib/personalize/owner";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { SpecialistLimitError } from "@/lib/personalize/specialists";
import { copySpecialistShare } from "@/lib/personalize/specialist-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    const b = await body<{ token?: unknown }>(req);
    try {
      const sp = await copySpecialistShare(String(b.token ?? ""), ws.id, { paid: ws.plan !== "free" });
      if (!sp) throw new HttpError(404, "This link was turned off or has expired.", "not_found");
      const { workspaceId: _w, ...specialist } = sp;
      return json({ specialist }, { status: 201 });
    } catch (e) {
      if (e instanceof SpecialistLimitError) throw new HttpError(429, e.message, "specialist_limit");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
