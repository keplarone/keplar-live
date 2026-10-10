/**
 * The Specialist directory: specialists people chose to list publicly, after review.
 *   1. The owner lists one of their live specialist links with a category.
 *   2. An automatic screen runs on everything the visitor would get (name, description, instructions, starters, notes if shared):
 *      Keplar's content moderation (OpenAI omni-moderation when OPENAI_MODERATION_API_KEY is live, keyword rules otherwise) plus
 *      checks for attempts to override Keplar's rules. A hard block is rejected at once; everything else waits for a person.
 *   3. An admin approves ("listed"), hides or rejects it (/admin/specialists). Nothing is public before that.
 * A listing disappears at once when its link is revoked or expires, when the owner withdraws it, or when an admin hides it.
 */
import { collection } from "@/lib/create/platform/store";
import { moderateText } from "@/lib/create/platform/moderation";
import { openSpecialistShare, validSpecialistToken, type SpecialistShareRow } from "./specialist-share";

export const DIRECTORY_CATEGORIES = [
  { id: "writing", label: "Writing" },
  { id: "learning", label: "Learning" },
  { id: "work", label: "Work" },
  { id: "coding", label: "Coding" },
  { id: "research", label: "Research" },
  { id: "everyday", label: "Everyday" },
  { id: "other", label: "Other" },
] as const;
export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number]["id"];
export const DIRECTORY_LIMITS = { pendingPerAccount: 5, listedPerAccount: 20, page: 60, query: 80 } as const;

export type ListingStatus = "pending" | "listed" | "hidden" | "rejected";
export type SpecialistListing = {
  id: string; // the share token
  workspaceId: string;
  token: string;
  name: string;
  description: string;
  category: DirectoryCategory;
  status: ListingStatus;
  screen: { engine: string; flags: string[] };
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  note?: string;
};

const rows = () => collection<SpecialistListing>("specialist_listings");
export class DirectoryError extends Error {
  constructor(message: string, readonly code: "not_found" | "limit" | "duplicate" | "invalid") { super(message); }
}

