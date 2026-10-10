/**
 * Live theme edit: colors, fonts, style texture, shape, density and motion change instantly with no model call and no credits,
 * because the app's design-system stylesheet (kapp.css) is generated from the design choice at serve time. The draft changes
 * now; the published app changes when the owner publishes again.
 */
import { errorResponse, json, body, HttpError } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { now } from "@/lib/create/platform/ids";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { getSite, sites } from "@/lib/site-builder/store";
import { normalizeDesign, tokensFor } from "@/lib/app-builder/design/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`apps:theme:${ws.id}`, 60, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    if (!site.app) throw new HttpError(400, "Build the app first.");
    const input = await body<{ design?: unknown }>(req);
    const design = normalizeDesign({ ...site.app.design, ...(input.design as object), direction: site.app.design.direction });
    await sites().update(ws.id, site.id, { app: { ...site.app, design }, updatedAt: now() });
    return json({ design, tokens: tokensFor(design) });
  } catch (e) {
    return errorResponse(e);
  }
}
