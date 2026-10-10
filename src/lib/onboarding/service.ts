/** Server side of /api/onboarding: facts for the checklist, the payload shape and the guarded mutations. */
import { chats } from "@/lib/memory/repo";
import { listSites } from "@/lib/site-builder/store";
import { imageJobs } from "@/lib/images/store";
import { mcpServers } from "@/lib/business/repo";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { checklist, planLine, starters, validateAnswers, validateProgressKey, validateStep, ValidationError, type Facts, type OnboardingState } from "./model";
import { finish, getOnboarding, markProgress, mergeAnswers, onboardingEnabled, replay, saveProgress, setAccountName } from "./store";

async function count(f: () => Promise<unknown[]>): Promise<number> {
  try {
    return (await f()).length;
  } catch {
    return 0; // a store that can't be read must not break the app: the item just shows as not done
  }
}

export async function factsFor(ws: Workspace): Promise<Facts> {
  const [c, s, i, m] = await Promise.all([
    count(() => chats().list(ws.id)),
    count(() => listSites(ws)),
    count(() => imageJobs().list(ws.id, (j) => j.status === "ready")),
    count(() => mcpServers().list(ws.id)),
  ]);
  return { chats: c, sites: s, images: i, connectors: m, plan: ws.plan };
}

export async function payloadFor(ws: Workspace, state: OnboardingState, accountName = "") {
  const facts = await factsFor(ws);
  return {
    state,
    plan: { id: ws.plan, line: planLine(ws.plan), connectorsAllowed: ws.plan !== "free" && ws.plan !== "lite" },
    name: state.answers.name || accountName,
    starters: starters(state.answers),
    checklist: checklist(facts, state.progress),
    firstQuestionDone: facts.chats > 0,
  };
}

export type Mutation = { step?: unknown; answers?: unknown; action?: unknown; key?: unknown };

/** Apply one validated change for this user. Every input is checked here; anything unknown is a 400. */
export async function applyMutation(userId: string, b: Mutation): Promise<OnboardingState> {
  if (!onboardingEnabled()) throw new HttpError(503, "Onboarding isn't available right now.", "unavailable");
  try {
    const action = b.action === undefined ? null : String(b.action);
    if (action === "complete" || action === "skip") {
      const answers = b.answers === undefined ? null : validateAnswers(b.answers);
      if (answers && Object.keys(answers).length) {
        if (answers.name) await setAccountName(userId, answers.name);
        await mergeAnswers(userId, answers);
      }
      return finish(userId, action === "complete" ? "completed" : "skipped");
    }
    if (action === "replay") return replay(userId);
    if (action === "progress") return markProgress(userId, validateProgressKey(b.key));
    if (action !== null) throw new ValidationError("Unknown action.");
    if (b.step === undefined && b.answers === undefined) throw new ValidationError("Nothing to save.");
    const step = b.step === undefined ? undefined : validateStep(b.step);
    const answers = b.answers === undefined ? undefined : validateAnswers(b.answers);
    if (answers?.name) await setAccountName(userId, answers.name);
    const cur = await getOnboarding(userId);
    // After the flow, answers can still be edited, but the step no longer moves.
    if (cur.completedAt || cur.skippedAt) return answers ? mergeAnswers(userId, answers) : cur;
    return saveProgress(userId, { step, answers });
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message, "invalid");
    throw e;
  }
}
