/**
 * Space Studio chat (POST /api/space-studio/chat): one model call for one of the four Space Studio configurations.
 * Order: validate -> plan check (stored subscription) -> Roblox link gate -> routing (explicit choice honored; escalation only when
 * the person allowed it and their plan covers it) -> credit check -> OpenRouter call with the SERVED profile's own system prompt and
 * budgets -> the answer is used only if the provider says it came from the requested model -> the real cost is charged.
 */
import { assertCanSpend, chargeUnits, toUnits } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { liveEnv } from "@/lib/orchestration/config";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { costUsd, extractEscalation, modelAllowed, modelById, resolvedSlug, route, type ModelId, type ModelProfile, type Subscription, type Workload } from "./core";

export const CHAT_LIMITS = { maxMessages: 40, maxMessageChars: 20_000 } as const;
const WORKSPACES: Workload[] = ["roblox", "blender", "general"];
const HINT: Record<Workload, string> = {
  roblox: "Workspace: Roblox Studio (Luau). Assume the person is working in Roblox Studio.",
  blender: "Workspace: Blender (Python/bpy). Assume the person is working in Blender.",
  general: "Workspace: general. The person may be working in Roblox Studio or Blender.",
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatBody = { model: ModelId; messages: ChatMessage[]; workspace: Workload; allowEscalation: boolean };

const bad = (m: string, code = "bad_request") => new HttpError(400, m, code);

/** Validates the request body. Only these fields are read; anything else (a `plan`, a price, a slug) is ignored. */
export function validateChatBody(raw: unknown): ChatBody & { profile: ModelProfile } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const profile = modelById(b.model);
  if (!profile) throw bad("Pick Orbit, Nebula, Solar or Nova.", "unknown_model");
  const workspace = WORKSPACES.find((w) => w === b.workspace);
  if (!workspace) throw bad("workspace must be roblox, blender or general.");
  if (!Array.isArray(b.messages) || !b.messages.length) throw bad("Send at least one message.");
  if (b.messages.length > CHAT_LIMITS.maxMessages) throw bad(`Send at most ${CHAT_LIMITS.maxMessages} messages; start a new chat or trim older ones.`, "too_many_messages");
  let total = 0;
  const messages = b.messages.map((m, i) => {
    const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    if (r.role !== "user" && r.role !== "assistant") throw bad(`Message ${i + 1}: role must be user or assistant.`);
    if (typeof r.content !== "string" || !r.content.trim()) throw bad(`Message ${i + 1} is empty.`);
    if (r.content.length > CHAT_LIMITS.maxMessageChars) throw bad(`Message ${i + 1} is longer than ${CHAT_LIMITS.maxMessageChars.toLocaleString("en-US")} characters.`, "too_large");
    total += r.content.length;
    return { role: r.role, content: r.content } as ChatMessage;
  });
  if (messages[messages.length - 1]!.role !== "user") throw bad("The last message must be from you.");
  if (total > profile.budgets.maxContextChars) throw bad(`This conversation is longer than ${profile.name} takes (${profile.budgets.maxContextChars.toLocaleString("en-US")} characters). Start a new chat or trim older messages.`, "too_large");
  return { model: profile.id, messages, workspace, allowEscalation: b.allowEscalation === true, profile };
}