const OVERRIDE = [
  /\bignore (all |any )?(previous|prior|earlier|keplar'?s?|system) (instructions|rules|prompts?)\b/i,
  /\b(jailbreak|developer mode|do anything now|no (rules|restrictions|filters|limits))\b/i,
  /\b(reveal|print|show) (your|the) (system prompt|hidden instructions)\b/i,
  /\bpretend (you are|to be) (an? )?(unfiltered|uncensored)\b/i,
];

/** The automatic screen. `blocked` = rejected without review; `flags` = what a reviewer should look at. */
export async function screenSpecialist(share: Pick<SpecialistShareRow, "name" | "description" | "instructions" | "knowledge" | "starters">): Promise<{ blocked: boolean; engine: string; flags: string[] }> {
  const text = [share.name, share.description, share.instructions, share.knowledge, ...share.starters].join("\n").slice(0, 30_000);
  const v = await moderateText(text);
  const flags: string[] = [];
  if (!v.allowed) flags.push(`moderation: ${v.category ?? "flagged"}`);
  for (const re of OVERRIDE) if (re.test(text)) { flags.push("tries to override Keplar's rules"); break; }
  if (/\b(?:\d[ -]?){13,19}\b|\bsk_(live|test)_[A-Za-z0-9]{8,}|\bAKIA[0-9A-Z]{16}\b/.test(text)) flags.push("looks like it contains a card number or key");
  if (share.knowledge) flags.push("includes reference notes");
  return { blocked: !v.allowed, engine: v.engine, flags };
}

export const validCategory = (c: unknown): c is DirectoryCategory => DIRECTORY_CATEGORIES.some((x) => x.id === c);

export async function submitListing(workspaceId: string, token: unknown, category: unknown, at = Date.now()): Promise<SpecialistListing> {
  if (!validSpecialistToken(token)) throw new DirectoryError("Make a specialist link first.", "not_found");
  if (!validCategory(category)) throw new DirectoryError("Pick a category.", "invalid");
  const share = await openSpecialistShare(token, {}, at);
  if (!share || share.workspaceId !== workspaceId) throw new DirectoryError("That link isn't one of your live specialist links.", "not_found");
  const mine = await rows().list(workspaceId);
  const existing = mine.find((r) => r.token === token);
  if (existing && existing.status !== "rejected") throw new DirectoryError(existing.status === "listed" ? "It's already in the directory." : "It's already waiting for review.", "duplicate");
  if (mine.filter((r) => r.status === "pending").length >= DIRECTORY_LIMITS.pendingPerAccount) throw new DirectoryError(`You have ${DIRECTORY_LIMITS.pendingPerAccount} specialists waiting for review. Wait for those first.`, "limit");
  if (mine.filter((r) => r.status === "listed").length >= DIRECTORY_LIMITS.listedPerAccount) throw new DirectoryError(`You can list up to ${DIRECTORY_LIMITS.listedPerAccount} specialists.`, "limit");
  const s = await screenSpecialist(share);
  const row: SpecialistListing = {
    id: token, workspaceId, token, name: share.name, description: share.description, category,
    status: s.blocked ? "rejected" : "pending", screen: { engine: s.engine, flags: s.flags },
    createdAt: new Date(at).toISOString(), decidedAt: s.blocked ? new Date(at).toISOString() : null, decidedBy: s.blocked ? "automatic screen" : null,
    ...(s.blocked ? { note: "Our automatic content check didn't allow it." } : {}),
  };
  if (existing) await rows().update(workspaceId, token, row);
  else await rows().insert(row);
  return row;
}

export async function withdrawListing(workspaceId: string, token: string): Promise<boolean> {
  if (!validSpecialistToken(token)) return false;
  return rows().remove(workspaceId, token);
}

export async function listingsOf(workspaceId: string): Promise<SpecialistListing[]> {
  return (await rows().list(workspaceId)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Admin review. Only a pending or listed/hidden entry can change; rejected stays rejected unless the owner submits again. */
export async function decideListing(token: string, decision: "list" | "hide" | "reject", by: string, note = "", at = Date.now()): Promise<SpecialistListing | null> {
  if (!validSpecialistToken(token)) return null;
  const r = await rows().findSystemBy("token", token);
  if (!r) return null;
  const status: ListingStatus = decision === "list" ? "listed" : decision === "hide" ? "hidden" : "rejected";
  return rows().update(r.workspaceId, r.id, { status, decidedAt: new Date(at).toISOString(), decidedBy: by, note: note.slice(0, 300) });
}

export async function listingsForReview(limit = 200): Promise<SpecialistListing[]> {
  return (await rows().listSystem()).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

/** The public directory: approved listings whose link is still live, newest first, optionally by category or words. */
export async function publicDirectory(opts: { category?: unknown; q?: unknown } = {}, at = Date.now()): Promise<(Pick<SpecialistListing, "token" | "name" | "description" | "category"> & { copies: number; starters: string[] })[]> {
  const all = await rows().listSystem((r) => r.status === "listed");
  const cat = validCategory(opts.category) ? opts.category : null;
  const q = typeof opts.q === "string" ? opts.q.toLowerCase().trim().slice(0, DIRECTORY_LIMITS.query) : "";
  const out = [];
  for (const r of all.sort((a, b) => ((a.decidedAt ?? "") < (b.decidedAt ?? "") ? 1 : -1))) {
    if (cat && r.category !== cat) continue;
    if (q && !`${r.name} ${r.description}`.toLowerCase().includes(q)) continue;
    const share = await openSpecialistShare(r.token, {}, at);
    if (!share) continue;
    out.push({ token: r.token, name: share.name, description: share.description, category: r.category, copies: share.copies, starters: share.starters.slice(0, 2) });
    if (out.length >= DIRECTORY_LIMITS.page) break;
  }
  return out;
}
