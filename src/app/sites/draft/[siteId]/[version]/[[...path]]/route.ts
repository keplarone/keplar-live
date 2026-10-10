/**
 * Draft preview of a builder site, shown in the studio's sandboxed iframe. Access is a short-lived signed
 * token in the URL (the sandboxed frame has no cookies). Served with the strict site CSP: no scripts.
 */
import { expandFeatures } from "@/lib/site-builder/features/expand";
import { checkPreviewToken, fxActive, pageFromPath, renderCss, renderPage, siteHeaders } from "@/lib/site-builder/render";
import { getVersion, isDeleted, sites } from "@/lib/site-builder/store";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const note = (status: number, title: string, text: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#52525b"><div style="text-align:center;max-width:380px;padding:24px"><h1 style="font-size:20px;color:#18181b">${title}</h1><p>${text}</p></div>`, { status, headers: siteHeaders("preview", "text/html; charset=utf-8") });

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string; version: string; path?: string[] }> }) {
  const { siteId, version, path } = await params;
  const token = new URL(req.url).searchParams.get("t");
  if (!checkPreviewToken(siteId, token)) return note(403, "Preview expired", "Reload the builder to refresh this preview.");
  const found = await sites().findSystemBy("id", siteId);
  const site = found && !isDeleted(found) ? found : null; // a deleted site has no preview either
  const n = Number(version);
  const v = site && Number.isInteger(n) ? await getVersion(site, n) : null;
  if (!site || !v) return note(404, "No preview yet", "Describe what you want to build to see a preview.");
  const plan = await siteOwnerPlan(site.workspaceId);
  const file = pageFromPath(path, v.files);
  if (!file && v.files["404.html"] !== undefined) {
    const nf = { site, mode: "preview" as const, version: n, token: token as string, thumb: false, plan };
    return new Response(renderPage(v.files, "404.html", nf), { status: 404, headers: siteHeaders("preview", "text/html; charset=utf-8", { scripts: false }) });
  }
  if (!file) return note(404, "Page not found", "This page doesn't exist in this version.");
  const thumb = new URL(req.url).searchParams.get("thumb") === "1";
  const ctx = { site, mode: "preview" as const, version: n, token: token as string, thumb, plan };
  if (file.endsWith(".css")) return new Response(renderCss(v.files, file, ctx), { headers: siteHeaders("preview", "text/css; charset=utf-8") });
  const html = await expandFeatures(renderPage(v.files, file, ctx), { site, base: `/s/${site.slug}`, preview: true, file });
  return new Response(html, { headers: siteHeaders("preview", "text/html; charset=utf-8", { scripts: fxActive(site, v.files[file] ?? "", thumb) }) });
}
