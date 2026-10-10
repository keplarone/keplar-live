/**
 * POST /api/templates/<slug>/remix  { name?, credit?: boolean }
 * Copies the template into a new draft site in the caller's workspace and returns it. Signed in only; counts against the plan's
 * site limit and daily remix limit. Only markup and styles are copied: no forms, leads, bookings, orders, members, analytics,
 * chat history or uploaded images. `credit: true` adds a small "Based on ..." line to the home page; it is never required.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { remixTemplate } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req);
    if (!ws.userId || ws.anonymous) throw new HttpError(401, "Sign in to remix a template.", "unauthenticated");
    await limitRequest(req, "remix", { perIp: 40, perAccount: 40, accountId: ws.id, windowSec: 600 });
    const { slug } = await params;
    const b = await body<{ name?: unknown; credit?: unknown }>(req).catch(() => ({}) as { name?: unknown; credit?: unknown });
    const r = await remixTemplate(ws, slug, b);
    return json({ site: { id: r.site.id, name: r.site.name, slug: r.site.slug }, template: r.title, credited: r.credited, openUrl: "/app/create" }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