type Completion = {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

export type ChatGate = { sub: Subscription | null; robloxRequired: boolean; robloxLinked: boolean; now?: number };
export type ChatDeps = { fetch?: typeof fetch; env?: Record<string, string | undefined>; key?: string | null; assertCanSpend?: typeof assertCanSpend; chargeUnits?: typeof chargeUnits };

/** Everything before the provider call; exported so the gates can be tested without a network. */
export function planChat(body: ChatBody, gate: ChatGate) {
  const now = gate.now ?? Date.now();
  if (!modelAllowed(gate.sub, now, body.model)) throw new HttpError(402, `${modelById(body.model)!.name} needs a higher Space Studio plan.`, "plan_required", { minPlan: modelById(body.model)!.minPlan });
  if (gate.robloxRequired && !gate.robloxLinked && body.workspace === "roblox") throw new HttpError(403, "Link your Roblox account to use the Roblox workspace.", "roblox_link_required");
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")!.content;
  return route(body.model, lastUser, { allowEscalation: body.allowEscalation, allowed: (id) => modelAllowed(gate.sub, now, id) });
}

export async function runSpaceChat(ws: Workspace, body: ChatBody, gate: ChatGate, deps: ChatDeps = {}) {
  const r = planChat(body, gate);
  const served = r.served;
  const env = deps.env ?? process.env;
  const slug = resolvedSlug(served, env);
  const key = deps.key !== undefined ? deps.key : liveEnv().openRouterKey;
  if (!key) throw new HttpError(503, `${served.name} isn't available right now.`, "model_unavailable");

  // Reserve what this call can cost at most (prompt estimate + the full output budget), capped by the profile's per-task budget.
  const promptChars = body.messages.reduce((n, m) => n + m.content.length, 0) + served.system.length;
  const worst = Math.min(served.budgets.maxUsdPerTask, costUsd(served, Math.ceil(promptChars / 3), served.budgets.maxOutputTokens)) * METER_MARGIN;
  await (deps.assertCanSpend ?? assertCanSpend)(ws, toUnits(worst), { kind: "text" });

  const t0 = Date.now();
  const res = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": `Space Studio ${served.name}`, "http-referer": "https://keplar.one" },
    body: JSON.stringify({
      model: slug,
      messages: [{ role: "system", content: `${served.system}\n\n${HINT[body.workspace]}` }, ...body.messages],
      max_tokens: served.budgets.maxOutputTokens,
      ...(served.budgets.reasoningTokens > 0 ? { reasoning: { max_tokens: served.budgets.reasoningTokens } } : {}),
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(served.budgets.timeoutMs),
  }).catch((e: unknown) => {
    throw new HttpError(503, `${served.name} didn't answer in time. Try again.`, "model_unavailable", { cause: e instanceof Error ? e.name : "error" });
  });
  const data = (await res.json().catch(() => ({}))) as Completion;
  const latencyMs = Date.now() - t0;
  if (!res.ok || !data.choices?.length) {
    console.error(`[space.chat] ${slug} failed: status ${res.status} after ${latencyMs} ms`);
    throw new HttpError(503, `${served.name} isn't available right now. Nothing was charged; try again in a moment.`, "model_unavailable");
  }
  // Never a silent substitute: an answer from any other model is discarded and not charged.
  if (typeof data.model !== "string" || !data.model.startsWith(slug)) {
    console.error(`[space.chat] discarded an answer from ${String(data.model).slice(0, 80)}; requested ${slug}`);
    throw new HttpError(503, `${served.name} couldn't answer right now, and Space Studio never switches models silently. Nothing was charged.`, "model_mismatch");
  }

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  const usd = typeof data.usage?.cost === "number" && data.usage.cost > 0 ? data.usage.cost : costUsd(served, promptTokens, completionTokens);
  const metered = usd * METER_MARGIN;
  const units = usd > 0 ? await (deps.chargeUnits ?? chargeUnits)(ws, "space.chat", toUnits(metered), metered) : 0;

  const raw = (data.choices[0]!.message?.content ?? "").trim();
  const flagged = extractEscalation(raw);
  const suggestTo: ModelId | null = r.suggestion?.to ?? (flagged.reason && served.escalateTo ? served.escalateTo : null);
  return {
    text: flagged.text,
    served: { id: served.id, name: served.name, underlyingModel: served.underlying.name },
    requested: r.requested.id,
    escalated: r.escalated,
    escalation: { suggested: Boolean(suggestTo), to: suggestTo, reason: r.suggestion?.reason ?? (suggestTo ? flagged.reason : null) },
    usage: { promptTokens, completionTokens, usd: Math.round(usd * 1e6) / 1e6, units, latencyMs },
  };
}
