/**
 * Studio mode's saved chats, on the account: one row per game (the same compact save the page keeps on the device,
 * src/components/app-ui/studio-mode/saved-session.ts), so a Studio conversation follows the person to another computer and
 * survives a cleared browser. The device copy stays as the offline cache; the newer of the two wins.
 */
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";

export const STUDIO_CHAT_LIMITS = {
  /** One game's save, as JSON. The page saves well under this (no images, no old thinking). */
  maxChars: 1_200_000,
  /** Games per account; the least recently saved one makes room. */
  maxGames: 100,
};

/** The device key ("keplar-studio-chat:id:123" or "...:name:my obby"), without the prefix. */
const KEY = /^(id:[1-9]\d{0,19}|name:[^\n]{1,120})$/;
export const STUDIO_CHAT_PREFIX = "keplar-studio-chat:";

export type StudioChatRow = { id: string; workspaceId: string; key: string; name: string; savedAt: number; data: string };

const rows = () => collection<StudioChatRow>("studio_chats");
const bad = (m: string) => new HttpError(400, m, "bad_request");

/** Validates a device key and returns its stable row id. */
export function chatKey(raw: unknown): { key: string; id: string } {
  const full = typeof raw === "string" ? raw : "";
  const key = full.startsWith(STUDIO_CHAT_PREFIX) ? full.slice(STUDIO_CHAT_PREFIX.length) : full;
  if (!KEY.test(key)) throw bad("Unknown game.");
  return { key, id: `sc_${createHash("sha256").update(key).digest("hex").slice(0, 32)}` };
}

/** The shape the page saves (SavedSession); checked loosely, since it is the person's own data shown back as text. */
export function checkSession(raw: unknown): { savedAt: number; name: string; data: string } {
  const s = raw as { v?: unknown; savedAt?: unknown; name?: unknown; items?: unknown; history?: unknown } | null;
  if (!s || typeof s !== "object" || s.v !== 1 || !Array.isArray(s.items) || !Array.isArray(s.history)) throw bad("Not a Studio chat.");
  const savedAt = Number(s.savedAt);
  if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > Date.now() + 5 * 60_000) throw bad("Bad save time.");
  const data = JSON.stringify(s);
  if (data.length > STUDIO_CHAT_LIMITS.maxChars) throw new HttpError(413, "This chat is too long to sync. Start a new session for this game.", "too_large");
  // Saves never carry screenshots or reference images (the page strips them); refuse anything that does.
  if (data.includes("data:image/")) throw bad("Saved chats cannot include images.");
  return { savedAt, name: String(s.name ?? "").slice(0, 120), data };
}

export async function getChat(workspaceId: string, rawKey: unknown): Promise<{ savedAt: number; session: unknown } | null> {
  const { id } = chatKey(rawKey);
  const row = await rows().get(workspaceId, id);
  if (!row) return null;
  try {
    return { savedAt: row.savedAt, session: JSON.parse(row.data) };
  } catch {
    return null;
  }
}

/** Saves unless the account already holds a newer save of this game (another device). Returns what the account now holds. */
export async function putChat(workspaceId: string, rawKey: unknown, rawSession: unknown): Promise<{ savedAt: number; stale: boolean }> {
  const { key, id } = chatKey(rawKey);
  const s = checkSession(rawSession);
  const r = rows();
  const cur = await r.get(workspaceId, id);
  if (cur && cur.savedAt > s.savedAt) return { savedAt: cur.savedAt, stale: true };
  if (cur) await r.update(workspaceId, id, { name: s.name, savedAt: s.savedAt, data: s.data });
  else {
    await r.insert({ id, workspaceId, key, name: s.name, savedAt: s.savedAt, data: s.data });
    const all = await r.list(workspaceId);
    if (all.length > STUDIO_CHAT_LIMITS.maxGames) {
      for (const old of all.sort((a, b) => a.savedAt - b.savedAt).slice(0, all.length - STUDIO_CHAT_LIMITS.maxGames)) await r.remove(workspaceId, old.id);
    }
  }
  return { savedAt: s.savedAt, stale: false };
}

export async function deleteChat(workspaceId: string, rawKey: unknown): Promise<boolean> {
  const { id } = chatKey(rawKey);
  return rows().remove(workspaceId, id);
}

/** Every saved game on the account (names and dates only), newest first. */
export async function listChats(workspaceId: string): Promise<{ key: string; name: string; savedAt: number }[]> {
  return (await rows().list(workspaceId)).sort((a, b) => b.savedAt - a.savedAt).map((r) => ({ key: `${STUDIO_CHAT_PREFIX}${r.key}`, name: r.name, savedAt: r.savedAt }));
}
