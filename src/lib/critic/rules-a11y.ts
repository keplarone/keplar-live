/** Accessibility rules: names, labels, landmarks, headings, contrast (WCAG 2.2 math), motion, zoom, focus. */
import { contrast, firstColor, fixContrast, parseColor, resolveVars } from "./css";
import type { Ctx } from "./context";
import { MASK, type El } from "./html";
import { escAttr, wordsFrom } from "./text";

const INTERACTIVE_INPUT = (el: El) => el.tag === "select" || el.tag === "textarea" || (el.tag === "input" && !/^(hidden|submit|button|image|reset)$/i.test(el.attrs.type?.value ?? "text"));
const named = (el: El) => Boolean(el.attrs["aria-label"]?.value || el.attrs["aria-label"]?.dynamic || el.attrs["aria-labelledby"] || el.attrs.title?.value || el.attrs.title?.dynamic);
const hasText = (el: El) => el.name.replace(new RegExp(MASK, "g"), "x").replace(/[\s\u00a0]/g, "").length > 0;
function guessName(el: El): string {
  for (const k of ["data-icon", "id", "class", "name"]) {
    const v = el.attrs[k]?.value;
    if (v && !v.includes(MASK)) {
      const w = wordsFrom(v.split(/\s+/).find((c) => /close|menu|search|play|pause|next|prev|back|cart|share|delete|remove|edit|add|like|save|send|user|account|settings|theme|toggle|filter|more/i.test(c)) ?? "");
      if (w) return w;
    }
  }
  const svg = el.children.find((c) => c.tag === "svg");
  const cls = svg?.attrs.class?.value ?? svg?.attrs["data-icon"]?.value;
  return cls ? wordsFrom(cls) : "";
}

