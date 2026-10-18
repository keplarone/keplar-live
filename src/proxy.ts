/**
 * Edge guard for /api: same-origin check on browser state-changing requests,
 * a coarse per-IP rate limit, and no-store on API responses. Route handlers add
 * their own, tighter limits (sign-in, ask, checkout) and auth.
 *
 * Custom domains: a request whose Host is not one of Keplar's own is served only as the published site of the active
 * domain with that Host (rewritten to /s/<slug>/...), or 404. Nothing else of the app is reachable on such a host.
 */
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { logEvent, newRequestId, requestIdOf } from "@/lib/ops/log";
import { hostOf, isAppHost, resolveCustomHost } from "@/lib/domains/routing";
import { DOCS_HOST, PRODUCTION_HOST, PRODUCTION_URL, SPACE_HOST } from "@/lib/site";
import { BUSINESS_ICON_PATHS, BUSINESS_MANIFEST_PATH, BUSINESS_PREFIX, businessUrl, isBusinessHost } from "@/lib/business-site";
import { DOC_SECTION_IDS } from "@/lib/kb/doc-sections";
import { isOriginExempt, isSameOrigin, SAFE_METHODS } from "@/lib/security/origin";
import { noteVisit } from "@/lib/traffic/visits";
import { shareViewLimited } from "@/lib/growth/share-guard";
import { applyLocaleHint } from "@/lib/i18n/proxy-hint";

const API_PER_IP_PER_MIN = 240;
/** Largest body any /api route accepts (Business plan attachments are 50 MB); every route applies its own, smaller cap on top. */
const API_MAX_BODY_BYTES = 64 * 1024 * 1024;
/** CSP for the framed widget page (next.config.ts sets the same with frame-ancestors * for widgets without an allowlist). */
const EMBED_CSP_BASE = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

const PLAIN = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };
/** Customers' domains get a plain HSTS without includeSubDomains/preload: those would affect the rest of their domain. */
const CUSTOM_HSTS = "max-age=31536000";

async function customHost(req: NextRequest, host: string) {
  const { pathname, search } = req.nextUrl;
  // PATCH/DELETE/OPTIONS only reach a Keplar app's own API (/_api/...); the site route refuses them anywhere else.
  const appApi = pathname === "/_api" || pathname.startsWith("/_api/");
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST" && !(appApi && (req.method === "PATCH" || req.method === "DELETE" || req.method === "OPTIONS"))) return new NextResponse("Method not allowed", { status: 405, headers: { ...PLAIN, allow: "GET, HEAD, POST" } });
  let site;
  try {
    site = await resolveCustomHost(host);
  } catch {
    return new NextResponse("This site is temporarily unavailable.", { status: 503, headers: { ...PLAIN, "retry-after": "30" } });
  }
  if (!site) return new NextResponse("There is no site at this address.", { status: 404, headers: { ...PLAIN, "strict-transport-security": CUSTOM_HSTS } });
  // Keplar's own public effects runtime (public/fx/*.js), loaded by pages that turn effects on. Static files only.
  if ((req.method === "GET" || req.method === "HEAD") && /^\/fx\/[\w.-]+\.js$/.test(pathname)) {
    const res = NextResponse.next();
    res.headers.set("strict-transport-security", CUSTOM_HSTS);
    return res;
  }
  // Old absolute links (/s/<slug>/page) collapse to the clean path on this host.
  const own = `/s/${site.slug}`;
  if (pathname === own || pathname.startsWith(`${own}/`)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(own.length) || "/";
    return NextResponse.redirect(url, 308);
  }
  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? own : `${own}${pathname}`;
  url.search = search;
  const res = NextResponse.rewrite(url);
  res.headers.set("strict-transport-security", CUSTOM_HSTS);
  return res;
}


/**
 * docs.keplar.one serves the docs at the root: / → /docs and /<section>/... → /docs/<section>/... (rewrite, the URL stays clean).
 * /docs/... links (the ones the docs pages render) are served as-is, so every in-page link resolves on the subdomain too.
 * Static files, /_next, /api and /og pass through. Any other path (/pricing, /blogs, /app, sign-in...) is the main site's:
 * 308 to keplar.one, so nav and footer links never land on a docs 404. Canonical URLs stay keplar.one/docs/... (metadataBase).
 */
