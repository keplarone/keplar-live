/**
 * Renders a stored site page for the draft preview and the published site.
 * Every response is re-sanitized here (defense in depth), relative links are rewritten to the right base,
 * SEO tags are injected, and forms are pointed at the lead endpoint. No scripts are ever emitted.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { authSecret } from "@/lib/accounts/secret";
import { siteUrl } from "@/lib/site";
import { buildDocument, sanitizeCss, sanitizeHtml, type UrlKind } from "./sanitize";
import { FX_GL_PATH, FX_LOADER_PATH } from "./fx/types";
import { getDirection } from "./design";
import { nsCss, nsHtml, sitePrefix } from "./namespace";
import { footerStrip, watermarkRequired } from "./watermark";
import type { PlanId } from "@/lib/create/platform/plans";
import type { Site } from "./types";

export type Mode = "preview" | "live";

/* ── preview tokens: let the sandboxed preview iframe (no cookies) load its own pages ── */
const sign = (data: string) => createHmac("sha256", createHmac("sha256", authSecret()).update("keplar:site-preview:v1").digest()).update(data).digest("base64url").slice(0, 32);

/**
 * "full" is the creator's (and editors') preview. "view" is for collaborators who may only look (collab viewers): the app's
 * draft runtime then never hands out sign-in links, so a viewer can't sign in as the app's draft users (AZ-5).
 */
export type PreviewScope = "full" | "view";

