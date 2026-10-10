import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { setReportStatus } from "@/lib/safety/store";
import { setTicketStatus } from "@/lib/support/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only. Body: { kind: "report" | "ticket", id, status }. Written to the admin audit log. */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:inbox:${admin.email}`, 60);
    const b = await body<{ kind?: string; id?: string; status?: string }>(req);
    if (typeof b.id !== "string" || !/^[\w:.-]{1,80}$/.test(b.id)) throw new HttpError(400, "Bad id.");
    let ok = false;
    if (b.kind === "report") {
      if (b.status !== "open" && b.status !== "reviewed" && b.status !== "dismissed") throw new HttpError(400, "Bad status.");
      ok = await setReportStatus(b.id, b.status, admin.email);
    } else if (b.kind === "ticket") {
      if (b.status !== "open" && b.status !== "answered" && b.status !== "closed") throw new HttpError(400, "Bad status.");
      ok = await setTicketStatus(b.id, b.status, admin.email);
    } else throw new HttpError(400, "Bad kind.");
    if (!ok) throw new HttpError(404, "Not found.", "not_found");
    await writeAudit(admin.email, `inbox_${b.kind}_${b.status}`, b.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