export function docsHost(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // The browser's default favicon request on the subdomain gets the docs mark, not the main site's.
  if (pathname === "/favicon.ico") {
    const url = req.nextUrl.clone();
    url.pathname = "/icons/docs-favicon.ico";
    return NextResponse.rewrite(url);
  }
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/") || pathname.startsWith("/og/") || pathname.startsWith("/icons/") || pathname.startsWith("/fonts/") || pathname.startsWith("/fx/") || last.includes(".")) {
    return NextResponse.next();
  }
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return NextResponse.next();
  const first = pathname.split("/")[1] ?? "";
  if (pathname === "/" || DOC_SECTION_IDS.has(first)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/docs" : `/docs${pathname}`;
    url.search = search;
    return NextResponse.rewrite(url);
  }
  return NextResponse.redirect(`${PRODUCTION_URL}${pathname}${search}`, 308);
}


/**
 * space.keplar.one is Space Studio's site: / → /space-studio and /app → /space-studio/app (rewrite, the URL stays clean);
 * /space-studio/... is served as-is. Static files, /_next, /api and /og pass through (the desktop app itself talks to keplar.one).
 * Any other path is the main site's: 308 to keplar.one.
 */
export function spaceHost(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/favicon.ico") {
    const url = req.nextUrl.clone();
    url.pathname = "/icons/space-studio-favicon.ico";
    return NextResponse.rewrite(url);
  }
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/") || pathname.startsWith("/og/") || pathname.startsWith("/icons/") || pathname.startsWith("/fonts/") || last.includes(".")) {
    return NextResponse.next();
  }
  if (pathname === "/space-studio" || pathname.startsWith("/space-studio/")) return NextResponse.next();
  if (pathname === "/" || pathname === "/app") {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/space-studio" : "/space-studio/app";
    url.search = search;
    return NextResponse.rewrite(url);
  }
  return NextResponse.redirect(`${PRODUCTION_URL}${pathname}${search}`, 308);
}

/**
 * business.keplar.one is the Keplar Business app (src/lib/business-site.ts): every page path maps onto its internal route
 * under /biz ("/" → /biz, "/work" → /biz/work), so a Business page can never resolve to a Keplar One page. Static files pass
 * through; /api is handled by the shared API guard below (rate limit, same-origin), like on keplar.one. Returns null for /api.
 */
/**
 * The Business app's own pages (first path segment), each under /biz: storefront, account setup, sign-in handoff, workspace, and
 * its own copies of keplar.one's Status, Terms, Privacy and Security pages.
 */
const BUSINESS_PAGES = new Set(["", "account", "signin", "work", "chatgpt", "status", "terms", "privacy", "security"]);

