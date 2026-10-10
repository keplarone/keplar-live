import { errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { hfCheckConnection } from "@/lib/higgsfield/client";
import { higgsfieldAdminStatus } from "@/lib/higgsfield/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection status for the admin panel. Booleans and env var NAMES only; the credentials are never returned. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json(higgsfieldAdminStatus());
  } catch (e) {
    return errorResponse(e);
  }
}

/** "Test connection": one free, read-only status lookup that tells valid credentials from rejected ones. Nothing is generated or charged. */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:higgsfield:${admin.email}`, 10);
    const check = await hfCheckConnection();
    await writeAudit(admin.email, "higgsfield_test", check.state);
    return json({ ...higgsfieldAdminStatus(), check });
  } catch (e) {
    return errorResponse(e);
  }
}
