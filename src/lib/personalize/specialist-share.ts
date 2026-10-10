/**
 * Specialist links: share a copy of one of your specialists. The link shows a snapshot taken when you made it (name,
 * description, instructions, starters, and the reference notes only if you chose to include them). Anyone signed in can add
 * a copy to their own specialists; your original never changes and nobody sees your chats. Revoke any time; links expire.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { createSpecialist, type Specialist } from "./specialists";

export const SPECIALIST_SHARE_LIMITS = { live: 30, perHour: 10, days: 180 } as const;

export type SpecialistShareRow = {
  id: string;
  workspaceId: string;
  token: string;
  specialistId: string;
  name: string;
  description: string;
  instructions: string;
  knowledge: string;
  starters: string[];
  includesNotes: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  views: number;
  copies: number;
};

const rows = () => collection<SpecialistShareRow>("specialist_shares");
export const validSpecialistToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{24}$/.test(t);
export class SpecialistShareLimitError extends Error {}

export async function createSpecialistShare(sp: Specialist, opts: { includeNotes: boolean }, at = Date.now()): Promise<SpecialistShareRow> {
  const own = await rows().list(sp.workspaceId);
  if (own.filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).length >= SPECIALIST_SHARE_LIMITS.live) throw new SpecialistShareLimitError(`You have ${SPECIALIST_SHARE_LIMITS.live} live specialist links. Stop sharing one to make another.`);
  if (own.filter((r) => Date.parse(r.createdAt) > at - 3_600_000).length >= SPECIALIST_SHARE_LIMITS.perHour) throw new SpecialistShareLimitError("You've made several specialist links in the last hour. Try again a little later.");
  const token = randomBytes(18).toString("base64url");
  return rows().insert({
    id: token, workspaceId: sp.workspaceId, token, specialistId: sp.id,
    name: sp.name, description: sp.description, instructions: sp.instructions, knowledge: opts.includeNotes ? sp.knowledge : "", starters: [...sp.starters],
    includesNotes: opts.includeNotes && Boolean(sp.knowledge), createdAt: new Date(at).toISOString(), expiresAt: new Date(at + SPECIALIST_SHARE_LIMITS.days * 864e5).toISOString(), views: 0, copies: 0,
  });
}

export async function liveSpecialistSharesOf(workspaceId: string, at = Date.now()): Promise<SpecialistShareRow[]> {
  return (await rows().list(workspaceId)).filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function revokeSpecialistShare(workspaceId: string, token: string): Promise<boolean> {
  if (!validSpecialistToken(token)) return false;
  const r = await rows().get(workspaceId, token);
  if (!r || r.revokedAt) return false;
  await rows().update(workspaceId, token, { revokedAt: new Date().toISOString() });
  return true;
}

/** Public lookup: live links only. */
export async function openSpecialistShare(token: string, opts: { count?: boolean } = {}, at = Date.now()): Promise<SpecialistShareRow | null> {
  if (!validSpecialistToken(token)) return null;
  const r = await rows().findSystemBy("token", token);
  if (!r || r.revokedAt || Date.parse(r.expiresAt) <= at) return null;
  if (opts.count) await rows().increment(r.workspaceId, r.id, { views: 1 }, { ...r, views: 0 }).catch(() => undefined);
  return r;
}

/** Adds a copy to the visitor's own specialists (plan caps apply). Copying your own link is allowed and makes a duplicate. */
export async function copySpecialistShare(token: string, toWorkspace: string, opts: { paid: boolean }, at = Date.now()): Promise<Specialist | null> {
  const r = await openSpecialistShare(token, {}, at);
  if (!r) return null;
  const sp = await createSpecialist(toWorkspace, { name: r.name, description: r.description, instructions: r.instructions, knowledge: r.knowledge, starters: r.starters }, opts, at);
  await rows().increment(r.workspaceId, r.id, { copies: 1 }, { ...r, copies: 0 }).catch(() => undefined);
  return sp;
}

export const publicView = (r: SpecialistShareRow) => ({ name: r.name, description: r.description, instructions: r.instructions, knowledge: r.knowledge, starters: r.starters, includesNotes: r.includesNotes, createdAt: r.createdAt });
