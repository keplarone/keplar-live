/**
 * POST /api/keplar — runs Keplar-One and streams newline-delimited JSON
 * events (KeplarEvent) followed by the final answer.
 *
 * Live models run with KEPLAR_LIVE_MODELS=1 plus provider keys (see
 * docs/orchestration.md). Without them the route answers 503 "not set up yet";
 * nothing is faked. Casual chat ("hi", "thanks") is answered by one free model.
 *
 * Media (images, video frames) arrives as validated data URLs in `media`, is
 * passed to vision models for this request only, and is never written to disk,
 * the store or logs.
 */
import { recordQuestion } from "@/lib/faq/repo";
import { engineDeps } from "@/lib/orchestration/orchestrator";
import { coreRunOpts } from "@/lib/core/ask";
import { runCore } from "@/lib/core/run";
import { depthOf } from "@/lib/core/assess";
import { isCreatorQuestion, runCreator } from "@/lib/orchestration/creator";
import { activeOutputRule } from "@/lib/orchestration/output-rules";
import { pickConsciousnessAnswer, voiceTopic } from "@/lib/persona";
import { guardReply } from "@/lib/orchestration/identity-guards";
import { assumptionLine, pricingReply, understand, understandingBlock, type Understood } from "@/lib/orchestration/understand";
import { selfKnowledgeNote } from "@/lib/orchestration/self-knowledge";
import { followupPrompt, followupRead, resolveFollowup } from "@/lib/orchestration/followup";
import { commonSenseNote } from "@/lib/orchestration/common-sense";
import { scrubCreatorAges } from "@/lib/identity";
import { detectMood, humorNote, moodNote } from "@/lib/persona-tone";
import { pickCreatorAnswer } from "@/lib/orchestration/creator";
import { isSmallTalk } from "@/lib/orchestration/smalltalk";
import type { KeplarAnswer, KeplarEvent, KeplarRequest, RoutingStrategy, ToolUse } from "@/lib/orchestration/types";
import { makePlanner, runChatTools } from "@/lib/mcp/chat";
import { id as newId } from "@/lib/create/platform/ids";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { usedThisPeriod } from "@/lib/create/platform/compute";
import { extensionBalance } from "@/lib/create/platform/extensions";
import { canBuyExtension } from "@/lib/billing/extensions";
import { windowRoom, type WindowBlock } from "@/lib/create/platform/windows";
import { FREE_DAY_BUDGET_MESSAGE, freePaused, nextUtcMidnight } from "@/lib/create/platform/spend";
import { breakerLevel } from "@/lib/create/platform/breaker";
import { lighterRouting } from "@/lib/orchestration/breaker-routing";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { errorResponse } from "@/lib/create/platform/http";
import { enterUsage, inflight, reserveUnits, UsageLimitError } from "@/lib/create/platform/usage";
import { claimDaily, claimExtra, DailyLimitError, dailySubjects, readDeviceId, resetOf, type Claim } from "@/lib/usage/daily";
import { cancelRequested, claimTurn, finishTurn, readTurn, turnOwner, validTurnKey, type TurnRow } from "@/lib/orchestration/turn-recovery";
import { FREE_UPGRADE_HINT } from "@/lib/upgrade-copy";
import { clientIpOf } from "@/lib/create/platform/ratelimit";
import { busyMessage, CONSENSUS_CALLS, sharedPool } from "@/lib/orchestration/pool-governor";
import { callKey, callRoom } from "@/lib/usage/call-budget";
import { DEBATE_POLICY, FREE_DEBATE_CALLS } from "@/lib/orchestration/debate";
import { freeEndpointsMayTrain } from "@/lib/orchestration/config";
import { isSupportRequest } from "@/lib/orchestration/support";
import { FREE_DOCS_NOT_SENT } from "@/lib/privacy/free-gate";
import { clampHistory, limitsFor, sizeProblem, type LimitPlan } from "@/lib/orchestration/limits";
import { PLAN_ALLOWANCES, type PlanId } from "@/lib/orchestration/plans";
import { MEDIA_LIMITS, parseMedia } from "@/lib/orchestration/media";
import { createSettler, type RunState } from "@/lib/orchestration/settle";
import { isEmptyAnswer, noResponseEvent } from "@/lib/orchestration/no-response";
import { after } from "next/server";
import { memoryIntent } from "@/lib/memory/intent";
import { runMemoryIntent } from "@/lib/memory/actions";
import { listItems, memoryEnabled } from "@/lib/memory/repo";
import { memoryUsedCount } from "@/lib/memory/facts";
import { learnFromTurn, traceRouter } from "@/lib/learning/turn";
import { warmLearning } from "@/lib/learning/warm";
import { afterTurn, prepareContext, type TurnResult } from "@/lib/memory/turn";
import { recallIntent, recallReply, justAskedReply, validTz, RECALL_OFF, RECALL_SIGNED_OUT } from "@/lib/memory/recall";
import { listMeta, validChatId } from "@/lib/memory/digest";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { screenPrompt } from "@/lib/safety/screen";
import { recordSafetyEvent } from "@/lib/safety/store";
import { featureForAsk } from "@/lib/cost/features";
import { freeQuestionLimit } from "@/lib/cost/hooks";
import { applyFanout, beginRun, fanoutPolicy, loadInflight } from "@/lib/orchestration/fanout";
import { bumpFanout, fanoutUsedToday } from "@/lib/usage/fanout-day";
import { enterCostScope, newScope, recordRequestCost } from "@/lib/ops/request-cost";
import { flightFromStreamEvent, flightPush, flightRow, recordFlight, startFlight } from "@/lib/ops/flight";
import { EVENT_PROTOCOL, PROTOCOL_HEADER, stamper } from "@/lib/orchestration/event-contract";
import { requestIdOf } from "@/lib/ops/log";
import { clampDocs, docsBlock, docsFrom, freeAllowsDoc } from "@/lib/documents/chat-docs";
import { clampLiveResearch, LIVE_BRIEF_CHARS, liveModes, liveResearchBlock, liveResearchFrom, liveResearchOff, liveRouting } from "@/lib/research/live-request";
import { withReadSources } from "@/lib/attachments/sources";
import { validProjectId } from "@/lib/projects/repo";
import { projectContextFor } from "@/lib/projects/load";
import { projectItemCount } from "@/lib/projects/context";
import { personalContext } from "@/lib/personalize/turn";
import { validSpecialistId } from "@/lib/personalize/specialists";
import { answerLanguageNote } from "@/lib/i18n/answer-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Keplar Core's Thorough / Exhaustive depths can work for up to ~3 minutes in one request (src/lib/core/config.ts); quick answers are unaffected.
export const maxDuration = 300;

