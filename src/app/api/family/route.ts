/**
 * Family mode (src/lib/personalize/family.ts). Signed-in personal workspace.
 *   GET  -> { enabled, guideHomework, locked, lockedUntil }
 *   POST { action: "enable", pin, guideHomework? } | { action: "disable", pin } | { action: "update", pin, guideHomework?, newPin? }
 *        | { action: "reset", newPin }   (only within 10 minutes of a fresh email sign-in)
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { personalOwner } from "@/lib/personalize/owner";
import { getSession } from "@/lib/accounts/auth";
import { disableFamily, enableFamily, FamilyError, familyView, getFamily, resetFamilyPin, updateFamily } from "@/lib/personalize/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    return json(familyView(await getFamily(ws.id)));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "family", { perIp: 30, perAccount: 15, accountId: ws.id, windowSec: 300 });
    const b = await body<{ action?: unknown; pin?: unknown; newPin?: unknown; guideHomework?: unknown }>(req);
    const homework = typeof b.guideHomework === "boolean" ? b.guideHomework : undefined;
    try {
      if (b.action === "enable") await enableFamily(ws.id, b.pin, { guideHomework: homework });
      else if (b.action === "disable") await disableFamily(ws.id, b.pin);
      else if (b.action === "update") await updateFamily(ws.id, b.pin, { guideHomework: homework, ...(b.newPin !== undefined ? { newPin: b.newPin } : {}) });
      else if (b.action === "reset") await resetFamilyPin(ws.id, (await getSession(req.headers))?.session.createdAt ?? null, b.newPin);
      else throw new HttpError(400, "Unknown action.", "invalid");
    } catch (e) {
      if (e instanceof FamilyError) throw new HttpError(e.code === "locked" ? 429 : e.code === "bad_pin" ? 403 : 400, e.message, e.code);
      throw e;
    }
    return json(familyView(await getFamily(ws.id)));
  } catch (e) {
    return errorResponse(e);
  }
}
