/**
 * POST /api/v1/ask, the engine side: validate the public body, run the SAME pipeline the app uses (the /api/keplar handler, called
 * in-process with the key's workspace injected), and turn its NDJSON events into the public shapes. No cookies and no
 * Authorization header are forwarded; the pipeline sees a stateless workspace (no memory, no chats saved).
 */
import { POST as runKeplar } from "@/app/api/keplar/route";
import { injectWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { API_ASK_LIMITS } from "./policy";
import { ApiError } from "./keys";
import { toV1Answer, type V1Answer } from "./format";
import type { KeplarAnswer, KeplarEvent } from "@/lib/orchestration/types";
import { parseTools, prepareTools, type ApiTool } from "./tools";

export const STRATEGIES = ["auto", "fast", "balanced", "deep"] as const;

/** One image the question is about (a screenshot, a photo, an area of a page). Answered by vision-capable models only. */
export type AskImage = { dataUrl: string; width: number; height: number };
export type AskInput = { prompt: string; history: { role: "user" | "keplar"; text: string }[]; strategy?: string; tools?: ApiTool[]; image?: AskImage };

/** `image: { data_url, width, height }`: shape-checked here; the full check (real type, size) is the app's parseMedia. */
function parseImage(raw: unknown): AskImage | undefined {
  if (raw === undefined || raw === null) return undefined;
  const o = (typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const dataUrl = o.data_url;
  const bad = () => new ApiError(400, "invalid_request", `"image" must be { "data_url": "data:image/(png|jpeg|webp);base64,...", "width": px, "height": px } and at most ${Math.round(API_ASK_LIMITS.imageChars / 1e6 * 10) / 10} MB as a data URL.`);
  if (typeof dataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > API_ASK_LIMITS.imageChars) throw bad();
  const width = Number(o.width), height = Number(o.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw bad();
  return { dataUrl, width, height };
}

export function parseAsk(raw: unknown): AskInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "invalid_request", "Send a JSON object like {\"question\": \"...\"}.");
  const b = raw as Record<string, unknown>;
  if (typeof b.question !== "string" || !b.question.trim()) throw new ApiError(400, "invalid_request", "\"question\" is required and must be a non-empty string.");
  if (b.question.length > API_ASK_LIMITS.questionChars) throw new ApiError(400, "invalid_request", `"question" must be at most ${API_ASK_LIMITS.questionChars} characters.`);
  let history: AskInput["history"] = [];
  if (b.history !== undefined) {
    if (!Array.isArray(b.history) || b.history.length > API_ASK_LIMITS.historyTurns) throw new ApiError(400, "invalid_request", `"history" must be an array of at most ${API_ASK_LIMITS.historyTurns} turns.`);
    history = b.history.map((h) => {
      const t = h as { role?: unknown; content?: unknown };
      if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string" || t.content.length > API_ASK_LIMITS.historyTurnChars) {
        throw new ApiError(400, "invalid_request", `Each "history" turn needs role "user" or "assistant" and "content" up to ${API_ASK_LIMITS.historyTurnChars} characters.`);
      }
      return { role: t.role === "assistant" ? ("keplar" as const) : ("user" as const), text: t.content };
    });
  }
  const r = b.routing;
  let strategy: string | undefined;
  if (r !== undefined) {
    const s = (r as { strategy?: unknown } | null)?.strategy;
    if (s !== undefined && (typeof s !== "string" || !(STRATEGIES as readonly string[]).includes(s))) throw new ApiError(400, "invalid_request", `"routing.strategy" must be one of: ${STRATEGIES.join(", ")}.`);
    strategy = s as string | undefined;
  }
  const tools = parseTools(b.tools);
  const image = parseImage(b.image);
  return { prompt: b.question.trim(), history, strategy, ...(tools.length ? { tools } : {}), ...(image ? { image } : {}) };
}

/** Public stage names; the app's internal ids are not part of the contract. */
const STAGES: Record<string, string> = { understand: "understanding", select: "choosing_models", debate: "debating", compare: "comparing", disagree: "comparing_disagreements", verify: "checking", synthesize: "writing" };