export function businessHost(req: NextRequest): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/") || pathname === "/.well-known/oauth-protected-resource" || pathname === "/.well-known/oauth-authorization-server") return null;
  // Browsers ask for /favicon.ico (and Apple's touch icons) on their own: the Business mark here, never Keplar One's.
  const asset = pathname === "/manifest.webmanifest" ? BUSINESS_MANIFEST_PATH : BUSINESS_ICON_PATHS[pathname];
  if (asset) {
    const url = req.nextUrl.clone();
    url.pathname = asset;
    return NextResponse.rewrite(url);
  }
  // The Business host's own crawl files (src/app/(business)/biz): before, these fell through to keplar.one's, so the Business
  // sitemap listed keplar.one's URLs and none of its own.
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/llms.txt" || pathname === "/opengraph-image" || pathname === "/twitter-image") {
    const url = req.nextUrl.clone();
    url.pathname = `${BUSINESS_PREFIX}${pathname === "/twitter-image" ? "/opengraph-image" : pathname}`;
    return NextResponse.rewrite(url);
  }
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (pathname.startsWith("/_next/") || pathname.startsWith("/og/") || pathname.startsWith("/icons/") || pathname.startsWith("/fonts/") || pathname.startsWith("/models/") || last.includes(".")) {
    return NextResponse.next();
  }
  // Old storefront link, and the internal prefix itself: one public URL per page.
  if (pathname === "/business-landing") return NextResponse.redirect(new URL(`/${search}`, req.url), 308);
  if (pathname === BUSINESS_PREFIX || pathname.startsWith(`${BUSINESS_PREFIX}/`)) return NextResponse.redirect(new URL(`${pathname.slice(BUSINESS_PREFIX.length) || "/"}${search}`, req.url), 308);
  // Every other path (/pricing, /terms, /showcase, /app/create: links inside Create and the Business OS modules) belongs to
  // keplar.one: send it there instead of a Business 404. 307, so a Business page added at that path later is not shadowed by a cache.
  if (!BUSINESS_PAGES.has(pathname.split("/")[1] ?? "")) return NextResponse.redirect(`${PRODUCTION_URL}${pathname}${search}`, 307);
  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? BUSINESS_PREFIX : `${BUSINESS_PREFIX}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

/** keplar.one URLs that belonged to Business before it became its own app: 308 to the same page there. Null for every other path. */
export function businessMoved(req: NextRequest): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  const moved =
    pathname === "/business-account" ? "/account"
    : pathname === "/app/work" || pathname.startsWith("/app/work/") ? "/work"
    : pathname === "/business-landing" || pathname === "/business" ? "/" // keplar.one/business is the address people guess (it was a 404)
    : pathname === BUSINESS_PREFIX || pathname.startsWith(`${BUSINESS_PREFIX}/`) ? pathname.slice(BUSINESS_PREFIX.length) || "/"
    : null;
  return moved === null ? null : NextResponse.redirect(businessUrl(`${moved}${search}`), 308);
}

/**
 * Real /app pages. The catch-all page calls notFound(), but the @modal parallel slot makes that response HTTP 200.
 * Unknown paths are rewritten to a missing URL so the root 404's status is 404. Redirect targets stay listed so
 * next.config can still send them on.
 */
const APP_PAGES = new Set([
  "/app/agents",
  "/app/approvals",
  "/app/apps",
  "/app/ask",
  "/app/business",
  "/app/browser",
  "/app/create",
  "/app/create/site",
  "/app/deployments",
  "/app/history",
  "/app/projects",
  "/app/slides",
  "/app/studio",
  "/app/studio/overlay",
  "/app/study",
  "/app/wants",
]);

export function unknownAppPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (!p.startsWith("/app/")) return false;
  if (APP_PAGES.has(p)) return false;
  if (/^\/app\/create\/live\/[^/]+$/.test(p)) return false;
  return true;
}

/** Where user-authored files are served (sites, apps, drafts). Their pages are sandboxed to an opaque origin (CSP sandbox). */
const USER_CONTENT = /^\/(s|sites|apps)\//;
/** Request destinations that execute what they load. */
const RUNS_CODE = new Set(["script", "worker", "sharedworker", "serviceworker", "audioworklet", "paintworklet"]);

/**
 * IN-5 (docs/rebirth/AUDIT.md): the app CSP's script-src 'self' also covers user files under /s/, /sites/ and /apps/. Their own
 * pages are sandboxed (opaque origin), so their scripts arrive as cross-site requests; a keplar.one page loading one as a
 * script (what an injected <script src="/s/..."> or a service-worker registration would do) arrives as same-origin and is
 * refused here. Browsers that send no fetch metadata are not refused (defence in depth, not the only guard).
 */
export function firstPartyLoadOfUserCode(req: Pick<NextRequest, "headers"> & { nextUrl: { pathname: string } }): boolean {
  if (!USER_CONTENT.test(req.nextUrl.pathname)) return false;
  const dest = req.headers.get("sec-fetch-dest")?.toLowerCase() ?? "";
  const site = req.headers.get("sec-fetch-site")?.toLowerCase() ?? "";
  return RUNS_CODE.has(dest) && site === "same-origin";
}

/** keplar.one and www hide Space Studio. space.keplar.one still serves those pages (spaceHost). */
export function hideSpaceStudio(host: string, pathname: string): boolean {
  if (host !== PRODUCTION_HOST && host !== `www.${PRODUCTION_HOST}`) return false;
  return pathname === "/space-studio" || pathname.startsWith("/space-studio/");
}

export async function proxy(req: NextRequest, event?: NextFetchEvent) {
  const host = hostOf(req);
  if (!isAppHost(host)) return customHost(req, host);
  if (!req.nextUrl.pathname.startsWith("/api/") && hideSpaceStudio(host, req.nextUrl.pathname)) {
    return NextResponse.redirect(`${PRODUCTION_URL}/`, 308);
  }
  // /api on the docs and Space hosts goes through the same API guard as keplar.one (rate limit, same-origin check) below.
  const api = req.nextUrl.pathname.startsWith("/api/");
  if (host === DOCS_HOST && !api) return docsHost(req);
  if (host === SPACE_HOST && !api) return spaceHost(req);
  const business = isBusinessHost(host);
  if (business) {
    const page = businessHost(req);
    if (page) return page;
  } else {
    const moved = businessMoved(req);
    if (moved) return moved;
  }
  const { pathname } = req.nextUrl;
  // Unknown /app URLs: rewrite onto a path with no page so the response is the real 404, not the soft one parallel routes produce.
  if (!business && unknownAppPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/__missing";
    return NextResponse.rewrite(url);
  }
  if (firstPartyLoadOfUserCode(req)) return new NextResponse("User content can't run as a Keplar script.", { status: 403, headers: PLAIN });
  // Referral short link: /?ref=CODE → /invite/CODE (same cookies/claim flow).
  if ((pathname === "/" || pathname === "") && req.method === "GET") {
    const ref = req.nextUrl.searchParams.get("ref");
    if (ref && /^[a-hjkmnp-z2-9]{8}$/i.test(ref)) {
      const url = req.nextUrl.clone();
      url.pathname = `/invite/${ref.toLowerCase()}`;
      url.search = "";
      return NextResponse.redirect(url, 302);
    }
  }
  // Embeddable Ask: the browser enforces the widget's origin allowlist (CSP frame-ancestors), not only the server.
  if (pathname === "/embed" && req.method === "GET") {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (/^emb_[a-f0-9]{16}$/.test(id)) {
      try {
        const { embedWidgets, frameAncestorsFor } = await import("@/lib/embed/store");
        const w = await embedWidgets().findSystemBy("id", id);
        if (w && !w.revokedAt && w.origins.length) {
          const res = NextResponse.next();
          res.headers.set("content-security-policy", `${EMBED_CSP_BASE}; ${frameAncestorsFor(w)}`);
          return res;
        }
      } catch {
        /* lookup failed: the page and /api/embed/ask still check the allowlist */
      }
    }
  }
  // Shared answer pages: a per-IP rate limit against token guessing and scraping (src/lib/growth/share-guard.ts).
  const limited = await shareViewLimited(req, pathname);
  if (limited) return new NextResponse(limited.body, { status: limited.status, headers: limited.headers });
  // Shared answer links (/r/<token>) are private-by-default content the owner chose to share: never indexed, archived or followed.
  if (pathname.startsWith("/r/")) {
    const r = NextResponse.next();
    r.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    r.headers.set("cache-control", "no-store");
    return r;
  }
  if (!pathname.startsWith("/api/")) {
    // Visitor count for the admin card: cookie-free, no IP stored, batched and written after the response (src/lib/traffic/visits.ts).
    const pending = noteVisit(req);
    if (pending) event?.waitUntil(pending);
    // Language: a hint cookie for the quiet "switch language?" banner. Never a redirect; crawlers get nothing (src/lib/i18n/proxy-hint.ts).
    return applyLocaleHint(req, NextResponse.next());
  }

  // Correlation id: kept if the caller sent a valid one, otherwise new. Forwarded to the route and echoed on the response.
  const reqId = requestIdOf(req) !== "unknown" ? requestIdOf(req) : newRequestId();
  const headers = new Headers(req.headers);
  headers.set("x-request-id", reqId);
  const next = () => {
    const r = NextResponse.next({ request: { headers } });
    r.headers.set("x-request-id", reqId);
    return r;
  };
  const withId = (r: NextResponse) => {
    r.headers.set("x-request-id", reqId);
    return r;
  };

  const declared = req.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > API_MAX_BODY_BYTES) {
    return withId(NextResponse.json({ error: "That request is too large.", code: "too_large" }, { status: 413 }));
  }
  const webhook = pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/business/stripe/webhook") || pathname.startsWith("/api/inngest");
  // Live collaboration streams keystrokes and presence; its routes enforce their own per-user limits.
  const collab = pathname.startsWith("/api/collab/");
  if (!webhook && !collab) {
    try {
      await rateLimit(`ip:${clientIpOf(req)}:api`, API_PER_IP_PER_MIN);
    } catch (e) {
      if (e instanceof RateLimitError) return withId(NextResponse.json({ error: e.message, code: "rate_limited" }, { status: 429, headers: { "retry-after": String(e.retryAfterSec) } }));
      throw e;
    }
  }
  if (!SAFE_METHODS.has(req.method) && !isOriginExempt(pathname) && !isSameOrigin(req)) {
    // Security event (edge: log line only; the store-backed log lives in src/lib/security/events.ts for node routes).
    logEvent("warn", "security.authz.denied", { code: "bad_origin", where: pathname.slice(0, 120), status: 403 }, req);
    return withId(NextResponse.json({ error: "Request blocked: cross-site request.", code: "bad_origin" }, { status: 403 }));
  }
  return next();
}

// Every path except Next's static assets: the host check must see page requests too (custom domains serve a site at "/").
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
