/**
 * Generated app files: what may be stored, and how pages are served. Apps may contain HTML pages, CSS, ES-module JavaScript,
 * JSON and SVG. Scripts run only from the app's own files (CSP script-src 'self'; no inline script, no eval, no third-party
 * script), inside a sandboxed document with an opaque origin (it can never read keplar.one cookies or storage), and the only
 * network access is the app's own API (connect-src 'self'). Keplar injects its runtime, the design-system stylesheet and fonts.
 */
import { createHash } from "node:crypto";
import { KAPP_SDK_PATH, KAPP_THREE_PATH, KAPP_UI_PATH } from "./runtime-paths";
import { designCss, tokensFor } from "./design/tokens";
import { watermarkRequired, WATERMARK_TEXT, WATERMARK_URL } from "@/lib/site-builder/watermark";
import type { PlanId } from "@/lib/create/platform/plans";
import type { AppMeta } from "./types";

export const APP_FILE = /^(?:[a-z0-9][a-z0-9_-]{0,30}\/){0,2}[a-z0-9][a-z0-9_.-]{0,40}\.(html|css|js|mjs|json|svg)$/;
export const DESIGN_FILE = "kapp.css";

export class AppFilesError extends Error {}

const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml" };
export const contentTypeOf = (file: string) => TYPES[file.split(".").pop() ?? ""] ?? "text/plain; charset=utf-8";

