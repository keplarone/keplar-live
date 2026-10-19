/**
 * Which chats belong on screen. A browser is either "anon" (device-local chats, no account), "user:<id>" (one signed-in
 * account), or "pending" (not known yet: nothing is shown). Every client cache is keyed by that scope, so one account's
 * chats can never be read while another is signed in, and signing out wipes the account caches.
 *
 * Storage is injected so the rules are testable without a browser.
 */
import type { Project, Thread } from "./types";

export type Scope = "pending" | "anon" | `user:${string}`;

export const ANON_KEY = "keplar.anon.v2";
export const ACCOUNT_PREFIX = "keplar.acct.v2.";
/** Pre-accounts-scoping store. It may hold a signed-in user's cached chats, so it is never shown directly: only offered for import. */
export const LEGACY_KEY = "keplar.app.v1";
const DECLINED_KEY = "keplar.import.declined.v1";
/**
 * Other per-session client caches that belong to whoever was signed in: handoffs between views (a site, app, study set, deck or
 * remix to open) and the unsent App prompt.
 */
const SESSION_KEYS = [
  "keplar.mcp.oauth", "keplar.onboarding.redirected", "keplar.onboarding.open", "keplar:create-site",
  "keplar:app-prompt", "keplar:app-open", "keplar:study-open", "keplar:slides-open", "keplar:create-remix",
];
/** keplar:app-build is the App build to resume after a reload (create/apps/resume.ts): it names the account's app and prompt. */
const LOCAL_KEYS = ["keplar.upsell.v1", "keplar:app-build"];
/** Studio chats saved on this device for a signed-in account (studio-mode/saved-session.ts): `<prefix><user id>|<game key>`. */
export const STUDIO_ACCOUNT_PREFIX = "keplar-studio-chat@";
/** Unsent composer drafts (drafts.ts): one object keyed `<scope>|<chat>`. Only the account entries go on sign-out. */
const DRAFTS_KEY = "keplar-drafts-v1";

export type KV = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export const scopeOf = (userId: string | null | undefined): Scope => (userId ? `user:${userId}` : "anon");
export const userIdOf = (scope: string): string | null => (scope.startsWith("user:") ? scope.slice(5) : null);
export const storageKey = (scope: string): string | null => (scope === "anon" ? ANON_KEY : userIdOf(scope) ? `${ACCOUNT_PREFIX}${userIdOf(scope)}` : null);
/** Value of the `x-keplar-account` header: what the on-screen chats belong to (omitted while pending). */
export const accountHeader = (scope: string): string | null => (scope === "pending" ? null : userIdOf(scope) ?? "anon");

let active: string = "pending";
export const setActiveScope = (scope: string) => { active = scope; };
/** The scope the app has on screen ("pending" outside the app, or before it knows). */
export const activeScope = (): string => active;
export const activeScopeHeaders = (): Record<string, string> => {
  const v = accountHeader(active);
  return v ? { "x-keplar-account": v } : {};
};

const store = (): KV | null => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

export type Saved = { threads?: Thread[]; projects?: Project[]; activeThreadId?: string | null; settings?: unknown };

export function readSaved(key: string, kv: KV | null = store()): Saved | null {
  if (!kv) return null;
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function writeSaved(key: string, value: Saved, kv: KV | null = store()) {
  try { kv?.setItem(key, JSON.stringify(value)); } catch { /* storage full or unavailable: the session still works in memory */ }
}

/** A run cannot survive a reload; the caller marks it. Messages only, no media data. */
const withMessages = (t: Thread) => Array.isArray(t.messages) && t.id;

/** Chats on this device that were never attached to an account (plus the unattributed legacy store). */
export function importCandidates(kv: KV | null = store()): Thread[] {
  const seen = new Set<string>();
  const out: Thread[] = [];
  for (const key of [ANON_KEY, LEGACY_KEY]) {
    for (const t of readSaved(key, kv)?.threads ?? []) {
      if (!withMessages(t) || !t.messages.length || t.remote || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** Projects the importable chats belong to (so an imported chat keeps its project). */
export function importProjects(threads: Thread[], kv: KV | null = store()): Project[] {
  const want = new Set(threads.map((t) => t.projectId).filter((x): x is string => Boolean(x)));
  if (!want.size) return [];
  const out = new Map<string, Project>();
  for (const key of [ANON_KEY, LEGACY_KEY]) for (const p of readSaved(key, kv)?.projects ?? []) if (want.has(p.id) && !out.has(p.id)) out.set(p.id, p);
  return [...out.values()];
}

const declinedList = (kv: KV | null): string[] => {
  try { const v = JSON.parse(kv?.getItem(DECLINED_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};
export const importDeclined = (userId: string, kv: KV | null = store()) => declinedList(kv).includes(userId);
export function declineImport(userId: string, kv: KV | null = store()) {
  try { kv?.setItem(DECLINED_KEY, JSON.stringify([...new Set([...declinedList(kv), userId])].slice(-20))); } catch { /* ignore */ }
}

/** After a consented import the chats leave the device-local stores: the next account can never claim them again. */
export function removeImported(ids: string[], kv: KV | null = store()) {
  const gone = new Set(ids);
  for (const key of [ANON_KEY, LEGACY_KEY]) {
    const saved = readSaved(key, kv);
    if (!saved) continue;
    const threads = (saved.threads ?? []).filter((t) => !gone.has(t.id));
    if (!threads.length && key === LEGACY_KEY) { try { kv?.removeItem(key); } catch { /* ignore */ } continue; }
    writeSaved(key, { ...saved, threads }, kv);
  }
}

/** Sign-out / account change: drop every account-keyed cache in this browser. Device-local (anon) chats stay. */
export function clearAccountCaches(kv: KV | null = store(), session: KV | null = typeof window === "undefined" ? null : safeSession()) {
  try {
    const drop: string[] = [];
    for (let i = 0; kv && i < kv.length; i++) { const k = kv.key(i); if (k?.startsWith(ACCOUNT_PREFIX) || k?.startsWith(STUDIO_ACCOUNT_PREFIX)) drop.push(k); }
    for (const k of [...drop, ...LOCAL_KEYS]) kv?.removeItem(k);
    for (const k of SESSION_KEYS) session?.removeItem(k);
  } catch { /* ignore */ }
  try { dropAccountDrafts(kv); } catch { /* ignore */ }
  try {
    if (typeof caches !== "undefined") void caches.keys().then((ks) => Promise.all(ks.filter((k) => /keplar/i.test(k)).map((k) => caches.delete(k)))).catch(() => undefined);
  } catch { /* ignore */ }
}

/** Keeps this device's (anon) drafts, drops every account's. */
function dropAccountDrafts(kv: KV | null) {
  const raw = kv?.getItem(DRAFTS_KEY);
  if (!raw) return;
  let all: unknown;
  try { all = JSON.parse(raw); } catch { all = null; }
  const kept = all && typeof all === "object" ? Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith("user:"))) : {};
  if (Object.keys(kept).length) kv?.setItem(DRAFTS_KEY, JSON.stringify(kept));
  else kv?.removeItem(DRAFTS_KEY);
}

function safeSession(): KV | null {
  try { return window.sessionStorage; } catch { return null; }
}
