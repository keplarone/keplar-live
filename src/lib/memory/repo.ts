/**
 * Memory and saved chats, per user, in the store (Neon in production). Every row is scoped by workspaceId.
 * Deletion is a hard delete (the row is removed from the store, not flagged).
 */
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import type { ChatRow, MemoryItem, MemoryKind, MemorySettings } from "./types";

export const MAX_ITEMS = 100;
export const MAX_CHATS = 200;
export const ITEM_MAX_CHARS = 220;

export const items = () => collection<MemoryItem>("memory_items");
export const settingsRows = () => collection<MemorySettings>("memory_settings");
export const chats = () => collection<ChatRow>("chat_threads");

const SETTINGS_ID = "settings";

export async function memoryEnabled(workspaceId: string): Promise<boolean> {
  const s = await settingsRows().get(workspaceId, SETTINGS_ID);
  return s ? s.enabled : true; // on by default for signed-in users; they can turn it off any time
}

export async function setMemoryEnabled(workspaceId: string, enabled: boolean) {
  const row: MemorySettings = { id: SETTINGS_ID, workspaceId, enabled, updatedAt: now() };
  if (await settingsRows().get(workspaceId, SETTINGS_ID)) await settingsRows().update(workspaceId, SETTINGS_ID, row);
  else await settingsRows().insert(row);
  return enabled;
}

export async function listItems(workspaceId: string): Promise<MemoryItem[]> {
  return (await items().list(workspaceId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Add facts (deduplicated; the oldest are dropped past the cap). Returns the items actually stored. */
export async function addItems(workspaceId: string, facts: { text: string; kind: MemoryKind }[], source: "auto" | "user"): Promise<MemoryItem[]> {
  const existing = await listItems(workspaceId);
  const seen = new Set(existing.map((i) => norm(i.text)));
  const added: MemoryItem[] = [];
  const batch = newId("mb");
  for (const f of facts) {
    const key = norm(f.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const t = now();
    const row: MemoryItem = { id: newId("mem"), workspaceId, text: f.text, kind: f.kind, source, batch, createdAt: t, updatedAt: t };
    await items().insert(row);
    added.push(row);
  }
  const all = await listItems(workspaceId);
  for (const old of all.slice(MAX_ITEMS)) await items().remove(workspaceId, old.id);
  return added;
}

/** Edit the text of one note (the person's own correction; it then counts as theirs). Returns the updated item, or null when it does not exist. */
export async function updateItemText(workspaceId: string, itemId: string, text: string): Promise<MemoryItem | null> {
  const existing = (await items().list(workspaceId)).find((i) => i.id === itemId);
  if (!existing) return null;
  const row: MemoryItem = { ...existing, text, source: "user", updatedAt: now() };
  await items().update(workspaceId, itemId, row);
  return row;
}

export async function deleteItem(workspaceId: string, itemId: string) {
  return items().remove(workspaceId, itemId);
}

/** Hard delete of every memory item for the user. Returns how many were removed. */
export async function eraseAllMemory(workspaceId: string): Promise<number> {
  const all = await items().list(workspaceId);
  for (const i of all) await items().remove(workspaceId, i.id);
  return all.length;
}

/** Hard delete of every saved chat for the user. */
export async function eraseAllChats(workspaceId: string): Promise<number> {
  const all = await chats().list(workspaceId);
  for (const c of all) await chats().remove(workspaceId, c.id);
  return all.length;
}

/** The facts saved by the most recent turn(s): what "forget that" removes. */
export async function lastAdded(workspaceId: string): Promise<MemoryItem[]> {
  const all = await listItems(workspaceId);
  if (!all.length) return [];
  const b = all[0].batch;
  return b ? all.filter((i) => i.batch === b) : [all[0]];
}
