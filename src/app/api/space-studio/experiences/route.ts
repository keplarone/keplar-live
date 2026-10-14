import { limitRequest } from "@/lib/create/platform/ratelimit";
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { spaceOwner } from "@/lib/space-studio/account";
import { addExperience, experienceView, listExperiences } from "@/lib/space-studio/experiences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { experiences: [{ universeId, placeId, name, iconUrl, addedAt, beacon: { connected, lastEventAt } }] } */
export async function GET(req: Request) {
  try {
    const ws = await spaceOwner(req, false);
    return json({ experiences: (await listExperiences(ws.id)).map(experienceView) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST { link } (roblox.com game URL, place id, or "universe:<id>") -> 201 { experience, beacon: { token, script } }.
 * The beacon token is shown only here (and on rotation). 400 bad_link, 404 experience_not_found, 409 experience_exists /
 * too_many_experiences (max 10), 502 roblox_unavailable.
 */
export async function POST(req: Request) {
  try {
    await limitRequest(req, "space-experiences", { perIp: 20 });
    const ws = await spaceOwner(req, true, 20);
    const { link } = await body<{ link?: unknown }>(req);
    return json(await addExperience(ws.id, link), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
