/**
 * Preview of a template at /sites/template/<slug>, shown in the gallery's sandboxed iframe and thumbnails. Renders the stored snapshot with the same sanitizer
 * and strict site CSP as every Keplar site (no scripts, no frames, opaque origin). Feature placeholders (forms, bookings, ...) are shown as
 * inert notes: a preview never touches any site's data. Never indexed.
 */
import { findPlaceholders } from "@/lib/site-builder/features/placeholders";
import { featureInfo } from "@/lib/site-builder/features/catalog";
import { pageFromPath, renderCss, renderPage, siteHeaders } from "@/lib/site-builder/render";
import { defaultSeo } from "@/lib/site-builder/store";
import { openTemplate } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const note = (status: number, title: string, text: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#52525b"><div style="text-align:center;max-width:380px;padding:24px"><h1 style="font-size:20px;color:#18181b">${esc(title)}</h1><p>${esc(text)}</p></div>`, { status, headers: siteHeaders("preview", "text/html; charset=utf-8") });

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path } = await params;
  const t = await openTemplate(slug).catch(() => null);
  if (!t) return note(404, "Template not available", "This template doesn't exist or was removed.");
  const last = path?.[path.length - 1];
  if (last === "_report" || last === "_lead") return Response.redirect(new URL(`/templates/${slug}#report`, req.url), 303);
  const file = pageFromPath(path, t.files);
  if (!file) return note(404, "Page not found", "This page doesn't exist in this template.");
  const site = { id: `tp${slug.replace(/[^a-z0-9]/g, "").slice(0, 24)}`, slug, name: t.view.title, seo: defaultSeo(t.view.title) };
  const base = `/sites/template/${slug}`; // under /sites/: the one prefix next.config.ts leaves out of the app CSP and X-Frame-Options, so the gallery can frame it
  const ctx = { site, mode: "live" as const, base, plan: "business" as const, thumb: true }; // "business": no Free-plan watermark on a template preview
  if (file.endsWith(".css")) return new Response(renderCss(t.files, file, ctx), { headers: siteHeaders("preview", "text/css; charset=utf-8") });
  let html = renderPage(t.files, file, ctx);
  for (const p of findPlaceholders(html)) {
    const label = featureInfo(p.feature)?.label ?? p.feature;
    html = html.replace(p.raw, `<div class="k-feat" style="border:1px dashed currentColor;border-radius:12px;padding:16px;margin:16px 0;opacity:.8"><p><strong>${esc(p.attrs.title || label)}</strong></p><p><small>${esc(label)}: connected to your own inbox and settings once you remix this template.</small></p></div>`);
  }
  return new Response(html, { headers: siteHeaders("preview", "text/html; charset=utf-8", { scripts: false }) });
}
