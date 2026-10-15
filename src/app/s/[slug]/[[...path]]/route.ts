/**
 * Published Keplar sites, path-based: /s/<slug>[/page]. Everything served here was sanitized when it was saved and is
 * sanitized again on the way out. CSP: no scripts, sandboxed to an opaque origin, forms post only to this host.
 * Special paths: _lead (form posts), _thanks, _report (abuse), sitemap.xml, robots.txt.
 */
import { readFormData } from "@/lib/create/platform/http";
import { orders } from "@/lib/business/repo";
import { alertOwner } from "@/lib/accounts/alerts";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { fileAbuseReport, reporterOf, takedownNote } from "@/lib/create/abuse-policy";
import { hostOf, isAppHost, resolveCustomHost } from "@/lib/domains/routing";
import { siteUrl } from "@/lib/site";
import { fxActive, liveHref, pageFromPath, renderCss, renderPage, sitemapXml, siteHeaders } from "@/lib/site-builder/render";
import { activeHold } from "@/lib/site-builder/slug-holds";
import { getVersion, isDeleted, saveLead, sites } from "@/lib/site-builder/store";
import { expandFeatures, replaceMain } from "@/lib/site-builder/features/expand";
import { whenLabel } from "@/lib/site-builder/features/booking";
import { records } from "@/lib/site-builder/features/records";
import { collectionsIn, listRows, publicRows } from "@/lib/site-builder/features/data";
import { FEATURE_IDS, type FeatureId } from "@/lib/site-builder/features/catalog";
import { highlight, isGated, MAX_QUERY, search, terms } from "@/lib/site-builder/features/search";
import { recordSiteView } from "@/lib/site-builder/features/analytics";
import { blogsIn, dateLabel, listPosts, publishedPost, renderBody } from "@/lib/site-builder/features/blog";
import { findIn } from "@/lib/site-builder/features/placeholders";
import { memberFor } from "@/lib/site-builder/features/members";
import { handleFeature } from "@/lib/site-builder/features/handlers";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import type { Site } from "@/lib/site-builder/types";
import { serveApp } from "@/lib/app-runtime/serve";
import { preflight } from "@/lib/app-runtime/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const THANKS: Record<string, string> = { form: "Your message was sent.", newsletter: "You are on the list.", booking: "Your booking is confirmed.", checkout: "Thank you. We are confirming your payment." };
const thanksText = (f: string | null) => (f && Object.hasOwn(THANKS, f) ? THANKS[f] : "Your message was sent.");
/** Booking confirmations read the saved booking back (never text from the URL), so a crafted link can't put words on the page. */
async function thanksBody(site: Site, q: URLSearchParams): Promise<string> {
  const f = q.get("f");
  const b = q.get("b");
  if (f === "booking" && b && /^rec_[\w]{1,120}$/.test(b)) {
    const rec = await records().get(site.workspaceId, b);
    if (rec && rec.siteId === site.id && rec.feature === "booking" && rec.status === "confirmed") return `Your booking is confirmed for ${esc(whenLabel(rec.data.start, rec.data.tz))}.`;
  }
  if (f === "checkout") {
    if (q.get("checkout") === "cancelled") return "Checkout was canceled. Nothing was charged.";
    // Only Stripe's signed webhook marks an order paid, so this page never says "paid" on the strength of the URL.
    const o = /^ord_[\w]{1,60}$/.test(q.get("o") ?? "") ? await orders().get(site.workspaceId, q.get("o")!) : null;
    if (o && o.projectId === site.id) {
      if (o.status === "paid") return "Payment received. Thank you! Stripe emails you a receipt.";
      if (o.status === "cancelled") return "This payment didn’t go through. Nothing was charged.";
    }
    return "Thank you. We are confirming your payment with Stripe; this can take a minute. Stripe emails you a receipt once it is paid.";
  }
  return thanksText(f);
}
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function shell(status: number, title: string, inner: string, extra: Record<string, string> = {}) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 24px;color:#18181b}h1{font-size:22px;margin:0 0 8px}p{color:#52525b}label{display:grid;gap:6px;margin-top:16px;font-size:14px;color:#52525b}select,input,textarea{font:inherit;padding:10px;border:1px solid #d4d4d8;border-radius:8px}button{margin-top:20px;height:44px;padding:0 22px;border-radius:999px;border:0;background:#18181b;color:#fff;font:inherit;cursor:pointer}a{color:#18181b}</style></head><body>${inner}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP, "x-content-type-options": "nosniff", "cache-control": "no-store", ...extra } },
  );
}
const notFound = () => shell(404, "Site not found", "<h1>Site not found</h1><p>There's no published site at this address.</p>");
/** 410: the owner deleted this site (or released the address recently). Never cached, so a delete takes effect at once and an undo too. */
const gone = () => shell(410, "Site removed", "<h1>This site was removed</h1><p>Its owner deleted it. There's nothing here any more.</p>");
async function isGone(slug: string, site: Site | null): Promise<boolean> {
  if (site) return isDeleted(site);
  return Boolean(await activeHold(slug));
}

