/**
 * Content approval queue (editorial and distribution drafts). Admin only.
 *
 *   draft -> in_review -> approved -> published
 *                      \-> rejected (back to draft when edited)
 *
 * Rules enforced here, not by convention:
 *  - A draft lists its factual claims, each with a source URL. It can't be approved while any claim lacks one.
 *  - Approval records who approved it and when; the author can't approve their own draft.
 *  - "Published" records where it went live (a URL a person posted it at). Keplar has no posting credentials for social networks or an
 *    email service, so nothing is posted automatically; when an integration is connected it publishes only approved items.
 *  - Every transition is appended to the item's history (the audit trail).
 */
import { collection } from "@/lib/create/platform/store";
import { id as newId } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";

export const CHANNELS = ["blog", "docs", "x", "linkedin", "youtube", "tiktok", "instagram", "email", "community", "directory"] as const;
export type Channel = (typeof CHANNELS)[number];
export type ContentStatus = "draft" | "in_review" | "approved" | "rejected" | "published";
export type Claim = { text: string; source: string | null };

export type ContentItem = {
  id: string;
  workspaceId: string;
  channel: Channel;
  title: string;
  body: string;
  claims: Claim[];
  status: ContentStatus;
  author: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  publishedUrl?: string;
  publishedAt?: string;
  history: { at: string; by: string; to: ContentStatus; note?: string }[];
};

const SYSTEM = "system";
export const contentRows = () => collection<ContentItem>("growth_content");

const httpUrl = (u: unknown) => { try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null; } catch { return null; } };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "");

/** Pure: validates an editor's input. Throws a 400 with a plain message. */
export function parseDraft(body: unknown): Pick<ContentItem, "channel" | "title" | "body" | "claims"> {
  const b = (body ?? {}) as Record<string, unknown>;
  const channel = CHANNELS.find((c) => c === b.channel);
  const title = text(b.title, 200);
  const content = text(b.body, 20_000);
  if (!channel) throw new HttpError(400, `Pick a channel: ${CHANNELS.join(", ")}.`, "bad_channel");
  if (!title || !content) throw new HttpError(400, "A draft needs a title and a body.", "empty");
  const claims = (Array.isArray(b.claims) ? b.claims : []).slice(0, 50).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { text: text(o.text, 500), source: httpUrl(o.source) };
  }).filter((c) => c.text);
  return { channel, title, body: content, claims };
}

/** Pure: why an item can't be approved, or null. */
export function approvalBlocker(item: Pick<ContentItem, "status" | "claims" | "author">, approver: string): string | null {
  if (item.status !== "in_review") return "Only an item in review can be approved.";
  if (item.author === approver) return "The author can't approve their own draft.";
  const unsourced = item.claims.filter((c) => !c.source);
  if (unsourced.length) return `${unsourced.length} claim(s) have no source: "${unsourced[0].text.slice(0, 80)}".`;
  return null;
}

const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "rejected", "draft"],
  approved: ["published", "draft"],
  rejected: ["draft"],
  published: [],
};

export async function createDraft(input: unknown, author: string): Promise<ContentItem> {
  const d = parseDraft(input);
  const now = new Date().toISOString();
  const item: ContentItem = { id: newId("gc"), workspaceId: SYSTEM, ...d, status: "draft", author, createdAt: now, updatedAt: now, history: [{ at: now, by: author, to: "draft" }] };
  await contentRows().insert(item);
  return item;
}

export async function editDraft(id: string, input: unknown, by: string): Promise<ContentItem> {
  const cur = await contentRows().get(SYSTEM, id);
  if (!cur) throw new HttpError(404, "Not found.", "not_found");
  if (cur.status === "published") throw new HttpError(409, "A published item can't be edited.", "published");
  const d = parseDraft(input);
  const now = new Date().toISOString();
  // Any edit sends the item back to draft: an approval covers the exact text that was approved.
  const next = { ...d, status: "draft" as const, updatedAt: now, approvedBy: undefined, approvedAt: undefined, history: [...cur.history, { at: now, by, to: "draft" as const, note: "edited" }] };
  return (await contentRows().update(SYSTEM, id, next))!;
}

export async function transition(id: string, to: ContentStatus, by: string, extra: { note?: string; publishedUrl?: string } = {}): Promise<ContentItem> {
  const cur = await contentRows().get(SYSTEM, id);
  if (!cur) throw new HttpError(404, "Not found.", "not_found");
  if (!TRANSITIONS[cur.status].includes(to)) throw new HttpError(409, `Can't move from ${cur.status} to ${to}.`, "bad_transition");
  if (to === "approved") {
    const why = approvalBlocker(cur, by);
    if (why) throw new HttpError(409, why, "not_approvable");
  }
  const url = to === "published" ? httpUrl(extra.publishedUrl) : null;
  if (to === "published" && !url) throw new HttpError(400, "Give the URL where it was published.", "no_url");
  const now = new Date().toISOString();
  const patch: Partial<ContentItem> = {
    status: to,
    updatedAt: now,
    ...(to === "approved" ? { approvedBy: by, approvedAt: now } : {}),
    ...(to === "published" ? { publishedUrl: url!, publishedAt: now } : {}),
    history: [...cur.history, { at: now, by, to, ...(extra.note ? { note: text(extra.note, 300) } : {}) }],
  };
  return (await contentRows().update(SYSTEM, id, patch))!;
}

export const listContent = async () => (await contentRows().list(SYSTEM)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
