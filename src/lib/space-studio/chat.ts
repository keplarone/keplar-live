/**
 * Space Studio chat (POST /api/space-studio/chat): one model call for one of the four Space Studio configurations.
 * Order: validate -> plan check (stored subscription) -> Roblox link gate -> routing (explicit choice honored; escalation only when
 * the person allowed it and their plan covers it) -> Space Studio credit check (core credits.ts: Free 5-hour and weekly limits, paid
 * monthly allowance) and an output cap so the call can't cost more than is left -> OpenRouter call with the SERVED profile's own
 * system prompt and budgets -> the answer is used only if the provider says it came from the requested model -> the real cost is
 * charged in credits. Failed or discarded answers cost nothing.
 *
 * Effort (body.effort, default "medium") scales the served profile's budgets (effortBudgets): low = no reasoning and 60% of the
 * output; high = reasoning x1.5 and task budget x1.5; extra = reasoning x2, output x1.25, task budget x2; ultracode = extra's
 * budgets with a task budget x3 PLUS a second "self-review" call to the same served model, which checks the draft for bugs,
 * security problems and missed requirements and returns only the corrected final answer. Both calls are charged; the first is
 * capped so credits stay for the review, and the review is skipped (with a note) when credits or time run out.
 */
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { liveEnv } from "@/lib/orchestration/config";
import { creditBalance, creditsFor, effectivePlan, extractEscalation, modelAllowed, modelById, outOfCreditsReason, route, USD_PER_CREDIT, type CreditBalance, type CreditUsage, type ModelId, type ModelProfile, type Subscription, type Workload } from "./core";
import { costUsd, PROVIDERS, resolvedSlug } from "./providers";
import { addCredits, loadCreditUsage } from "./store";

export const CHAT_LIMITS = { maxMessages: 40, maxMessageChars: 20_000 } as const;
const WORKSPACES: Workload[] = ["roblox", "blender", "general"];
const HINT: Record<Workload, string> = {
  roblox: "Workspace: Roblox Studio (Luau). Assume the person is working in Roblox Studio.",
  blender: "Workspace: Blender (Python/bpy). Assume the person is working in Blender.",
  general: "Workspace: general. The person may be working in Roblox Studio or Blender.",
};

export const EFFORTS = ["low", "medium", "high", "extra", "ultracode"] as const;
export type Effort = (typeof EFFORTS)[number];

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatBody = { model: ModelId; messages: ChatMessage[]; workspace: Workload; allowEscalation: boolean; effort: Effort };
export type Budgets = ModelProfile["budgets"];

/** The served profile's budgets at this effort. Profiles without reasoning (Orbit, Nebula) only get the output scaling. */
export function effortBudgets(b: Budgets, effort: Effort): Budgets {
  switch (effort) {
    case "low":
      return { ...b, reasoningTokens: 0, maxOutputTokens: Math.floor(b.maxOutputTokens * 0.6) };
    case "medium":
      return b;
    case "high":
      return { ...b, reasoningTokens: Math.floor(b.reasoningTokens * 1.5), maxUsdPerTask: b.maxUsdPerTask * 1.5 };
    case "extra":
      return { ...b, reasoningTokens: b.reasoningTokens * 2, maxOutputTokens: Math.floor(b.maxOutputTokens * 1.25), maxUsdPerTask: b.maxUsdPerTask * 2 };
    case "ultracode":
      return { ...b, reasoningTokens: b.reasoningTokens * 2, maxOutputTokens: Math.floor(b.maxOutputTokens * 1.25), maxUsdPerTask: b.maxUsdPerTask * 3 };
  }
}

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
  const effort = b.effort === undefined || b.effort === null ? "medium" : EFFORTS.find((x) => x === b.effort);
  if (!effort) throw bad("effort must be low, medium, high, extra or ultracode.", "bad_effort");
  return { model: profile.id, messages, workspace, allowEscalation: b.allowEscalation === true, effort, profile };
}

