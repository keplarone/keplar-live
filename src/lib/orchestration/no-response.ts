/**
 * "No model responded": the question ended without an answer because every
 * model failed, timed out, was rate-limited or came back empty. (A deployment
 * that is not set up is a different state: 503 not_configured.)
 *
 * Free (and signed-out) users get a friendly note with an upgrade suggestion;
 * Plus, Pro and admin users get a plain message. Neither is ever charged.
 * Pure, so the engine, the route and the tests share one source of wording.
 */
import type { KeplarEvent } from "./types";

export const FREE_NO_RESPONSE_MESSAGE =
  "Free models are busy right now and none responded. Lite, Plus and Pro use faster, more reliable models, so you get an answer when it counts.";
export const PAID_NO_RESPONSE_MESSAGE = "No model responded, you were not charged. Try again.";
/** The Free no-response card adds "You were not charged." unless the message already says so (UNRELIABLE_MESSAGE does: it read the line twice). */
export const needsChargeNote = (message: string) => !/\b(not|nothing was|never) charged\b/i.test(message);

/** Free and signed-out visitors (no plan = Free). */
export const isFreeOrSignedOut = (plan?: string | null) => !plan || plan === "free";

export type NoResponseEvent = Extract<KeplarEvent, { type: "error" }> & { code: "no_response" };

export function noResponseEvent(plan?: string | null, message?: string): NoResponseEvent {
  const free = isFreeOrSignedOut(plan);
  return { type: "error", code: "no_response", message: message ?? (free ? FREE_NO_RESPONSE_MESSAGE : PAID_NO_RESPONSE_MESSAGE), retryable: true, upgrade: free, charged: false };
}

/** An answer that carries nothing: no body text, or no panel model behind it. Casual-chat and creator replies are exempt. */
export function isEmptyAnswer(a: { smalltalk?: boolean; markdown: string; consensus: { responded: number } }): boolean {
  if (a.smalltalk) return false;
  return !a.markdown.trim() || a.consensus.responded <= 0;
}