export function a11yRules(c: Ctx) {
  const els = c.allEls();
  const labelFor = new Set(els.filter((x) => x.el.tag === "label" && x.el.attrs.for?.value).map((x) => x.el.attrs.for!.value!));

  for (const { file, el } of els) {
    const src = c.files[file];
    // ── images
    if (el.tag === "img" && !("alt" in el.attrs) && !named(el) && el.attrs.role?.value !== "presentation") {
      const s = el.attrs.src;
      let patchVal: string | null = null;
      if (s?.dynamic) {
        const expr = src.slice(s.valueStart, s.valueEnd);
        const m = /\$\{\s*([A-Za-z_$][\w$]*)\.[\w$]+\s*\}/.exec(expr);
        if (m && el.inTemplate) patchVal = `alt=\${${m[1]}.alt || ${m[1]}.title || ${m[1]}.name || ""}`;
      } else {
        const fig = el.parent?.tag === "figure" ? el.parent.children.find((x) => x.tag === "figcaption")?.text : "";
        const w = fig || wordsFrom(s?.value ?? "") || (el.parent?.tag === "a" ? el.parent.text : "");
        if (w) patchVal = `alt="${escAttr(w.slice(0, 100))}"`;
      }
      c.add({ rule: "a11y/img-alt", category: "a11y", severity: "major", file, at: el.start, element: el.raw, title: "Image has no alt text", detail: `Screen readers announce this image as “image” or read its file name${s?.value && !s.dynamic ? ` (${s.value.slice(0, 60)})` : ""}.`, fix: patchVal ? `Add ${patchVal.replace(/\$\{[^}]+\}/, "{…}")} — or alt="" if it is purely decorative.` : `Add alt="…" describing what the image shows (or alt="" if decorative).`, patch: patchVal ? [c.insAttr(file, el, patchVal)] : undefined, ref: "WCAG 1.1.1" });
    }
    if (el.tag === "html" && !el.attrs.lang?.value) {
      c.add({ rule: "a11y/html-lang", category: "a11y", severity: "major", file, at: el.start, element: el.raw, title: "Page language is not set", detail: "Without lang, screen readers guess the pronunciation and browsers can't offer the right translation.", fix: `Add lang="en" (or the page's language) to <html>.`, patch: [c.insAttr(file, el, 'lang="en"')], ref: "WCAG 3.1.1" });
    }
    // ── names
    const isButton = el.tag === "button" || el.attrs.role?.value === "button";
    if (isButton && !named(el) && !hasText(el)) {
      const g = guessName(el);
      c.add({ rule: "a11y/button-name", category: "a11y", severity: "critical", file, at: el.start, element: el.raw, title: "Button has no accessible name", detail: "It is announced as just “button”: someone using a screen reader can't tell what it does.", fix: g ? `Add aria-label="${g}".` : `Add aria-label describing the action (e.g. aria-label="Close menu"), or visible text.`, patch: g ? [c.insAttr(file, el, `aria-label="${escAttr(g)}"`)] : undefined, ref: "WCAG 4.1.2" });
    }
    if (el.tag === "a" && "href" in el.attrs && !named(el) && !hasText(el)) {
      const g = guessName(el) || wordsFrom(el.attrs.href?.value ?? "");
      c.add({ rule: "a11y/link-name", category: "a11y", severity: "critical", file, at: el.start, element: el.raw, title: "Link has no accessible name", detail: "Icon-only link with no text, aria-label or titled SVG: it is announced as its raw URL or nothing.", fix: g ? `Add aria-label="${g}".` : "Add aria-label naming the destination.", patch: g ? [c.insAttr(file, el, `aria-label="${escAttr(g)}"`)] : undefined, ref: "WCAG 2.4.4" });
    }
    if (INTERACTIVE_INPUT(el) && !named(el)) {
      let p: El | null = el.parent;
      let wrapped = false;
      while (p) { if (p.tag === "label") { wrapped = true; break; } p = p.parent; }
      const id = el.attrs.id?.value;
      if (!wrapped && !(id && labelFor.has(id))) {
        const ph = el.attrs.placeholder?.value;
        const g = (ph && !ph.includes(MASK) ? ph : "") || wordsFrom(el.attrs.name?.value ?? "") || wordsFrom(id ?? "");
        c.add({ rule: "a11y/input-label", category: "a11y", severity: "major", file, at: el.start, element: el.raw, title: `${el.tag === "input" ? "Input" : el.tag[0].toUpperCase() + el.tag.slice(1)} has no label`, detail: ph ? `Only a placeholder (“${ph.slice(0, 50)}”) describes it; placeholders vanish while typing and are not a reliable label.` : "Nothing names this field for assistive technology.", fix: g ? `Add aria-label="${g}" (or a visible <label for>).` : "Add a <label for> or aria-label naming the field.", patch: g ? [c.insAttr(file, el, `aria-label="${escAttr(g.replace(/…$/, ""))}"`)] : undefined, ref: "WCAG 1.3.1 / 4.1.2" });
      }
    }
    if (el.tag === "iframe" && !el.attrs.title?.value && !named(el)) {
      c.add({ rule: "a11y/iframe-title", category: "a11y", severity: "minor", file, at: el.start, element: el.raw, title: "Embedded frame has no title", detail: "Screen readers list frames by title; this one is announced as “frame”.", fix: `Add title="…" describing the embed.`, patch: [c.insAttr(file, el, `title="${escAttr(wordsFrom(el.attrs.src?.value ?? "") || "Embedded content")}"`)], ref: "WCAG 4.1.2" });
    }
    const ti = el.attrs.tabindex?.value;
    if (ti && /^\d+$/.test(ti) && Number(ti) > 0) {
      const a = el.attrs.tabindex!;
      c.add({ rule: "a11y/tabindex-positive", category: "a11y", severity: "major", file, at: a.start, element: el.raw, title: `tabindex="${ti}" breaks the focus order`, detail: "Positive tabindex pulls this element ahead of everything else, so keyboard focus jumps around the page.", fix: `Use tabindex="0" and order the markup instead.`, patch: [c.rep(file, a.valueStart, a.valueEnd, "0")], ref: "WCAG 2.4.3" });
    }
    if ((el.tag === "div" || el.tag === "span" || el.tag === "li") && (el.attrs.onclick || el.attrs["on:click"]) && !el.attrs.role) {
      const attrs = el.raw.slice(1 + el.tag.length, el.raw.endsWith("/>") ? -2 : -1);
      const patch = el.closeStart !== null ? [c.rep(file, el.start, el.openEnd, `<button type="button"${attrs}>`), c.rep(file, el.closeStart, el.closeStart + 2 + el.tag.length, "</button")] : undefined;
      c.add({ rule: "a11y/click-target", category: "a11y", severity: "major", file, at: el.start, element: el.raw, title: `Clickable <${el.tag}> isn't reachable by keyboard`, detail: "It has a click handler but no role, no tabindex and no key handling: keyboard and switch users can't activate it.", fix: `Make it a <button type="button"> (keeps the handler, gets focus and Enter/Space for free).`, patch, ref: "WCAG 2.1.1" });
    }
    if ((el.tag === "video" || el.tag === "audio") && "autoplay" in el.attrs && !("muted" in el.attrs)) {
      c.add({ rule: "a11y/autoplay-sound", category: "a11y", severity: "major", file, at: el.start, element: el.raw, title: "Media autoplays with sound", detail: "Sound that starts on its own talks over screen readers and startles people.", fix: "Add muted (and controls), or don't autoplay.", patch: [c.insAttr(file, el, "muted playsinline")], ref: "WCAG 1.4.2" });
    }
    if (el.tag === "meta" && /viewport/i.test(el.attrs.name?.value ?? "")) {
      const v = el.attrs.content;
      if (v?.value && (/user-scalable\s*=\s*(no|0)/i.test(v.value) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(v.value))) {
        c.add({ rule: "a11y/zoom-disabled", category: "a11y", severity: "critical", file, at: el.start, element: el.raw, title: "Pinch-zoom is disabled", detail: `content="${v.value}" stops people with low vision from zooming in.`, fix: `Use content="width=device-width, initial-scale=1".`, patch: [c.rep(file, v.valueStart, v.valueEnd, "width=device-width, initial-scale=1")], ref: "WCAG 1.4.4" });
      }
    }
  }

  // ── duplicate ids (per page)
  for (const [file, docs] of c.html) {
    if (!/\.html?$/.test(file)) continue;
    const seen = new Map<string, El>();
    for (const el of docs[0]?.els ?? []) {
      const id = el.attrs.id?.value;
      if (!id || id.includes(MASK)) continue;
      if (seen.has(id)) c.add({ rule: "a11y/duplicate-id", category: "a11y", severity: "minor", file, at: el.attrs.id!.start, element: el.raw, title: `id="${id}" is used twice`, detail: "Labels, aria references and in-page links only find the first one.", fix: `Rename this one, e.g. id="${id}-2", and update anything pointing at it.`, ref: "WCAG 4.1.1" });
      else seen.set(id, el);
    }
    // heading order
    let prev = 0;
    let h1 = 0;
    for (const el of docs[0]?.els ?? []) {
      const m = /^h([1-6])$/.exec(el.tag);
      if (!m) continue;
      const lvl = Number(m[1]);
      if (lvl === 1) h1++;
      if (prev && lvl > prev + 1) {
        const to = prev + 1;
        const patch = el.closeStart !== null ? [c.rep(file, el.start, el.start + 3, `<h${to}`), c.rep(file, el.closeStart, el.closeStart + 4, `</h${to}`)] : undefined;
        c.add({ rule: "a11y/heading-order", category: "a11y", severity: "minor", file, at: el.start, element: el.raw + el.text.slice(0, 40), title: `Heading jumps from h${prev} to h${lvl}`, detail: "Screen-reader users navigate by heading level; a skipped level reads like a missing section.", fix: `Make it an <h${to}> (restyle with a class if it should look smaller).`, patch, ref: "WCAG 1.3.1" });
      }
      prev = lvl;
    }
    if (h1 > 1) {
      const second = (docs[0]?.els ?? []).filter((e) => e.tag === "h1")[1];
      c.add({ rule: "a11y/multiple-h1", category: "a11y", severity: "info", file, at: second.start, element: second.raw + second.text.slice(0, 40), title: `${h1} <h1> headings on one page`, detail: "One h1 per page gives the page a single clear title in the outline.", fix: "Keep the page title as h1 and make this one an h2." });
    }
  }

  // ── landmarks (anywhere in the creation: apps render <main> from JS)
  const all = els.map((x) => x.el);
  if (c.pages.length && !all.some((e) => e.tag === "main" || e.attrs.role?.value === "main")) {
    const idx = c.files["index.html"] !== undefined ? "index.html" : c.pages[0];
    const root = (c.html.get(idx)?.[0]?.els ?? []).find((e) => e.tag === "div" && /^(app|root|main|content)$/.test(e.attrs.id?.value ?? ""));
    const patch = root && root.closeStart !== null ? [c.rep(idx, root.start, root.start + 4, "<main"), c.rep(idx, root.closeStart, root.closeStart + 5, "</main")] : undefined;
    c.add({ rule: "a11y/landmark-main", category: "a11y", severity: "major", file: idx, at: root?.start ?? 0, element: root?.raw, title: "No <main> landmark", detail: "Screen-reader and keyboard users jump straight to the main content with the main landmark; this creation has none on any screen.", fix: root ? `Turn ${root.raw} into <main id="${root.attrs.id!.value}">.` : "Wrap the primary content of each screen in <main>.", patch, ref: "WCAG 1.3.1 / 2.4.1" });
  }

  contrastRules(c);
  motionAndFocus(c);
}

