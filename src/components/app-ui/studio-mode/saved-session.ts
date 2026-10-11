/**
 * One saved Studio conversation per game, so someone can close Roblox Studio and Keplar and pick up where they left off. Stored on
 * this device (localStorage), keyed by the game's own placeId when Studio reports it (the studio_id changes every launch), else by
 * the place's name. Pure helpers; the hook (useStudioAgent) reads and writes through them.
 *
 * What is kept: the chat as shown, the conversation the model continues from, the plan and progress. What is not: screenshots and
 * reference images (data URLs would overflow storage; a resumed session takes one fresh look), and the model's old thinking blocks
 * (only needed inside a run that is still going).
 */
import type { Item, Msg, Place } from "./useStudioAgent";

export const SAVE_PREFIX = "keplar-studio-chat:";
export const SAVE_VERSION = 1;
/** Stay well inside localStorage's ~5 MB per origin, which is shared with the rest of Keplar. */
export const SAVE_MAX_CHARS = 1_500_000;
const MAX_ITEMS = 200;

export type SavedSession = {
  v: number;
  savedAt: number;
  name: string;
  items: Item[];
  history: Msg[];
  plan: string[];
  current: number;
  finished: boolean;
  built: { key: string; title: string }[];
  stats: { steps: number; changes: number; errors: number };
  units: number;
};

/** The game this chat belongs to: its placeId, or its name for an unpublished place. Null when there is no place yet. */
export function placeKey(place: Pick<Place, "name" | "placeId"> | null): string | null {
  if (!place) return null;
  if (place.placeId) return `${SAVE_PREFIX}id:${place.placeId}`;
  const name = place.name.trim().toLowerCase();
  return name ? `${SAVE_PREFIX}name:${name}` : null;
}

const NO_IMAGE = "(A screenshot was here.)";

/** History without images or thinking blocks, so it is small enough to keep. */
function slimHistory(history: Msg[]): Msg[] {
  return history.map((m) => {
    if (m.role === "user" && Array.isArray(m.content)) {
      const text = m.content.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")).join("\n");
      const hadImage = m.content.some((p) => p.type === "image_url");
      return { role: "user", content: hadImage ? `${text}\n${NO_IMAGE}`.trim() : text };
    }
    if (m.role === "assistant") {
      const { reasoning_details: _drop, ...rest } = m;
      void _drop;
      return rest;
    }
    return m;
  });
}

/**
 * Every tool call needs a result right after it, or the next request is rejected. A session closed while a step was waiting for
 * approval (or running) left calls without results: answer them, so the conversation can continue.
 */
export function repairHistory(history: Msg[]): Msg[] {
  const out: Msg[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    out.push(m);
    if (m.role !== "assistant" || !m.tool_calls?.length) continue;
    const answered = new Set<string>();
    let j = i + 1;
    while (j < history.length && history[j]!.role === "tool") { answered.add((history[j] as Extract<Msg, { role: "tool" }>).tool_call_id); out.push(history[j]!); j++; }
    for (const c of m.tool_calls) if (!answered.has(c.id)) out.push({ role: "tool", tool_call_id: c.id, content: "Not run: the session was closed before this step finished. Check the place before assuming it happened." });
    i = j - 1;
  }
  return out;
}

/** Drops the oldest turns, at user-message boundaries only (never between a tool call and its result), until it fits. */
function trimToFit(history: Msg[], budget: number): Msg[] {
  let h = history;
  while (h.length > 1 && JSON.stringify(h).length > budget) {
    const next = h.findIndex((m, i) => i > 0 && m.role === "user");
    if (next <= 0) break;
    h = h.slice(next);
  }
  return h;
}

const slimItem = (it: Item): Item =>
  it.kind === "user" ? { ...it, images: [] }
  : it.kind === "action" ? { ...it, image: undefined, ...(it.status === "waiting" || it.status === "running" ? { status: "skipped" as const, summary: "Not run: the session was closed." } : {}) }
  : it.kind === "look" ? { ...it, image: undefined }
  : it;

/** What gets stored for this game. */
export function toSaved(s: Omit<SavedSession, "v" | "savedAt" | "history" | "items"> & { items: Item[]; history: Msg[] }, now = Date.now()): SavedSession {
  const items = s.items.slice(-MAX_ITEMS).map(slimItem);
  const history = trimToFit(repairHistory(slimHistory(s.history)), SAVE_MAX_CHARS - JSON.stringify(items).length - 20_000);
  return { ...s, v: SAVE_VERSION, savedAt: now, items, history };
}

export function readSaved(key: string | null): SavedSession | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    if (s?.v !== SAVE_VERSION || !Array.isArray(s.items) || !Array.isArray(s.history)) return null;
    return { ...s, history: repairHistory(s.history) };
  } catch {
    return null;
  }
}

export function writeSaved(key: string | null, s: SavedSession): boolean {
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(s));
    return true;
  } catch {
    // Storage full or blocked: keep what fits, the chat, and drop the model's history (the next request starts fresh).
    try { localStorage.setItem(key, JSON.stringify({ ...s, history: [] })); return true; } catch { return false; }
  }
}

export function clearSaved(key: string | null): void {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* storage blocked */ }
}

/* ── account sync (/api/studio/chats): the device copy above is the instant, offline one; the account copy follows the person ── */

/** The account's save of this game, or null (signed out, offline, or none yet). */
export async function fetchRemote(key: string | null): Promise<SavedSession | null> {
  if (!key) return null;
  try {
    const r = await fetch(`/api/studio/chats?key=${encodeURIComponent(key)}`, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return null;
    const d = (await r.json()) as { chat?: { session?: SavedSession } | null };
    const s = d.chat?.session;
    return s && s.v === SAVE_VERSION && Array.isArray(s.items) && Array.isArray(s.history) ? { ...s, history: repairHistory(s.history) } : null;
  } catch {
    return null;
  }
}

/** Sends this game's save to the account. Quietly does nothing when signed out or offline: the device copy still has it. */
export async function pushRemote(key: string | null, s: SavedSession): Promise<void> {
  if (!key) return;
  try {
    await fetch("/api/studio/chats", { method: "PUT", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ key, session: s }) });
  } catch { /* offline: the next save tries again */ }
}

export async function deleteRemote(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await fetch(`/api/studio/chats?key=${encodeURIComponent(key)}`, { method: "DELETE", credentials: "same-origin" });
  } catch { /* offline */ }
}
