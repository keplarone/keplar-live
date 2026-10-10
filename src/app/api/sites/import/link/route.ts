/**
 * Product import from a page link. The server fetches the page (SSRF-safe, robots.txt respected, no cookies), extracts the
 * product, copies the photos into Keplar's private storage and returns a draft for the owner to review. Nothing is built.
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { ImportError, importMessage } from "@/lib/site-builder/product/fetch";
import { importFromLink } from "@/lib/site-builder/product/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:import:link:${ws.id}`, 6, 60, { shared: true });
    const input = await body<{ url?: string }>(req);
    const url = String(input.url ?? "").trim();
    if (!url) throw new HttpError(400, importMessage("invalid_url"), "invalid_url");
    try {
      return json(await importFromLink(ws, /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`));
    } catch (e) {
      if (e instanceof ImportError) return json({ error: e.message, code: e.code, manual: true }, { status: e.code === "invalid_url" || e.code === "private" ? 400 : 422 });
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