/**
 * Where this request is being served: Keplar's own host (`/s/<slug>`) or an active custom domain (site at the root).
 * On a custom domain only that domain's own site can be served, whatever path was rewritten to get here.
 */
type Where = { base: string; origin: string; custom: { siteId: string } | null };
async function where(req: Request, slug: string): Promise<Where | null> {
  const host = hostOf(req);
  if (isAppHost(host)) return { base: `/s/${slug.toLowerCase()}`, origin: siteUrl, custom: null };
  const c = await resolveCustomHost(host);
  if (!c || c.slug !== slug.toLowerCase()) return null;
  return { base: "", origin: `https://${host}`, custom: { siteId: c.siteId } };
}

async function liveSite(slug: string): Promise<Site | null> {
  const s = await sites().findSystemBy("slug", slug.toLowerCase());
  return s && s.publishedVersion !== null && !isDeleted(s) ? s : null;
}

export async function GET(req: Request, { params }: Ctx) {
  const { slug, path } = await params;
  const rel = (path ?? []).join("/");
  const at = await where(req, slug);
  if (!at) return notFound();
  const site = await sites().findSystemBy("slug", slug.toLowerCase());
  if (site && at.custom && site.id !== at.custom.siteId) return notFound();
  if (!at.custom && (await isGone(slug.toLowerCase(), site))) return gone();
  if (at.custom && site && isDeleted(site)) return notFound();
  const home = at.base || "/";
  if (rel === "_report") {
    if (!site) return notFound();
    const done = new URL(req.url).searchParams.get("done");
    return shell(200, "Report abuse", done ? "<h1>Thank you</h1><p>We review every report and remove sites that break our terms.</p>" : `<h1>Report this site</h1><p>Tell us what's wrong with <strong>${esc(at.custom ? hostOf(req) : `/s/${site.slug}`)}</strong>. We review every report.</p>
<form method="post"><label>Reason<select name="reason" required><option value="phishing">Phishing or scam</option><option value="malware">Malware</option><option value="csam">Child sexual abuse material</option><option value="ncii">Non-consensual intimate imagery</option><option value="impersonation">Impersonation</option><option value="copyright">Copyright</option><option value="other">Other</option></select></label><label>Details<textarea name="details" rows="4" maxlength="2000"></textarea></label><label>Your email (optional)<input name="email" type="email" maxlength="200"></label><button type="submit">Send report</button></form>`);
  }
  if (!site || site.publishedVersion === null) return notFound();
  if (site.takenDown) return shell(451, "Site unavailable", "<h1>Site unavailable</h1><p>This site was removed for breaking the terms of service.</p>");
  if (rel === "_thanks") return shell(200, "Thank you", `<h1>Thank you</h1><p>${await thanksBody(site, new URL(req.url).searchParams)}</p><p><a href="${esc(home)}">Back to the site</a></p>`);
  const v = await getVersion(site, site.publishedVersion);
  if (!v) return notFound();
  const origin = at.origin;
  const plan = await siteOwnerPlan(site.workspaceId); // current plan at serve time: upgrade removes the watermark at once, downgrade restores it
  if (rel === "robots.txt") return new Response(site.seo.indexable ? `User-agent: *\nAllow: /\nSitemap: ${origin}${at.base}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=300" } });
  if (rel === "sitemap.xml") return new Response(site.seo.indexable ? sitemapXml(site, v.files, origin, at.base) : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=300" } });
  if (site.kind === "app" && site.app) {
    // Keplar app: API under _api/. Pages carry a <base> so relative files resolve with or without the trailing slash (Next.js
    // strips it with a 308, so redirecting back to it would loop).
    if (!rel.startsWith("_api")) await recordSiteView(site, req, "/");
    return serveApp(req, { site, version: v, env: "live", parts: path ?? [], base: at.base, origin, plan, reportHref: `${at.base}/_report` });
  }
  if (rel === "_search") return await searchPage(req, site, v.files, at, { site, mode: "live" as const, origin, base: at.base, plan });
  if (rel.startsWith("_blog/")) return await blogPost(site, v.files, at, rel.slice(6), { site, mode: "live" as const, origin, base: at.base, plan });
  if (rel.startsWith("_data/")) return await publicData(req, site, v.files, rel.slice(6));
  const file = pageFromPath(path, v.files);
  if (!file && v.files["404.html"] !== undefined) {
    // The site's own error page (every designed site ships one) instead of the generic Keplar one.
    const nf = { site, mode: "live" as const, origin, base: at.base, plan };
    return new Response(renderPage(v.files, "404.html", nf), { status: 404, headers: siteHeaders("live", "text/html; charset=utf-8", { scripts: false }) });
  }
  if (!file) return shell(404, "Page not found", `<h1>Page not found</h1><p>This page doesn't exist on this site.</p><p><a href="${esc(home)}">Go to the home page</a></p>`);
  const ctx = { site, mode: "live" as const, origin, base: at.base, plan };
  if (file.endsWith(".css")) return new Response(renderCss(v.files, file, ctx), { headers: siteHeaders("live", "text/css; charset=utf-8") });
  await recordSiteView(site, req, file === "index.html" ? "/" : `/${file.replace(/\.html$/, "")}`);
  const member = await memberFor(site, req.headers.get("cookie")).catch(() => null);
  const html = await expandFeatures(renderPage(v.files, file, ctx), { site, base: at.base, preview: false, file, member });
  return new Response(html, { headers: siteHeaders("live", "text/html; charset=utf-8", { scripts: fxActive(site, v.files[file] ?? "") }) });
}

/** Search results, drawn inside the site's own first page so they carry its header, footer and style. */
async function searchPage(req: Request, site: Site, files: Record<string, string>, at: Where, ctx: Parameters<typeof renderPage>[2]) {
  try {
    await rateLimit(`feat:search:${clientIpOf(req)}`, 60, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return shell(429, "Slow down", "<h1>Too many searches</h1><p>Please wait a minute and try again.</p>", { "retry-after": String(e.retryAfterSec) });
    throw e;
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_QUERY);
  const extra = (await Promise.all(blogsIn(files).filter((b) => !blogGated(files, b.key)).map(async (b) => (await listPosts(site, b.key, true)).map((x) => ({ path: `/_blog/${b.key}/${x.slug}`, title: x.title, text: x.body }))))).flat();
  const hits = search(files, q, extra);
  const ts = terms(q);
  const home = files["index.html"] !== undefined ? "index.html" : Object.keys(files).find((f) => f.endsWith(".html") && f !== "404.html");
  if (!home) return notFound();
  const list = hits.length
    ? `<ul class="k-feat__results" style="list-style:none;padding:0;display:grid;gap:1.25rem">${hits.map((h) => `<li><a href="${esc(h.path ? `${at.base}${h.path}` : liveHref(site.slug, h.file, at.base))}"><strong>${highlight(h.title, ts)}</strong></a><p>${highlight(h.snippet, ts)}</p></li>`).join("")}</ul>`
    : q ? `<p>Nothing on this site matches “${esc(q)}”. Try a shorter or different word.</p>` : "<p>Type a word to search this site.</p>";
  const box = `<div class="k-feat k-feat--search-results"><h1>Search</h1><form class="k-form" method="get" action="${esc(`${at.base}/_search`)}" role="search"><label class="k-field"><span>Search this site</span><input type="search" name="q" maxlength="80" value="${esc(q)}" autocomplete="off" required></label><button class="k-btn k-btn--accent" type="submit">Search</button></form>${q ? `<p><small>${hits.length} ${hits.length === 1 ? "result" : "results"} for “${esc(q)}”</small></p>` : ""}${list}</div>`;
  const html = replaceMain(renderPage(files, home, ctx), box).replace(/<title>[\s\S]*?<\/title>/i, `<title>Search - ${esc(site.name)}</title>`).replace("</head>", '<meta name="robots" content="noindex"></head>');
  return new Response(html, { headers: siteHeaders("live", "text/html; charset=utf-8", { scripts: false }) });
}

/** A blog that sits on a members-only page is members-only: its posts are not served from the public post URL. */
const blogGated = (files: Record<string, string>, key: string) => { const at = findIn(files, "blog", key); return Boolean(at && isGated(files[at.file])); };

/** One blog post, drawn inside the site's own first page. Drafts and unknown posts are plain 404s. */
async function blogPost(site: Site, files: Record<string, string>, at: Where, rest: string, ctx: Parameters<typeof renderPage>[2]) {
  const m = rest.match(/^([a-z][a-z0-9-]{0,29})\/([a-z0-9-]{1,60})$/);
  const blog = m ? blogsIn(files).find((b) => b.key === m[1] && !blogGated(files, b.key)) : undefined;
  const post = blog && m ? await publishedPost(site, blog.key, m[2]) : null;
  const home = files["index.html"] !== undefined ? "index.html" : Object.keys(files).find((f) => f.endsWith(".html") && f !== "404.html");
  if (!blog || !post || !home) return shell(404, "Page not found", `<h1>Page not found</h1><p>This post doesn't exist.</p><p><a href="${esc(at.base || "/")}">Go to the home page</a></p>`);
  const back = findIn(files, "blog", blog.key);
  const box = `<article class="k-feat k-feat--post"><p><small>${esc(dateLabel(post.publishedAt))}</small></p><h1>${esc(post.title)}</h1>${renderBody(post.body)}<p><a href="${esc(back ? liveHref(site.slug, back.file, at.base) : at.base || "/")}">← ${esc(blog.title)}</a></p></article>`;
  const html = replaceMain(renderPage(files, home, ctx), box).replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(post.title)} - ${esc(site.name)}</title>`);
  return new Response(html, { headers: siteHeaders("live", "text/html; charset=utf-8", { scripts: false }) });
}

/** Public read API for data tables: /_data/<id>.json. Read-only, only for tables the published site really has. */
async function publicData(req: Request, site: Site, files: Record<string, string>, name: string) {
  const m = name.match(/^([a-z][a-z0-9-]{0,29})\.json$/);
  const c = m ? collectionsIn(files).find((x) => x.key === m[1]) : undefined;
  const cors = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "public, max-age=0, s-maxage=30" };
  if (!c) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...cors, "cache-control": "no-store" } });
  await rateLimit(`data:ip:${clientIpOf(req)}`, 120, 60, { shared: true });
  const rows = publicRows(await listRows(site, c.key), c.fields);
  return new Response(JSON.stringify({ table: c.key, title: c.title, columns: c.fields, rows }), { headers: cors });
}

const MAX_BODY = 24_000;

export async function POST(req: Request, { params }: Ctx) {
  const { slug, path } = await params;
  const rel = (path ?? []).join("/");
  const url = new URL(req.url);
  try {
    const at = await where(req, slug);
    if (!at) return notFound();
    if (rel === "_api" || rel.startsWith("_api/")) return await appLive(req, slug, path ?? [], at);
    if (rel === "_lead") return await postLead(req, slug, at, !at.custom && url.searchParams.get("preview") === "1");
    if (rel === "_report") return await postReport(req, slug, at);
    if (rel.startsWith("_f/")) return await postFeature(req, slug, at, rel.slice(3), !at.custom && url.searchParams.get("preview") === "1");
  } catch (e) {
    if (e instanceof RateLimitError) return shell(429, "Slow down", "<h1>Too many requests</h1><p>Please wait a minute and try again.</p>", { "retry-after": String(e.retryAfterSec) });
    console.error("[s] post failed", e instanceof Error ? e.message : e);
    return shell(500, "Something went wrong", "<h1>Something went wrong</h1><p>Please try again.</p>");
  }
  return new Response(null, { status: 405 });
}

async function readForm(req: Request): Promise<Record<string, string> | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return null;
  const ct = req.headers.get("content-type") ?? "";
  if (!/application\/x-www-form-urlencoded|multipart\/form-data/i.test(ct)) return null;
  // Read through the cap (a chunked body has no Content-Length to check above).
  const form = await readFormData(req, MAX_BODY);
  if (!form) return null;
  const entries = [...form.entries()];
  const out: Record<string, string> = {};
  for (const [k, v] of entries.slice(0, 40)) if (typeof v === "string") out[k] = v;
  return out;
}

async function postLead(req: Request, slug: string, at: Where, preview: boolean) {
  const ip = clientIpOf(req);
  await rateLimit(`lead:ip:${ip}`, 10, 60, { shared: true });
  const any = await sites().findSystemBy("slug", slug.toLowerCase());
  if (!at.custom && (await isGone(slug.toLowerCase(), any))) return gone();
  const site = preview ? any : await liveSite(slug);
  if (!site || isDeleted(site) || site.takenDown) return notFound();
  if (at.custom && site.id !== at.custom.siteId) return notFound();
  // The preview iframe (same origin as the app, but sandboxed) shows this note, so it may be framed by us.
  if (preview) return shell(200, "Preview", "<h1>This is a preview</h1><p>Forms work once the site is published. Nothing was saved.</p>", { "content-security-policy": PAGE_CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'") });
  await rateLimit(`lead:ip:${ip}:${site.id}`, 20, 3600, { shared: true });
  await rateLimit(`lead:site:${site.id}`, 300, 86_400, { shared: true });
  const form = await readForm(req);
  if (!form) return shell(413, "Too large", "<h1>That submission was too large</h1><p>Please shorten your message.</p>");
  const thanks = () => new Response(null, { status: 303, headers: { location: `${at.base}/_thanks`, "cache-control": "no-store" } });
  if ((form._hp ?? "").trim()) return thanks(); // honeypot: pretend it worked
  const fields: Record<string, string> = {};
  let total = 0;
  for (const [k, v] of Object.entries(form)) {
    if (k.startsWith("_") || !/^[\w .-]{1,60}$/.test(k)) continue;
    const val = v.trim().slice(0, 2000);
    if (!val) continue;
    total += val.length;
    if (total > 8000) break;
    fields[k] = val;
  }
  if (!Object.keys(fields).length) return shell(400, "Empty form", `<h1>Please fill in the form</h1><p><a href="${esc(at.base || "/")}">Back to the site</a></p>`);
  const ws = await getWorkspace(site.workspaceId);
  await saveLead(site, ws?.plan ?? "free", { page: (form._page ?? "index.html").slice(0, 60), fields });
  return thanks();
}

/** Public feature forms (/_f/<feature>): same gates as lead forms, then the feature's own handler. */
async function postFeature(req: Request, slug: string, at: Where, feature: string, preview: boolean) {
  const ip = clientIpOf(req);
  await rateLimit(`feat:ip:${ip}`, 12, 60, { shared: true });
  const any = await sites().findSystemBy("slug", slug.toLowerCase());
  if (!at.custom && (await isGone(slug.toLowerCase(), any))) return gone();
  const site = preview ? any : await liveSite(slug);
  if (!site || isDeleted(site) || site.takenDown) return notFound();
  if (at.custom && site.id !== at.custom.siteId) return notFound();
  if (!FEATURE_IDS.has(feature)) return notFound();
  if (preview) return shell(200, "Preview", "<h1>This is a preview</h1><p>Features work once the site is published. Nothing was saved.</p>", { "content-security-policy": PAGE_CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'") });
  await rateLimit(`feat:ip:${ip}:${site.id}`, 20, 3600, { shared: true });
  await rateLimit(`feat:site:${site.id}`, 300, 86_400, { shared: true });
  const form = await readForm(req);
  if (!form) return shell(413, "Too large", "<h1>That submission was too large</h1><p>Please shorten your message.</p>");
  const v = site.publishedVersion !== null ? await getVersion(site, site.publishedVersion) : null;
  if (!v) return notFound();
  const r = await handleFeature({ feature: feature as FeatureId, form, site, files: v.files, origin: at.origin, base: at.base });
  if (r.kind === "fail") return shell(r.status, "Couldn't send", `<h1>${esc(r.message)}</h1><p><a href="${esc(at.base || "/")}">Back to the site</a></p>`);
  if (r.kind === "redirect") return payRedirect(r.url);
  if (r.kind === "session") return new Response(null, { status: 303, headers: { location: r.to, "set-cookie": r.cookie, "cache-control": "no-store" } });
  return new Response(null, { status: 303, headers: { location: `${at.base}/_thanks?f=${r.thanks}${r.ref ? `&b=${r.ref}` : ""}`, "cache-control": "no-store" } });
}

/** Hand the visitor to Stripe's page. A link plus a refresh, not a form redirect: the site's CSP only lets forms post to this host. */
function payRedirect(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !/(^|\.)stripe\.com$/.test(u.hostname)) return shell(502, "Checkout unavailable", "<h1>Checkout couldn't start</h1><p>Please try again in a moment.</p>");
  return shell(200, "Taking you to secure payment", `<h1>Taking you to secure payment</h1><p>If nothing happens, <a href="${esc(u.href)}">continue to Stripe</a>.</p>`, { refresh: `0; url=${u.href}` });
}

async function postReport(req: Request, slug: string, at: Where) {
  await rateLimit(`abuse:ip:${clientIpOf(req)}`, 5, 600, { shared: true });
  const site = await sites().findSystemBy("slug", slug.toLowerCase());
  if (!at.custom && (await isGone(slug.toLowerCase(), site))) return gone();
  if (!site || isDeleted(site) || (at.custom && site.id !== at.custom.siteId)) return notFound();
  const form = await readForm(req);
  if (!form) return shell(400, "Invalid report", "<h1>Invalid report</h1>");
  const reason = ["phishing", "malware", "csam", "ncii", "impersonation", "copyright", "other"].includes(form.reason) ? form.reason : "other";
  // Child-safety and intimate-image reports take the site down at once only from a verified account or 3+ distinct reporters in 24 h;
  // otherwise they are stored as urgent and alerted for immediate human review (src/lib/create/abuse-policy.ts).
  const filed = await fileAbuseReport({ workspaceId: site.workspaceId, target: `site:${site.slug}`, reason, details: (form.details ?? "").slice(0, 4000), reporterEmail: form.email ? form.email.slice(0, 200) : undefined, reporter: await reporterOf(req) });
  if (filed.takeDown) await sites().update(site.workspaceId, site.id, { takenDown: true });
  await alertOwner(`${filed.urgent && !filed.takeDown ? "URGENT " : ""}Abuse report: ${reason} on /s/${site.slug}`, `Site ${site.name} (/s/${site.slug}, workspace ${site.workspaceId}) was reported for ${reason}. Report ${filed.report.id}.\n\n${(form.details ?? "").slice(0, 1000)}\n\n${takedownNote(filed)}`).catch(() => undefined);
  return new Response(null, { status: 303, headers: { location: `${at.base}/_report?done=1` } });
}

/** Write requests to a published Keplar app's API (`/_api/...`). Reads go through GET above. */
async function appLive(req: Request, slug: string, path: string[], at: Where): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  const site = await liveSite(slug);
  if (!site || site.kind !== "app" || !site.app || site.takenDown || (at.custom && site.id !== at.custom.siteId)) return new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  const v = await getVersion(site, site.publishedVersion!);
  if (!v) return new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  const plan = await siteOwnerPlan(site.workspaceId);
  return serveApp(req, { site, version: v, env: "live", parts: path, base: at.base, origin: at.origin, plan, reportHref: `${at.base}/_report` });
}

async function appMethod(req: Request, { params }: Ctx) {
  const { slug, path } = await params;
  const rel = (path ?? []).join("/");
  if (req.method === "OPTIONS") return preflight();
  const at = await where(req, slug);
  if (!at || !(rel === "_api" || rel.startsWith("_api/"))) return new Response("Not found", { status: 404 });
  return appLive(req, slug, path ?? [], at);
}
export const PATCH = appMethod;
export const DELETE = appMethod;
export const OPTIONS = appMethod;
