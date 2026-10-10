/**
 * The "Made with Keplar" watermark for sites built in Create.
 *
 * Rule: Free (and Lite) sites carry the watermark; Plus, Pro, Business and Admin sites never do, in the published site, the
 * Create preview and the exported ZIP. The decision is made from the site owner's CURRENT plan every time a page is rendered
 * (nothing is stored on the site and live HTML is served `no-store`), so an upgrade removes it immediately and a downgrade
 * brings it back with no purge step.
 *
 * The watermark is appended by Keplar's renderer AFTER the sanitized user markup (see buildDocument), never produced by the
 * model. Because user CSS is allowed, it is also hardened: every property is an inline `!important` (element-attached
 * important declarations beat all author CSS, including @layer), and a first-in-head `@layer` guard keeps html/body from being
 * hidden, collapsed or clipped. It is a normal-flow strip at the end of <body>, not a fixed overlay.
 */
import type { PlanId } from "@/lib/create/platform/plans";

export const WATERMARK_URL = "https://keplar.one";
export const WATERMARK_TEXT = "Made with Keplar";
export const WATERMARK_ID = "k-wm";

/** Plans that remove the watermark. Anything else (free, lite, an unknown value) keeps it. */
const WATERMARK_FREE: ReadonlySet<string> = new Set<PlanId>(["plus", "pro", "business"]);

/** Plan -> watermark decision. Fail closed: a missing or unknown plan shows it. */
export function watermarkRequired(plan: PlanId | string | null | undefined): boolean {
  return !(typeof plan === "string" && WATERMARK_FREE.has(plan));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const imp = (decls: string) => decls.split(";").filter(Boolean).map((d) => `${d.trim()} !important`).join(";");

const STRIP = imp(
  "display:block;position:static;float:none;clear:both;box-sizing:border-box;width:100%;min-width:0;max-width:none;height:auto;min-height:0;max-height:none;flex:none;order:2147483647;grid-column:1/-1;align-self:stretch;margin:auto 0 0 0;padding:0 16px;overflow:visible;visibility:visible;opacity:1;transform:none;clip:auto;clip-path:none;mask:none;content-visibility:visible;pointer-events:auto;z-index:auto;background:#f4f4f5;color:#52525b;border:0;border-top:1px solid #e4e4e7;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:normal;text-transform:none;text-indent:0;text-align:center;text-shadow:none;filter:none",
);
const LINK = imp(
  "display:inline-block;position:static;visibility:visible;opacity:1;transform:none;clip-path:none;pointer-events:auto;width:auto;height:auto;margin:0;padding:14px 8px;color:#18181b;background:none;font:inherit;font-size:12px;letter-spacing:normal;text-transform:none;text-decoration:underline;text-shadow:none;filter:none",
);
const SEP = imp("display:inline;visibility:visible;opacity:1;color:#52525b;font-size:12px");

const link = (href: string, text: string, extra = "") => `<a href="${esc(href)}"${extra} style="${LINK}">${esc(text)}</a>`;

export type FooterOpts = {
  /** Show "Made with Keplar". */
  watermark: boolean;
  /** Live site: also carries the abuse-report link (every published site, any plan). */
  reportHref?: string | null;
};

/** The strip appended after the page content. Empty when there is nothing to show. */
export function footerStrip(o: FooterOpts): string {
  const parts: string[] = [];
  if (o.watermark) parts.push(link(WATERMARK_URL, WATERMARK_TEXT, ' rel="noopener" target="_blank"'));
  if (o.reportHref) parts.push(link(o.reportHref, "Report abuse", ' rel="nofollow"'));
  if (!parts.length) return "";
  const sep = `<span style="${SEP}"> &middot; </span>`;
  const mark = o.watermark ? ` data-keplar-watermark="1"` : "";
  return `\n<div id="${o.watermark ? WATERMARK_ID : "k-ft"}"${mark} style="${STRIP}">${parts.join(sep)}</div>`;
}

/** Watermark-only strip (preview and ZIP: no abuse link, there is no live site to report). */
export const watermarkStrip = () => footerStrip({ watermark: true });

/**
 * Stylesheet that keeps the page's own CSS from hiding or collapsing the strip. Placed first in <head> so its @layer is the
 * earliest layer, which wins every `!important` fight against later layers and unlayered author CSS.
 * `pageCss` is the page's CSS text, used only to decide whether <body> needs `display:block` forced (a flex/grid body is left alone).
 */
export function guardStyle(pageCss = ""): string {
  const hidesRoot = /(?:^|[}\s,;>+~])(?:html|body|:root|\*)\s*(?:,[^{}]*)?\{[^}]*display\s*:\s*(?:none|contents)/i.test(pageCss);
  const rules = [
    "html,body{visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow-y:visible!important;clip-path:none!important;transform:none!important;content-visibility:visible!important}",
    "html{display:block!important}",
    "body{flex-wrap:wrap!important}",
    ...(hidesRoot ? ["body{display:block!important}"] : []),
  ];
  return `<style data-keplar-guard>@layer kwm{${rules.join("")}}</style>`;
}

/** Drops `!important` from the page's own <body style>, so the guard layer's important rules always win over it. */
export const dropImportant = (style: string) => style.replace(/!\s*important/gi, "");

/** Add the watermark to a finished, static HTML document (ZIP export). Idempotent. */
export function injectWatermark(html: string): string {
  if (html.includes(`id="${WATERMARK_ID}"`)) return html;
  const strip = watermarkStrip();
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? html + strip : html.slice(0, i) + strip + "\n" + html.slice(i);
}

/** Apply the plan rule to an export: Free/Lite get the watermark in every HTML page, Plus and above get the files untouched. */
export function watermarkFiles(files: Record<string, string>, plan: PlanId | string | null | undefined): Record<string, string> {
  if (!watermarkRequired(plan)) return files;
  const out: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) out[name] = /\.html?$/i.test(name) ? injectWatermark(content) : content;
  return out;
}
