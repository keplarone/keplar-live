import { readText } from "@/lib/create/platform/http";
import { limitRequest, RateLimitError } from "@/lib/create/platform/ratelimit";
import { formatCitation, runFreeTool, TOOL_LIMITS, toolBySlug, type CitationInput } from "@/lib/seo/tools";

/**
 * POST /api/tools/:slug. Citation formatting is local. Model tools call one $0 `:free` model
 * and are limited per IP. A missing key is a 503 with an honest message, never a made-up draft.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const tool = toolBySlug((await ctx.params).slug);
  if (!tool || tool.kind === "browse") return Response.json({ error: "Unknown tool." }, { status: 404 });
  try {
    await limitRequest(req, "free-tool", { perIp: TOOL_LIMITS.perIp, windowSec: TOOL_LIMITS.windowSec });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return Response.json({ error: "This free tool is limited to 8 runs an hour from this network." }, { status: 429, headers: { "retry-after": String(e.retryAfterSec) } });
    }
    throw e;
  }
  const raw = await readText(req, 12_000);
  if (raw == null) return Response.json({ error: "That request is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (tool.kind === "citation") {
    const result = formatCitation(record.citation && typeof record.citation === "object" ? (record.citation as CitationInput) : {});
    return result.ok ? Response.json({ text: result.text }) : Response.json({ error: result.error }, { status: 400 });
  }
  const text = typeof record.text === "string" ? record.text : "";
  const result = await runFreeTool(tool.slug, text);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ text: result.text });
}