const MAX_PROMPT = 16_000; // absolute ceiling; each plan has its own lower cap (orchestration/limits.ts)
const STRATEGIES: RoutingStrategy[] = ["auto", "fast", "balanced", "thorough"];

function parse(body: unknown): KeplarRequest | string {
  if (!body || typeof body !== "object") return "Expected a JSON object.";
  const b = body as Record<string, unknown>;
  if (typeof b.prompt !== "string" || !b.prompt.trim()) return "prompt is required.";
  if (b.prompt.length > MAX_PROMPT) return `That message is too long (up to ${MAX_PROMPT.toLocaleString("en-US")} characters). Shorten it and try again.`; // shown in the answer card as-is
  const modes = (b.modes ?? {}) as Record<string, unknown>;
  const routing = (b.routing ?? {}) as Record<string, unknown>;
  const history = Array.isArray(b.history) ? b.history.slice(-40) : [];
  const attachments = Array.isArray(b.attachments) ? b.attachments.slice(0, 10) : [];
  // Images / video frames: untrusted. Types, magic bytes, sizes and counts are re-checked here.
  const media = parseMedia(b.media);
  if (typeof media === "string") return media;
  // Live Research from the Keplar One desktop app (live-request.ts): validated and capped; malformed data is dropped and the question runs as a web question.
  // Not even parsed while the kill switch is on.
  const live = liveResearchOff() ? undefined : liveResearchFrom(b.liveResearch);
  return {
    ...(live ? { liveResearch: live } : {}),
    ...(media ? { media } : {}),
    ...(validChatId(b.chatId) ? { chatId: b.chatId } : {}),
    ...(validProjectId(b.projectId) ? { projectId: b.projectId } : {}),
    ...(validTz(b.tz) ? { tz: validTz(b.tz) } : {}),
    prompt: b.prompt.trim(),
    history: history
      .filter((h): h is { role: "user" | "keplar"; text: string } => !!h && typeof h === "object" && typeof (h as { text?: unknown }).text === "string")
      // Earlier answers that stated the creators' age (older builds did) are scrubbed before they reach a model again (identity.ts).
      .map((h) => ({ role: h.role === "keplar" ? "keplar" : "user", text: scrubCreatorAges(h.text.slice(0, 8000)) })),
    ...(docsFrom(b.docs) ? { docs: docsFrom(b.docs) } : {}),
    attachments: attachments
      .filter((a): a is { name: string; size: number; type: string } => !!a && typeof a === "object" && typeof (a as { name?: unknown }).name === "string")
      .map((a) => ({ name: String(a.name).slice(0, 200), size: Math.max(0, Number(a.size) || 0), type: String(a.type ?? "").slice(0, 100) })),
    // Opt-in for connected-app tools in this conversation. Only a request; plan, grants and policy are checked server-side.
    ...(b.tools === true ? { tools: true } : {}),
    // Private chat: no memory read or written, no saved history, no learning from the turn (the client keeps it out of history too).
    ...(b.private === true ? { private: true } : {}),
    // The person's saved specialist for this chat: only an id, looked up in their own workspace server-side.
    ...(validSpecialistId(b.specialistId) ? { specialistId: b.specialistId } : {}),
    // Answer recovery: the send's random key (turn-recovery.ts). A retry after a dropped connection reuses it.
    ...(validTurnKey(b.turnKey) ? { turnKey: b.turnKey } : {}),
    // The person's modes as sent. With Live Research the route switches them to liveModes() once it keeps the brief, so a brief it drops
    // (kill switch, plan clamp) leaves the question exactly as asked.
    modes: { web: modes.web === true, deepResearch: modes.deepResearch === true, create: modes.create === true, agent: modes.agent === true, ...(modes.debate === true ? { debate: true } : {}), ...(modes.reason === true ? { reason: true } : {}) },
    routing: {
      strategy: STRATEGIES.includes(routing.strategy as RoutingStrategy) ? (routing.strategy as RoutingStrategy) : "auto",
      maxModels: typeof routing.maxModels === "number" ? Math.min(6, Math.max(1, Math.round(routing.maxModels))) : undefined,
      excludeProviders: Array.isArray(routing.excludeProviders) ? routing.excludeProviders.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
      preferOpenWeights: routing.preferOpenWeights === true,
      excludeProviderRetention: routing.excludeProviderRetention === true,
      depth: depthOf(routing.depth),
    },
  };
}

const TOO_LARGE = "The attachments are too large to send. Remove one, or use a smaller image or a shorter video.";

