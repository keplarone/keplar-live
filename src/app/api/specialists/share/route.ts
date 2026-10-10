/**
 * Specialist links (src/lib/personalize/specialist-share.ts). Owner only.
 *   GET                                     -> { links }
 *   POST   { specialistId, includeNotes? }  -> { link }
 *   DELETE { token }                        -> { ok }
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { personalOwner } from "@/lib/personalize/owner";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { getSpecialist } from "@/lib/personalize/specialists";
import { createSpecialistShare, liveSpecialistSharesOf, revokeSpecialistShare, SpecialistShareLimitError, type SpecialistShareRow } from "@/lib/personalize/specialist-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (r: SpecialistShareRow, origin: string) => ({ token: r.token, url: `${origin}/sp/${r.token}`, specialistId: r.specialistId, name: r.name, includesNotes: r.includesNotes, createdAt: r.createdAt, expiresAt: r.expiresAt, views: r.views, copies: r.copies });

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    const origin = new URL(req.url).origin;
    return json({ links: (await liveSpecialistSharesOf(ws.id)).map((r) => view(r, origin)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    const b = await body<{ specialistId?: unknown; includeNotes?: unknown }>(req);
    const sp = typeof b.specialistId === "string" ? await getSpecialist(ws.id, b.specialistId) : null;
    if (!sp) throw new HttpError(404, "No such specialist.", "not_found");
    try {
      return json({ link: view(await createSpecialistShare(sp, { includeNotes: b.includeNotes === true }), new URL(req.url).origin) }, { status: 201 });
    } catch (e) {
      if (e instanceof SpecialistShareLimitError) throw new HttpError(429, e.message, "share_limit");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "personal-settings", { perIp: 120, perAccount: 40, accountId: ws.id, windowSec: 60 });
    const b = await body<{ token?: unknown }>(req);
    if (!(await revokeSpecialistShare(ws.id, String(b.token ?? "")))) throw new HttpError(404, "No such link.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
