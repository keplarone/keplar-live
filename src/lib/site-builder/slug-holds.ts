/**
 * Released addresses. When a deleted site is purged its /s/<slug> is not handed straight to the next person: it is held for
 * the workspace that owned it (SLUG_HOLD_MS), so nobody else can pick up a name that old links, search results or a custom
 * domain redirect may still point at. The owner can reuse it at once. While held, the public address answers 410 Gone.
 * Rows live under the shared "system" tenant keyed by slug; they hold no personal data (an opaque workspace id and dates).
 */
import { now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";

export const SLUG_HOLD_MS = 30 * 86_400_000;
const SYSTEM = "system";

export type SlugHold = { id: string; workspaceId: string; ownerWorkspaceId: string; releasedAt: string; until: string };
export const slugHolds = () => collection<SlugHold>("sb_slug_holds");

export async function holdSlug(slug: string, ownerWorkspaceId: string, ms = SLUG_HOLD_MS): Promise<SlugHold> {
  const row: SlugHold = { id: slug, workspaceId: SYSTEM, ownerWorkspaceId, releasedAt: now(), until: new Date(Date.now() + ms).toISOString() };
  await slugHolds().remove(SYSTEM, slug);
  await slugHolds().insert(row);
  return row;
}

/** The live hold on this address, if any (expired holds are ignored). */
export async function activeHold(slug: string): Promise<SlugHold | null> {
  const h = await slugHolds().get(SYSTEM, slug.toLowerCase());
  return h && h.until > now() ? h : null;
}

/** True when someone other than `workspaceId` is holding the address. */
export async function heldByOther(slug: string, workspaceId: string): Promise<boolean> {
  const h = await activeHold(slug);
  return Boolean(h && h.ownerWorkspaceId !== workspaceId);
}

/** The owner took the address back (a new site with the same name): the hold is no longer needed. */
export async function releaseHold(slug: string): Promise<void> {
  await slugHolds().remove(SYSTEM, slug);
}

/** Housekeeping: drops expired holds. */
export async function sweepHolds(limit = 500): Promise<number> {
  return slugHolds().purgeSystemBefore("until", now(), limit);
}