export function previewToken(siteId: string, ttlMs = 2 * 3_600_000, at = Date.now(), scope: PreviewScope = "full") {
  const exp = Math.floor((at + ttlMs) / 1000);
  return scope === "view" ? `${exp}.${sign(`${siteId}.${exp}.view`)}.v` : `${exp}.${sign(`${siteId}.${exp}`)}`;
}
/** The scope a valid, unexpired token grants, or null. */
export function previewScope(siteId: string, token: string | null, at = Date.now()): PreviewScope | null {
  if (!token) return null;
  const [exp, sig, kind, extra] = token.split(".");
  if (!exp || !sig || extra !== undefined || (kind !== undefined && kind !== "v") || !(Number(exp) * 1000 > at)) return null;
  const want = Buffer.from(sign(kind === "v" ? `${siteId}.${exp}.view` : `${siteId}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return kind === "v" ? "view" : "full";
}
export function checkPreviewToken(siteId: string, token: string | null, at = Date.now()) {
  return previewScope(siteId, token, at) !== null;
}

/* ── page <-> URL mapping ── */
export function pageFromPath(parts: string[] | undefined, files: Record<string, string>): string | null {
  let rel = (parts ?? []).join("/").replace(/\/+$/, "");
  if (!rel) rel = "index.html";
  if (rel.includes("..") || rel.startsWith("/")) return null;
  rel = rel.toLowerCase();
  if (files[rel] !== undefined) return rel;
  if (files[`${rel}.html`] !== undefined) return `${rel}.html`;
  return null;
}

/** `base` is the URL prefix the site is served under: `/s/<slug>` on keplar.one, "" on a custom domain. */
export function liveHref(slug: string, file: string, base: string = `/s/${slug}`) {
  if (file === "index.html") return base || "/";
  if (file.endsWith(".html")) return `${base}/${file.slice(0, -5)}`;
  return `${base}/${file}`;
}

function resolveRel(fromFile: string, url: string): { file: string; suffix: string } | null {
  const m = /^([^?#]*)([?#].*)?$/.exec(url);
  if (!m) return null;
  const base = path.posix.dirname(fromFile);
  const p = path.posix.normalize(path.posix.join(base === "." ? "" : base, m[1] || fromFile)).replace(/^\/+/, "");
  if (p.startsWith("..") || p === "") return null;
  return { file: p.toLowerCase(), suffix: m[2] ?? "" };
}

export type RenderCtx = {
  site: Pick<Site, "id" | "slug" | "name" | "seo"> & { fx?: Site["fx"]; design?: Site["design"] };
  mode: Mode;
  /** Draft preview only. */
  version?: number;
  token?: string;
  origin?: string;
  /** Live only: URL prefix of the site on this host. Default `/s/<slug>`; "" when served from a custom domain root. */
  base?: string;
  /** Draft thumbnails never run effects. */
  thumb?: boolean;
  /**
   * The site owner's CURRENT plan, read by the route at request time. Decides the "Made with Keplar" watermark
   * (see ./watermark.ts). Omitted means Free: when in doubt the watermark is shown.
   */
  plan?: PlanId;
};

function rewriter(ctx: RenderCtx, fromFile: string) {
  return (url: string, _kind: UrlKind) => {
    const r = resolveRel(fromFile, url);
    if (!r) return "#";
    if (ctx.mode === "live") return liveHref(ctx.site.slug, r.file, ctx.base) + r.suffix;
    const hash = r.suffix.startsWith("#") ? r.suffix : "";
    return `/sites/draft/${ctx.site.id}/${ctx.version}/${r.file}?t=${ctx.token}${hash}`;
  };
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The strip after the page content: the watermark (Free/Lite, live AND preview) and, on a published site, the abuse link
 * (every plan). Built by Keplar and appended after the sanitized user markup, so site code never produces or edits it.
 */
export function footer(slug: string, base: string = `/s/${slug}`, o: { plan?: PlanId; live?: boolean } = {}) {
  return footerStrip({ watermark: watermarkRequired(o.plan), reportHref: o.live === false ? null : `${base}/_report` });
}

/**
 * Effects run only when the owner turned them on AND the page carries effect hooks (Keplar adds those to designed sites).
 * Every other page, and every legacy/template site, is still served with no script at all.
 */
export function fxActive(site: { fx?: Site["fx"] }, rawHtml: string, thumb = false): boolean {
  if (thumb || !site.fx?.enabled || site.fx.intensity <= 0) return false;
  return /\sdata-(kfx|reveal|parallax)\b/i.test(rawHtml);
}

function fxTag(ctx: RenderCtx): string {
  const fx = ctx.site.fx;
  const dir = getDirection(ctx.site.design?.direction);
  const effect = fx && fx.effect !== "auto" ? fx.effect : dir.effect;
  const i = Math.max(0, Math.min(100, Math.round(fx?.intensity ?? 0)));
  return `\n<script src="${FX_LOADER_PATH}" data-i="${i}" data-e="${effect}" data-gl="${FX_GL_PATH}" defer></script>`;
}

export function renderPage(files: Record<string, string>, file: string, ctx: RenderCtx): string {
  const raw = nsHtml(files[file] ?? "", sitePrefix(ctx.site.id));
  const rewrite = rewriter(ctx, file);
  const s = sanitizeHtml(raw, {
    rewriteUrl: rewrite,
    formAction: `${ctx.base ?? `/s/${ctx.site.slug}`}/_lead${ctx.mode === "preview" ? "?preview=1" : ""}`,
    formFields: { _page: file },
    honeypot: true,
  });
  const seo = ctx.site.seo;
  const per = seo.pages?.[file];
  const origin = (ctx.origin || siteUrl).replace(/\/$/, "");
  const isHome = file === "index.html";
  const title = per?.title || (isHome && seo.title ? seo.title : s.head.title || seo.title || ctx.site.name);
  const description = per?.description || s.head.description || seo.description || "";
  const live = ctx.mode === "live";
  return buildDocument(s, {
    title,
    description,
    canonical: live ? `${origin}${liveHref(ctx.site.slug, file, ctx.base)}` : null,
    robots: live && seo.indexable ? "index,follow" : "noindex,nofollow",
    ogImage: seo.ogImage || null,
    ogSiteName: ctx.site.name,
    footerHtml: footer(ctx.site.slug, ctx.base, { plan: ctx.plan, live }),
    guard: watermarkRequired(ctx.plan) ? { pageCss: Object.entries(files).filter(([f]) => f.endsWith(".css")).map(([, c]) => c).join("\n") } : undefined,
    scriptHtml: fxActive(ctx.site, raw, ctx.thumb) ? fxTag(ctx) : "",
  });
}

export function renderCss(files: Record<string, string>, file: string, ctx: RenderCtx): string {
  return sanitizeCss(nsCss(files[file] ?? "", sitePrefix(ctx.site.id)), { rewriteUrl: (u) => { const r = resolveRel(file, u); return r ? rewriter(ctx, file)(u, "src") : u; } });
}

/** CSP for user sites: no scripts, no frames, sandboxed to an opaque origin; forms post only to Keplar. */
export function siteCsp(mode: Mode, scripts = false) {
  return [
    "default-src 'none'",
    // Scripts only for pages that carry Keplar's own effects loader: same-origin files, no inline, no user script (the sanitizer strips every <script>).
    ...(scripts ? ["script-src 'self'"] : []),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    mode === "preview" ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    `sandbox allow-forms allow-popups allow-popups-to-escape-sandbox${scripts ? " allow-scripts" : ""}`,
  ].join("; ");
}

export function siteHeaders(mode: Mode, contentType: string, opts: { scripts?: boolean } = {}): Record<string, string> {
  return {
    "content-type": contentType,
    "content-security-policy": siteCsp(mode, Boolean(opts.scripts)),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    // The sandboxed page has an opaque origin, so its own stylesheet counts as cross-origin: same-origin would block it.
    "cross-origin-resource-policy": "cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // HTML carries the plan-dependent watermark, so it is never cached by a CDN or browser (upgrade/downgrade must show at once). CSS does not depend on the plan.
    ...(mode === "preview" ? { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } : { "cache-control": /^text\/html/i.test(contentType) ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300" }),
  };
}

export function sitemapXml(site: Pick<Site, "slug">, files: Record<string, string>, origin: string, base?: string) {
  const urls = Object.keys(files).filter((f) => f.endsWith(".html") && f !== "404.html").map((f) => `<url><loc>${escHtml(origin + liveHref(site.slug, f, base))}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
}
