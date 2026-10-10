/** Trust & safety takedown (admin only). Mock: requires KEPLAR_ADMIN_TOKEN. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { timingSafeEqual } from "node:crypto";
import { abuseReports, projects } from "@/lib/create/repo";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = process.env.KEPLAR_ADMIN_TOKEN;
    const given = Buffer.from(req.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${token ?? ""}`);
    if (!token || given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, "Admin only.", "forbidden");
    const { action } = (await req.json()) as { action: "takedown" | "restore" | "dismiss" };
    const rid = (await params).id;
    const r = await abuseReports().findSystem((x) => x.id === rid);
    if (!r) throw new HttpError(404, "Report not found.", "not_found");
    const project = await projects().findSystem((p) => p.id === r.target);
    if (project && action !== "dismiss") await projects().update(project.workspaceId, project.id, { takenDown: action === "takedown" });
    await abuseReports().update(r.workspaceId, r.id, { status: action === "dismiss" ? "dismissed" : "actioned" });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