type Completion = {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

export type ChatGate = { sub: Subscription | null; robloxRequired: boolean; robloxLinked: boolean; now?: number; /** Under 13 without an approved parental consent (./profile.ts). */ parentConsentRequired?: boolean };
export type ChatDeps = {
  fetch?: typeof fetch; env?: Record<string, string | undefined>; key?: string | null;
  loadCreditUsage?: (wsId: string, now: number) => Promise<CreditUsage>; addCredits?: (wsId: string, credits: number, now: number) => Promise<void>;
};

/** The smallest answer worth starting; below this the person is told to wait for a reset or pick a lighter model. */
const MIN_OUTPUT_TOKENS = 600;

/**
 * Output and reasoning caps so the call can't cost more than the credits left (or the profile's own per-task budget).
 * Throws 402 when what's left can't pay for the prompt plus a minimal answer.
 */
export function capForCredits(served: ModelProfile, promptChars: number, balance: CreditBalance, now: number, opts: { budgets?: Budgets; budgetUsd?: number; reasoningShare?: number } = {}) {
  const out = outOfCreditsReason(balance, now);
  if (out) throw new HttpError(402, out, "credits_exhausted", { resetsAt: balance.resetsAt, limitedBy: balance.limitedBy });
  const budgets = opts.budgets ?? served.budgets;
  const budgetUsd = Math.min(opts.budgetUsd ?? budgets.maxUsdPerTask, balance.remaining * USD_PER_CREDIT);
  const promptUsd = costUsd(served, Math.ceil(promptChars / 3), 0);
  const affordable = Math.floor(((budgetUsd - promptUsd) * 1e6) / PROVIDERS[served.id].usdPerMOutput);
  const maxTokens = Math.min(budgets.maxOutputTokens, affordable);
  if (maxTokens < MIN_OUTPUT_TOKENS) {
    throw new HttpError(402, `You have ${balance.remaining} credit${balance.remaining === 1 ? "" : "s"} left, not enough for ${served.name} on this conversation. Try Orbit, start a new chat, or wait for your limit to reset.`, "credits_low", { resetsAt: balance.resetsAt, limitedBy: balance.limitedBy });
  }
  // Reasoning shares the output budget; keep at least half of it for the answer (a quarter at high effort and above).
  const share = opts.reasoningShare ?? 0.5;
  const reasoning = budgets.reasoningTokens > 0 ? Math.min(budgets.reasoningTokens, Math.floor(maxTokens * share)) : 0;
  return { maxTokens, reasoning };
}

/** Everything before the provider call; exported so the gates can be tested without a network. */
export function planChat(body: ChatBody, gate: ChatGate) {
  const now = gate.now ?? Date.now();
  if (gate.parentConsentRequired) throw new HttpError(403, "A parent or guardian needs to approve your account first. We emailed them a link.", "parent_consent_required");
  if (!modelAllowed(gate.sub, now, body.model)) throw new HttpError(402, `${modelById(body.model)!.name} needs a higher Space Studio plan.`, "plan_required", { minPlan: modelById(body.model)!.minPlan });
  if (gate.robloxRequired && !gate.robloxLinked && body.workspace === "roblox") throw new HttpError(403, "Link your Roblox account to use the Roblox workspace.", "roblox_link_required");
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")!.content;
  return route(body.model, lastUser, { allowEscalation: body.allowEscalation, allowed: (id) => modelAllowed(gate.sub, now, id) });
}

const REVIEW_INSTRUCTION = "Review your draft answer above before it is shown. Check it carefully for bugs, security problems (especially anything a client could exploit) and requirements from the conversation that it missed or got wrong, and fix them. Reply with ONLY the corrected final answer, written for the person, with no notes about this review.";
/** The whole run (both ultracode passes) must finish inside the route's 300 s. */
const RUN_DEADLINE_MS = 285_000;
const MIN_REVIEW_MS = 20_000;

type CallResult = { text: string; promptTokens: number; completionTokens: number; usd: number; latencyMs: number };

/** One OpenRouter call to the served model. Throws 503 on failure or when another model answered (nothing is charged then). */
async function callModel(served: ModelProfile, slug: string, key: string, messages: { role: string; content: string }[], cap: { maxTokens: number; reasoning: number }, timeoutMs: number, doFetch: typeof fetch): Promise<CallResult> {
  const t0 = Date.now();
  const res = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": `Space Studio ${served.name}`, "http-referer": "https://keplar.one" },
    body: JSON.stringify({
      model: slug,
      messages,
      max_tokens: cap.maxTokens,
      ...(cap.reasoning > 0 ? { reasoning: { max_tokens: cap.reasoning } } : {}),
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(timeoutMs),
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
  return { text: (data.choices[0]!.message?.content ?? "").trim(), promptTokens, completionTokens, usd, latencyMs };
}

export async function runSpaceChat(ws: Workspace, body: ChatBody, gate: ChatGate, deps: ChatDeps = {}) {
  const r = planChat(body, gate);
  const served = r.served;
  const env = deps.env ?? process.env;
  const slug = resolvedSlug(served, env);
  const key = deps.key !== undefined ? deps.key : liveEnv().openRouterKey;
  if (!key) throw new HttpError(503, `${served.name} isn't available right now.`, "model_unavailable");
  const doFetch = deps.fetch ?? fetch;
  const charge = deps.addCredits ?? addCredits;
  const effort: Effort = body.effort ?? "medium";
  const budgets = effortBudgets(served.budgets, effort);
  const review = effort === "ultracode";
  const reasoningShare = effort === "high" || effort === "extra" || effort === "ultracode" ? 0.75 : 0.5;
  const started = Date.now();

  // Credits: what's left in every window that applies, and caps so this call can't cost more than that.
  const now = gate.now ?? Date.now();
  const plan = effectivePlan(gate.sub, now);
  const system = `${served.system}\n\n${HINT[body.workspace]}`;
  const promptChars = body.messages.reduce((n, m) => n + m.content.length, 0) + served.system.length;
  const before = creditBalance(plan, await (deps.loadCreditUsage ?? loadCreditUsage)(ws.id, now), now);
  const taskUsd = Math.min(budgets.maxUsdPerTask, before.remaining * USD_PER_CREDIT);
  // Ultracode: the draft may use a bit less than half of the run's budget, so the review (which reads the draft) can still be paid.
  const cap = capForCredits(served, promptChars, before, now, { budgets, budgetUsd: review ? taskUsd * 0.45 : taskUsd, reasoningShare });

  const first = await callModel(served, slug, key, [{ role: "system", content: system }, ...body.messages], cap, budgets.timeoutMs, doFetch);
  let credits = creditsFor(first.usd);
  if (credits > 0) await charge(ws.id, credits, now);
  let promptTokens = first.promptTokens;
  let completionTokens = first.completionTokens;
  let latencyMs = first.latencyMs;
  let text = first.text;
  let passes = 1;
  let note: string | null = null;

  if (review) {
    const left = { ...before, remaining: Math.max(0, before.remaining - credits) };
    const timeLeft = RUN_DEADLINE_MS - (Date.now() - started);
    let reviewCap: { maxTokens: number; reasoning: number } | null = null;
    if (timeLeft < MIN_REVIEW_MS) note = "The self-review pass was skipped: the first answer used the time available.";
    else {
      try {
        reviewCap = capForCredits(served, promptChars + first.text.length + REVIEW_INSTRUCTION.length, left, now, { budgets, budgetUsd: Math.max(0, taskUsd - first.usd), reasoningShare });
      } catch {
        note = "The self-review pass was skipped: not enough credits left for it.";
      }
    }
    if (reviewCap) {
      try {
        const second = await callModel(served, slug, key, [{ role: "system", content: system }, ...body.messages, { role: "assistant", content: first.text }, { role: "user", content: REVIEW_INSTRUCTION }], reviewCap, Math.min(budgets.timeoutMs, timeLeft), doFetch);
        const c2 = creditsFor(second.usd);
        if (c2 > 0) await charge(ws.id, c2, now);
        credits += c2;
        promptTokens += second.promptTokens;
        completionTokens += second.completionTokens;
        latencyMs += second.latencyMs;
        if (second.text) {
          text = second.text;
          passes = 2;
        } else note = "The self-review pass returned nothing, so this is the first draft.";
      } catch {
        note = "The self-review pass couldn't run, so this is the first draft. It wasn't charged.";
      }
    }
  }
  const remaining = Math.max(0, before.remaining - credits);

  const flagged = extractEscalation(text);
  const suggestTo: ModelId | null = r.suggestion?.to ?? (flagged.reason && served.escalateTo ? served.escalateTo : null);
  return {
    text: flagged.text,
    served: { id: served.id, name: served.name },
    requested: r.requested.id,
    escalated: r.escalated,
    escalation: { suggested: Boolean(suggestTo), to: suggestTo, reason: r.suggestion?.reason ?? (suggestTo ? flagged.reason : null) },
    effort,
    passes,
    note,
    usage: { promptTokens, completionTokens, credits, latencyMs },
    credits: { remaining, resetsAt: before.resetsAt, limitedBy: before.limitedBy },
  };
}