export async function POST(request: Request) {
  // Vercel caps request bodies at ~4.5 MB; the composer compresses media well below it.
  if (Number(request.headers.get("content-length") ?? 0) > MEDIA_LIMITS.maxBodyBytes) return Response.json({ error: TOO_LARGE }, { status: 413 });
  let json: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MEDIA_LIMITS.maxBodyBytes) return Response.json({ error: TOO_LARGE }, { status: 413 });
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const req = parse(json);
  if (typeof req === "string") return Response.json({ error: req }, { status: 400 });

  // Server-side account context: plan, Usage ledger, rate limits, spend guard.
  let ws;
  try {
    ws = await currentWorkspace(request, { allowAnonymous: true, team: true });
    assertSameAccount(request, ws.userId);
    await limitRequest(request, "keplar", { perIp: 30, perAccount: ws.entitlements.rpm, accountId: ws.anonymous ? null : ws.id });
  } catch (e) {
    return errorResponse(e);
  }
  // Answer recovery (src/lib/orchestration/turn-recovery.ts), read-only here, before any daily question is taken or anything is charged:
  // a turn that already finished is replayed (no second run, no second charge); one still running gets 409 and the browser polls for it.
  // Never for private chats, API keys or embeds; signed out only with the signed device cookie.
  const turnOwnerKey = req.turnKey && !req.private && ws.via !== "api" && ws.via !== "embed" ? turnOwner(ws, ws.anonymous ? readDeviceId(request.headers.get("cookie")) : null) : null;
  let turn: { owner: string; key: string } | null = turnOwnerKey && req.turnKey ? { owner: turnOwnerKey, key: req.turnKey } : null;
  if (turn) {
    try {
      const seen = await readTurn(turn.owner, turn.key);
      if (seen?.status === "done" && seen.answer) return replayTurn(seen);
      if (seen?.status === "running" && Date.now() - Date.parse(seen.updatedAt) < 6 * 60_000) return turnRunning();
    } catch (e) {
      console.error("[turns] check failed:", e instanceof Error ? e.name : "error");
      turn = null; // recovery is off for this request; the question still runs normally
    }
  }
  // Memory commands ("forget that", "erase my memory", "remember that ...") and recall questions ("what did we talk about last
  // time?", "what did I just ask?") are answered here, before the engine: no model, no charge. Signed-out users get a plain
  // "needs an account" reply and nothing is touched.
  const history = req.history ?? [];
  // Personal memory is never read or written inside a team workspace (it would be shared with the whole team) or for an API-key request (stateless).
  const personalAllowed = !ws.anonymous && !ws.team && ws.via !== "api" && ws.via !== "embed";
  const noPersonal = Boolean(ws.team) || ws.via === "api" || ws.via === "embed" || req.private === true;
  const intent = noPersonal ? null : memoryIntent(req);
  const recall = intent || noPersonal ? null : recallIntent(req);
  let memoryReply: string | null = null;
  if (intent) {
    try {
      memoryReply = await runMemoryIntent(ws, intent);
    } catch (e) {
      return errorResponse(e);
    }
  } else if (recall?.kind === "just-asked") {
    memoryReply = justAskedReply(history);
  } else if (recall) {
    try {
      if (ws.anonymous) memoryReply = RECALL_SIGNED_OUT;
      else if (!(await memoryEnabled(ws.id))) memoryReply = RECALL_OFF;
      else memoryReply = recallReply(recall.when, await listMeta(ws.id), { currentId: req.chatId, tz: req.tz });
    } catch (e) {
      console.error("[memory] recall failed:", e instanceof Error ? e.name : "error");
      memoryReply = "I couldn't read your saved chats just now. Please try again in a moment.";
    }
  }
  // First-line input screen (src/lib/safety/screen.ts): obviously illegal or severely harmful requests get a fixed refusal, and a
  // self-harm request for a method gets the fixed caring crisis reply. No model, no charge. Plain distress is NOT screened out: it
  // continues to the supportive path below. Only the category is logged, never the prompt.
  if (memoryReply === null) {
    const screened = screenPrompt(req.prompt);
    if (screened.action !== "allow") {
      memoryReply = screened.reply;
      void recordSafetyEvent({ category: screened.category, action: screened.action, plan: ws.plan, signedIn: !ws.anonymous });
    }
  }
  // A standing output rule the person set ("say nothing more and nothing less, just say Yess") is enforced here, in code: while it
  // is active the reply is that literal text, plain, with no model, no metadata card and no charge (output-rules.ts).
  if (memoryReply === null && !req.attachments?.length && !req.media) {
    const rule = activeOutputRule(history, req.prompt);
    if (rule) memoryReply = rule.text;
  }
  // "Are you human?" and "are you conscious / sentient / alive?" get fixed, code-enforced replies (identity-guards.ts): no model, no charge.
  let extra: Partial<KeplarAnswer> | undefined;
  if (memoryReply === null && !req.attachments?.length && !req.media) {
    const fixed = guardReply(req);
    if (fixed) memoryReply = fixed;
  }
  // A direct "are you AGI / superintelligent?" gets an instant answer in Keplar's voice that is candid about not knowing (persona.ts): no model, no charge.
  if (memoryReply === null) {
    const topic = voiceTopic(req);
    if (topic) memoryReply = pickConsciousnessAnswer(topic);
  }
  // Signed in with memory on: the person's saved notes, used to understand the request below.
  let memoryOn = false;
  let notes: string[] = [];
  // Shared team projects still bring their own saved material (each project has its own switch); personal memory does not.
  const projectsOn = () => (ws.team ? true : memoryOn);
  if (!ws.anonymous && !noPersonal) {
    try {
      memoryOn = await memoryEnabled(ws.id);
      if (memoryOn) notes = (await listItems(ws.id)).map((i) => i.text);
    } catch {
      /* memory is optional: the question still runs without it */
    }
  }
  // Query understanding (understand.ts): short or fragmentary messages ("who made", "chatgpt", "keplar one", "pricing", "claude vs you") are
  // resolved with the conversation, what Keplar knows about itself and the person's notes into the best reading, stated as an assumption.
  // Product facts (who made Keplar, Keplar's pricing) are instant; unresolved fragments reach the models to infer a useful reading.
  const askedPrompt = req.prompt;
  let understood: Understood | null = null;
  let assumptionPrefix = "";
  if (memoryReply === null && !req.attachments?.length && !req.media && !req.modes?.web && !req.modes?.deepResearch && !req.modes?.create && !req.modes?.agent && !isSmallTalk(req) && !isCreatorQuestion(req)) {
    try {
      understood = understand({ prompt: req.prompt, history, facts: notes });
    } catch (e) {
      console.error("[understand] failed:", e instanceof Error ? e.name : "error");
    }
    if (understood) {
      const note = understood.assumption ? `${assumptionLine(understood.assumption)}\n\n` : "";
      if (understood.intent === "creator") {
        memoryReply = `${note}${pickCreatorAnswer()}`;
        extra = { interpretation: understood.assumption ?? undefined };
      } else if (understood.intent === "pricing") {
        memoryReply = `${note}${pricingReply()}`;
        extra = { interpretation: understood.assumption ?? undefined };
      } else if (understood.intent === "playful" && understood.play?.fixed) {
        // A turn of knock-knock or a classic riddle: fixed text, instant, no model, no charge.
        memoryReply = understood.play.fixed;
      } else if (understood.assumption) {
        assumptionPrefix = note;
      }
      if (understood.rewritten && memoryReply === null) req.prompt = understood.rewritten;
      if (memoryReply === null) req.understanding = { intent: understood.intent, crossCheck: understood.crossCheck, mood: understood.mood, interpretation: understood.assumption ?? understood.contextRead ?? null, ...(understood.play ? { play: understood.play } : {}) };
    }
  } else if (memoryReply === null && !req.attachments?.length && !req.media && (req.modes?.web || req.modes?.deepResearch) && !req.modes?.create && !req.modes?.agent) {
    // Web / Deep Research stay on across messages, so a clarification ("twitter" after "do deep research on x") arrives in the same mode:
    // it continues that request on the clarified subject instead of researching the bare word (followup.ts).
    const f = resolveFollowup(req.prompt, history);
    if (f) {
      req.prompt = followupPrompt(f, askedPrompt);
      req.understanding = { intent: "followup", crossCheck: false, mood: detectMood(askedPrompt), interpretation: followupRead(f, askedPrompt) };
    }
  }
  // "Who created Keplar?" is a fixed answer: no model, no keys needed, no charge, no allowance check.
  const creator = memoryReply !== null || isCreatorQuestion(req);
  const keyTier = ws.plan === "free" ? "free" : "paid";
  const deps = engineDeps({ keyTier });
  if (!deps && !creator) {
    return Response.json({ error: "Keplar isn't connected to its models yet. Please check back soon.", code: "not_configured" }, { status: 503 });
  }
  const smallTalk = creator || isSmallTalk(req) || req.understanding?.intent === "playful";
  const limits = limitsFor(ws.plan as LimitPlan);
  // Live Research only for a real question in the app: never for API keys or the embed widget (they never send it; this is defence in depth),
  // never for fixed replies, never while KEPLAR_LIVE_RESEARCH_OFF=1. Then clamped to the plan's share at whole-source boundaries (the fence
  // stays closed).
  // The desktop sent pages (even ones dropped while the kill switch is on, which parse() doesn't read).
  const sentLive = Boolean(req.liveResearch) || Boolean((json as { liveResearch?: unknown } | null)?.liveResearch);
  if (req.liveResearch && (liveResearchOff() || creator || smallTalk || memoryReply !== null || ws.via === "api" || ws.via === "embed")) delete req.liveResearch;
  if (req.liveResearch) {
    const clamped = clampLiveResearch(req.liveResearch, LIVE_BRIEF_CHARS[ws.plan as LimitPlan] ?? LIVE_BRIEF_CHARS.free);
    if (clamped) req.liveResearch = clamped;
    else delete req.liveResearch;
  }
  // Kept: the pages are already read, so it is a web question (no server Deep Research, Debate, Create or Agent on top). Dropped: the
  // question runs as asked, except Deep Research on a plan without it (the desktop offered it there), which becomes a web question.
  if (req.liveResearch) req.modes = liveModes(req.modes);
  else if (sentLive && req.modes?.deepResearch && !PLAN_ALLOWANCES[ws.plan as PlanId]?.deepResearch) req.modes = { ...req.modes, web: true, deepResearch: false };
  // Plan size caps: prompt, history, attachments, images (cheaper plans get smaller caps).
  const tooBig = creator ? null : sizeProblem(req, limits, ws.plan as LimitPlan);
  if (tooBig) return Response.json({ error: tooBig, code: "too_large" }, { status: 413 });
  if (req.history?.length) req.history = clampHistory(req.history, limits.maxHistoryChars);
  // Privacy gate (src/lib/privacy/free-gate.ts): Free requests go to free hosts that MAY log and train on what they receive, so an attached
  // document's text is never sent there. Refused up front, before anything is counted, with the reason.
  const mayTrain = freeEndpointsMayTrain();
  if (!creator && mayTrain && ws.plan === "free" && req.docs?.some((d) => !freeAllowsDoc(d))) {
    return Response.json({ error: FREE_DOCS_NOT_SENT, code: "docs_not_on_free", plan: ws.plan }, { status: 422, headers: { "cache-control": "no-store" } });
  }
  // Free: every request shares ONE OpenRouter key limited by requests (20/min, 50 or 1000/day). Before anything is counted against the
  // person, check the pool (pool-governor.ts): full answer, a single-model answer when it is running low, or a friendly "busy" with Retry-After.
  let singleBy: "pool" | "calls" | null = null;
  // Debate (BETA, debate.ts) asked for but not run for a reason decided here (Free limits, or a message that isn't a question): said on screen.
  let debateOff: string | null = null;
  if (req.modes?.debate && smallTalk) { req.modes.debate = false; debateOff = "That reads as a quick chat message rather than a question, so it was answered without a debate."; }
  if (keyTier === "free" && !creator && deps) {
    try {
      // Free Debate: 2 free models x 2 rounds + 1 combined review = 5 requests from the shared key, only while the pool is comfortable.
      if (req.modes?.debate) {
        const dp = await sharedPool().planFor(FREE_DEBATE_CALLS);
        if (dp.mode !== "full" || dp.status.level !== "normal") { req.modes.debate = false; debateOff = "Free capacity is limited right now, so this was answered without a debate. Try Debate again later."; }
      }
      const pp = await sharedPool().planFor(smallTalk ? 1 : CONSENSUS_CALLS);
      if (pp.mode === "busy") {
        return Response.json({ error: busyMessage(pp.retryAfterSec), code: "free_busy", retryAfterSec: pp.retryAfterSec, plan: ws.plan }, { status: 503, headers: { "retry-after": String(pp.retryAfterSec), "cache-control": "no-store" } });
      }
      if (pp.mode === "single" && !smallTalk) singleBy = "pool";
    } catch (e) {
      console.error("[pool] status unavailable:", e instanceof Error ? e.name : "error"); // a counter hiccup never blocks an answer
    }
  }
  // Per-user burst, daily, daily-spend and concurrency guards (the creator reply costs nothing and is exempt).
  let gate: Awaited<ReturnType<typeof enterUsage>> | null = null;
  if (!creator) {
    try {
      gate = await enterUsage(request, ws, { countsDaily: true });
    } catch (e) {
      if (e instanceof UsageLimitError) {
        return Response.json({ error: e.message, code: e.code === "daily" || e.code === "daily_ip" || e.code === "daily_spend" ? "daily_limit" : "rate_limited", plan: ws.plan }, { status: 429, headers: { "retry-after": String(e.retryAfterSec) } });
      }
      return errorResponse(e);
    }
  }
  // Shared daily budget (spend.ts): Free pauses until 00:00 UTC. This is not the person's questions and not monthly credits.
  // Refuse before a question is counted, so the meter stays where it was. Paid plans are not paused here.
  if (ws.plan === "free" && !ws.admin && !smallTalk && (await freePaused())) {
    gate?.release();
    const resetsAt = nextUtcMidnight();
    const secs = Math.max(1, Math.ceil((Date.parse(resetsAt) - Date.now()) / 1000));
    return Response.json(
      { error: FREE_DAY_BUDGET_MESSAGE, code: "daily_budget", resetsAt, plan: ws.plan },
      { status: 429, headers: { "retry-after": String(secs), "cache-control": "no-store" } },
    );
  }
  // Free plan: take one of today's questions (exactly one per question; given back below if no answer reaches the screen).
  let dailyClaim: Claim | null = null;
  // Free: the person's own provider-request budget for the day (a question can cost several requests; usage/call-budget.ts). Counted by the registry per request sent.
  let callBudget: { key: string; limit: number } | null = null;
  if (ws.plan === "free" && !ws.admin) {
    try {
      const subjects = dailySubjects({ workspaceId: ws.id, anonymous: ws.anonymous, ip: clientIpOf(request), cookie: request.headers.get("cookie"), secure: new URL(request.url).protocol === "https:" || (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"), limit: await freeQuestionLimit(ws.anonymous, limits.dailyRequests), ipLimit: limits.dailyIpRequests });
      dailyClaim = await claimDaily(subjects);
      // Free Debate counts as DEBATE_POLICY.free.freeQuestions questions. Not enough left: answered normally with the one already taken.
      if (req.modes?.debate && !ws.admin) {
        const all = await claimExtra(subjects, dailyClaim, DEBATE_POLICY.free.freeQuestions - 1);
        if (all) dailyClaim = all;
        else { req.modes.debate = false; debateOff = `A Free Debate counts as ${DEBATE_POLICY.free.freeQuestions} questions and you have 1 left today, so this was answered without a debate.`; }
      }
      if (limits.dailyProviderCalls && !creator && keyTier === "free") {
        callBudget = { key: callKey(subjects.primary), limit: limits.dailyProviderCalls };
        const room = await callRoom(subjects.primary, limits.dailyProviderCalls).catch(() => null);
        if (room && room.left < 1) {
          await dailyClaim.release();
          gate?.release();
          const secs = Math.max(1, Math.ceil((Date.parse(resetOf()) - Date.now()) / 1000));
          return Response.json({ error: `You've used today's Free model requests (${room.limit}). They reset at 00:00 UTC. ${FREE_UPGRADE_HINT}`, code: "daily_calls", plan: ws.plan }, { status: 429, headers: { "retry-after": String(secs), "cache-control": "no-store" } });
        }
        // Not enough left for a two-model answer: one model answers instead (the request count is what is scarce, not questions).
        if (room && room.left < CONSENSUS_CALLS && !smallTalk && !singleBy) singleBy = "calls";
        // Not enough left for a debate: answered normally, and the extra question is given back.
        if (req.modes?.debate && room && room.left < FREE_DEBATE_CALLS) {
          req.modes.debate = false;
          debateOff = `You're close to today's Free model-request limit (a Debate uses ${FREE_DEBATE_CALLS}), so this was answered without a debate.`;
          await dailyClaim.release();
          dailyClaim = await claimDaily(subjects);
        }
      }
    } catch (e) {
      gate?.release();
      if (e instanceof DailyLimitError) return Response.json({ error: e.message, code: "daily_limit", plan: ws.plan, daily: e.meter }, { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((Date.parse(e.meter.resetsAt) - Date.now()) / 1000))), "cache-control": "no-store" } });
      return errorResponse(e);
    }
  }
  req.plan = ws.plan;
  // Global circuit breaker: as the day's spend nears the cap, answers use fewer, lighter models (the Usage meter says so).
  // Fan-out control (fanout.ts): per-plan daily cap on full panels and an instance-load cap, applied on top of the breaker; the strictest wins.
  let degradedBy: "daily_fanout" | "load" | "breaker" | "pool" | "calls" | null = null;
  let fanoutCap: number | null = null;
  if (!creator && !smallTalk) {
    const level = await breakerLevel();
    const used = ws.plan === "free" || ws.admin ? 0 : await fanoutUsedToday(ws.id);
    const policy = fanoutPolicy({ plan: ws.plan as LimitPlan, usedToday: used, loadInflight: loadInflight(), admin: ws.admin });
    // Live Research: the desktop's depth picks the panel (fast: one model; standard: balanced; deep: thorough) unless the person chose a strategy.
    // Free answers with one model: its combined free writer never reads the brief (free-merged.ts), the single panel model does.
    if (req.liveResearch) req.routing = ws.plan === "free" ? { ...(req.routing ?? {}), strategy: "fast", maxModels: 1 } : liveRouting(req.liveResearch.depth, req.routing);
    req.routing = applyFanout(lighterRouting(req.routing, level), policy);
    // Free pool running low: one model answers (strictest cap wins).
    if (singleBy) req.routing = { ...(req.routing ?? {}), strategy: "fast", maxModels: 1 };
    // Reason (paid plans): one more model and the thorough panel; Free keeps its free roster and gets the step-by-step framing only.
    if (req.modes?.reason && ws.plan !== "free" && !singleBy) req.routing = { ...(req.routing ?? {}), strategy: "thorough" };
    fanoutCap = req.routing?.maxModels ?? null;
    degradedBy = policy.reason ?? (level !== "normal" ? "breaker" : singleBy);
    if (ws.plan !== "free" && !ws.admin) void bumpFanout(ws.id);
  }
  // Context for the models. Everyone: the conversation so far (recent turns word for word, older ones shortened).
  // Signed in with memory on: also long-term notes, summaries of the last chats (new chats), and relevant past-chat snippets.
  // All of it is fenced data, token-capped, built here (never copied from the client), and costs no credits.
  let usedMemory = 0;
  let withheld = false;
  if (!creator && !smallTalk) {
    try {
      // Saved notes, past-chat summaries and snippets stay home whenever the request will be answered by free hosts that may train (Free plan; and an
      // emotional-support reply on any plan, which also runs on the free roster). The conversation so far still goes: it is the question's own context.
      withheld = !creator && mayTrain && (ws.plan === "free" || isSupportRequest(req));
      const preface = await prepareContext({ workspaceId: ws.id, memory: memoryOn && !withheld, history, prompt: askedPrompt, chatId: req.chatId, tz: req.tz, maxChars: Math.min(limits.maxHistoryChars, 16_000) });
      // The project the chat sits in (signed in, memory on, the project's own switch on): its instructions, notes and file passages. Same gate as above.
      const projectPart = ws.anonymous ? "" : await projectContextFor({ workspaceId: ws.id, projectId: req.projectId, prompt: askedPrompt, allowed: !withheld, accountMemoryOn: projectsOn() });
      if (preface || projectPart) req.memory = projectPart ? `${projectPart}\n\n${preface || "The question:\n"}` : preface;
      usedMemory = memoryUsedCount(preface) + (projectPart ? projectItemCount(projectPart) : 0);
    } catch {
      /* the question still runs without the extra context */
    }
    // How to read a fragmentary message, how to meet the person's mood, and whether humor fits: guidance ahead of the question (never shown).
    const mood = understood ? understood.mood : detectMood(askedPrompt);
    // Questions about Keplar itself ("can you build a website?", "do you have an API?") get the product's own fact sheet.
    const guidance = [understood ? understandingBlock(understood, askedPrompt) : "", selfKnowledgeNote(understood?.followup?.question ?? askedPrompt), commonSenseNote(understood?.followup?.question ?? askedPrompt), moodNote(mood), humorNote(askedPrompt, mood), answerLanguageNote(request.headers.get("cookie"))].filter(Boolean).join("\n");
    if (guidance) req.memory = `${guidance}\n\n${req.memory ?? "The question:\n"}`;
    // Answer preferences, the chosen specialist and Reason framing (src/lib/personalize/turn.ts). Fenced data; Free keeps "About you" and knowledge home.
    const personal = await personalContext({ workspaceId: ws.id, personalAllowed, withhold: mayTrain && ws.plan === "free", specialistId: req.specialistId, reason: req.modes?.reason === true }).catch(() => null);
    if (personal?.block) req.memory = `${personal.block}\n\n${req.memory ?? "The question:\n"}`;
  }
  // Attached documents: their text goes ahead of the question as material (data, not instructions), for this message only.
  // Read links (public pages) and the transcript of the person's own attached video/audio also go when other context is withheld (Free): the media itself already does.
  const sendDocs = withheld ? req.docs?.filter(freeAllowsDoc) : req.docs;
  if (sendDocs?.length) req.memory = `${docsBlock(clampDocs(sendDocs, ws.plan === "free"))}\n\n${req.memory ?? "The question:\n"}`;
  // Live Research: the desktop's brief goes first, fenced as data. In memory before the engine classifies, so the estimate and every cost cap count it.
  if (req.liveResearch) req.memory = `${liveResearchBlock(req.liveResearch)}\n\n${req.memory ?? "The question:\n"}`;
  if (!smallTalk && ws.plan !== "free") req.limits = { maxRequestUsd: limits.maxRequestUsd, maxDeepResearchUsd: limits.maxDeepResearchUsd };
  // Rolling 5-hour / weekly limit (Plus/Pro). When it binds tighter than the monthly credits, a stop says so, with the reset time.
  let windowBound: WindowBlock | null = null;
  try {
    if (smallTalk) req.computeRemaining = Infinity; // casual chat is never metered and never blocked by an allowance
    // Free has no monthly credit balance. A shared-budget pause is refused above; never report it as "0 credits left this month".
    else if (ws.plan === "free") req.computeRemaining = Infinity;
    else {
      const monthly = Math.max(0, ws.entitlements.monthlyUnits - (await usedThisPeriod(ws)) - (gate ? inflight(gate.wsKey).units : 0));
      const room = await windowRoom(ws);
      const inflightUnits = gate ? inflight(gate.wsKey).units : 0;
      const windowLeft = Math.max(0, room.remaining - inflightUnits);
      if (room.binding && windowLeft < monthly) windowBound = room.binding;
      // Bought extension credits (limit_extensions) add to what is left once the allowance or a window runs out. The per-request cap still applies.
      const extra = ws.admin || !canBuyExtension(ws.plan) ? 0 : await extensionBalance(ws.id);
      req.computeRemaining = Math.min(monthly, windowLeft) + extra;
    }
  } catch (e) {
    gate?.release();
    await dailyClaim?.release();
    return errorResponse(e);
  }

  // Answer recovery: the atomic claim, after every early exit above (so a refused request never leaves a "running" turn behind).
  // A reconnect that raced the first send gets the replay or the 409 here, and gives back what it took.
  if (turn) {
    try {
      const c = await claimTurn(turn.owner, turn.key);
      if (c.kind !== "fresh") {
        gate?.release();
        await dailyClaim?.release();
        return c.kind === "replay" ? replayTurn(c.row) : turnRunning();
      }
    } catch (e) {
      console.error("[turns] claim failed:", e instanceof Error ? e.name : "error");
      turn = null;
    }
  }
  const recoverable = turn !== null;

  const encoder = new TextEncoder();
  const stamp = stamper(); // the event contract: protocol version and a sequence per response
  const abort = new AbortController();
  // The browser went away. A recoverable turn keeps running so its answer is saved (the person can come back to it); only a Stop
  // ends it. Anything else stops as before.
  // Stop on a recoverable turn: the browser posts a cancel (/api/keplar/turn) and the run checks for it every 2 s from the start, not only
  // after a disconnect: on Vercel the function is not told when the browser closes the stream (measured on production 2026-10-12: a
  // stopped answer ran to the end), so waiting for a disconnect would never stop it.
  let clientGone = false;
  let cancelWatch: ReturnType<typeof setInterval> | null = null;
  const checkCancel = () => {
    const t = turn;
    if (!t || abort.signal.aborted) return;
    void cancelRequested(t.owner, t.key).then((yes) => { if (yes && !abort.signal.aborted) { flightPush(costScope.flight, { k: "cancel", code: "stop_requested" }); abort.abort(); } }).catch(() => undefined);
  };
  if (recoverable) cancelWatch = setInterval(checkCancel, 2000);
  const onClientGone = () => {
    if (clientGone) return;
    clientGone = true;
    if (!recoverable || !turn) { abort.abort(); return; }
    flightPush(costScope.flight, { k: "note", code: "client_gone_recoverable" });
    checkCancel(); // when the disconnect is seen (local runtimes), a Stop is honoured at once
  };
  request.signal.addEventListener("abort", onClientGone, { once: true });
  let finishRun: () => void = () => undefined;
  const runDone = new Promise<void>((r) => { finishRun = r; });
  let turnAnswer: unknown;
  let turnError: { code: string; message: string } | undefined;

  // The engine reports whether paid calls were sent, so a stopped or failed run is still billed.
  // A run where no model responded is never billed (run.noResponse).
  const run: RunState = { started: false, settled: false, plannedUnits: 0 };
  if (deps) deps.run = run;
  // Router learning: note which question type and panel this turn got (inert when learning is off).
  const traced = deps ? traceRouter(deps.router) : null;
  if (deps && traced) deps.router = traced.router;
  const startedAt = Date.now();
  const costScope = newScope();
  costScope.flight = startFlight(startedAt); // the request's execution timeline (ops/flight.ts): stages, provider requests, outcome; no text
  let flightError: string | null = null;
  let flightLimited = false;
  let flightFirst = false;
  if (callBudget) costScope.callBudget = callBudget;
  costScope.tag = { feature: featureForAsk(req), userId: ws.anonymous ? null : ws.id, plan: ws.plan, admin: Boolean(ws.admin) }; // cost meter attribution (src/lib/cost)
  const endRun = creator || smallTalk ? () => undefined : beginRun();
  let billedUnits = 0;
  let answeredOk = false;
  const reqIdForCost = requestIdOf(request);
  let releaseReserved: (() => void) | null = null;
  const settle = createSettler(ws, run);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      enterCostScope(costScope); // every provider call made below is attributed to this request (ops/request-cost.ts)
      const send = (e: KeplarEvent) => {
        flightFromStreamEvent(costScope.flight, e as { type: string } & Record<string, unknown>);
        if (!flightFirst && (e.type === "delta" || e.type === "answer")) { flightFirst = true; flightPush(costScope.flight, { k: "note", code: "first_output" }); }
        if (e.type === "error") { flightError = e.code; turnError = { code: e.code, message: e.message }; }
        if (e.type === "limit") flightLimited = true;
        if (e.type === "answer") turnAnswer = e.answer; // what recovery replays: the answer exactly as it was sent
        if (clientGone) return; // the browser left: the run carries on (recoverable) and its answer is saved below
        try {
          controller.enqueue(encoder.encode(JSON.stringify(stamp(e)) + "\n")); // v + seq (event-contract.ts)
        } catch {
          onClientGone(); // the stream closed under us: same as a disconnect
        }
      };
      const closeStream = () => { try { controller.close(); } catch { /* the browser already closed it */ } };
      // Free: a question only keeps its count if an answer reached the screen. Failures, "no reliable answer", no model
      // responding and stops all give it back, and the meter is re-sent so the UI shows the true number.
      let answered = false;
      let dailySettled = false;
      const finishDaily = async (notify: boolean) => {
        if (!dailyClaim || dailySettled) return;
        dailySettled = true;
        if (answered) return;
        const meter = await dailyClaim.release().catch(() => null);
        if (notify && meter) { try { send({ type: "daily", daily: meter }); } catch { /* the stream is already closed */ } }
      };
      if (dailyClaim) send({ type: "daily", daily: dailyClaim.meter });
      if (debateOff) send({ type: "debate", debate: { phase: "skipped", reason: debateOff } });
      let toolUses: ToolUse[] = [];
      let prefixed = false;
      try {
        // Connected-app tools (opt-in per conversation, paid plans, signed in). Bounded pre-stage; never blocks the answer.
        if (req.tools === true && deps && !creator && !smallTalk && !ws.anonymous && ws.plan !== "free") {
          try {
            const mp = makePlanner(deps, ws, req);
            const tr = await runChatTools({ ws, prompt: req.prompt, context: req.memory, planner: mp?.planner ?? null, emit: (use) => send({ type: "tool", use }), signal: abort.signal, turnId: newId("turn") });
            toolUses = tr.uses;
            if (tr.block) req.memory = tr.block + (req.memory ?? "The question:\n");
            const spent = tr.units + (mp?.units() ?? 0);
            if (spent > 0 && typeof req.computeRemaining === "number" && Number.isFinite(req.computeRemaining)) req.computeRemaining = Math.max(0, req.computeRemaining - spent);
          } catch (e) {
            console.error("[keplar] tools failed:", e instanceof Error ? e.name : "error");
          }
        }
        await warmLearning();
        for await (let event of memoryReply !== null ? runCreator(undefined, memoryReply, extra) : creator || !deps ? runCreator() : runCore(req, deps, abort.signal, coreRunOpts({ ws, req, askedPrompt, noPersonal, defer: (p) => { try { after(p); } catch { /* outside a request scope */ } } }))) {
          if (!releaseReserved && run.plannedUnits > 0 && gate && !smallTalk) releaseReserved = reserveUnits(gate.wsKey, run.plannedUnits);
          // Final-empty path: an "answer" with no text or no responding model is a no-response run, not an answer. Not charged.
          if (event.type === "answer" && !smallTalk && isEmptyAnswer(event.answer)) {
            run.noResponse = true;
            event = noResponseEvent(ws.plan);
          }
          if (event.type === "error" && event.code === "no_response") run.noResponse = true;
          // How a short message was read: an italic first line, added in code (never left to a model).
          if (assumptionPrefix && event.type === "delta" && !prefixed) { prefixed = true; event = { ...event, text: assumptionPrefix + event.text }; }
          if (assumptionPrefix && event.type === "answer" && !event.answer.smalltalk && event.answer.markdown) {
            event = { ...event, answer: { ...event.answer, markdown: assumptionPrefix + event.answer.markdown, interpretation: understood?.assumption ?? undefined } };
          }
          // The creators' age or birth date is never published, whatever a model wrote (identity.ts).
          if (event.type === "answer" && event.answer.markdown) {
            const clean = scrubCreatorAges(event.answer.markdown);
            if (clean !== event.answer.markdown) event = { ...event, answer: { ...event.answer, markdown: clean } };
          }
          if (event.type === "answer") { answered = true; answeredOk = true; }
          // Said plainly on the card: Free capacity (or the person's own request budget) was low, so one model answered instead of two.
          if (event.type === "answer" && singleBy && !event.answer.smalltalk) {
            const why = singleBy === "pool" ? "Free capacity is limited right now, so one model answered instead of two." : "You're close to today's Free model-request limit, so one model answered instead of two.";
            event = { ...event, answer: { ...event.answer, reasoning: `${event.answer.reasoning ? `${event.answer.reasoning} ` : ""}${why}` } };
          }
          if (event.type === "answer" && toolUses.length) event = { ...event, answer: { ...event.answer, tools: toolUses } };
          // Links Keplar read for this answer are listed first in Sources, with their address (src/lib/attachments/sources.ts).
          if (event.type === "answer" && !event.answer.smalltalk && req.docs?.some((x) => x.source === "link")) event = { ...event, answer: withReadSources(event.answer, req.docs) };
          if (event.type === "answer" && !event.answer.smalltalk && ws.plan !== "free") {
            if (await settle(event.answer.compute.units)) billedUnits = event.answer.compute.units;
          }
          if (event.type === "limit" && windowBound) event = { ...event, window: { id: windowBound.id, label: windowBound.label, resetsAt: windowBound.resetsAt, message: windowBound.message } };
          send(event);
          // After the answer is on its way: record how the turn went for the router's scoreboard (no text, no account id).
          if (!creator && !smallTalk && memoryReply === null && traced && !req.private && ((event.type === "answer" && !event.answer.smalltalk) || (event.type === "error" && event.code === "no_response"))) {
            const job = learnFromTurn({ workspaceId: ws.id, anonymous: ws.anonymous, failedText: askedPrompt, answerId: event.type === "answer" ? event.answer.id : newId("nr"), plan: ws.plan, trace: traced.trace(), answer: event.type === "answer" ? event.answer : undefined, startedAt });
            try { after(job); } catch { /* outside a request scope */ }
          }
          // "Most frequently asked": a plain question from someone who opted in is counted once the answer is out (keyed hashes only; see src/lib/faq/repo.ts).
          if (event.type === "answer" && !ws.anonymous && !noPersonal && !req.attachments?.length && !req.media && !req.modes?.web && !req.modes?.deepResearch && !req.modes?.create && !req.modes?.agent) {
            const job = recordQuestion({ workspaceId: ws.id, anonymous: ws.anonymous, prompt: askedPrompt });
            try { after(job); } catch { /* outside a request scope: it still runs, just not past the response */ }
          }
          // Signed in: after a real answer, free models save the chat's digest + summary and any durable facts (never charged); then the UI hint.
          if (event.type === "answer" && !ws.anonymous && !noPersonal) {
            const learned = memoryOn && !creator && !event.answer.smalltalk ? learn(ws.id, { ...req, prompt: askedPrompt }, event.answer.markdown, !(ws.plan === "free" && mayTrain)) : null;
            const result = learned ? await Promise.race([learned, new Promise<null>((r) => setTimeout(() => r(null), LEARN_WAIT_MS))]) : null;
            const enabled = creator ? await memoryEnabled(ws.id).catch(() => memoryOn) : memoryOn;
            send({ type: "memory", enabled, saved: result?.saved ?? 0, ...(result?.summarized ? { summarized: true } : {}), ...(usedMemory > 0 && enabled ? { used: usedMemory } : {}) });
          }
        }
        // Stopped by the user after paid calls went out: still billed at the planned (margin-included) cost.
        if (abort.signal.aborted && run.started && !run.settled && !smallTalk) await settle(run.plannedUnits).catch(() => undefined);
        await finishDaily(!abort.signal.aborted);
        closeStream();
      } catch (err) {
        // Stopped or crashed after the panel was called: charge the planned (margin-included) cost.
        if (run.started && !run.settled && !smallTalk) await settle(run.plannedUnits).catch(() => undefined);
        if (abort.signal.aborted) {
          await finishDaily(false);
          closeStream();
          return;
        }
        console.error("[keplar] run failed:", err instanceof Error ? err.name : "error");
        if (run.noResponse) send(noResponseEvent(ws.plan));
        else send({ type: "error", code: "internal", message: "Something went wrong. Please try again.", retryable: true });
        await finishDaily(true);
        closeStream();
      } finally {
        await finishDaily(false);
        releaseReserved?.();
        gate?.release();
        endRun();
        if (cancelWatch) clearInterval(cancelWatch);
        // Answer recovery: save how the turn ended (the answer exactly as sent, or why it didn't come) for a retry or a reconnect.
        if (turn) {
          const ended = answeredOk && turnAnswer !== undefined ? "done" : abort.signal.aborted ? "cancelled" : "failed";
          if (clientGone && ended === "done") flightPush(costScope.flight, { k: "note", code: "finished_headless" });
          await finishTurn(turn.owner, turn.key, { status: ended, answer: turnAnswer, error: ended === "failed" ? (turnError ?? { code: "internal", message: "Something went wrong. Please try again." }) : undefined, headless: clientGone }).catch(() => undefined);
        }
        finishRun();
        if (!creator) recordFlight(flightRow(costScope.flight!, { reqId: reqIdForCost, plan: ws.plan, feature: costScope.tag?.feature, kind: smallTalk ? "instant" : "answer", answered: answeredOk, aborted: abort.signal.aborted, errorCode: flightError, limited: flightLimited, usd: costScope.usd }));
        if (!creator) recordRequestCost(costScope, { reqId: reqIdForCost, plan: ws.plan, accountId: ws.anonymous ? null : ws.id, kind: smallTalk ? "instant" : "answer", units: billedUnits, durationMs: Date.now() - startedAt, answered: answeredOk, degraded: degradedBy, maxModels: fanoutCap });
      }
    },
    cancel() {
      flightPush(costScope.flight, { k: "cancel", code: "client_closed" });
      onClientGone(); // recoverable: keeps running unless Stop was pressed; otherwise aborts as before
    },
  });
  // A recoverable turn may outlive the response (the browser left): keep the function alive until it has saved its answer.
  if (recoverable) {
    try { after(runDone); } catch { /* outside a request scope (tests): the run still completes */ }
  }

  const headers = new Headers({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", [PROTOCOL_HEADER]: String(EVENT_PROTOCOL) });
  if (gate?.setCookie) headers.append("Set-Cookie", gate.setCookie);
  if (dailyClaim?.setCookie) headers.append("Set-Cookie", dailyClaim.setCookie);
  return new Response(stream, { headers });
}

/** Answer recovery: the saved answer of an earlier run of this turn, as a normal answer stream (no run, no charge, no daily question). */
function replayTurn(row: TurnRow): Response {
  const events: KeplarEvent[] = [{ type: "recovery", state: "replayed", ...(row.headless ? { headless: true } : {}) }, { type: "answer", answer: row.answer as Extract<KeplarEvent, { type: "answer" }>["answer"] }];
  const stamp = stamper();
  return new Response(events.map((e) => JSON.stringify(stamp(e))).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "x-keplar-turn": "replayed", [PROTOCOL_HEADER]: String(EVENT_PROTOCOL) } });
}

/** Answer recovery: the same turn is still being worked on (a reconnect raced it). The browser polls /api/keplar/turn. */
function turnRunning(): Response {
  return Response.json({ error: "This answer is still being worked on. It will appear here when it's ready.", code: "turn_running", retryAfterSec: 2 }, { status: 409, headers: { "retry-after": "2", "cache-control": "no-store" } });
}

const LEARN_WAIT_MS = 6_000;

/** Free, best effort: failures never touch the answer. The work keeps running after the response when it outlasts the wait. */
function learn(workspaceId: string, req: KeplarRequest, answer: string, modelsAllowed = true): Promise<TurnResult> {
  const job = afterTurn({ workspaceId, req: { prompt: req.prompt, attachments: req.attachments, media: req.media, modes: req.modes, chatId: req.chatId }, answer, modelsAllowed });
  try {
    after(job);
  } catch {
    /* outside a request scope (tests, scripts): the promise still runs */
  }
  return job;
}
