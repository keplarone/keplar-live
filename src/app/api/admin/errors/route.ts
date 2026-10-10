import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { setErrorStatus } from "@/lib/ops/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only. Body: { id, status: "open" | "resolved" }. */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:errors:${admin.email}`, 60);
    const b = await body<{ id?: string; status?: string }>(req);
    if (typeof b.id !== "string" || !/^er_[a-f0-9]{16}$/.test(b.id)) throw new HttpError(400, "Bad id.");
    if (b.status !== "open" && b.status !== "resolved") throw new HttpError(400, "Bad status.");
    if (!(await setErrorStatus(b.id, b.status))) throw new HttpError(404, "Not found.", "not_found");
    await writeAudit(admin.email, `error_${b.status}`, b.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
