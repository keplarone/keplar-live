/** Admin review of Specialist directory listings. GET -> { listings }; POST { token, decision: "list" | "hide" | "reject", note? } -> { listing }. */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { decideListing, listingsForReview } from "@/lib/personalize/specialist-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json({ listings: await listingsForReview() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await limitRequest(req, "admin-specialists", { perIp: 120, windowSec: 60 });
    const b = await body<{ token?: unknown; decision?: unknown; note?: unknown }>(req);
    if (b.decision !== "list" && b.decision !== "hide" && b.decision !== "reject") throw new HttpError(400, "Pick list, hide or reject.", "invalid");
    const r = await decideListing(String(b.token ?? ""), b.decision, admin.email, typeof b.note === "string" ? b.note : "");
    if (!r) throw new HttpError(404, "No such listing.", "not_found");
    return json({ listing: r });
  } catch (e) {
    return errorResponse(e);
  }
}
