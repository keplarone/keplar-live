/** POST { version, ids } → applies the chosen critic fixes to the current head as a NEW version (history keeps the old one). */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import { assertCan } from "@/lib/collab/access";
import { access } from "@/lib/collab/caller";
import { applyFixes, getReport } from "@/lib/critic/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a, user } = await access(req, (await params).id);
    assertCan(a, "edit");
    await rateLimit(`critic:fix:${user.id}`, 30, 600, { shared: true });
    const input = await body<{ version?: number | "live"; ids?: unknown }>(req);
    const ids = Array.isArray(input.ids) ? input.ids.map(String).slice(0, 200) : [];
    const report = await getReport(a.site, input.version === "live" ? "live" : Number(input.version) || a.site.headVersion);
    if (!report) throw new HttpError(404, "Run the critic first.", "not_found");
    const r = await applyFixes(a.site, await siteOwnerPlan(a.site.workspaceId), report, ids, user.name);
    return json({ version: r.version, applied: r.applied, skipped: r.skipped, report: r.report });
  } catch (e) {
    return errorResponse(e);
  }
}
