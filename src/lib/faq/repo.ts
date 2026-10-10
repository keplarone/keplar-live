/**
 * Counting and listing the most frequently asked questions.
 *
 * Privacy by construction:
 *  - Only signed-in people who turned it on ("Count my questions", off by default) are counted. Anonymous questions are never read.
 *  - A question is stored as a keyed hash (HMAC with the server secret) plus short keyed hashes of the people who asked it. Its text
 *    is written down only once FAQ_MIN_USERS different people have asked the same normalized question, and then it is the words
 *    those people typed (they passed the filters in normalize.ts). A question nobody else asked never exists as text.
 *  - Turning the setting off removes the person from every count and deletes any question that falls under the threshold again.
 *  - The list is a daily snapshot (aggregate()); it holds text, a people count and nothing else.
 * Rows live under the "system" tenant (system_faq*), which holds no account ids.
 */
import { createHmac } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import { PINNED_QUESTION, STARTERS } from "./constants";
import { displayQuestion, FAQ_MIN_USERS, FAQ_SLOTS, FAQ_WINDOW_DAYS, foldQuestion, isConsciousVariant, normalizeQuestion } from "./normalize";

const SYSTEM = "system" as const;
const MAX_USERS = 200;
const SNAPSHOT_MAX_AGE_MS = 26 * 3600_000;

export type FaqSettings = { id: string; workspaceId: string; count: boolean; updatedAt: string };
export type FaqRow = { id: string; workspaceId: "system"; users: string[]; text?: string; firstAt: string; lastAt: string };
export type FaqEntry = { text: string; people?: number; kind: "pinned" | "frequent" | "starter" };
type Snapshot = { id: "top"; workspaceId: "system"; computedAt: string; items: { text: string; people: number }[] };

export const faqSettings = () => collection<FaqSettings>("faq_settings");
export const faqRows = () => collection<FaqRow>("system_faq");
export const faqTop = () => collection<Snapshot>("system_faq_top");

const salt = () => process.env.BETTER_AUTH_SECRET || "keplar-faq-dev-salt";
const mac = (kind: string, v: string) => createHmac("sha256", salt()).update(`faq:${kind}:${v}`).digest("hex");
export const questionKey = (norm: string) => mac("q", norm).slice(0, 32);
export const userKey = (workspaceId: string) => mac("u", workspaceId).slice(0, 16);

/** Off until the person turns it on. */
export async function faqCounting(workspaceId: string): Promise<boolean> {
  return Boolean((await faqSettings().get(workspaceId, "settings"))?.count);
}

export async function setFaqCounting(workspaceId: string, on: boolean): Promise<boolean> {
  const row: FaqSettings = { id: "settings", workspaceId, count: on, updatedAt: now() };
  if (await faqSettings().get(workspaceId, "settings")) await faqSettings().update(workspaceId, "settings", row);
  else await faqSettings().insert(row);
  if (!on) await forgetUser(workspaceId);
  return on;
}

/** Count one question from a signed-in person who opted in. Best effort: never throws into the answer path. Returns true when counted. */
export async function recordQuestion(i: { workspaceId: string; anonymous?: boolean; prompt: string }): Promise<boolean> {
  try {
    if (i.anonymous) return false;
    const norm = normalizeQuestion(i.prompt);
    if (!norm || isConsciousVariant(norm)) return false;
    if (!(await faqCounting(i.workspaceId))) return false;
    const id = questionKey(norm);
    const u = userKey(i.workspaceId);
    const t = now();
    const row = await faqRows().get(SYSTEM, id);
    if (!row) {
      await faqRows().insert({ id, workspaceId: SYSTEM, users: [u], firstAt: t, lastAt: t });
      return true;
    }
    const users = row.users.includes(u) ? row.users : [...row.users, u].slice(-MAX_USERS);
    const patch: Partial<FaqRow> = { users, lastAt: t };
    if (!row.text && users.length >= FAQ_MIN_USERS) patch.text = displayQuestion(i.prompt);
    await faqRows().update(SYSTEM, id, patch);
    return true;
  } catch {
    return false;
  }
}

/** Take one person out of every count (turning the setting off, deleting the account). Questions that fall under the threshold lose their text. */
export async function forgetUser(workspaceId: string): Promise<number> {
  const u = userKey(workspaceId);
  let n = 0;
  for (const row of await faqRows().listSystem((r) => r.users.includes(u))) {
    const users = row.users.filter((x) => x !== u);
    n++;
    if (!users.length) await faqRows().remove(SYSTEM, row.id);
    else await faqRows().update(SYSTEM, row.id, { users, ...(users.length < FAQ_MIN_USERS ? { text: "" } : {}) });
  }
  return n;
}

/**
 * The daily job: drop questions not asked within the window, then rank those asked by at least FAQ_MIN_USERS people and store the
 * snapshot. Returns what was stored.
 */
export async function aggregate(at = new Date()): Promise<{ items: { text: string; people: number }[]; pruned: number }> {
  const cutoff = new Date(at.getTime() - FAQ_WINDOW_DAYS * 86400_000).toISOString();
  const pruned = await faqRows().purgeSystemBefore("lastAt", cutoff, 5000);
  const rows = await faqRows().listSystem((r) => Boolean(r.text) && r.users.length >= FAQ_MIN_USERS);
  const items = rows
    .map((r) => ({ text: r.text as string, people: r.users.length, last: r.lastAt }))
    .filter((r) => !isConsciousVariant(foldQuestion(r.text)))
    .sort((a, b) => b.people - a.people || b.last.localeCompare(a.last))
    .slice(0, 20)
    .map(({ text, people }) => ({ text, people }));
  const snap: Snapshot = { id: "top", workspaceId: SYSTEM, computedAt: at.toISOString(), items };
  if (await faqTop().get(SYSTEM, "top")) await faqTop().update(SYSTEM, "top", snap);
  else await faqTop().insert(snap);
  return { items, pruned };
}

/** The list the home screen shows: the pinned question, then real counted questions, then generic starters only to fill the gap. */
export async function faqList(opts: { refresh?: boolean } = {}): Promise<FaqEntry[]> {
  let snap: Snapshot | null = null;
  try {
    snap = await faqTop().get(SYSTEM, "top");
    if (opts.refresh !== false && (!snap || Date.now() - Date.parse(snap.computedAt) > SNAPSHOT_MAX_AGE_MS)) {
      await aggregate();
      snap = await faqTop().get(SYSTEM, "top");
    }
  } catch {
    snap = null;
  }
  return buildList(snap?.items ?? []);
}

export function buildList(counted: { text: string; people: number }[]): FaqEntry[] {
  const out: FaqEntry[] = [{ text: PINNED_QUESTION, kind: "pinned" }];
  for (const c of counted) {
    if (out.length >= FAQ_SLOTS) break;
    if (c.people >= FAQ_MIN_USERS) out.push({ text: c.text, people: c.people, kind: "frequent" });
  }
  for (const s of STARTERS) {
    if (out.length >= FAQ_SLOTS) break;
    out.push({ text: s, kind: "starter" });
  }
  return out;
}
