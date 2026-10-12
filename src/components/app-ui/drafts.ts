/**
 * Unsent composer drafts, per chat, on this browser (session continuity: close the tab, come back, the half-written question is still
 * there). Scoped to whoever is on screen (the app's scope: this device, or the signed-in account), so another account on the same
 * browser never sees it. Never for private chats (the caller passes no key). Text only, at most 8,000 characters, at most 30 drafts,
 * gone after 7 days or once sent. Chats themselves already live in this browser's storage; a draft is no more sensitive than they are.
 */
const KEY = "keplar-drafts-v1";
export const DRAFT_MAX_CHARS = 8_000;
export const DRAFT_MAX = 30;
export const DRAFT_TTL_MS = 7 * 864e5;

type Store = Pick<Storage, "getItem" | "setItem">;
type Drafts = Record<string, { t: string; at: number }>;

const store = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

function load(s: Store | null, now: number): Drafts {
  try {
    const all = JSON.parse(s?.getItem(KEY) ?? "{}") as Drafts;
    const fresh: Drafts = {};
    for (const [k, v] of Object.entries(all)) if (v && typeof v.t === "string" && typeof v.at === "number" && now - v.at < DRAFT_TTL_MS) fresh[k] = v;
    return fresh;
  } catch {
    return {};
  }
}

/** The key for a chat's draft, or null when nothing may be kept (scope unknown yet, or a private chat). */
export function draftKeyFor(scope: string, threadId: string | null, isPrivate: boolean): string | null {
  if (isPrivate || scope === "pending") return null;
  return `${scope}|${threadId ?? "new"}`;
}

export function readDraft(key: string, s: Store | null = store(), now = Date.now()): string | null {
  return load(s, now)[key]?.t ?? null;
}

/** Save (or, for blank text, forget) one draft. Oldest drafts beyond the cap are dropped. */
export function writeDraft(key: string, text: string, s: Store | null = store(), now = Date.now()): void {
  const all = load(s, now);
  const t = text.slice(0, DRAFT_MAX_CHARS);
  if (t.trim()) all[key] = { t, at: now };
  else delete all[key];
  const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, DRAFT_MAX);
  try {
    s?.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch { /* storage full or blocked: the draft just isn't kept */ }
}
