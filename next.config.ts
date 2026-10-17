import type { NextConfig } from "next";
import { APP_HEADERS, APP_PAGE_HEADERS, BASE_HEADERS, BUSINESS_PAGE_HEADERS, FX_HEADERS } from "./src/lib/security/headers";

const PRODUCTION_HOST = "keplar.one"; // keep in sync with src/lib/site.ts
// Keplar's own hosts. Anything else that reaches the app is a customer's custom domain (src/proxy.ts), which must NOT get the
// app CSP (it would override the site's own CSP) or an HSTS that covers the customer's whole domain (includeSubDomains, preload).
const OWN_HOSTS = "(keplar\\.one|www\\.keplar\\.one|docs\\.keplar\\.one|space\\.keplar\\.one|business\\.keplar\\.one|business\\.localhost|localhost|127\\.0\\.0\\.1|.*\\.vercel\\.app)";
const HSTS = "Strict-Transport-Security";
// Keplar Business (src/lib/business-site.ts): its own app on this server; its pages get the signed-in app headers (Stripe.js for bank linking).
const BUSINESS_HOSTS = "(business\\.keplar\\.one|business\\.localhost)";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  // The site test browser (Chromium) is a binary package: keep it out of the bundle and make sure its files ship with the route.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/sites/[id]/qa": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**"],
    // Keplar Browser drives the same serverless Chromium for a person's task.
    "/api/browser/tasks": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**"],
    // Keplar Wants Track B fills a local fixture in headless Chromium (dry-run unless a PIN confirmed a submit).
    // The swarm catalog is seeded by `npm run build` into data/wants/swarm.db and opened read-only.
    "/api/keplar/wants/orchestrate": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**", "./data/wants/swarm.db"],
    "/api/health/qa-browser": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**"],
    // The app builder tests generated apps in a real browser, serving the runtime scripts from public/fx in-process.
    "/api/apps/[id]/build": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**", "./public/fx/**"],
    // Roblox Cloud checks scripts with the official Luau analyzer (WebAssembly), loaded from vendor/luau at run time.
    // Its roblox_docs tool searches the Roblox Creator Docs index in vendor/roblox-docs (the worker runs the model turns).
    "/api/roblox-cloud/worker": ["./vendor/luau/**", "./vendor/roblox-docs/**"],
    "/api/roblox-cloud/jobs/[id]/start": ["./vendor/luau/**"],
    "/api/health": ["./vendor/luau/**"],
    // Studio mode's roblox_docs tool searches the Roblox Creator Docs index, read from vendor/roblox-docs at run time.
    "/api/studio/docs": ["./vendor/roblox-docs/**"],
    // Blender Cloud copies its machine scripts (agent, render setup, video step) onto each new render machine.
    "/api/blender-cloud/jobs": ["./vendor/blender-cloud/**"],
  },
  async redirects() {
    return [
      // Create lives inside the app (same pattern as /app/slides and /app/study). Keep the short URL working.
      // Site Create UI removed: deep links land on the App tab.
      // ?tab=site must be matched before the bare /create permanent redirect (query is otherwise preserved into a second hop).
      { source: "/create", has: [{ type: "query", key: "tab", value: "site" }], destination: "/app/create?tab=app", permanent: false },
      { source: "/create", destination: "/app/create", permanent: true },
      { source: "/create/site", destination: "/app/create", permanent: true },
      { source: "/app/create/site", destination: "/app/create", permanent: true },
      // Explicit ?tab=app so the query is not preserved (same-path redirects keep unmatched query otherwise → loop).
      { source: "/app/create", has: [{ type: "query", key: "tab", value: "site" }], destination: "/app/create?tab=app", permanent: false },
      // Each /app tab has its own subfolder; bare /app is Ask.
      { source: "/app", destination: "/app/ask", permanent: true },
      { source: "/app/", destination: "/app/ask", permanent: true },
      // Business, Agents and Approvals moved to business.keplar.one for now (src/lib/business.ts).
      ...["/app/business", "/app/agents", "/app/approvals", "/enterprise", "/agents"].map((source) => ({ source, destination: "https://business.keplar.one", permanent: false })),
      // Common account URLs people type or other sites link to (/login answered 404 on the live site).
      ...["/login", "/log-in", "/sign-in"].map((source) => ({ source, destination: "/signin", permanent: true })),
      ...["/register", "/sign-up", "/join"].map((source) => ({ source, destination: "/signup", permanent: true })),
      // Marketing's draft URL for the comparison hub.
      { source: "/compare/best-multi-model-ai-tools", destination: "/compare", permanent: true },
      // Blog moved from /blog to /blogs (keep old URLs working for SEO and shared links).
      { source: "/blog", destination: "/blogs", permanent: true },
      { source: "/blog/:slug", destination: "/blogs/:slug", permanent: true },
      // The short guide duplicated the fuller blog post's search intent and title; one page now owns it.
      { source: "/guides/check-an-ai-answer", destination: "/blogs/how-to-check-an-ai-answer", permanent: true },
      {
        // www → apex, permanent
        source: "/:path*",
        has: [{ type: "host", value: `www.${PRODUCTION_HOST}` }],
        destination: `https://${PRODUCTION_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
  // Self-hosted images: modern formats, long CDN cache. Marketing screenshots stay small on slow links.
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  // Compress responses (Vercel also brotlis at the edge; this helps `next start` / previews).
  compress: true,
  async headers() {
    const YEAR = "public, max-age=31536000, immutable";
    const DAY = "public, max-age=86400, stale-while-revalidate=604800";
    return [
      // Production chunk names are content-hashed, so a year is safe there. In `next dev` the names stay the same across edits,
      // and an immutable header made browsers keep stale CSS and JS after every change.
      ...(process.env.NODE_ENV === "production" ? [{ source: "/_next/static/:path*", headers: [{ key: "Cache-Control", value: YEAR }] }] : []),
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: YEAR }, { key: "X-Content-Type-Options", value: "nosniff" }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: YEAR }, { key: "X-Content-Type-Options", value: "nosniff" }] },
      // Runtime scripts for generated apps, loaded from sandboxed (opaque-origin) previews: cross-origin readable (FX_HEADERS).
      { source: "/fx/:path*", headers: [{ key: "Cache-Control", value: YEAR }, { key: "X-Content-Type-Options", value: "nosniff" }, ...FX_HEADERS] },
      // The weather sky's stills (public/sky): re-rendered rarely and under the same names, so a day (not a year).
      { source: "/sky/:path*", headers: [{ key: "Cache-Control", value: DAY }, { key: "X-Content-Type-Options", value: "nosniff" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: DAY }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/:path*", headers: BASE_HEADERS.filter((h) => h.key !== HSTS) },
      { source: "/:path*", has: [{ type: "host", value: OWN_HOSTS }], headers: BASE_HEADERS.filter((h) => h.key === HSTS) },
      // Everything but user sites (/sites/* local, /s/* published builder sites, /apps/* app previews), which set their own sandbox CSP,
      // and the /fx/* runtime scripts above (a same-origin CORP there blanks every draft preview).
      { source: "/((?!sites/|s/|apps/|embed|fx/).*)", has: [{ type: "host", value: OWN_HOSTS }], headers: APP_HEADERS },
      // Embeddable Ask widget must be frameable by third-party sites (no X-Frame-Options DENY / frame-ancestors none).
      {
        source: "/embed",
        has: [{ type: "host", value: OWN_HOSTS }],
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors *; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      // The widget loader is included by other sites' <script> tags: cross-origin readable, short cache so fixes reach every embed quickly.
      {
        source: "/embed.js",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      // The signed-in app pages (/app/*) only: Google Fonts for typography previews, and Stripe.js for bank linking.
      { source: "/app/:path*", has: [{ type: "host", value: OWN_HOSTS }], headers: APP_PAGE_HEADERS },
      { source: "/((?!api/|_next/).*)", has: [{ type: "host", value: BUSINESS_HOSTS }], headers: BUSINESS_PAGE_HEADERS },
      {
        // Previews and local hosts are noindex. (Customers' own domains are not matched here: a published site decides
        // for itself through its robots meta tag and robots.txt; see src/proxy.ts and docs/custom-domains.md.)
        source: "/:path*",
        has: [{ type: "host", value: "(localhost|127\\.0\\.0\\.1|.*\\.vercel\\.app)" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
