/** Trust & safety takedown/restore (admin only). Mock: requires KEPLAR_ADMIN_TOKEN. The admin inbox (/api/admin/inbox, kind "abuse") is the signed-in path. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { timingSafeEqual } from "node:crypto";
import { applyAbuseAction } from "@/lib/create/abuse-policy";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = process.env.KEPLAR_ADMIN_TOKEN;
    const given = Buffer.from(req.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${token ?? ""}`);
    if (!token || given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, "Admin only.", "forbidden");
    const { action } = (await req.json()) as { action: "takedown" | "restore" | "dismiss" };
    const rid = (await params).id;
    if (action !== "takedown" && action !== "restore" && action !== "dismiss") throw new HttpError(400, "Bad action.");
    // Same handler as the admin inbox: works for published sites (site:<slug>) and legacy projects.
    const r = await applyAbuseAction(rid, action, "admin-token");
    if (!r) throw new HttpError(404, "Report not found.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