export type PublicEvent =
  | { event: "progress"; data: { stage: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "answer"; data: V1Answer };

export function mapFailure(status: number, code: string | undefined, message: string, retryAfter?: number): ApiError {
  const m = (s: number, c: string) => new ApiError(s, c, message, retryAfter);
  if (status === 413 || code === "too_large") return m(413, "too_large");
  if (code === "daily_limit" || code === "daily_calls" || code === "admin_cap") return m(402, "limit_reached");
  if (status === 429) return m(429, "rate_limited");
  if (code === "not_configured" || status === 503) return m(503, "unavailable");
  if (status === 400) return m(400, "invalid_request");
  if (status === 401 || status === 403) return m(403, "forbidden");
  return m(status >= 500 ? 502 : status, "upstream_error");
}

export function eventToPublic(ev: KeplarEvent): PublicEvent | null {
  switch (ev.type) {
    case "stage": {
      const s = STAGES[ev.stage];
      return s && ev.status === "active" ? { event: "progress", data: { stage: s } } : null;
    }
    case "delta": return { event: "delta", data: { text: ev.text } };
    case "answer": return { event: "answer", data: toV1Answer(ev.answer as KeplarAnswer) };
    default: return null;
  }
}

/** Runs the pipeline and yields public events. Throws ApiError for refusals / failures (before or during the run). */
export async function* runAsk(ws: Workspace, input: AskInput, passHeaders: Headers, signal?: AbortSignal): AsyncGenerator<PublicEvent> {
  const headers = new Headers({ "content-type": "application/json" });
  for (const h of ["x-forwarded-for", "x-real-ip", "x-request-id", "user-agent"]) {
    const v = passHeaders.get(h);
    if (v) headers.set(h, v);
  }
  // Built-in tools (./tools.ts): fetch-style tools run first; the rest become pipeline modes. Each reports what happened.
  const prepared = input.tools?.length ? await prepareTools(ws, input.tools, input.prompt) : null;
  const inner = new Request("http://internal.keplar/api/keplar", {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      prompt: input.prompt, history: input.history, modes: prepared?.modes ?? {}, ...(prepared?.docs.length ? { docs: prepared.docs } : {}), routing: input.strategy ? { strategy: input.strategy } : {},
      // The app's media path: validated again there, sent only to models that can see, never stored.
      ...(input.image ? { media: { images: [{ dataUrl: input.image.dataUrl, width: input.image.width, height: input.image.height, name: "image" }], videos: [] } } : {}),
    }),
  });
  injectWorkspace(inner, ws);
  const res = await runKeplar(inner);
  if (!res.ok || !res.body) {
    let j: { error?: string; code?: string } = {};
    try { j = await res.json(); } catch { /* not JSON */ }
    throw mapFailure(res.status, j.code, typeof j.error === "string" ? j.error : "The request could not be completed.", Number(res.headers.get("retry-after")) || undefined);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handle = (line: string): PublicEvent | null => {
    if (!line.trim()) return null;
    let ev: KeplarEvent;
    try { ev = JSON.parse(line) as KeplarEvent; } catch { return null; }
    if (ev.type === "error" && ev.code === "plan_required") throw new ApiError(403, "plan_required", ev.message || "Your plan doesn't include this.");
    if (ev.type === "error") throw new ApiError(ev.code === "no_response" ? 502 : 500, ev.code === "no_response" ? "no_response" : "internal", ev.message || "The request failed.");
    if (ev.type === "limit") throw new ApiError(402, "limit_reached", ev.window?.message ?? "Your plan's credits for this period are used up.");
    const out = eventToPublic(ev);
    return out?.event === "answer" && prepared ? { event: "answer", data: { ...out.data, tools: prepared.report } } : out;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const out = handle(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (out) yield out;
    }
    if (done) break;
  }
  const last = handle(buf);
  if (last) yield last;
}
