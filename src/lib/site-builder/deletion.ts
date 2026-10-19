/**
 * Deleting a Create site: soft delete, undo, then purge.
 *
 *  1. softDeleteSite  (DELETE /api/sites/:id)         The site is hidden at once: gone from lists and every owner API (404), the public
 *                                                      address answers 410, the custom domain stops serving, caches are purged. Nothing is
 *                                                      destroyed yet, so Undo can restore everything exactly as it was.
 *  2. restoreSite     (POST /api/sites/:id/restore)   Undo. Allowed until `purgeAfter` (GRACE_MS; the screen offers 6 s).
 *  3. purgeSite       (DELETE /api/sites/:id?purge=1)  Called by the screen when the undo window ends, and by the sweep (cron, and every site
 *                                                      list read) for anything that was never finalized. Detaches custom domains from hosting first
 *                                                      (if that fails the site stays soft-deleted and is retried), holds the address for its
 *                                                      owner, then removes versions, leads, screenshots and product images, and the row.
 *
 * Kept on purpose: images made in the Images tab (they live in the user's library), abuse-report records, and all Business OS
 * data (orders, customers). Create sites have no checkout of their own, so there is no commerce to archive; a pending
 * Business checkout that points at the site blocks deletion until it settles.
 */
import { orders } from "@/lib/business/repo";
import { removeDomainsForSite } from "@/lib/domains/service";
import { invalidateHost } from "@/lib/domains/routing";
import { domainStore } from "@/lib/domains/store";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import type { Workspace } from "@/lib/create/platform/workspace";
import { setPublic } from "@/lib/images/blob";
import { imageJobs } from "@/lib/images/store";
import { listAssets } from "./product/assets";
import { SLUG_HOLD_DAYS, UNDO_SECONDS, type RemovalBlocker, type RemovalImpact } from "./deletion-copy";
import { removeTemplatesOfSite } from "@/lib/templates/store";
import { holdSlug, sweepHolds } from "./slug-holds";
import { deleteSite, isDeleted, leads, sites, versionMetas, versions } from "./store";
import { purgeSiteCaches } from "./revalidate";
import type { Site } from "./types";

export { SLUG_HOLD_DAYS, UNDO_SECONDS };
/** How long a soft-deleted site stays restorable on the server. The screen only offers UNDO_SECONDS; the rest absorbs slow networks and closed tabs. */
export const GRACE_MS = 10 * 60_000;
const OPEN_ORDER_MS = 24 * 3_600_000;

const asWs = (site: Pick<Site, "workspaceId">) => ({ id: site.workspaceId }) as Workspace; // the helpers below only read `id`

/** Reasons this site cannot be deleted right now (shown in the dialog and enforced by the API). */
export async function deletionBlockers(site: Site): Promise<RemovalBlocker[]> {
  const out: RemovalBlocker[] = [];
  if (site.takenDown) out.push({ code: "taken_down", message: "This site was taken down for breaking the terms and is kept while it is reviewed. Contact support if you need it removed." });
  const since = Date.now() - OPEN_ORDER_MS;
  const open = await orders().list(site.workspaceId, (o) => o.projectId === site.id && o.status === "pending" && Date.parse(o.createdAt) > since).catch(() => []);
  if (open.length) out.push({ code: "open_orders", message: `${open.length === 1 ? "A customer is" : `${open.length} customers are`} in the middle of paying for something on this site. Wait for ${open.length === 1 ? "it" : "them"} to finish (or expire), then delete the site. Paid orders are never deleted.` });
  return out;
}

export async function removalImpact(site: Site): Promise<RemovalImpact> {
  const [vs, ls, assets, domains, jobs, blockers] = await Promise.all([
    versionMetas(site), // counted without reading any version's files
    leads().list(site.workspaceId, (l) => l.siteId === site.id),
    listAssets(asWs(site)).catch(() => []),
    domainStore().listBySite(site.workspaceId, site.id).catch(() => []),
    imageJobs().list(site.workspaceId, (j) => j.usedIn.some((u) => u.siteId === site.id)).catch(() => []),
    deletionBlockers(site),
  ]);
  return {
    siteId: site.id,
    name: site.name,
    slug: site.slug,
    published: site.publishedVersion !== null,
    versions: vs.length,
    leads: ls.length,
    assets: assets.filter((a) => a.siteId === site.id).length,
    domains: domains.map((d) => d.hostname),
    libraryImages: jobs.length,
    blockers,
  };
}

/** Product images of this site: public by id while the site is live, private while it is deleted. */
async function setSiteAssetsPublic(site: Site, isPublic: boolean) {
  for (const a of (await listAssets(asWs(site)).catch(() => [])).filter((x) => x.siteId === site.id)) await setPublic(site.workspaceId, a.id, isPublic).catch(() => false);
}

async function dropCaches(site: Site) {
  for (const d of await domainStore().listBySite(site.workspaceId, site.id).catch(() => [])) invalidateHost(d.hostname);
  await purgeSiteCaches(site, (await versions().get(site.workspaceId, `${site.id}_v${site.publishedVersion ?? site.headVersion}`).catch(() => null))?.files ?? {});
}

