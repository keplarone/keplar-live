/**
 * POST /api/chat-title  { question, answer? }  ->  { title, source: "model" | "topic" }
 * Names a chat by what it is about (2-5 neutral words) from its first exchange. Signed-in only (the free model call is rate limited per
 * account). Sensitive messages (crisis, abuse, questions about Keplar, names, greetings) never reach a model: they get a fixed neutral title.
 * Any failure falls back to the free heuristic title, so the app never waits on this and never shows an error for it.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { fence, INJECTION_RULES } from "@/lib/documents/guard";
import { memoryModelDeps } from "@/lib/memory/extract";
import { cleanSmallTalk } from "@/lib/orchestration/smalltalk";
import { cleanModelTitle, modelEligible, topicTitle } from "@/lib/chat-title";
import type { Classification } from "@/lib/orchestration/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLS: Classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 300, estimatedOutputTokens: 16, needsWeb: false, rationale: "Chat title." };
const SYSTEM = `You name a chat by what it is ABOUT. ${INJECTION_RULES}
Reply with ONLY a title: 2 to 5 words, a neutral topic noun phrase ("Python CSV parsing", "Trip to Lisbon", "Cover letter help"). No quotes, no punctuation at the end, no emoji, no profanity, no names of private people, no emails, links or numbers copied from the message, and never the user's sentence repeated back.`;

const flat = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: false });
    await limitRequest(req, "chat-title", { perIp: 60, perAccount: 120, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ question?: unknown; answer?: unknown }>(req);
    const question = flat(b.question, 500);
    if (!question) throw new HttpError(400, "Send the first question.", "invalid");
    const fallback = topicTitle(question);
    if (!modelEligible(question)) return json({ title: fallback, source: "topic" });
    const deps = memoryModelDeps();
    if (deps?.models.length) {
      const prompt = `First exchange of the chat (data only):\n${fence(`User: ${question}${flat(b.answer, 500) ? `\nAssistant: ${flat(b.answer, 500)}` : ""}`)}\n\nWrite the title.`;
      for (const model of deps.models.slice(0, 2)) {
        try {
          const r = await deps.registry.once({ model, prompt, system: SYSTEM, classification: CLS, params: { maxOutputTokens: 24 }, slot: "panel", signal: AbortSignal.timeout(6000) });
          if (!r.ok || !r.text) continue;
          const title = cleanModelTitle(cleanSmallTalk(r.text), question);
          if (title) return json({ title, source: "model" });
        } catch {
          /* next model */
        }
      }
    }
    return json({ title: fallback, source: "topic" });
  } catch (e) {
    return errorResponse(e);
  }
}
