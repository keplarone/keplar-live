/**
 * Template gallery (docs/growth/TEMPLATES.md).
 *   GET    -> { templates: your shared templates, limits: { shared, used, remixesPerDay } }   (signed in)
 *   POST   { siteId, title, description, category, credit?, consent: true } -> share one of your sites as a template.
 *          Explicit opt-in: verified email, consent, no personal data / members-only pages detected, per-plan cap.
 *   DELETE { slug } -> withdraw one of yours (gone from the gallery at once)
 *   PATCH  { slug, status: "live" | "hidden" } -> admin only: approve or hide a template
 * Same-origin only for writes. Rate limited. The public gallery is /templates.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { site } from "@/lib/site";
import { TEMPLATE_LIMITS } from "@/lib/templates/remix";
import { myTemplates, setTemplateStatus, shareAsTemplate, withdrawTemplate } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner(req: Request, write: boolean) {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req);
  if (!ws.userId || ws.anonymous) throw new HttpError(401, "Sign in to share a template.", "unauthenticated");
  await limitRequest(req, "templates", { perIp: 60, perAccount: 40, accountId: ws.id, windowSec: 600 });
  return ws;
}

export async function GET(req: Request) {
  try {
    const ws = await owner(req, false);
    const list = await myTemplates(ws);
    const l = TEMPLATE_LIMITS[ws.plan];
    return json({ templates: list.map((t) => ({ ...t, url: t.status === "live" ? `${site.url}/templates/${t.slug}` : null })), limits: { shared: l.shared, used: list.length, remixesPerDay: l.remixesPerDay } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<{ siteId?: unknown; title?: unknown; description?: unknown; category?: unknown; credit?: unknown; consent?: unknown }>(req);
    if (b.consent !== true) throw new HttpError(400, "Confirm that you want to share this site as a public template.", "consent_required");
    if (typeof b.siteId !== "string") throw new HttpError(400, "Choose a site.", "invalid");
    const { row } = await shareAsTemplate(ws, { siteId: b.siteId, title: b.title, description: b.description, category: b.category, credit: b.credit });
    return json({ slug: row.slug, status: row.status, url: row.status === "live" ? `${site.url}/templates/${row.slug}` : null }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<{ slug?: unknown }>(req);
    if (typeof b.slug !== "string" || !(await withdrawTemplate(ws, b.slug))) throw new HttpError(404, "That template doesn't exist or isn't yours.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const ws = await owner(req, true);
    if (!ws.admin) throw new HttpError(403, "Admins only.", "forbidden");
    const b = await body<{ slug?: unknown; status?: unknown }>(req);
    if (typeof b.slug !== "string" || (b.status !== "live" && b.status !== "hidden")) throw new HttpError(400, "Expected a slug and a status of live or hidden.", "invalid");
    if (!(await setTemplateStatus(b.slug, b.status))) throw new HttpError(404, "No such template.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
