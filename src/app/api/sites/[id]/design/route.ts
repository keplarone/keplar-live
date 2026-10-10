import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { DIRECTION_IDS } from "@/lib/site-builder/design";
import { parseHex } from "@/lib/site-builder/color";
import { getSite, setDesign, toSummary } from "@/lib/site-builder/store";
import type { SiteDesign } from "@/lib/site-builder/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Switch style direction / accent / light-dark. No model, no credits: the design layer is rewritten into a new version. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:design:${ws.id}`, 20, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const input = await body<{ direction?: string; accent?: string | null; mode?: string }>(req);
    const patch: Partial<SiteDesign> = {};
    if (input.direction !== undefined) {
      if (!DIRECTION_IDS.includes(input.direction as SiteDesign["direction"])) throw new HttpError(400, "Unknown style.");
      patch.direction = input.direction as SiteDesign["direction"];
    }
    if (input.accent !== undefined) {
      if (input.accent !== null && input.accent !== "" && !parseHex(String(input.accent))) throw new HttpError(400, "Use a color like #1f4bff.");
      patch.accent = input.accent ? (String(input.accent).startsWith("#") ? String(input.accent) : `#${input.accent}`).toLowerCase() : null;
    }
    if (input.mode !== undefined) {
      if (!["auto", "light", "dark"].includes(input.mode)) throw new HttpError(400, "Mode must be auto, light or dark.");
      patch.mode = input.mode as SiteDesign["mode"];
    }
    if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms.", "taken_down");
    const r = await setDesign(ws, site, patch);
    return json({ site: toSummary(r.site, new URL(req.url).origin), version: r.version ? r.version.n : null });
  } catch (e) {
    return errorResponse(e);
  }
}
