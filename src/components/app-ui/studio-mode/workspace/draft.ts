/**
 * Draft handoff into the composer. Anything that wants to put text in the composer without sending it (an idea chip in the
 * conversation's empty state, an idea picked on a page before Studio was connected) offers a draft for an environment; the
 * mounted Composer for that environment takes it once, fills its box and focuses it. Nothing is sent: Build stays the
 * person's choice. Module state only (one page), no storage.
 */
import type { Env } from "./conversation-model";

type Draft = { text: string; id: number };

const drafts = new Map<Env, Draft>();
const listeners = new Set<() => void>();
let seq = 0;

/** Put `text` in the composer for `env` (replaces any untaken draft). */
export function offerDraft(env: Env, text: string): void {
  drafts.set(env, { text, id: ++seq });
  for (const l of listeners) l();
}

/** The untaken draft for `env`, if any (stable object until it changes). */
export function peekDraft(env: Env): Draft | null {
  return drafts.get(env) ?? null;
}

/** Marks the draft `id` as taken (a newer draft offered meanwhile stays). */
export function takeDraft(env: Env, id: number): void {
  if (drafts.get(env)?.id === id) drafts.delete(env);
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
