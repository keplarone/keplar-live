/**
 * Shared chats: a read-only link to a whole conversation (or the turns the owner picked), with redaction and revoke.
 *
 * Private by default: nothing is shared until the signed-in owner presses "Create link" after previewing exactly what goes in it.
 * Redaction runs on the server whatever the browser sent: email addresses, phone numbers, card-like and long ID numbers (when the
 * owner leaves "Hide personal details" on), and every word or phrase the owner listed, become "[hidden]". No account id, name, email,
 * memory, attachments or media are ever included (only the text of the turns). Revoke = an immediate 404; links expire after 90 days;
 * a view only increments a counter. Pages are noindex and render text only (no clickable links, no HTML).
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";

export const CHAT_SHARE_LIMITS = { turns: 60, turnChars: 12_000, totalChars: 120_000, title: 120, terms: 20, termChars: 80, live: 25, perHour: 10, days: 90 } as const;

export type SharedTurn = { role: "user" | "keplar"; text: string };
export type ChatShareRow = {
  id: string;
  workspaceId: string;
  token: string;
  title: string;
  turns: SharedTurn[];
  /** How many replacements redaction made (shown to the owner in the list). */
  hidden: number;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  views: number;
};

const rows = () => collection<ChatShareRow>("chat_shares");

export const newChatToken = () => randomBytes(18).toString("base64url");
export const validChatToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{24}$/.test(t);

import { redactText } from "./redact";
export { redactText };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max) : "");

export type ChatShareSnapshot = Pick<ChatShareRow, "title" | "turns" | "hidden">;

/** Validates what the browser sent and applies redaction. Returns an error sentence when there is nothing to share. */
export function buildChatSnapshot(body: unknown): ChatShareSnapshot | string {
  if (!body || typeof body !== "object") return "Nothing to share.";
  const b = body as Record<string, unknown>;
  const r = (b.redact && typeof b.redact === "object" ? b.redact : {}) as Record<string, unknown>;
  const auto = r.auto !== false; // on unless the owner turned it off
  const terms = (Array.isArray(r.terms) ? r.terms : []).map((t) => clean(t, CHAT_SHARE_LIMITS.termChars).trim()).filter((t) => t.length >= 2).slice(0, CHAT_SHARE_LIMITS.terms);
  let total = 0;
  let hidden = 0;
  const turns: SharedTurn[] = [];
  for (const t of (Array.isArray(b.turns) ? b.turns : []).slice(0, CHAT_SHARE_LIMITS.turns)) {
    if (!t || typeof t !== "object") continue;
    const x = t as Record<string, unknown>;
    const role = x.role === "keplar" ? "keplar" : x.role === "user" ? "user" : null;
    const raw = clean(x.text, CHAT_SHARE_LIMITS.turnChars).trim();
    if (!role || !raw) continue;
    const red = redactText(raw, { auto, terms });
    if (total + red.text.length > CHAT_SHARE_LIMITS.totalChars) break;
    total += red.text.length;
    hidden += red.count;
    turns.push({ role, text: red.text });
  }
  if (!turns.some((t) => t.role === "keplar")) return "Pick at least one answer to share.";
  const title = redactText(clean(b.title, CHAT_SHARE_LIMITS.title).trim() || "A shared Keplar chat", { auto, terms });
  return { title: title.text, turns, hidden: hidden + title.count };
}

export class ChatShareLimitError extends Error {}

export async function createChatShare(workspaceId: string, snap: ChatShareSnapshot, at = Date.now()): Promise<ChatShareRow> {
  const own = await rows().list(workspaceId);
  if (own.filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).length >= CHAT_SHARE_LIMITS.live) throw new ChatShareLimitError(`You have ${CHAT_SHARE_LIMITS.live} live chat links. Revoke one to make another.`);
  if (own.filter((r) => Date.parse(r.createdAt) > at - 3_600_000).length >= CHAT_SHARE_LIMITS.perHour) throw new ChatShareLimitError("You've made several chat links in the last hour. Try again a little later.");
  const token = newChatToken();
  return rows().insert({ id: token, workspaceId, token, ...snap, createdAt: new Date(at).toISOString(), expiresAt: new Date(at + CHAT_SHARE_LIMITS.days * 864e5).toISOString(), views: 0 });
}

export async function liveChatSharesOf(workspaceId: string, at = Date.now()): Promise<ChatShareRow[]> {
  return (await rows().list(workspaceId)).filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function revokeChatShare(workspaceId: string, token: string): Promise<boolean> {
  if (!validChatToken(token)) return false;
  const r = await rows().get(workspaceId, token);
  if (!r || r.revokedAt) return false;
  await rows().update(workspaceId, token, { revokedAt: new Date().toISOString() });
  return true;
}

/** Public lookup: only a live link. Counts the view when asked. */
export async function openChatShare(token: string, opts: { count?: boolean } = {}, at = Date.now()): Promise<ChatShareRow | null> {
  if (!validChatToken(token)) return null;
  const r = await rows().findSystemBy("token", token);
  if (!r || r.revokedAt || Date.parse(r.expiresAt) <= at) return null;
  if (opts.count) await rows().increment(r.workspaceId, r.id, { views: 1 }, { ...r, views: 0 }).catch(() => undefined);
  return r;
}
