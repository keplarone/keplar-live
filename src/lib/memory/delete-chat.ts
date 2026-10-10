/**
 * Hard delete of saved chats, with everything that exists only because of them. Every call is scoped to one workspace id
 * (the signed-in owner), so another person's rows can never be reached.
 *
 * Removed with a chat:
 *   - the chat row (all its messages, including the references to attachments and generated images stored inside them;
 *     media bytes and thumbnails never reach the server, and pictures themselves stay in the owner's Create > Images library)
 *   - the chat's saved summary and past-chat snippets (chat_digests)
 *   - the router-learning records of this chat's answers (the per-turn outcome row and its feedback marks)
 * Kept on purpose: memory notes (they are the person's, listed and deletable in Settings, not tied to one chat), the
 * per-model running tallies (aggregates with no link back to a turn), and the anonymous "frequently asked" counts.
 */
import { signalRows, outcomes, SYSTEM, turnKey } from "@/lib/learning/repo";
import { deleteDigest } from "./digest";
import { chats } from "./repo";

const SLOTS = ["vote", "copy", "regenerate", "correct"] as const;

/** Answer ids found in a chat's stored messages. */
export function answerIds(messages: unknown[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    const id = (m as { answer?: { id?: unknown } } | null)?.answer?.id;
    if (typeof id === "string" && id) out.push(id);
  }
  return out;
}

async function forgetLearning(workspaceId: string, messages: unknown[]) {
  for (const answerId of answerIds(messages)) {
    const key = turnKey(workspaceId, answerId);
    await outcomes().remove(SYSTEM, key).catch(() => false);
    for (const slot of SLOTS) await signalRows().remove(SYSTEM, `${key}:${slot}`).catch(() => false);
  }
}

/** Delete one chat and what hangs off it. false when this person has no such chat. */
export async function deleteChat(workspaceId: string, chatId: string): Promise<boolean> {
  const row = await chats().get(workspaceId, chatId);
  if (!row) return false;
  await forgetLearning(workspaceId, Array.isArray(row.messages) ? row.messages : []);
  await chats().remove(workspaceId, chatId);
  await deleteDigest(workspaceId, chatId);
  return true;
}

/** Delete every chat of this person, with the same cascade. Returns how many chats were removed. */
export async function deleteAllChats(workspaceId: string): Promise<number> {
  const all = await chats().list(workspaceId);
  for (const c of all) await deleteChat(workspaceId, c.id);
  return all.length;
}
