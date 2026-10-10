import { assertSameAccount } from "@/lib/accounts/account-guard";
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { purgeSite, softDeleteSite, UNDO_SECONDS } from "@/lib/site-builder/deletion";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { previewToken } from "@/lib/site-builder/render";
import { getSite, headFiles, sites, toSummary, updateSite, versionList } from "@/lib/site-builder/store";
import type { SiteFx } from "@/lib/site-builder/fx/types";
import type { SiteSeo } from "@/lib/site-builder/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const site = await getSite(ws, (await params).id);
    const files = await headFiles(site);
    return json({
      site: toSummary(site, new URL(req.url).origin),
      messages: site.messages,
      files,
      pages: Object.keys(files).filter((f) => f.endsWith(".html")).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b))),
      versions: await versionList(site),
      previewToken: previewToken(site.id),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const site = await getSite(ws, (await params).id);
    const input = await body<{ name?: string; slug?: string; seo?: Partial<SiteSeo>; fx?: Partial<SiteFx>; archived?: boolean; featureSettings?: { notifyOwner?: boolean; confirmVisitors?: boolean; analytics?: boolean } }>(req);
    const updated = await updateSite(ws, site, input);
    return json({ site: toSummary(updated, new URL(req.url).origin) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * DELETE /api/sites/:id           soft delete (hidden and 410 at once, restorable for a short grace period; see lib/site-builder/deletion.ts)
 * DELETE /api/sites/:id?purge=1   finalize: remove the site's data for good (the screen calls it when the 6 s undo window ends).
 * Owner only (workspace-scoped lookups: someone else's site is a plain 404), same-origin only, rate limited.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    await rateLimit(`sb:delete:${ws.id}`, 30, 60, { shared: true });
    const id = (await params).id;
    if (new URL(req.url).searchParams.get("purge") === "1") {
      const gone = await sites().get(ws.id, id);
      if (!gone) throw new HttpError(404, "Site not found.", "not_found");
      if (!gone.deletedAt) throw new HttpError(409, "Delete the site first, then finalize.", "conflict");
      await purgeSite(gone); // throws (site stays soft-deleted, retried by the sweep) if a custom domain can't be detached from hosting
      return json({ ok: true, purged: true });
    }
    const site = await getSite(ws, id);
    const { deletedAt, purgeAfter } = await softDeleteSite(ws, site);
    return json({ ok: true, deletedAt, purgeAfter, undoSeconds: UNDO_SECONDS });
  } catch (e) {
    return errorResponse(e);
  }
}