/** Step 1. Idempotent: deleting a deleted site returns the same deadline. */
export async function softDeleteSite(ws: Pick<Workspace, "id">, site: Site): Promise<{ deletedAt: string; purgeAfter: string }> {
  if (isDeleted(site)) return { deletedAt: site.deletedAt as string, purgeAfter: site.purgeAfter ?? new Date(Date.parse(site.deletedAt as string) + GRACE_MS).toISOString() };
  const blockers = await deletionBlockers(site);
  if (blockers.length) throw new HttpError(409, blockers[0].message, blockers[0].code, { blockers });
  // One clock read. A second Date.now() can land a millisecond later, so the
  // stored window would be GRACE_MS + 1 and the exact-duration check flakes.
  const deletedAtMs = Date.now();
  const deletedAt = new Date(deletedAtMs).toISOString();
  const purgeAfter = new Date(deletedAtMs + GRACE_MS).toISOString();
  const row = await sites().update(ws.id, site.id, { deletedAt, purgeAfter, updatedAt: deletedAt });
  if (!row) throw new HttpError(404, "Site not found.", "not_found");
  await setSiteAssetsPublic(site, false);
  await dropCaches(site);
  return { deletedAt, purgeAfter };
}

/** Step 2: Undo. */
export async function restoreSite(ws: Workspace, id: string): Promise<Site> {
  const site = await sites().get(ws.id, id);
  if (!site) throw new HttpError(404, "Site not found.", "not_found");
  if (!isDeleted(site)) return site; // nothing to undo
  if (site.purgeAfter && site.purgeAfter <= now()) throw new HttpError(410, "This site was already removed and can't be brought back.", "gone");
  const live = (await sites().list(ws.id, (s) => !isDeleted(s))).length;
  if (live >= ws.entitlements.projects) throw new HttpError(409, `Your plan includes ${ws.entitlements.projects} site${ws.entitlements.projects === 1 ? "" : "s"}, and they're all in use. Delete another one first, then undo.`, "limit");
  const back = await sites().update(ws.id, id, { deletedAt: null, purgeAfter: null, updatedAt: now() });
  if (!back) throw new HttpError(404, "Site not found.", "not_found");
  await setSiteAssetsPublic(back, true);
  await dropCaches(back);
  return back;
}

/** Library images lose their link to the site; one that no site uses any more stops being publicly readable. */
async function releaseLibraryImages(site: Site) {
  const jobs = await imageJobs().list(site.workspaceId, (j) => j.usedIn.some((u) => u.siteId === site.id));
  for (const j of jobs) {
    const usedIn = j.usedIn.filter((u) => u.siteId !== site.id);
    await imageJobs().update(site.workspaceId, j.id, { usedIn, updatedAt: now() });
    if (!usedIn.length && j.blobId) await setPublic(site.workspaceId, j.blobId, false).catch(() => false);
  }
}

/** Step 3: destroy. Throws (site stays soft-deleted, retried later) if a custom domain can't be detached from hosting. */
export async function purgeSite(site: Site): Promise<void> {
  if (!isDeleted(site)) throw new HttpError(409, "Delete the site first.", "conflict");
  if (site.takenDown) throw new HttpError(409, "This site was taken down for breaking the terms and is kept while it is reviewed.", "taken_down");
  await removeDomainsForSite({ id: site.workspaceId }, site.id); // never leave a domain attached at the host with no owner row
  await holdSlug(site.slug, site.workspaceId); // before the row goes: the address is never free for a stranger in between
  await releaseLibraryImages(site).catch(() => undefined);
  await removeTemplatesOfSite(site.workspaceId, site.id).catch(() => 0); // a shared template snapshot goes with its site
  await deleteSite(asWs(site), site);
  await purgeSiteCaches(site, {});
}

/** Everything past its grace period (system job) or only one workspace's (cheap lazy sweep on list reads). Never throws. */
export async function purgeDueSites(opts: { workspaceId?: string; limit?: number } = {}): Promise<{ purged: number; failed: number }> {
  const at = now();
  const overdue = (s: Site) => isDeleted(s) && Boolean(s.purgeAfter) && (s.purgeAfter as string) <= at;
  const due = opts.workspaceId
    ? (await sites().list(opts.workspaceId, overdue).catch(() => [])).slice(0, opts.limit ?? 5)
    : (await sites().listSystemRange({ field: "purgeAfter", gte: "2000-01-01T00:00:00.000Z", lt: at }, opts.limit ?? 25).catch(() => [])).filter(overdue);
  const out = { purged: 0, failed: 0 };
  for (const s of due) {
    try {
      await purgeSite(s);
      out.purged++;
    } catch (e) {
      out.failed++;
      console.error("[sites] purge failed", s.id, e instanceof Error ? e.message : e);
    }
  }
  if (!opts.workspaceId) await sweepHolds().catch(() => 0);
  return out;
}
