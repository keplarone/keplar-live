"use client";
/**
 * Business chats are saved to the person's Keplar account (/api/chats/<id>, the store Keplar One uses), in Keplar One's own
 * message shape, so a Business chat reopens here and also reads correctly in Keplar One's history. Media bytes never leave
 * the browser (the route strips them); a reopened chat shows the text of each turn.
 */
import type { KeplarAnswer } from "@/lib/orchestration/types";

export type SavedTurn = { id: string; q: string; a: string; models?: string; at: number; answer?: KeplarAnswer | null };
export type ChatMeta = { id: string; title: string; projectId: string | null; updatedAt: number };

export const newChatId = () => `biz${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const titleOf = (q: string) => (q.replace(/\s+/g, " ").trim().slice(0, 80) || "New chat");
const MODES = { web: false, deepResearch: false, create: false, agent: false };

export async function saveChat(id: string, projectId: string | null, createdAt: number, turns: SavedTurn[]): Promise<void> {
  const done = turns.filter((t) => t.a);
  if (!done.length) return;
  const messages = done.flatMap((t) => [
    { id: `${t.id}u`, role: "user", text: t.q, attachments: [], modes: MODES, createdAt: t.at },
    { id: `${t.id}k`, role: "keplar", replyTo: `${t.id}u`, status: "done", stages: [], capabilities: [], models: [], draft: t.a, ...(t.answer ? { answer: t.answer } : {}), startedAt: t.at, finishedAt: t.at },
  ]);
  await fetch(`/api/chats/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: titleOf(done[0]!.q), projectId, createdAt, updatedAt: Date.now(), messages }),
  }).catch(() => undefined);
}

/** A saved chat as Business turns, or null when it can't be read. */
export async function loadChat(id: string): Promise<{ turns: SavedTurn[]; projectId: string | null; createdAt: number; title: string } | null> {
  try {
    const r = await fetch(`/api/chats/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    const { chat } = (await r.json()) as { chat: { title: string; projectId: string | null; createdAt: number; messages: Record<string, unknown>[] } };
    const turns: SavedTurn[] = [];
    for (const m of chat.messages ?? []) {
      if (m.role === "user") turns.push({ id: String(m.id).replace(/u$/, ""), q: String(m.text ?? ""), a: "", at: Number(m.createdAt) || Date.now() });
      else if (m.role === "keplar" && turns.length) {
        const answer = (m.answer as KeplarAnswer | undefined) ?? null;
        const models = answer?.consensus ? `${answer.consensus.responded} of ${answer.consensus.consulted} models · ${answer.consensus.summary}` : undefined;
        turns[turns.length - 1] = { ...turns[turns.length - 1]!, a: answer?.markdown ?? String(m.draft ?? ""), answer, ...(models ? { models } : {}) };
      }
    }
    return { turns, projectId: chat.projectId ?? null, createdAt: Number(chat.createdAt) || Date.now(), title: chat.title };
  } catch {
    return null;
  }
}

export async function listChats(): Promise<ChatMeta[]> {
  try {
    const r = await fetch("/api/chats", { cache: "no-store" });
    if (!r.ok) return [];
    const d = (await r.json()) as { chats: ChatMeta[] };
    return d.chats ?? [];
  } catch {
    return [];
  }
}