/** Cleans one HTML page: keeps the app's own module/classic scripts by relative path, drops everything CSP would block anyway. */
export function cleanAppHtml(html: string): { html: string; removed: string[] } {
  const removed: string[] = [];
  let out = html.replace(/^\uFEFF/, "");
  out = out.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (m, attrs: string, body: string) => {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src) {
      if (body.trim()) removed.push("inline script (moved code must live in a .js file)");
      return /type\s*=\s*["']importmap["']/i.test(attrs) ? "" : "";
    }
    if (/^(https?:)?\/\//i.test(src) || /^(javascript|data):/i.test(src)) {
      if (!src.includes("/fx/kapp")) removed.push(`external script ${src.slice(0, 60)}`);
      return "";
    }
    const isModule = /type\s*=\s*["']module["']/i.test(attrs);
    return `<script${isModule ? ' type="module"' : " defer"} src="${src.replace(/^\.\//, "").replace(/"/g, "")}"></script>`;
  });
  out = out.replace(/<(iframe|object|embed|base|frame|frameset|applet)\b[^>]*>(?:[\s\S]*?<\/\1\s*>)?/gi, (m, tag) => {
    removed.push(`<${String(tag).toLowerCase()}>`);
    return "";
  });
  out = out.replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*>/gi, () => (removed.push("meta refresh"), ""));
  out = out.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy[^>]*>/gi, () => "");
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m) => (/^\s+on[a-z]+\s*=/i.test(m) ? (removed.push("inline event handler"), "") : m));
  out = out.replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  // Keplar adds these itself.
  out = out.replace(/<link[^>]+href\s*=\s*["'](?:\.\/)?kapp\.css["'][^>]*>/gi, "");
  return { html: out, removed: [...new Set(removed)] };
}

/** Validates and cleans a generated file set against the plan's budget. */
export function normalizeAppFiles(input: Record<string, string>, budget: { maxFiles: number; maxBytes: number }): { files: Record<string, string>; removed: string[] } {
  const files: Record<string, string> = {};
  const removed: string[] = [];
  for (const [raw, content] of Object.entries(input)) {
    const p = raw.trim().replace(/^\.?\//, "").toLowerCase();
    if (typeof content !== "string") continue;
    if (p === DESIGN_FILE) continue; // always regenerated from the design choice
    if (!APP_FILE.test(p) || p.includes("..")) {
      removed.push(`file ${p.slice(0, 50)} skipped`);
      continue;
    }
    if (content.length > 400_000) throw new AppFilesError(`${p} is too large.`);
    if (p.endsWith(".html")) {
      const c = cleanAppHtml(content);
      files[p] = c.html;
      removed.push(...c.removed.map((r) => `${p}: ${r}`));
    } else files[p] = content.replace(/^\uFEFF/, "");
  }
  if (!files["index.html"]) throw new AppFilesError("An app needs an index.html.");
  if (Object.keys(files).length > budget.maxFiles + 1) throw new AppFilesError(`Your plan allows up to ${budget.maxFiles} files per app.`);
  const bytes = Object.values(files).reduce((a, c) => a + Buffer.byteLength(c), 0);
  if (bytes > budget.maxBytes) throw new AppFilesError(`This app is ${Math.round(bytes / 1024)} KB; your plan allows up to ${Math.round(budget.maxBytes / 1024)} KB.`);
  return { files, removed: [...new Set(removed)] };
}

/** The design-system file for a stored app (always derived from the design choice, so theme edits need no model). */
export const designFileFor = (meta: Pick<AppMeta, "design">) => designCss(tokensFor(meta.design));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type AppRenderCtx = {
  meta: AppMeta;
  /** The app's root path ("/s/<slug>", "/apps/draft/..."): a <base> makes relative files resolve inside the app even when the
   *  address has no trailing slash (Next.js removes it). Omitted for files in subfolders and on custom domains. */
  base?: string;
  siteId: string;
  env: "draft" | "live" | "qa";
  /** Absolute path of the API, e.g. /s/slug/_api or /apps/draft/<id>/<v>/<token>/_api */
  api: string;
  plan: PlanId;
  /** Published apps: the report link. */
  reportHref: string | null;
  images: Record<string, string>;
  title: string;
};

/** Injects the runtime into a page: config meta, fonts, design system, SDK (+ UI / three when the app uses them), badge. */
export function renderAppPage(html: string, ctx: AppRenderCtx): string {
  const spec = ctx.meta.spec;
  const t = tokensFor(ctx.meta.design);
  const cfg = { id: ctx.siteId, env: ctx.env, api: ctx.api, name: spec.name, auth: spec.auth.enabled, authMethods: spec.auth.enabled ? (spec.auth.methods.length ? spec.auth.methods : ["password"]) : [], collections: spec.collections.map((c) => c.name), images: ctx.images };
  const head = [
    `<meta name="k-app" content="${esc(JSON.stringify(cfg))}">`,
    t.fonts.google ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(t.fonts.google)}">` : "",
    `<link rel="stylesheet" href="${DESIGN_FILE}">`,
    `<script src="${KAPP_SDK_PATH}"></script>`,
    spec.uses.includes("ui") ? `<script src="${KAPP_UI_PATH}"></script>` : "",
    spec.uses.includes("three") ? `<script src="${KAPP_THREE_PATH}"></script>` : "",
  ].filter(Boolean).join("\n");
  let doc = /<!doctype html>/i.test(html) ? html : `<!doctype html>\n${html}`;
  if (!/<head[\s>]/i.test(doc)) doc = doc.replace(/<html[^>]*>/i, (m) => `${m}<head></head>`);
  if (!/<html[\s>]/i.test(doc)) doc = doc.replace(/<!doctype html>/i, `<!doctype html><html lang="en"><head></head>`);
  if (!/<meta[^>]+viewport/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => `${m}\n<meta name="viewport" content="width=device-width, initial-scale=1">`);
  if (!/<meta[^>]+charset/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => `${m}\n<meta charset="utf-8">`);
  // Runtime first so the app's own stylesheet and modules come after it.
  doc = doc.replace(/<head[^>]*>/i, (m) => `${m}\n${head}`);
  if (ctx.base && !/<base[\s>]/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${esc(ctx.base!.replace(/\/+$/, ""))}/">`);
  if (!/<title>/i.test(doc)) doc = doc.replace(/<\/head>/i, `<title>${esc(ctx.title)}</title></head>`);
  if (ctx.env !== "live" || !/name=["']robots["']/i.test(doc)) doc = doc.replace(/<\/head>/i, `<meta name="robots" content="noindex"></head>`);
  const badge = watermarkRequired(ctx.plan)
    ? `<a id="k-wm" href="${WATERMARK_URL}" target="_blank" rel="noopener" style="position:fixed;right:10px;bottom:10px;z-index:2147483646;font:500 11px/1 system-ui,sans-serif;padding:7px 10px;border-radius:999px;background:rgba(12,12,12,.82);color:#fff;text-decoration:none;letter-spacing:.01em">${WATERMARK_TEXT}</a>`
    : "";
  const report = ctx.reportHref ? `<a href="${esc(ctx.reportHref)}" style="position:fixed;left:10px;bottom:10px;z-index:2147483646;font:500 10px/1 system-ui,sans-serif;padding:6px 8px;border-radius:999px;background:rgba(12,12,12,.55);color:#fff;text-decoration:none;opacity:.7">Report</a>` : "";
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${badge}${report}</body>`) : doc + badge + report;
}

/** CSP for app documents: own scripts only, own API only, sandboxed to an opaque origin. */
export function appCsp(env: "draft" | "live" | "qa") {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self'",
    "worker-src blob:",
    "form-action 'self'",
    "base-uri 'self'", // the page's own <base> (relative files resolve inside the app with or without a trailing slash)
    "object-src 'none'",
    env !== "live" ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock",
  ].join("; ");
}

export function appHeaders(env: "draft" | "live" | "qa", file: string, opts: { html?: boolean } = {}): Record<string, string> {
  const ct = contentTypeOf(file);
  const html = opts.html ?? ct.startsWith("text/html");
  return {
    "content-type": ct,
    ...(html ? { "content-security-policy": appCsp(env) } : { "content-security-policy": "default-src 'none'; sandbox" }),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    // Module scripts from an opaque origin are CORS requests: the app's own files must allow them.
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(env !== "live" ? { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } : { "cache-control": html ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300" }),
  };
}

/** Which stored file answers a path: exact file, then `<path>.html`, then index.html for anything else (SPA fallback). */
export function appFileFor(parts: string[] | undefined, files: Record<string, string>): string | null {
  const rel = (parts ?? []).join("/").replace(/\/+$/, "").toLowerCase();
  if (!rel) return "index.html";
  if (rel.includes("..")) return null;
  if (rel === DESIGN_FILE) return DESIGN_FILE;
  if (files[rel] !== undefined) return rel;
  if (files[`${rel}.html`] !== undefined) return `${rel}.html`;
  if (/\.(js|mjs|css|json|svg|png|jpe?g|webp|ico)$/i.test(rel)) return null;
  return "index.html";
}

export const etagOf = (s: string) => `"${createHash("sha1").update(s).digest("base64url").slice(0, 20)}"`;

/** A quiet patterned placeholder in the app's own colors for an image slot that has no generated image (e.g. Free builds). */
export function placeholderImage(meta: Pick<AppMeta, "design">, slot: string): string {
  const p = tokensFor(meta.design).palette;
  let h = 0;
  for (const c of slot) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const angle = 20 + (h % 50);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400' preserveAspectRatio='xMidYMid slice'><rect width='600' height='400' fill='${p.surface2}'/><g transform='rotate(${angle} 300 200)' stroke='${p.accent}' stroke-opacity='.35' stroke-width='2'>${Array.from({ length: 24 }, (_, i) => `<line x1='-400' y1='${i * 40 - 300}' x2='1000' y2='${i * 40 - 300}'/>`).join("")}</g><circle cx='${120 + (h % 360)}' cy='${110 + (h % 180)}' r='64' fill='${p.accent}' fill-opacity='.75'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;
}

/** Replaces "keplar-image:<slot>" references in served HTML/CSS/JS with the generated image URL (or a placeholder). */
export function resolveImageRefs(text: string, meta: Pick<AppMeta, "design" | "images">): string {
  if (!text.includes("keplar-image:")) return text;
  return text.replace(/keplar-image:([a-zA-Z][a-zA-Z0-9_]{0,31})/g, (_m, slot: string) => meta.images?.[slot] ?? placeholderImage(meta, slot));
}

/** index.html for single-page apps: Keplar writes it so the entry is always wired the same way. */
export function appIndexHtml(spec: Pick<AppMeta["spec"], "name" | "tagline" | "summary">, cssFiles: string[] = ["styles.css"], lang = "en"): string {
  const desc = (spec.tagline || spec.summary || spec.name).slice(0, 160);
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(spec.name)}</title>
<meta name="description" content="${esc(desc)}">
${cssFiles.map((c) => `<link rel="stylesheet" href="${esc(c)}">`).join("\n")}
<script type="module" src="app.js"></script>
</head>
<body>
<div id="app"></div>
<noscript>${esc(spec.name)} needs JavaScript to run.</noscript>
</body>
</html>
`;
}

/**
 * Abuse checks on app code before publishing (the sandbox already blocks third-party scripts, foreign network calls and
 * cookies; this catches what would still be abuse inside it). Returns a reason, or null when nothing was found.
 */
export function scanAppCode(files: Record<string, string>): string | null {
  for (const [p, c] of Object.entries(files)) {
    if (!/\.(m?js|html)$/.test(p)) continue;
    if (/coinhive|cryptonight|cryptoloot|webminer|xmrig|minero\.cc|monero[-_ ]?miner|\bCoinImp\b/i.test(c)) return "it contains cryptocurrency-mining code.";
    if (/WebAssembly\.(instantiate|compile)(Streaming)?\s*\(/.test(c) && /\b(hash(es)?rate|nonce|mining|miner)\b/i.test(c)) return "it runs WebAssembly that looks like a miner.";
    if (/(seed phrase|recovery phrase|private key|wallet passphrase)/i.test(c) && /<input|k-input|type=["']password/i.test(c) && /(metamask|trust wallet|ledger|coinbase|phantom)/i.test(c)) return "it looks like a wallet phishing page.";
    if (/(verify|confirm|update) your (paypal|apple id|bank|chase|wells fargo|microsoft|office 365|outlook|netflix|amazon) (account|password|details)/i.test(c)) return "it looks like a credential phishing page.";
  }
  return null;
}
