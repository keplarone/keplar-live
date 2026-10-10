/** Performance (render-blocking, image loading, weight, fonts) and UX (titles, meta, links, assets) rules. */
import type { Ctx } from "./context";
import { MASK, type El } from "./html";
import { escAttr } from "./text";

const LOCAL = (u: string) => u && !/^(https?:|\/\/|data:|blob:|mailto:|tel:|#|javascript:|keplar-image:|\{|\$)/i.test(u) && !u.includes(MASK);
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

export function perfRules(c: Ctx) {
  let jsBytes = 0;
  let cssBytes = 0;
  for (const [p, s] of Object.entries(c.files)) {
    const b = new TextEncoder().encode(s).length;
    if (/\.m?js$/.test(p)) jsBytes += b;
    if (/\.css$/.test(p)) cssBytes += b;
    if (b > 150_000) c.add({ rule: "perf/large-file", category: "perf", severity: "minor", file: p, at: 0, title: `${p} is ${kb(b)}`, detail: "One file this large delays first paint on slow phones (it must download and parse before anything in it runs).", fix: "Split it by screen and load the secondary parts on demand (dynamic import()), or trim unused rules." });
    for (const m of s.matchAll(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{13000,}/g)) {
      c.add({ rule: "perf/inline-base64", category: "perf", severity: "minor", file: p, at: m.index ?? 0, element: m[0].slice(0, 40) + "…", title: `${kb(m[0].length * 0.75)} image inlined as base64`, detail: "Inlined images can't be cached separately and bloat every page that includes this file by a third more than the image itself.", fix: "Move it to an image file (or a Keplar generated image slot) and reference it by URL." });
    }
  }
  if (jsBytes > 300_000) c.add({ rule: "perf/js-weight", category: "perf", severity: "major", file: c.scripts[0] ?? Object.keys(c.files)[0], at: 0, title: `${kb(jsBytes)} of JavaScript`, detail: "Above ~300 KB, mid-range phones spend seconds parsing before the app responds.", fix: "Lazy-load secondary screens and drop unused helpers." });
  if (cssBytes > 120_000) c.add({ rule: "perf/css-weight", category: "perf", severity: "minor", file: c.css.find((x) => x.kind === "file")?.file ?? Object.keys(c.files)[0], at: 0, title: `${kb(cssBytes)} of CSS`, detail: "All CSS blocks rendering; this much usually means duplicated or unused rules.", fix: "Remove unused selectors and merge duplicates." });

  for (const [file, docs] of c.html) {
    for (const doc of docs) {
      let imgs = 0;
      const inHead = (el: El) => { let p = el.parent; while (p) { if (p.tag === "head") return true; p = p.parent; } return false; };
      const listTemplate = doc.base > 0 && /\.map\(\s*\(?[\w$,\s{}]*\)?\s*=>\s*(\(\s*)?$/.test(c.files[file].slice(Math.max(0, doc.base - 120), doc.base - 5));
      if (doc.els.length > 1500) c.add({ rule: "perf/dom-size", category: "perf", severity: "minor", file, at: doc.base, title: `${doc.els.length} elements in one document`, detail: "Large DOMs slow every style recalculation and layout.", fix: "Paginate or virtualize long lists; remove wrapper divs that only add nesting." });
      for (const el of doc.els) {
        if (el.tag === "script" && el.attrs.src?.value && inHead(el) && !("defer" in el.attrs) && !("async" in el.attrs) && el.attrs.type?.value !== "module") {
          c.add({ rule: "perf/render-blocking-script", category: "perf", severity: "major", file, at: el.start, element: el.raw, title: "Script blocks the first paint", detail: `${el.attrs.src.value} in <head> without defer stops HTML parsing until it downloads and runs.`, fix: "Add defer (it still runs in order, after parsing).", patch: [c.insAttr(file, el, "defer")] });
        }
        if (el.tag === "script" && /(jquery|moment(\.min)?\.js|lodash(\.min)?\.js|bootstrap\.bundle)/i.test(el.attrs.src?.value ?? "")) {
          c.add({ rule: "perf/heavy-library", category: "perf", severity: "minor", file, at: el.start, element: el.raw, title: `Heavy library: ${/(jquery|moment|lodash|bootstrap)/i.exec(el.attrs.src!.value!)![1]}`, detail: "Loaded for a few helpers it costs 30–90 KB and a blocking request.", fix: "Use the platform equivalent (querySelector, Intl.DateTimeFormat, structuredClone…)." });
        }
        if (el.tag === "img") {
          imgs++;
          if (!("loading" in el.attrs) && ((imgs > 2 && !el.inTemplate) || (el.inTemplate && listTemplate))) {
            c.add({ rule: "perf/img-lazy", category: "perf", severity: "minor", file, at: el.start, element: el.raw, title: "Off-screen image loads eagerly", detail: el.inTemplate ? "This image is rendered per list item; every one downloads at once on open." : `Image #${imgs} on the page downloads before the visitor scrolls to it.`, fix: `Add loading="lazy" decoding="async".`, patch: [c.insAttr(file, el, `loading="lazy" decoding="async"`)] });
          }
          if (!("width" in el.attrs) && !("height" in el.attrs) && !el.inTemplate && imgs <= 6) {
            c.add({ rule: "perf/img-dimensions", category: "perf", severity: "minor", file, at: el.start, element: el.raw, title: "Image without width/height (layout shift)", detail: "The page jumps when it arrives (Cumulative Layout Shift), pushing text the visitor is reading.", fix: "Add width and height attributes matching the image's aspect ratio (CSS can still size it), or aspect-ratio in CSS." });
          }
        }
        if (el.tag === "link" && /fonts\.googleapis\.com/.test(el.attrs.href?.value ?? "") && !/display=/.test(el.attrs.href!.value!)) {
          const a = el.attrs.href!;
          c.add({ rule: "perf/font-display", category: "perf", severity: "minor", file, at: el.start, element: el.raw, title: "Web font hides text while loading", detail: "Without display=swap the text stays invisible until the font file arrives (up to 3 s on slow networks).", fix: "Add &display=swap to the font URL.", patch: [c.ins(file, a.valueEnd, `${a.value!.includes("?") ? "&" : "?"}display=swap`)] });
        }
      }
    }
  }
  for (const s of c.css) {
    for (const im of s.sheet.imports) {
      const google = /fonts\.googleapis/.test(im.url);
      c.add({ rule: "perf/css-import", category: "perf", severity: "minor", file: s.file, at: im.start, element: c.files[s.file].slice(im.start, im.end), title: google ? "Fonts loaded with @import" : "Stylesheet chained with @import", detail: "@import is discovered only after this CSS downloads, adding a full round trip before first paint.", fix: google ? "Load it with <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin> + <link rel=\"stylesheet\" href=\"…&display=swap\"> in the HTML head." : "Reference it with its own <link rel=stylesheet> or merge it." });
    }
    if (s.kind === "file") {
      const src = c.files[s.file];
      for (const m of src.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        if (/font-display/.test(m[1])) continue;
        const at = (m.index ?? 0) + m[0].indexOf("{") + 1;
        c.add({ rule: "perf/font-face-display", category: "perf", severity: "minor", file: s.file, at: m.index ?? 0, element: m[0].slice(0, 70), title: "@font-face without font-display", detail: "Text is invisible until this font downloads.", fix: "Add font-display: swap; to the @font-face block.", patch: [c.ins(s.file, at, " font-display: swap;")] });
      }
    }
  }
}

const GENERIC_TITLES = /^(document|untitled|react app|vite app|my app|home|index|app|website|new page)$/i;

export function uxRules(c: Ctx) {
  const name = c.opts.name?.trim() || "";
  const files = new Set(Object.keys(c.files));
  for (const file of c.pages) {
    const doc = c.html.get(file)?.[0];
    if (!doc) continue;
    const head = doc.els.find((e) => e.tag === "head");
    const title = doc.els.find((e) => e.tag === "title");
    const headAt = head ? head.openEnd : 0;
    if (!title || !title.text.trim() || GENERIC_TITLES.test(title.text.trim())) {
      const t = name ? `${name}${file !== "index.html" ? ` · ${file.replace(/\.html?$/, "").replace(/[-_]/g, " ")}` : ""}` : "";
      const patch = t ? (title && title.closeStart !== null ? [c.rep(file, title.openEnd, title.closeStart, escAttr(t))] : head ? [c.ins(file, headAt, `\n  <title>${escAttr(t)}</title>`)] : undefined) : undefined;
      c.add({ rule: "ux/page-title", category: "ux", severity: "major", file, at: title?.start ?? headAt, element: title?.raw, title: title ? `Generic page title “${title.text.trim()}”` : "Page has no <title>", detail: "The title is the tab label, the bookmark name, the search result headline and the first thing a screen reader says.", fix: t ? `Use <title>${t}</title>.` : "Give the page a specific title.", patch, ref: "WCAG 2.4.2" });
    }
    if (!doc.els.some((e) => e.tag === "meta" && /viewport/i.test(e.attrs.name?.value ?? ""))) {
      c.add({ rule: "ux/viewport", category: "ux", severity: "critical", file, at: headAt, title: "No mobile viewport", detail: "Phones render the page at desktop width and shrink it; text becomes unreadably small.", fix: `Add <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>.`, patch: head ? [c.ins(file, headAt, `\n  <meta name="viewport" content="width=device-width, initial-scale=1">`)] : undefined });
    }
    if (file === "index.html" && !doc.els.some((e) => e.tag === "meta" && /description/i.test(e.attrs.name?.value ?? ""))) {
      const d = (c.opts.description ?? "").trim().slice(0, 155);
      c.add({ rule: "ux/meta-description", category: "ux", severity: "minor", file, at: headAt, title: "No meta description", detail: "Search results and link previews will show a random sentence from the page instead of your pitch.", fix: d ? `Add <meta name="description" content="${d}">.` : "Add a 140–160 character <meta name=\"description\">.", patch: d && head ? [c.ins(file, headAt, `\n  <meta name="description" content="${escAttr(d)}">`)] : undefined });
    }
    if (file === "index.html" && !doc.els.some((e) => e.tag === "link" && /icon/i.test(e.attrs.rel?.value ?? ""))) {
      const letter = (name[0] ?? "K").toUpperCase().replace(/[^A-Z0-9]/, "K");
      const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23111'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='18' font-weight='700' fill='%23fff' text-anchor='middle'%3E${letter}%3C/text%3E%3C/svg%3E`;
      c.add({ rule: "ux/favicon", category: "ux", severity: "info", file, at: headAt, title: "No favicon", detail: "The tab shows a blank page icon, which looks unfinished next to other tabs.", fix: `Add a <link rel="icon">; a monogram “${letter}” icon is ready to apply.`, patch: head ? [c.ins(file, headAt, `\n  <link rel="icon" href="${svg}">`)] : undefined });
    }
  }
  for (const { file, el } of c.allEls()) {
    const href = el.attrs.href?.value ?? "";
    if (el.tag === "a" && (href === "#" || /^javascript:/i.test(href)) && !el.attrs.onclick && !el.attrs.role) {
      c.add({ rule: "ux/dead-link", category: "ux", severity: "minor", file, at: el.start, element: el.raw + el.text.slice(0, 40), title: `Link “${el.text.slice(0, 30) || "…"}” goes nowhere`, detail: `href="${href}" looks clickable but does nothing (or jumps to the top).`, fix: "Point it at a real page or section, or remove it until there is one." });
    }
    if (el.tag === "a" && el.attrs.target?.value === "_blank" && !/noopener|noreferrer/.test(el.attrs.rel?.value ?? "")) {
      c.add({ rule: "ux/noopener", category: "ux", severity: "minor", file, at: el.start, element: el.raw, title: "New-tab link without rel=noopener", detail: "The opened page can navigate this tab (reverse tabnabbing) and shares its process.", fix: `Add rel="noopener".`, patch: el.attrs.rel ? undefined : [c.insAttr(file, el, `rel="noopener"`)] });
    }
    const ref = el.tag === "a" ? href : el.tag === "img" || el.tag === "script" || el.tag === "source" ? el.attrs.src?.value ?? "" : el.tag === "link" && /stylesheet|icon/.test(el.attrs.rel?.value ?? "") ? href : "";
    if (ref && LOCAL(ref) && !el.inTemplate) {
      const clean = ref.split(/[?#]/)[0].replace(/^\.?\//, "");
      const isPageLink = el.tag === "a";
      const exists = !clean || files.has(clean) || files.has(`${clean}.html`) || files.has(`${clean.replace(/\/$/, "")}/index.html`) || /^(fx|_api|api|i)\//.test(clean);
      if (!exists && (isPageLink ? /\.html?$|^[a-z0-9-]+$/.test(clean) && c.opts.kind !== "app" : /\.(css|m?js|png|jpe?g|webp|svg|gif|avif)$/i.test(clean))) {
        c.add({ rule: isPageLink ? "ux/broken-link" : "ux/missing-asset", category: "ux", severity: "major", file, at: el.start, element: el.raw, title: isPageLink ? `Link to “${ref}” is broken` : `Missing file “${ref}”`, detail: isPageLink ? "That page isn't part of this creation; visitors get a 404." : "That file isn't part of this creation; it will 404 and whatever depends on it won't load.", fix: isPageLink ? "Point it at an existing page or create that page." : "Add the file or remove the reference." });
      }
    }
    if ((el.attrs.src?.value ?? el.attrs.href?.value ?? "").startsWith("http://") && !/^http:\/\/(localhost|127\.|www\.w3\.org)/.test(el.attrs.src?.value ?? el.attrs.href?.value ?? "")) {
      const a = el.attrs.src ?? el.attrs.href!;
      c.add({ rule: "code/mixed-content", category: "code", severity: el.tag === "a" ? "minor" : "major", file, at: a.start, element: el.raw, title: "Insecure http:// URL", detail: el.tag === "a" ? "Visitors leave HTTPS and browsers warn." : "Browsers block http:// resources on an https page (mixed content), so this won't load.", fix: "Use https://.", patch: [c.rep(file, a.valueStart, a.valueStart + 7, "https://")] });
    }
  }
}
