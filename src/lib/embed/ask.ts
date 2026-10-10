/**
 * Run an Ask for an embed widget: same pipeline as the app / public API, but
 * forced to free models when the widget (or publisher plan) requires it.
 * Stateless: no memory, no chat saved.
 */
import { POST as runKeplar } from "@/app/api/keplar/route";
import { injectWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { EMBED_HISTORY_TURNS, EMBED_QUESTION_CHARS, type EmbedModelLane } from "./config";
import { EmbedError } from "./store";
import type { KeplarAnswer, KeplarEvent } from "@/lib/orchestration/types";

export type EmbedAskInput = { prompt: string; history: { role: "user" | "keplar"; text: string }[] };

export function parseEmbedAsk(raw: unknown): EmbedAskInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new EmbedError(400, "invalid_request", "Send a JSON object like {\"question\": \"...\"}.");
  const b = raw as Record<string, unknown>;
  if (typeof b.question !== "string" || !b.question.trim()) throw new EmbedError(400, "invalid_request", "\"question\" is required.");
  if (b.question.length > EMBED_QUESTION_CHARS) throw new EmbedError(400, "invalid_request", `Question must be at most ${EMBED_QUESTION_CHARS} characters.`);
  let history: EmbedAskInput["history"] = [];
  if (b.history !== undefined) {
    if (!Array.isArray(b.history) || b.history.length > EMBED_HISTORY_TURNS) throw new EmbedError(400, "invalid_request", `history must be at most ${EMBED_HISTORY_TURNS} turns.`);
    history = b.history.map((h) => {
      const t = h as { role?: unknown; content?: unknown };
      if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string" || t.content.length > EMBED_QUESTION_CHARS) {
        throw new EmbedError(400, "invalid_request", "Each history turn needs role user|assistant and content.");
      }
      return { role: t.role === "assistant" ? ("keplar" as const) : ("user" as const), text: t.content };
    });
  }
  return { prompt: b.question.trim(), history };
}

export type EmbedAskResult = {
  answer: string;
  agreement: string;
  models: string[];
  credits: number;
};

/** Force Free-plan routing when the widget asks for free models (even on a paid publisher). */
function workspaceForEmbed(ws: Workspace, models: EmbedModelLane): Workspace {
  if (models === "free" && ws.plan !== "free") {
    return { ...ws, plan: "free", via: "embed" };
  }
  return { ...ws, via: "embed" };
}

export async function runEmbedAsk(ws: Workspace, models: EmbedModelLane, input: EmbedAskInput, passHeaders: Headers, signal?: AbortSignal): Promise<EmbedAskResult> {
  const headers = new Headers({ "content-type": "application/json" });
  for (const h of ["x-forwarded-for", "x-real-ip", "x-request-id", "user-agent"]) {
    const v = passHeaders.get(h);
    if (v) headers.set(h, v);
  }
  const effective = workspaceForEmbed(ws, models);
  const inner = new Request("http://internal.keplar/api/keplar", {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({ prompt: input.prompt, history: input.history, modes: {}, routing: { strategy: "fast" } }),
  });
  injectWorkspace(inner, effective);
  const res = await runKeplar(inner);
  if (!res.ok || !res.body) {
    let j: { error?: string; code?: string } = {};
    try {
      j = await res.json();
    } catch {
      /* not JSON */
    }
    const msg = typeof j.error === "string" ? j.error : "The request could not be completed.";
    if (res.status === 429) throw new EmbedError(429, "rate_limited", msg, Number(res.headers.get("retry-after")) || undefined);
    if (res.status === 402 || j.code === "daily_limit" || j.code === "daily_calls") throw new EmbedError(402, "limit_reached", msg);
    if (res.status === 400) throw new EmbedError(400, "invalid_request", msg);
    throw new EmbedError(res.status >= 500 ? 502 : res.status, "upstream_error", msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const box: { answer: KeplarAnswer | null } = { answer: null };
  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: KeplarEvent;
    try {
      ev = JSON.parse(line) as KeplarEvent;
    } catch {
      return;
    }
    if (ev.type === "error") throw new EmbedError(502, "no_response", ev.message || "The request failed.");
    if (ev.type === "limit") throw new EmbedError(402, "limit_reached", ev.window?.message ?? "Credits for this period are used up.");
    if (ev.type === "answer") box.answer = ev.answer as KeplarAnswer;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
    if (done) break;
  }
  handle(buf);
  const answer = box.answer;
  if (!answer) throw new EmbedError(502, "no_response", "No answer was produced. Nothing was charged.");
  return {
    answer: answer.markdown,
    agreement: answer.consensus.summary,
    models: answer.models.map((m) => m.name),
    credits: answer.compute.units,
  };
}
