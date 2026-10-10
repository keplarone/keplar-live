/**
 * Your Specialist directory listings (src/lib/personalize/specialist-directory.ts). Owner only.
 *   GET                       -> { listings, categories }
 *   POST   { token, category } -> { listing }   (screened, then waits for review)
 *   DELETE { token }           -> { ok }        (withdraw)
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { personalOwner } from "@/lib/personalize/owner";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { DIRECTORY_CATEGORIES, DirectoryError, listingsOf, submitListing, withdrawListing, type SpecialistListing } from "@/lib/personalize/specialist-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (r: SpecialistListing) => ({ token: r.token, name: r.name, category: r.category, status: r.status, note: r.note ?? null, createdAt: r.createdAt, decidedAt: r.decidedAt });

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    return json({ listings: (await listingsOf(ws.id)).map(view), categories: DIRECTORY_CATEGORIES });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    await limitRequest(req, "specialist-directory", { perIp: 30, perAccount: 10, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ token?: unknown; category?: unknown }>(req);
    try {
      return json({ listing: view(await submitListing(ws.id, b.token, b.category)) }, { status: 201 });
    } catch (e) {
      if (e instanceof DirectoryError) throw new HttpError(e.code === "not_found" ? 404 : e.code === "limit" ? 429 : e.code === "duplicate" ? 409 : 400, e.message, e.code);
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
    if (!(await withdrawListing(ws.id, String(b.token ?? "")))) throw new HttpError(404, "No such listing.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