const TEXT_TOKENS = /^--(ink|text|fg|foreground|color-text|body-color|on-bg|on-surface)$/;
const MUTED_TOKENS = /^--(muted|ink-2|ink-muted|ink-soft|text-muted|text-2|fg-muted|subtle|secondary-text|dim)$/;
const BG_TOKENS = /^--(bg|background|surface|paper|canvas|base|page)$/;
const ACCENT_TOKENS = /^--(accent|primary|brand)$/;
const ON_ACCENT = /^--(on-accent|accent-ink|accent-fg|on-primary|accent-contrast|primary-ink)$/;

function contrastRules(c: Ctx) {
  // 1. design tokens, per scope (light root, dark theme…), each scope layered over :root
  const root = c.tokenScopes.get(":root") ?? new Map();
  for (const [scope, map] of c.tokenScopes) {
    const merged = new Map([...[...root].map(([k, v]) => [k, v.value] as const), ...[...map].map(([k, v]) => [k, v.value] as const)]);
    const res = (k: string) => parseColor(resolveVars(merged.get(k) ?? "", merged));
    const pairs: [RegExp, RegExp, number, string][] = [[TEXT_TOKENS, BG_TOKENS, 4.5, "body text"], [MUTED_TOKENS, BG_TOKENS, 4.5, "secondary text"], [ON_ACCENT, ACCENT_TOKENS, 4.5, "text on accent buttons"]];
    for (const [fgRe, bgRe, target, what] of pairs) {
      for (const [fk, fdecl] of map) {
        if (!fgRe.test(fk)) continue;
        for (const bk of merged.keys()) {
          if (!bgRe.test(bk) || (bk === "--surface" && fgRe === ON_ACCENT)) continue;
          const fg = res(fk);
          const bg = res(bk);
          if (!fg || !bg || bg.a < 1) continue;
          const ratio = contrast(fg, bg);
          if (ratio >= target) continue;
          const better = fixContrast(fg, bg, target);
          const literal = parseColor(fdecl.value) !== null;
          c.add({ rule: "a11y/contrast-token", category: "a11y", severity: ratio < 3 ? "critical" : "major", file: fdecl.file, at: fdecl.start, element: `${scope} { ${fk}: ${fdecl.value} }`, title: `${what[0].toUpperCase() + what.slice(1)} contrast ${ratio.toFixed(2)}:1 (needs ${target}:1)`, detail: `${fk} (${fdecl.value}) on ${bk} (${merged.get(bk)}) in ${scope} fails WCAG AA for ${what}.`, fix: better ? `Set ${fk}: ${better} (same hue, ${contrast(parseColor(better)!, bg).toFixed(2)}:1).` : `Pick a darker/lighter ${fk}.`, patch: better && literal ? [c.rep(fdecl.file, fdecl.valueStart, fdecl.valueEnd, better)] : undefined, ref: "WCAG 1.4.3" });
        }
      }
    }
  }
  // 2. rules (and inline styles) that set both a text color and a background
  const tokens = c.tokens;
  for (const { file, rule } of c.rules()) {
    const color = [...rule.decls].reverse().find((d) => d.prop === "color");
    const bgd = [...rule.decls].reverse().find((d) => d.prop === "background-color" || d.prop === "background");
    if (!color || !bgd) continue;
    const fgV = resolveVars(color.value, tokens);
    const bgV = firstColor(resolveVars(bgd.value, tokens)) ?? "";
    const fg = parseColor(fgV);
    const bg = parseColor(bgV);
    if (!fg || !bg || bg.a < 1 || fg.a === 0) continue;
    const sizeD = rule.decls.find((d) => d.prop === "font-size");
    const px = sizeD ? (/([\d.]+)px/.exec(sizeD.value) ? Number(/([\d.]+)px/.exec(sizeD.value)![1]) : /([\d.]+)rem/.exec(sizeD.value) ? Number(/([\d.]+)rem/.exec(sizeD.value)![1]) * 16 : 16) : 16;
    const bold = rule.decls.some((d) => d.prop === "font-weight" && (/bold/.test(d.value) || Number(d.value) >= 700));
    const target = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    const ratio = contrast(fg, bg);
    if (ratio >= target) continue;
    const better = fixContrast(fg, bg, target);
    const literal = parseColor(color.value) !== null;
    c.add({ rule: "a11y/contrast", category: "a11y", severity: ratio < 3 ? "critical" : "major", file, at: color.start, element: `${rule.selector} { color: ${color.value}; ${bgd.prop}: ${bgd.value} }`, title: `Text contrast ${ratio.toFixed(2)}:1 (needs ${target}:1)`, detail: `${rule.selector}: ${fgV} on ${bgV} is hard to read, especially outdoors or for low vision.`, fix: better ? `Change color to ${better} (${contrast(parseColor(better)!, bg).toFixed(2)}:1, same hue).` : "Darken or lighten the text color.", patch: better && literal ? [c.rep(file, color.valueStart, color.valueEnd, better)] : undefined, ref: "WCAG 1.4.3" });
  }
}

