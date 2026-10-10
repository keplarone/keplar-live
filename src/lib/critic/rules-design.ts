/** Design craft rules: the tells of generic AI output (gradient text, neon glow, glass, default purple), type and spacing systems. */
import { firstColor, parseColor, resolveVars, rgbToHsl, toHex, hslToRgb } from "./css";
import type { Ctx } from "./context";
import { MASK } from "./html";

const GRADIENT = /(linear|radial|conic)-gradient\(/i;
const EMOJI = /(\p{Extended_Pictographic})(\uFE0F)?\s?/u;
const GENERIC: [RegExp, string][] = [
  [/lorem ipsum/i, "Placeholder Latin"],
  [/welcome to (our|my|the) (website|site|app|platform)/i, "Welcome-to-our-website opener"],
  [/unlock the (full )?(power|potential)/i, "“Unlock the power” cliché"],
  [/revolutioni[sz]e (the way|your)/i, "“Revolutionize” cliché"],
  [/elevate your\b/i, "“Elevate your” cliché"],
  [/supercharge your\b/i, "“Supercharge” cliché"],
  [/seamless(ly)? (integrat|experience)/i, "“Seamless” filler"],
  [/cutting[- ]edge/i, "“Cutting-edge” filler"],
  [/game[- ]chang(er|ing)/i, "“Game-changer” filler"],
  [/(take|taking) (it|your \w+) to the next level/i, "“Next level” cliché"],
  [/your (one-stop|all-in-one) (shop|solution)/i, "“One-stop solution” filler"],
  [/\bjohn doe\b|\bjane doe\b|example@example\.com/i, "Placeholder person"],
];

export function designRules(c: Ctx) {
  const rules = c.rules();
  const tokens = c.tokens;
  const sizes = new Map<number, { file: string; at: number }>();
  const families = new Map<string, { file: string; at: number }>();
  const radii = new Set<string>();

  for (const { file, rule } of rules) {
    const decl = (p: string) => rule.decls.find((d) => d.prop === p);
    // gradient text: background gradient + background-clip:text + transparent fill
    const grad = rule.decls.find((d) => (d.prop === "background" || d.prop === "background-image") && GRADIENT.test(d.value));
    const clipText = rule.decls.filter((d) => /^(-webkit-)?background-clip$/.test(d.prop) && /text/.test(d.value));
    if (grad && clipText.length) {
      const stop = firstColor(resolveVars(grad.value.replace(/^[^,(]*\(/, "").replace(/^[^,]*deg\s*,/, ""), tokens)) ?? "currentColor";
      const accent = ["--accent", "--primary", "--brand"].find((t) => tokens.has(t));
      const solid = accent ? `var(${accent})` : stop;
      const fills = rule.decls.filter((d) => d.prop === "-webkit-text-fill-color" || (d.prop === "color" && /transparent/.test(d.value)));
      c.add({ rule: "design/gradient-text", category: "design", severity: "major", file, at: grad.start, element: `${rule.selector} { ${grad.prop}: ${grad.value.slice(0, 60)} }`, title: "Gradient-filled headline text", detail: "Gradient text is the most recognisable AI-template tell; it also drops contrast mid-word and breaks in forced-colors mode.", fix: `Use one solid ink: color: ${solid}; and remove the background-clip / text-fill declarations.`, patch: [c.rep(file, grad.start, grad.end, `color: ${solid}`), ...clipText.map((d) => c.rep(file, d.start, d.end, "")), ...fills.map((d) => c.rep(file, d.start, d.end, ""))] });
    } else if (grad && !/mask|border-image/.test(grad.prop)) {
      const stop = firstColor(resolveVars(grad.value, tokens));
      c.add({ rule: "design/gradient-surface", category: "design", severity: "minor", file, at: grad.start, element: `${rule.selector} { ${grad.prop}: ${grad.value.slice(0, 70)} }`, title: "Decorative gradient surface", detail: "Soft multi-stop gradients on sections and buttons read as template output and fight the content for attention.", fix: stop ? `Use a flat fill: ${grad.prop === "background" ? "background" : "background-color"}: ${stop}.` : "Use a flat surface color.", patch: stop ? [c.rep(file, grad.start, grad.end, `${grad.prop === "background" ? "background" : "background-color"}: ${stop}`)] : undefined });
    }
    // neon glow
    for (const d of rule.decls) {
      if (!/^(box-shadow|text-shadow|filter)$/.test(d.prop)) continue;
      const v = resolveVars(d.value, tokens);
      const blur = [...v.matchAll(/(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)px/g)].map((m) => Number(m[3]));
      const col = parseColor(firstColor(v) ?? "");
      if (!col || !blur.length || Math.max(...blur) < 18) continue;
      const [h, s] = rgbToHsl(col);
      if (s < 0.45 || col.a < 0.18) continue;
      c.add({ rule: "design/neon-glow", category: "design", severity: h >= 200 && h <= 300 ? "major" : "minor", file, at: d.start, element: `${rule.selector} { ${d.prop}: ${d.value.slice(0, 70)} }`, title: "Colored glow around an element", detail: `A ${Math.max(...blur)}px saturated ${toHex(col)} glow: neon halos are a generic AI-UI tell and smear on light backgrounds.`, fix: d.prop === "box-shadow" ? "Replace with a 1px border or a tight neutral shadow: box-shadow: 0 1px 2px rgba(0,0,0,.18)." : "Remove the glow.", patch: [c.rep(file, d.valueStart, d.valueEnd, d.prop === "box-shadow" ? "0 1px 2px rgba(0, 0, 0, 0.18)" : "none")] });
    }
    // glassmorphism
    const bf = rule.decls.find((d) => /^(-webkit-)?backdrop-filter$/.test(d.prop) && /blur/.test(d.value));
    const bg = decl("background") ?? decl("background-color");
    const bgc = bg ? parseColor(firstColor(resolveVars(bg.value, tokens)) ?? "") : null;
    if (bf && bgc && bgc.a < 0.5) {
      const surf = ["--surface", "--panel", "--card"].find((t) => tokens.has(t));
      c.add({ rule: "design/glass", category: "design", severity: "minor", file, at: bf.start, element: `${rule.selector} { ${bf.prop}: ${bf.value} }`, title: "Frosted-glass panel", detail: "Translucent blurred panels lower text contrast over busy backgrounds and cost GPU time on phones; they are a stock “AI app” look.", fix: surf ? `Use a solid surface: background: var(${surf}); and drop the backdrop-filter.` : "Use a solid surface color and drop the backdrop-filter.", patch: surf && bg ? [c.rep(file, bg.start, bg.end, `background: var(${surf})`), c.rep(file, bf.start, bf.end, "")] : undefined });
    }
    // type
    const fs = decl("font-size");
    if (fs) {
      const px = /^([\d.]+)px$/.exec(fs.value) ? Number(/^([\d.]+)px$/.exec(fs.value)![1]) : /^([\d.]+)rem$/.exec(fs.value) ? Number(/^([\d.]+)rem$/.exec(fs.value)![1]) * 16 : null;
      if (px !== null) {
        if (!sizes.has(px)) sizes.set(px, { file, at: fs.start });
        if (px < 12) c.add({ rule: "design/tiny-text", category: "design", severity: "minor", file, at: fs.start, element: `${rule.selector} { font-size: ${fs.value} }`, title: `${px}px text is too small to read`, detail: "Below 12px, text strains the eye on phones and fails comfortable reading for most adults.", fix: "Use at least 12px (0.75rem) for captions and 16px for body.", patch: [c.rep(file, fs.valueStart, fs.valueEnd, fs.value.endsWith("rem") ? "0.75rem" : "12px")] });
      }
    }
    const ff = decl("font-family");
    if (ff) {
      const first = resolveVars(ff.value, tokens).split(",")[0].trim().replace(/["']/g, "").toLowerCase();
      if (first && !/^(inherit|initial|system-ui|-apple-system|sans-serif|serif|monospace|ui-\w+)$/.test(first) && !families.has(first)) families.set(first, { file, at: ff.start });
    }
    const lh = decl("line-height");
    if (lh && /^(body|p|html|article|main|\.prose|\.content)\b/.test(rule.selector) && /^[\d.]+$/.test(lh.value) && Number(lh.value) < 1.35) {
      c.add({ rule: "design/line-height", category: "design", severity: "minor", file, at: lh.start, element: `${rule.selector} { line-height: ${lh.value} }`, title: `Body line-height ${lh.value} is cramped`, detail: "Running text needs air between lines; under ~1.4 the eye loses its place on long lines.", fix: "Set line-height: 1.55 for body copy (keep tight values for display headings).", patch: [c.rep(file, lh.valueStart, lh.valueEnd, "1.55")] });
    }
    const br = decl("border-radius");
    if (br && !/var\(/.test(br.value)) radii.add(br.value);
    // spacing grid
    for (const d of rule.decls) {
      if (!/^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/.test(d.prop)) continue;
      const parts = [...d.value.matchAll(/(-?\d+(?:\.\d+)?)px/g)];
      const off = parts.filter((m) => { const n = Math.abs(Number(m[1])); return n > 2 && !(n <= 12 ? n % 2 === 0 : n % 4 === 0); });
      if (!off.length) continue;
      const fixed = d.value.replace(/(-?\d+(?:\.\d+)?)px/g, (m, n) => { const v = Math.abs(Number(n)); if (v <= 2 || (v <= 12 ? v % 2 === 0 : v % 4 === 0)) return m; const r = v <= 12 ? Math.round(v / 2) * 2 : Math.round(v / 4) * 4; return `${Number(n) < 0 ? "-" : ""}${r}px`; });
      c.add({ rule: "design/spacing-grid", category: "design", severity: "minor", file, at: d.start, element: `${rule.selector} { ${d.prop}: ${d.value} }`, title: `Off-grid spacing: ${off.map((m) => m[0]).join(", ")}`, detail: "Spacing outside a 4px rhythm makes alignment drift between sections; it's the main reason generated layouts feel “almost right”.", fix: `Use ${d.prop}: ${fixed}.`, patch: [c.rep(file, d.valueStart, d.valueEnd, fixed)] });
    }
  }

  if (sizes.size > 9) {
    const list = [...sizes.keys()].sort((a, b) => a - b);
    const first = sizes.get(list[0])!;
    c.add({ rule: "design/type-scale", category: "design", severity: "minor", file: first.file, at: first.at, title: `${sizes.size} different font sizes`, detail: `Sizes in use: ${list.map((x) => `${+x.toFixed(2)}px`).join(", ")}. Without a scale, hierarchy reads as noise.`, fix: "Collapse to a 6–7 step scale, e.g. 12 / 14 / 16 / 20 / 28 / 40 / 56px, and map each size to its nearest step." });
  }
  if (families.size > 3) {
    const [, first] = [...families][3];
    c.add({ rule: "design/font-families", category: "design", severity: "minor", file: first.file, at: first.at, title: `${families.size} typefaces`, detail: `Families: ${[...families.keys()].join(", ")}. More than a display + a text face (+ mono) dilutes the voice and costs font downloads.`, fix: "Keep one display face and one text face; replace the rest with those." });
  }
  if (radii.size > 5) {
    const r = rules.find(({ rule }) => rule.decls.some((d) => d.prop === "border-radius"))!;
    c.add({ rule: "design/radius-system", category: "design", severity: "info", file: r.file, at: r.rule.start, title: `${radii.size} different corner radii`, detail: `Radii: ${[...radii].slice(0, 8).join(", ")}. Mixed radii make components look borrowed from different kits.`, fix: "Use two or three radius tokens (e.g. --radius-s 6px, --radius-m 10px, --radius-pill 999px)." });
  }

  // accent hue: the default AI purple-blue
  for (const key of ["--accent", "--primary", "--brand"]) {
    const d = c.tokenScopes.get(":root")?.get(key);
    if (!d) continue;
    const col = parseColor(d.value);
    if (!col) continue;
    const [h, s, l] = rgbToHsl(col);
    if (h >= 235 && h <= 290 && s > 0.45) {
      const [r, g, b] = hslToRgb(18, Math.min(0.75, s), Math.min(0.55, Math.max(0.38, l)));
      const alt = toHex({ r, g, b, a: 1 });
      c.add({ rule: "design/default-purple", category: "design", severity: "info", file: d.file, at: d.start, element: `${key}: ${d.value}`, title: `Accent ${d.value} is the stock AI violet`, detail: `Hue ${Math.round(h)}° at ${Math.round(s * 100)}% saturation is the most common accent in generated UIs, so the product looks like a template before anyone reads a word.`, fix: `Choose a hue from the subject itself. A warm terracotta ${alt} keeps similar weight; check contrast after.`, patch: parseColor(d.value) ? [c.rep(d.file, d.valueStart, d.valueEnd, alt)] : undefined });
    }
    break;
  }

  // copy and emoji
  for (const { file, el } of c.allEls()) {
    if (!/^(h1|h2|h3|h4|p|button|a|li|span|small|label|figcaption)$/.test(el.tag) || el.children.length > 3) continue;
    const src = c.files[file];
    const inner = el.closeStart !== null ? src.slice(el.openEnd, el.closeStart) : "";
    if (!inner || inner.includes("<")) continue;
    for (const [re, label] of GENERIC) {
      const m = re.exec(inner);
      if (!m) continue;
      c.add({ rule: "design/generic-copy", category: "design", severity: /Latin|person/.test(label) ? "major" : "minor", file, at: el.openEnd + m.index, element: `<${el.tag}>${inner.trim().slice(0, 80)}`, title: `${label}: “${m[0]}”`, detail: "Interchangeable marketing phrases tell visitors nothing about this product and mark the page as generated.", fix: /Latin|person/.test(label) ? "Replace with the real content before publishing." : "Say who it is for and the concrete result instead (numbers, nouns, a specific promise)." });
      break;
    }
    if (/^(h1|h2|h3|button|a|li)$/.test(el.tag)) {
      const m = EMOJI.exec(inner);
      if (m && !inner.includes(MASK)) {
        const at = el.openEnd + m.index;
        c.add({ rule: "design/emoji-icon", category: "design", severity: "minor", file, at, element: `<${el.tag}>${inner.trim().slice(0, 60)}`, title: `Emoji used as an icon (${m[1]})`, detail: "Emoji render differently on every OS, can't take the brand color, and read as placeholder decoration in headings and buttons.", fix: "Remove it, or use a small inline SVG icon in currentColor.", patch: [c.rep(file, at, at + m[0].length, "")] });
      }
    }
  }
}
