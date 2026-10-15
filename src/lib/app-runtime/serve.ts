/** Serves one generated app (draft preview or published) at a base path: its files, and its API under `_api/`. */
import { appFileFor, appHeaders, designFileFor, DESIGN_FILE, etagOf, renderAppPage, resolveImageRefs } from "@/lib/app-builder/files";
import type { PlanId } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import type { Site, SiteVersion } from "@/lib/site-builder/types";
import { appCtx, effectiveMeta, type AppEnv } from "./context";
import { handleAppApi, json, preflight } from "./router";

export type ServeOpts = { site: Site; version: SiteVersion; env: AppEnv; parts: string[]; base: string; origin: string; plan: PlanId; reportHref: string | null; workspace?: Workspace; viewOnly?: boolean };

export async function serveApp(req: Request, o0: ServeOpts): Promise<Response> {
  const o = o0.site.app ? { ...o0, site: { ...o0.site, app: effectiveMeta(o0.site.app, o0.env) } } : o0;
  const base = appCtx(o0.site, o.env, o.plan);
  if (!base) return json(404, { error: "Not an app." });
  const ctx = { ...(o.workspace && o.workspace.id === o0.site.workspaceId ? { ...base, workspace: o.workspace } : base), ...(o.viewOnly ? { viewOnly: true } : {}) };
  if (req.method === "OPTIONS") return preflight();
  if (o.parts[0] === "_api") return handleAppApi(req, ctx, o.parts.slice(1), `${o.origin}${o.base}/`);
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  const files = o.version.files;
  const file = appFileFor(o.parts, files);
  if (!file) return new Response("Not found", { status: 404, headers: { ...appHeaders(o.env, "x.txt"), "content-type": "text/plain; charset=utf-8" } });
  const body =
    file === DESIGN_FILE
      ? designFileFor(o.site.app!)
      : file.endsWith(".html")
        ? renderAppPage(files[file], { meta: o.site.app!, siteId: o.site.id, env: o.env, base: o.base && !file.includes("/") ? o.base : undefined, api: `${o.base}/_api`, plan: o.plan, reportHref: o.reportHref, images: o.site.app!.images ?? {}, title: o.site.app!.spec.name })
        : files[file];
  const served = file === DESIGN_FILE ? body : resolveImageRefs(body, o.site.app!);
  const headers = appHeaders(o.env, file);
  if (!file.endsWith(".html")) {
    const tag = etagOf(served);
    headers.etag = tag;
    if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === "HEAD" ? null : served, { headers });
}
