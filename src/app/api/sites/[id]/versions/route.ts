import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite, restoreVersion, saveFileEdit, toSummary } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Restore a version (or undo: restore the one before the current). Creates a new version; nothing is lost. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:restore:${ws.id}`, 20, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const input = await body<{ n?: number; undo?: boolean }>(req);
    let n = Number(input.n);
    if (input.undo) {
      const { versionList } = await import("@/lib/site-builder/store");
      const list = await versionList(site);
      const prev = list.filter((v) => v.n < site.headVersion).sort((a, b) => b.n - a.n)[0];
      if (!prev) throw new HttpError(409, "There's nothing earlier to go back to.", "conflict");
      n = prev.n;
    }
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Which version?");
    const { site: saved, version } = await restoreVersion(ws, site, n);
    return json({ site: toSummary(saved, new URL(req.url).origin), version: version.n });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Save a hand edit of one existing file as a new version. The workspace must own the site. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:edit:${ws.id}`, 30, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const input = await body<{ path?: unknown; content?: unknown }>(req);
    if (typeof input.path !== "string" || typeof input.content !== "string") throw new HttpError(400, "Send the file path and its new contents.");
    const { site: saved, version } = await saveFileEdit(ws, site, input.path, input.content);
    return json({ site: toSummary(saved, new URL(req.url).origin), version: version.n });
  } catch (e) {
    return errorResponse(e);
  }
}

/** One version's files, for the History "Compare" view (?n=3). Read-only; only the workspace's own sites. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:vget:${ws.id}`, 120, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const n = Number(new URL(req.url).searchParams.get("n"));
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Which version?");
    const { getVersion } = await import("@/lib/site-builder/store");
    const v = await getVersion(site, n);
    if (!v) throw new HttpError(404, "That version doesn't exist.", "not_found");
    return json({ n: v.n, summary: v.summary, createdAt: v.createdAt, files: v.files });
  } catch (e) {
    return errorResponse(e);
  }
}
