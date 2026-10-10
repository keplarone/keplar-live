/**
 * Platform-side assembly after the model writes (or the owner switches style): the design-system CSS, the direction's
 * font links, a skip link + main id, meta description, and the declarative effect hooks. Deterministic and idempotent;
 * runs before sanitizing (assemble) and after it (hooks, which are plain attributes the sanitizer allows).
 */
import { fontLinks, getDirection } from "./design";
import { applyDesignSystem, hasDesignSystem } from "./design-css";
import type { SiteDesign } from "./types";

const FONT_LINK = /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/gi;

export function designOpts(d: SiteDesign | undefined) {
  return { accent: d?.accent ?? null, mode: d && d.mode !== "auto" ? d.mode : null };
}

/** Prepares model output for storage: DS block in styles.css, direction fonts in every page, skip link, description. */
export function assembleFiles(files: Record<string, string>, design: SiteDesign, opts: { description?: string } = {}): Record<string, string> {
  const dir = getDirection(design.direction);
  const out: Record<string, string> = {};
  for (const [p, src] of Object.entries(files)) {
    if (p.endsWith(".css")) {
      out[p] = applyDesignSystem(src, design.direction, designOpts(design));
      continue;
    }
    if (!p.endsWith(".html")) {
      out[p] = src;
      continue;
    }
    let h = src.replace(FONT_LINK, "");
    if (/<\/head>/i.test(h)) h = h.replace(/<\/head>/i, `${fontLinks(dir, design.fontDisplay)}\n</head>`);
    if (!/<link[^>]*rel=["']stylesheet["'][^>]*styles\.css/i.test(h) && /<\/head>/i.test(h)) h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="styles.css">\n</head>`);
    if (!/class=["'][^"']*\bk-skip\b/.test(h) && /<body[^>]*>/i.test(h)) h = h.replace(/<body([^>]*)>/i, `<body$1><a class="k-skip" href="#main">Skip to content</a>`);
    if (/<main\b(?![^>]*\bid=)/i.test(h)) h = h.replace(/<main\b(?![^>]*\bid=)/i, '<main id="main"');
    if (opts.description && !/<meta[^>]*name=["']description["']/i.test(h) && /<\/head>/i.test(h)) h = h.replace(/<\/head>/i, `<meta name="description" content="${opts.description.replace(/"/g, "&quot;").replace(/</g, "").slice(0, 155)}">\n</head>`);
    out[p] = h;
  }
  return out;
}

/** Re-applies only the design layer (style switch): no model involved. */
export function restyleFiles(files: Record<string, string>, design: SiteDesign): Record<string, string> {
  const out = assembleFiles(files, design);
  if (!Object.keys(out).some((p) => p.endsWith(".css"))) out["styles.css"] = applyDesignSystem("", design.direction, designOpts(design));
  return out;
}

const REVEAL_TARGET = /<(h2|h3|figure|ul|ol|div|section|dl|table|details)\b([^>]*\bclass="[^"]*\b(?:k-h2|k-figure|k-rows|k-index|k-menu|k-tiers|k-faq|k-art|k-ph|k-stat|k-split|k-prose)\b[^"]*"[^>]*)>/g;

/** Adds data-kfx / data-reveal to canonical HTML when the model did not (idempotent, capped). */
export function ensureFxHooks(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...files };
  for (const [p, html] of Object.entries(files)) {
    if (!p.endsWith(".html")) continue;
    let h = html;
    if (!/\bdata-kfx=/.test(h)) {
      const hero = /<(section|div|header)\b([^>]*\bclass="[^"]*\bk-hero\b[^"]*"[^>]*)>/.exec(h);
      if (hero) h = h.replace(hero[0], `<${hero[1]} data-kfx="hero"${hero[2]}>`);
      else if (p === "index.html") {
        const m = /<main\b[^>]*>\s*<(section|div)\b([^>]*)>/.exec(h);
        if (m) h = h.replace(m[0], m[0].replace(`<${m[1]}`, `<${m[1]} data-kfx="hero"`));
      }
    }
    // Reveals: skip everything inside the first screen's section (before the second <section> after <main>).
    const mainAt = h.search(/<main\b/);
    let firstEnd = -1;
    if (mainAt >= 0) {
      const secs = [...h.slice(mainAt).matchAll(/<\/section>/g)];
      firstEnd = secs.length ? mainAt + secs[0].index! : -1;
    }
    let have = (h.match(/\bdata-reveal=/g) ?? []).length;
    if (have < 6) {
      h = h.replace(REVEAL_TARGET, (m: string, tag: string, _attrs: string, off: number) => {
        if (have >= 6 || /data-reveal|data-kfx/.test(m) || (firstEnd >= 0 && off < firstEnd) || off < 800) return m;
        have++;
        return `<${tag} data-reveal="up"${m.slice(1 + tag.length)}`;
      });
    }
    out[p] = h;
  }
  return out;
}

export { hasDesignSystem };

const ERROR_COPY: Record<string, { h: string; p: string }> = {
  dry: { h: "That page doesn't exist.", p: "The address is wrong or the page moved. These are the pages that do exist." },
  warm: { h: "We couldn't find that page.", p: "It may have moved, or the link had a typo. Here is where you can go from here." },
  terse: { h: "Not here.", p: "Try one of these." },
  ceremonial: { h: "This page could not be found.", p: "The address may have changed or never existed. The pages below are available." },
  playful: { h: "Well, that went nowhere.", p: "The page you wanted isn't on this site. These ones are." },
  plain: { h: "Page not found.", p: "Check the address, or choose one of the pages below." },
  literary: { h: "Nothing is kept at this address.", p: "Whatever was here has gone, or was never here. The rest of the house is open." },
};

/**
 * Guarantees the site has its own 404.html in the site's voice, reusing the home page's head, header and footer. Deterministic,
 * no model: only runs when the model did not write one. Links come from the home page's own navigation (real pages only).
 */
export function ensureErrorPage(files: Record<string, string>, voice: string, errorStyle = "plain-note"): Record<string, string> {
  if (files["404.html"] || !files["index.html"]) return files;
  const home = files["index.html"];
  const head = /<head[\s\S]*?<\/head>/i.exec(home)?.[0] ?? '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head>';
  const header = /<header\b[\s\S]*?<\/header>/i.exec(home)?.[0] ?? "";
  const footer = /<footer\b[\s\S]*?<\/footer>/i.exec(home)?.[0] ?? "";
  const lang = /<html[^>]*\blang=["']([a-z-]+)["']/i.exec(home)?.[1] ?? "en";
  const links = [...home.matchAll(/<a\b[^>]*href=["']([a-z0-9_-]+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }))
    .filter((l) => l.text && l.href !== "404.html");
  const uniq = [...new Map(links.map((l) => [l.href, l])).values()].slice(0, 8);
  const copy = ERROR_COPY[voice] ?? ERROR_COPY.plain;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = uniq.map((l, i) => `<li>${errorStyle === "directory" ? `<span class="k-num">${String(i + 1).padStart(2, "0")}</span> ` : ""}<a class="k-link" href="${l.href}">${esc(l.text)}</a></li>`).join("");
  const big = errorStyle === "huge-404" ? `<p class="k-display" aria-hidden="true" style="margin:0;line-height:.8;overflow:hidden">404</p>` : `<p class="k-kicker">404</p>`;
  const main = `<main id="main"><section class="k-section"><div class="k-wrap k-wrap--narrow">${big}<h1 class="k-h1">${esc(copy.h)}</h1><p class="k-lede">${esc(copy.p)}</p><${errorStyle === "directory" ? "ol" : "ul"} class="k-stack" style="list-style:none;padding:0">${list}</${errorStyle === "directory" ? "ol" : "ul"}></div></section></main>`;
  const title = head.replace(/<title>[\s\S]*?<\/title>/i, "<title>Page not found</title>").replace(/<meta[^>]*name=["']description["'][^>]*>/i, "");
  const skip = /<a class="k-skip"[^>]*>[\s\S]*?<\/a>/i.exec(home)?.[0] ?? "";
  return { ...files, "404.html": `<!doctype html>\n<html lang="${lang}">\n${title}\n<body>${skip}${header}\n${main}\n${footer}\n</body>\n</html>\n` };
}
