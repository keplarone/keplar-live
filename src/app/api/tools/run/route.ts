/**
 * POST /api/tools/run — run a model-backed free tool (src/lib/free-tools). Body: { tool, input }.
 * The prompt is composed on the server from the validated input and run through the same Ask pipeline as the chat, on the
 * Free lane (free open models, stateless, nothing saved), for the visitor's own workspace: anonymous when signed out.
 * The chat's own anonymous daily limits still apply inside; this route adds stricter per-IP limits of its own.
 * Local tools (citations, study plan, model explorer) never reach this route.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { errorResponse, readText } from "@/lib/create/platform/http";
import { runEmbedAsk } from "@/lib/embed/ask";
import { EmbedError } from "@/lib/embed/store";
import { buildPrompt, validateInput } from "@/lib/free-tools/prompts";
import { TOOL_RUN_LIMITS as TOOL_LIMITS, toolBySlug } from "@/lib/free-tools/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE = { "cache-control": "no-store" };
const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, code, ...extra }, { status, headers: NO_STORE });

export async function POST(req: Request) {
  let raw: unknown;
  try {
    const text = await readText(req, 64_000);
    if (text === null) return fail(413, "too_large", "That request is too large.");
    raw = JSON.parse(text);
  } catch {
    return fail(400, "invalid_request", "Send a JSON object like {\"tool\": \"text-summarizer\", \"input\": {…}}.");
  }
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const tool = typeof b.tool === "string" ? toolBySlug(b.tool) : undefined;
  if (!tool) return fail(404, "unknown_tool", "No such tool.");
  if (tool.kind !== "model") return fail(400, "local_tool", `${tool.name} runs in your browser and does not use this endpoint.`);
  const v = validateInput(tool, b.input);
  if (!v.ok) return fail(400, "invalid_input", v.error, v.field ? { field: v.field } : {});
  try {
    const ip = clientIpOf(req);
    await rateLimit(`ip:${ip}:tools`, TOOL_LIMITS.perMinute, 60);
    await rateLimit(`ip:${ip}:tools-day`, TOOL_LIMITS.perDay, 86_400);
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    const result = await runEmbedAsk(ws, "free", { prompt: buildPrompt(tool, v.input), history: [] }, req.headers, req.signal);
    return Response.json({ tool: tool.slug, answer: result.answer, agreement: result.agreement, models: result.models }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof RateLimitError) return fail(429, "rate_limited", `You have used this tool's free allowance for now (${TOOL_LIMITS.perMinute} a minute, ${TOOL_LIMITS.perDay} a day). Try again later, or ask the same thing in Keplar.`, { retryAfterSec: e.retryAfterSec });
    if (e instanceof EmbedError) return fail(e.status, e.code, e.message, e.retryAfterSec ? { retryAfterSec: e.retryAfterSec } : {});
    return errorResponse(e);
  }
}
