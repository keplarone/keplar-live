/**
 * Answer preferences (Settings > Personalization), signed-in personal workspace only.
 *   GET    -> { prefs, styles }
 *   PUT    { enabled?, aboutYou?, howToAnswer?, style?, customStyle?, location? } -> { prefs }
 *   DELETE -> clears them all
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { deletePrefs, getPrefs, sanitizePrefs, savePrefs, STYLES } from "@/lib/personalize/prefs";
import { personalOwner } from "@/lib/personalize/owner";
import { limitRequest } from "@/lib/create/platform/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (p: Awaited<ReturnType<typeof getPrefs>>) => ({ enabled: p.enabled, aboutYou: p.aboutYou, howToAnswer: p.howToAnswer, style: p.style, customStyle: p.customStyle, location: p.location ?? "", updatedAt: p.updatedAt });

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    return json({ prefs: view(await getPrefs(ws.id)), styles: STYLES.map(({ id, label, hint }) => ({ id, label, hint })), plan: ws.plan });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    const patch = sanitizePrefs(await body<unknown>(req));
    if (typeof patch === "string") throw new HttpError(400, patch, "invalid");
    return json({ prefs: view(await savePrefs(ws.id, patch)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    await deletePrefs(ws.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
