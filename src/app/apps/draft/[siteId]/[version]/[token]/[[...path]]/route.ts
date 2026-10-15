/**
 * Draft preview of a Keplar app, shown in the builder's sandboxed iframe (and opened by the build's browser tests).
 * Access is a short-lived signed token in the PATH (not the query), so the app's relative module imports keep working.
 * The app's API for the preview lives under `_api/` here and uses the app's separate draft data.
 */
import { previewScope } from "@/lib/site-builder/render";
import { getVersion, isDeleted, sites } from "@/lib/site-builder/store";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import { serveApp } from "@/lib/app-runtime/serve";
import { CORS } from "@/lib/app-runtime/router";
import { siteUrl } from "@/lib/site";
import { liveFiles } from "@/lib/collab/session";
import { collection } from "@/lib/create/platform/store";
import { finishFiles } from "@/lib/app-builder/generate";
import type { AppBuild } from "@/lib/app-builder/types";
import type { Site, SiteVersion } from "@/lib/site-builder/types";

/** "b.<buildId>": the build still running for this project, with the files it has written so far (live preview while it tests and fixes). */
async function buildPreview(siteId: string, buildId: string): Promise<{ site: Site; version: SiteVersion } | null> {
  const found = await sites().findSystemBy("id", siteId);
  if (!found || isDeleted(found)) return null;
  const b = await collection<AppBuild & { siteId: string; workspaceId: string }>("app_builds").get(found.workspaceId, buildId);
  if (!b || b.siteId !== siteId || !b.spec || !Object.keys(b.files).length) return null;
  const prev = found.app;
  const site: Site = { ...found, kind: "app", app: { spec: b.spec, design: b.design, images: b.images, admins: prev?.admins ?? [], settings: prev?.settings ?? { signups: true, ai: true, uploads: true }, ...(prev?.live ? { live: prev.live } : {}) } };
  const files = finishFiles(b.spec, b.files);
  const version = { id: `build-${b.id}`, workspaceId: found.workspaceId, siteId, n: found.headVersion ?? 0, files, summary: "", prompt: b.prompt, kind: "ai", model: null, units: 0, bytes: 0, createdAt: b.startedAt } as SiteVersion;
  return { site, version };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ siteId: string; version: string; token: string; path?: string[] }> };

const note = (status: number, title: string, text: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#52525b"><div style="text-align:center;max-width:380px;padding:24px"><h1 style="font-size:20px;color:#18181b">${title}</h1><p>${text}</p></div>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox", "cache-control": "no-store", ...CORS },
  });

async function handle(req: Request, { params }: Ctx) {
  const { siteId, version, token, path } = await params;
  const scope = previewScope(siteId, token);
  if (!scope) return note(403, "Preview expired", "Reload the builder to refresh this preview.");
  const viewOnly = scope === "view";
  const parts = path ?? [];
  const url = new URL(req.url);
  if (version.startsWith("b.")) {
    const bp = await buildPreview(siteId, version.slice(2)).catch(() => null);
    if (!bp) return note(404, "Still writing", "The preview appears as soon as the code is written.");
    const plan = await siteOwnerPlan(bp.site.workspaceId);
    return serveApp(req, { site: bp.site, version: bp.version, env: "draft", parts, base: `/apps/draft/${siteId}/${version}/${token}`, origin: url.origin.startsWith("http://localhost") || url.origin.startsWith("http://127.") ? url.origin : siteUrl, plan, reportHref: null, viewOnly });
  }
  // No redirect to a trailing slash: Next.js strips it (308), so that would loop. Pages carry a <base> instead.
  const found = await sites().findSystemBy("id", siteId);
  const site = found && !isDeleted(found) && found.kind === "app" && found.app ? found : null;
  // "live" = the shared live-collaboration session as it is right now (unsaved edits included), on top of the head version.
  const isLive = version === "live";
  const n = isLive ? (site?.headVersion ?? 0) : Number(version);
  const head = site && Number.isInteger(n) && n > 0 ? await getVersion(site, n) : null;
  const liveSrc = isLive && head ? await liveFiles(siteId).catch(() => null) : null;
  const v = head && liveSrc ? { ...head, files: liveSrc } : head;
  if (!site || !v) return note(404, "No preview yet", "Describe what you want to build to see a preview.");
  const plan = await siteOwnerPlan(site.workspaceId);
  const base = `/apps/draft/${siteId}/${isLive ? "live" : n}/${token}`;
  return serveApp(req, { site, version: v, env: "draft", parts, base, origin: url.origin.startsWith("http://localhost") || url.origin.startsWith("http://127.") ? url.origin : siteUrl, plan, reportHref: null, viewOnly });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
