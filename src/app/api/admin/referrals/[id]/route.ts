import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { decideClaim } from "@/lib/referrals/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only. Body: { decision: "approve" | "deny" } on a held claim. Approving grants the same extra usage credit (never cash). Audited. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:referrals:${admin.email}`, 60);
    const { id } = await ctx.params;
    const b = await body<{ decision?: string }>(req);
    if (b.decision !== "approve" && b.decision !== "deny") throw new HttpError(400, "Bad decision.");
    if (!/^rc_[\w:.-]{1,80}$/.test(id)) throw new HttpError(400, "Bad id.");
    const c = await decideClaim(id, b.decision, admin.email);
    if (!c) throw new HttpError(404, "Not found.", "not_found");
    await writeAudit(admin.email, `referral_${b.decision}`, id);
    return json({ status: c.status });
  } catch (e) {
    return errorResponse(e);
  }
}
