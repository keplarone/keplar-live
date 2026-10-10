/**
 * The two halves of a turn, for the chat route:
 *   prepareContext  BEFORE the models run: conversation so far (everyone) + long-term notes, last chats' summaries and
 *                   relevant past snippets (signed in, memory on).
 *   afterTurn       AFTER a real answer: store the chat digest, refresh its summary and save new notes, all with free models.
 * Neither is charged to credits. Failures never reach the answer, but they are logged by reason (never by content).
 */
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { isSmallTalk } from "@/lib/orchestration/smalltalk";
import type { KeplarRequest } from "@/lib/orchestration/types";
import { assemblePreface, conversationBlock, recentChatsBlock, snippetsBlock } from "./context";
import { dayLabel } from "./recall";
import { pickSnippets, recentDigests, recordTurn, searchDigests, setSummary, summarize, validChatId } from "./digest";
import { extractFacts } from "./extract";
import { memoryBlock, relevantFacts } from "./facts";
import { addItems, listItems, memoryEnabled } from "./repo";

type Turns = NonNullable<KeplarRequest["history"]>;

/** True when nothing real has been said yet in this chat (only greetings, or nothing): the moment to bring in earlier chats. */
export function isFreshChat(history: Turns | undefined): boolean {
  return !(history ?? []).some((h) => h.role === "user" && !isSmallTalk({ prompt: h.text }));
}

export type PrepareInput = {
  workspaceId: string;
  /** Signed in with memory on. */
  memory: boolean;
  history: Turns | undefined;
  prompt: string;
  chatId?: string;
  tz?: string;
  maxChars: number;
  /** Casual chat: no context at all. */
  smallTalk?: boolean;
  nowMs?: number;
};

/** The text placed ahead of the question ("" when there is nothing to add). */
export async function prepareContext(i: PrepareInput): Promise<string> {
  if (i.smallTalk) return "";
  const conversation = conversationBlock(i.history, i.maxChars);
  if (!i.memory) return assemblePreface([conversation]);
  const fresh = isFreshChat(i.history);
  const [facts, recent, snips] = await Promise.allSettled([
    listItems(i.workspaceId).then((all) => memoryBlock(relevantFacts(all, i.prompt, 250, { fill: fresh }))),
    fresh
      ? recentDigests(i.workspaceId, { excludeId: i.chatId, limit: 5 }).then((rows) => recentChatsBlock(rows.map((d) => ({ title: d.title, when: dayLabel(d.updatedAt, i.tz), summary: d.summary }))))
      : Promise.resolve(""),
    searchDigests(i.workspaceId, i.prompt, { excludeId: i.chatId }).then((hits) =>
      snippetsBlock(pickSnippets(hits, i.prompt).map((s) => ({ title: s.title, when: dayLabel(s.updatedAt, i.tz), text: s.text }))),
    ),
  ]);
  const val = (r: PromiseSettledResult<string>, what: string) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[memory] ${what} unavailable:`, r.reason instanceof Error ? r.reason.name : "error");
    return "";
  };
  return assemblePreface([val(facts, "notes"), val(recent, "recent chats"), val(snips, "past chat search"), conversation]);
}

export type TurnResult = { saved: number; summarized: boolean; skipped?: "off" | "error" };

export type AfterInput = {
  workspaceId: string;
  req: Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes" | "chatId">;
  answer: string;
  signal?: AbortSignal;
  /**
   * false = no model may read this turn (the Free plan while free hosts may train on prompts): the chat digest keeps its extractive
   * summary and no facts are picked out by a model. Notes the person adds themselves still work. Default true.
   */
  modelsAllowed?: boolean;
};

/** After a real answer: digest + summary + new notes. Never throws. */
export async function afterTurn(i: AfterInput): Promise<TurnResult> {
  const result: TurnResult = { saved: 0, summarized: false };
  try {
    if (!(await memoryEnabled(i.workspaceId))) return { ...result, skipped: "off" };
    const restricted = Boolean(i.req.attachments?.length || i.req.media?.images?.length || i.req.media?.videos?.length);
    const digestJob = async () => {
      if (!validChatId(i.req.chatId)) return;
      const d = await recordTurn({ chatId: i.req.chatId, workspaceId: i.workspaceId, prompt: i.req.prompt, answer: i.answer, restricted });
      try {
        await rateLimit(`memory:${i.workspaceId}:summary`, 90, 3600, { shared: true });
      } catch {
        return; // over the hourly budget: the extractive summary stands
      }
      if (i.modelsAllowed === false) return; // the extractive summary stands; nothing is sent to a model
      const s = await summarize(d.summarySource === "model" ? d.summary : "", i.req.prompt, restricted ? "" : i.answer, i.signal);
      if (s && (await memoryEnabled(i.workspaceId))) result.summarized = await setSummary(i.workspaceId, d.id, s);
    };
    const factsJob = async () => {
      if (i.modelsAllowed === false) return;
      try {
        await rateLimit(`memory:${i.workspaceId}:learn`, 40, 3600, { shared: true });
      } catch {
        return;
      }
      const facts = await extractFacts(i.req, i.signal);
      if (facts.length && (await memoryEnabled(i.workspaceId))) result.saved = (await addItems(i.workspaceId, facts, "auto")).length;
    };
    const [a, b] = await Promise.allSettled([digestJob(), factsJob()]);
    for (const [name, r] of [["chat summary", a], ["notes", b]] as const) {
      if (r.status === "rejected") console.error(`[memory] ${name} failed:`, r.reason instanceof Error ? `${r.reason.name}: ${r.reason.message}`.slice(0, 160) : "error");
    }
  } catch (e) {
    console.error("[memory] after-turn failed:", e instanceof Error ? e.name : "error");
    return { ...result, skipped: "error" };
  }
  return result;
}
