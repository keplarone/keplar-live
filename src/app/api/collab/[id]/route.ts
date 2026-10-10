/**
 * Live session for one creation.
 * GET  → your role, the room (seeded / moved onto the newest version when safe), the transport to use, branches.
 * POST → { action: "save", message? } saves the session as a new version (editors+)
 *        { action: "pull" } moves the session onto the newest version even with unsaved live edits (editors+)
 *        { action: "split" } your own branch of the creation as it is right now, in your workspace (editors+)
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import { assertCan } from "@/lib/collab/access";
import { access } from "@/lib/collab/caller";
import { collabCan, ROLE_NAME } from "@/lib/collab/roles";
import { relayBackend } from "@/lib/collab/relay";
import { branchesOf, openRoom, saveSession, splitOff } from "@/lib/collab/session";
import { transportFor } from "@/lib/collab/transport";
import { previewToken } from "@/lib/site-builder/render";
import { fromB64, docFromUpdates, docFiles, fingerprint } from "@/lib/collab/doc";
import { getVersion } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { access: a, user } = await access(req, (await params).id);
    await rateLimit(`collab:open:${user.id}`, 60, 60, { shared: true });
    const room = await openRoom(a.site);
    const actions = (["edit", "save", "split", "run", "invite", "deploy"] as const).filter((x) => collabCan(a.role, x));
    return json({
      site: { id: a.site.id, name: a.site.name, kind: a.site.kind ?? "site", headVersion: a.site.headVersion, publishedVersion: a.site.publishedVersion, slug: a.site.slug },
      me: { id: user.id, name: user.name, color: a.user.color, role: a.role, roleName: ROLE_NAME[a.role], via: a.via, actions },
      room,
      transport: transportFor(a.site.id, user.id, a.role),
      backend: relayBackend(),
      branches: await branchesOf(a.site).catch(() => []),
      // apps run their modules from a signed draft URL that serves the live session; sites render client-side from the doc
      // fingerprints of the base version's files, so the file tree can mark what changed in this session
      baseFingerprints: Object.fromEntries(Object.entries((await getVersion(a.site, room.base).catch(() => null))?.files ?? {}).map(([p, t]) => [p, fingerprint(t)])),
      livePreview: a.site.kind === "app" ? `/apps/draft/${a.site.id}/live/${previewToken(a.site.id)}/` : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a, user, personal } = await access(req, (await params).id);
    const input = await body<{ action?: string; message?: string; contributors?: unknown; state?: string }>(req);
    // In WebSocket mode the server has no copy of the doc: the client sends its full state with save/split.
    const files = typeof input.state === "string" && input.state.length < 4_000_000 ? (() => { const d = docFromUpdates([fromB64(input.state!)]); const f = docFiles(d); d.destroy(); return f; })() : undefined;
    const contributors = Array.isArray(input.contributors) ? input.contributors.map((c) => String(c).slice(0, 60)).slice(0, 8) : [];
    if (input.action === "save") {
      assertCan(a, "save");
      await rateLimit(`collab:save:${a.site.id}`, 20, 60, { shared: true });
      const plan = await siteOwnerPlan(a.site.workspaceId);
      const r = await saveSession(a.site, plan, { files, message: input.message, by: user.name, contributors });
      const saved = await getVersion(r.site, r.version).catch(() => null);
      return json({ version: r.version, changed: r.changed, headVersion: r.site.headVersion, baseFingerprints: Object.fromEntries(Object.entries(saved?.files ?? {}).map(([p, t]) => [p, fingerprint(t)])) });
    }
    if (input.action === "pull") {
      assertCan(a, "edit");
      const room = await openRoom(a.site, { pull: true });
      return json({ room, baseFingerprints: Object.fromEntries(Object.entries((await getVersion(a.site, room.base).catch(() => null))?.files ?? {}).map(([p, t]) => [p, fingerprint(t)])) });
    }
    if (input.action === "split") {
      assertCan(a, "split");
      if (!personal) throw new HttpError(401, "Sign in to split off a branch.", "unauthenticated");
      await rateLimit(`collab:split:${user.id}`, 6, 600, { shared: true });
      const r = await splitOff(a.site, personal, { by: user.id, byName: user.name, files });
      return json({ site: { id: r.site.id, name: r.site.name, headVersion: r.site.headVersion }, branch: r.branch });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errorResponse(e);
  }
}
