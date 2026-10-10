/**
 * Free plan: provider requests per person per UTC day (on top of questions per day).
 *
 * A question can cost 1 request or, with a retry or a stand-in, several. Only counting questions would let a few people with heavy
 * questions use the whole shared OpenRouter free pool, so the registry also counts each request that is about to leave against the
 * person's own budget (`PLAN_LIMITS.free.dailyProviderCalls`). The subject is the same as for questions: the signed-in account, or the
 * signed browser id when signed out. The count is never given back (a request that left is spent), and carries no text.
 *
 * The budget travels with the request in the cost scope (ops/request-cost.ts), so the registry needs no knowledge of who is asking.
 */
import { callBudgetOf } from "@/lib/ops/request-cost";
import { claimOne, releaseOne, usedToday } from "./daily";

export const CALL_CAP_MESSAGE = "You've used today's Free model requests. They reset at 00:00 UTC.";

export const callKey = (primary: string) => `calls:${primary}`;

/** "none": no budget applies to this request. "claimed": one request counted. "capped": the person is out; do not send. */
export async function claimUserCall(): Promise<"none" | "claimed" | "capped"> {
  const b = callBudgetOf();
  if (!b) return "none";
  return (await claimOne(b.key, b.limit)) === null ? "capped" : "claimed";
}

/** Gives one back when a counted request was not sent after all (the shared pool refused it). */
export async function releaseUserCall(): Promise<void> {
  const b = callBudgetOf();
  if (b) await releaseOne(b.key);
}

export type CallRoom = { used: number; limit: number; left: number };
export async function callRoom(primary: string, limit: number): Promise<CallRoom> {
  const used = await usedToday(callKey(primary));
  return { used, limit, left: Math.max(0, limit - used) };
}
