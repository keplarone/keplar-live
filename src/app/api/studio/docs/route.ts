import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { docsIndex, formatDocsHits, searchDocs } from "@/lib/studio/roblox-docs";

export const runtime = "nodejs";

/**
 * The roblox_docs tool's answer (src/lib/studio/roblox-docs-tool.ts): the page calls this when the Studio agent looks something up.
 * Same access as Studio mode (signed-in Lite and up), rate limited, no credits: the search runs in memory, with no model call.
 */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    if (!STUDIO_PLANS.has(ws.plan)) throw new EntitlementError("Roblox Studio mode comes with Keplar Lite, Plus and Pro.", "lite");
    await rateLimit(`studio-docs:${ws.id}`, 60, 60, { shared: true });
    const b = await body<{ query?: unknown; limit?: unknown }>(req);
    const query = typeof b.query === "string" ? b.query.trim().slice(0, 300) : "";
    if (!query) throw new HttpError(400, "Say what to look up.", "bad_request");
    const limit = typeof b.limit === "number" && Number.isFinite(b.limit) ? b.limit : 5;
    const index = docsIndex();
    const hits = searchDocs(index, query, limit);
    return json({ text: formatDocsHits(query, hits, index.commit), results: hits.map((h) => ({ title: h.title, url: h.url })) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
