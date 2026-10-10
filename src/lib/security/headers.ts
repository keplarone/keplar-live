/**
 * Security headers (applied by next.config.ts) and the Content-Security-Policy.
 *
 * CSP notes:
 *  - `script-src 'unsafe-inline'`: the root layout ships an inline theme script
 *    (before-paint theme, THEME_SCRIPT) and JSON-LD blocks. Next.js nonces would
 *    force every page to render dynamically, so inline is allowed for scripts,
 *    but only same-origin external scripts; no remote script hosts.
 *  - Whop Elements (embedded checkout): see WHOP below. Whop Pixel (inline snippet in the head, which then loads /s.js from t.whop.tw): see WHOP_PIXEL.
 *  - three.js renders to a canvas (WebGL) and may use blob: workers/textures.
 *  - Published user sites (/sites/*) set their own sandbox CSP and are excluded.
 */
const dev = process.env.NODE_ENV !== "production";

/**
 * Whop embedded checkout (Elements): script and frames are served from cdn.whop.com; the script talks to api.whop.com.
 * Only those two exact origins are allowed (no wildcard, no other Whop hosts) and only for these four directives.
 */
const WHOP = "https://cdn.whop.com";
const WHOP_API = "https://api.whop.com";
/** Whop Pixel (ad measurement, src/lib/whop-pixel.ts): its /s.js and chunks load from this origin and it posts events back to it. Scripts and connections only; it needs no images or frames. */
const WHOP_PIXEL = "https://t.whop.tw";

export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${WHOP} ${WHOP_PIXEL}${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${WHOP}`,
  "font-src 'self' data:",
  // https://keplar.one: business.keplar.one reads the visitor's Business status from keplar.one (same site; /api/business/account).
  `connect-src 'self' blob: https://keplar.one ${WHOP} ${WHOP_API} ${WHOP_PIXEL}${dev ? " ws: wss:" : ""}`,
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  `frame-src 'self' ${WHOP}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

export const PERMISSIONS_POLICY = ["camera=()", "microphone=(self)", "geolocation=()", "payment=()", "usb=()", "interest-cohort=()", "browsing-topics=()"].join(", ");

/**
 * /app pages only (next.config.ts): the Create studio's look tiles and design picker draw each typography pairing in its real
 * typeface. Most come from self-hosted preview cuts (public/fonts/previews); pairings without a local cut load from Google Fonts.
 * So this one variant adds Google's stylesheet host to style-src and its font-file host to font-src.
 * It also allows Stripe.js, used only here so a signed-in owner can link a bank (Financial Connections).
 * The hosts are exact origins: js.stripe.com (the script and its frame), connect-js.stripe.com (the bank
 * window), hooks.stripe.com (bank login challenges), and api.stripe.com (the script's API calls).
 * No wildcards. Every other page keeps the CSP above, which does not allow Stripe.
 */
export const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com";
export const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";
const STRIPE_JS = "https://js.stripe.com";
const STRIPE_CONNECT_JS = "https://connect-js.stripe.com";
const STRIPE_HOOKS = "https://hooks.stripe.com";
const STRIPE_API = "https://api.stripe.com";
export const APP_PAGE_CSP = CSP
  .replace("style-src 'self' 'unsafe-inline'", `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`)
  .replace("font-src 'self' data:", `font-src 'self' data: ${GOOGLE_FONTS_FILES}`)
  .replace(`script-src 'self' 'unsafe-inline' ${WHOP} ${WHOP_PIXEL}`, `script-src 'self' 'unsafe-inline' ${WHOP} ${WHOP_PIXEL} ${STRIPE_JS}`)
  .replace(`frame-src 'self' ${WHOP}`, `frame-src 'self' ${WHOP} ${STRIPE_JS} ${STRIPE_CONNECT_JS} ${STRIPE_HOOKS}`)
  .replace(`connect-src 'self' blob: https://keplar.one ${WHOP} ${WHOP_API} ${WHOP_PIXEL}`, `connect-src 'self' blob: https://keplar.one ${WHOP} ${WHOP_API} ${WHOP_PIXEL} ${STRIPE_API}`);

/** Applied to every path. */
export const BASE_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** Applied to everything except /sites/*, /s/*, /apps/*, /embed (they set their own CSP and may be framed) and /fx/* (FX_HEADERS). */
export const APP_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  // same-origin only on the app shell: published sites, draft previews and /i/ images set their own CORP (often cross-origin for sandboxed pages).
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/**
 * Keplar's own origins, the only pages allowed to frame Keplar documents that may be framed at all. 'self' covers the host that
 * served the response (keplar.one, a *.vercel.app deployment preview, localhost in development); the apex and its subdomains
 * (www, docs) are listed so the builder on any Keplar host can show it. Third-party sites stay blocked.
 */
export const KEPLAR_FRAME_ANCESTORS = "frame-ancestors 'self' https://keplar.one https://*.keplar.one";

/**
 * /fx/* : Keplar's public, versioned, immutable runtime scripts (kapp, kapp-ui, kapp-three, kfx). Generated apps load them with a
 * plain <script src="/fx/kapp.N.js"> from a document sandboxed to an OPAQUE origin (CSP sandbox, no allow-same-origin), so to
 * the browser every such load is cross-origin. APP_HEADERS' `Cross-Origin-Resource-Policy: same-origin` therefore blocked the
 * runtime and draft previews rendered blank. These files hold no user data, so they are cross-origin readable (CORP
 * cross-origin; CORS * for module or crossorigin loads). Framing stays limited to Keplar's own origins, with X-Frame-Options
 * as the fallback for browsers without frame-ancestors (browsers that support frame-ancestors ignore it).
 */
export const FX_HEADERS = [
  { key: "Content-Security-Policy", value: `default-src 'none'; ${KEPLAR_FRAME_ANCESTORS}` },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
  { key: "Access-Control-Allow-Origin", value: "*" },
];

/**
 * Applied after APP_HEADERS to /app/* only (the later rule wins for the same key): the CSP above, and a
 * Cross-Origin-Opener-Policy that still isolates the app but lets a bank's login popup talk back to Stripe.js.
 */
export const APP_PAGE_HEADERS = [
  { key: "Content-Security-Policy", value: APP_PAGE_CSP },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];