function motionAndFocus(c: Ctx) {
  const rules = c.rules();
  const moving = rules.find(({ rule }) => rule.decls.some((d) => (d.prop === "animation" || d.prop === "animation-name") && !/^none$/i.test(d.value)) || rule.decls.some((d) => d.prop === "transition" && /transform|all/.test(d.value)));
  const hasReduce = c.css.some((s) => s.sheet.media.some((m) => /prefers-reduced-motion/i.test(m))) || Object.values(c.files).some((f) => /prefers-reduced-motion/.test(f));
  const mainCss = c.css.find((s) => s.kind === "file")?.file;
  if (moving && !hasReduce) {
    const block = `\n\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }\n}\n`;
    c.add({ rule: "a11y/reduced-motion", category: "a11y", severity: "minor", file: moving.file, at: moving.rule.start, element: moving.rule.selector, title: "Motion ignores “reduce motion”", detail: "Animations and transform transitions run even when the visitor asked their OS to reduce motion (vestibular disorders).", fix: "Add a prefers-reduced-motion: reduce block that stops animations and transitions.", patch: mainCss ? [c.ins(mainCss, c.files[mainCss].length, block)] : undefined, ref: "WCAG 2.3.3" });
  }
  const killer = rules.find(({ rule }) => /:focus(?!-visible|-within)/.test(rule.selector) && rule.decls.some((d) => d.prop === "outline" && /^(none|0)\b/.test(d.value)));
  const hasVisible = rules.some(({ rule }) => /:focus-visible/.test(rule.selector));
  if (killer && !hasVisible) {
    const add = `\n\na:focus-visible, button:focus-visible, [role="button"]:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {\n  outline: none;\n  text-decoration: underline;\n  text-decoration-thickness: 2px;\n  text-underline-offset: 4px;\n  box-shadow: 0 2px 0 0 currentColor;\n}\n`;
    c.add({ rule: "a11y/focus-indicator", category: "a11y", severity: "major", file: killer.file, at: killer.rule.start, element: killer.rule.selector, title: "Focus is invisible for keyboard users", detail: `${killer.rule.selector} removes the outline and nothing replaces it, so Tab moves an invisible cursor.`, fix: "Add a :focus-visible cue that suits the design (an underline bar, not a box).", patch: mainCss ? [c.ins(mainCss, c.files[mainCss].length, add)] : undefined, ref: "WCAG 2.4.7" });
  }
}
