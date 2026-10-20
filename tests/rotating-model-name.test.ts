import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODEL_NAMES, STAGGER_MS, SWITCH_MS } from "@/components/app-ui/RotatingModelName";

const css = readFileSync("src/styles/gemini.css", "utf8");
const mod = readFileSync("src/components/app-ui/RotatingModelName.module.css", "utf8");
const src = readFileSync("src/components/app-ui/RotatingModelName.tsx", "utf8");
const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");

/** Brand gradients exactly as they shipped in PR #93, one dark and one light stop list per model. */
const BRAND: Record<(typeof MODEL_NAMES)[number]["id"], { dark: string; light: string }> = {
  claude: {
    dark: "linear-gradient(90deg, #d97757, #f2a57e, #e0835e, #d97757)",
    light: "linear-gradient(90deg, #b5532f, #c96442, #a3471f, #b5532f)",
  },
  chatgpt: {
    dark: "linear-gradient(90deg, #10a37f, #5fd4b0, #19c37d, #10a37f)",
    light: "linear-gradient(90deg, #0b7a5f, #0d8c6c, #08664f, #0b7a5f)",
  },
  deepseek: {
    dark: "linear-gradient(90deg, #4d6bfe, #8ea2ff, #6b84ff, #4d6bfe)",
    light: "linear-gradient(90deg, #3651e0, #4d6bfe, #2a40c4, #3651e0)",
  },
  mistral: {
    dark: "linear-gradient(90deg, #ffd800, #ff8205, #fa500f, #ff8205, #ffd800)",
    light: "linear-gradient(90deg, #b45309, #c2410c, #e10500, #c2410c, #b45309)",
  },
  gemini: {
    dark: "linear-gradient(90deg, #4796e3, #9177c7, #ca6673, #9177c7, #4796e3)",
    light: "linear-gradient(90deg, #2f6fc0, #7a5fb8, #b4505d, #7a5fb8, #2f6fc0)",
  },
};

const stripped = (file: string) => file.replace(/\/\*[\s\S]*?\*\//g, "");

/** Split a selector list on commas that are not inside brackets or parentheses. */
function selectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

/** The subject (last compound) of each selector in rules that clip the background to text. */
function textClipSubjects(file: string): string[] {
  const subjects: string[] = [];
  for (const match of stripped(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/background-clip:\s*text/.test(match[2])) continue;
    for (const part of selectorList(match[1])) {
      subjects.push((part.trim().split(/\s+/).pop() ?? "").trim());
    }
  }
  return subjects;
}

function keyframeProps(file: string, name: string): string[] {
  const body = stripped(file).match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  assert.ok(body, `${name} keyframes`);
  return [...new Set([...body.matchAll(/[;{\s]([a-z-]+)\s*:/g)].map((m) => m[1]))];
}

test("greeting name slot: the five models in order, each with its PR #93 brand gradient on the name only", () => {
  assert.deepEqual(MODEL_NAMES.map((m) => m.name), ["Claude", "ChatGPT", "DeepSeek", "Mistral", "Gemini"]);
  for (const m of MODEL_NAMES) {
    assert.match(css, new RegExp(`\\[data-theme\\] \\[data-welcome\\] \\[data-model="${m.id}"\\] \\{ background-image: ${BRAND[m.id].dark.replace(/[()]/g, "\\$&")}; \\}`), `${m.id} dark`);
    assert.match(css, new RegExp(`\\[data-theme="light"\\] \\[data-welcome\\] \\[data-model="${m.id}"\\] \\{ background-image: ${BRAND[m.id].light.replace(/[()]/g, "\\$&")}; \\}`), `${m.id} light`);
  }
  assert.match(mod, /background-size:\s*220% 100%/);
  assert.match(mod, /@keyframes shimmer \{\s*from \{ background-position: 0% 50%; \}\s*to \{ background-position: 100% 50%; \}\s*\}/);
  assert.match(mod, /shimmer 4\.8s ease-in-out infinite alternate/);
  assert.match(mod, /will-change:\s*transform,\s*opacity;/);
  assert.doesNotMatch(mod, /will-change:[^;]*filter/);
  assert.doesNotMatch(mod, /blur\(/);
  assert.ok(SWITCH_MS >= 1500, "each name stays long enough to read");
});

test("greeting name slot: the pop is a letter stagger and a lift, transform/opacity/width only, off under reduced motion", () => {
  assert.match(mod, /transition:\s*width /);
  const pop = keyframeProps(mod, "letter-pop");
  assert.deepEqual(pop, ["transform"]);
  const lift = keyframeProps(mod, "lift-out").sort();
  assert.deepEqual(lift, ["opacity", "transform"]);
  const fade = keyframeProps(mod, "fade-in");
  assert.deepEqual(fade, ["opacity"]);
  assert.deepEqual(keyframeProps(mod, "shimmer"), ["background-position"]);
  const popMs = Number(mod.match(/letter-pop\s+(\d+)ms/)?.[1]);
  const liftMs = Number(mod.match(/lift-out\s+(\d+)ms/)?.[1]);
  assert.ok(popMs >= 400 && popMs <= 600, `letter pop ${popMs}ms`);
  assert.ok(liftMs >= 400 && liftMs <= 600, `lift out ${liftMs}ms`);
  const longest = Math.max(...MODEL_NAMES.map((m) => m.name.length));
  assert.ok((longest - 1) * STAGGER_MS + popMs <= 600, "the last letter of the longest name settles by 600ms");
  assert.doesNotMatch(mod, /filter\s*:|blur\(|drop-shadow|text-shadow|box-shadow/);
  assert.match(mod, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none;/);
  assert.doesNotMatch(mod, /\b(top|left|margin|height)\s*:[^;]*;[^}]*transition/, "no layout properties animated");
  assert.match(src, /if \(reduced\) return <>Keplar<\/>;/);
  assert.match(src, /aria-hidden="true"/);
  assert.match(src, /className="visually-hidden"/);
  assert.match(src, /document\.hidden/, "no switching in a background tab");
  assert.match(src, /data-letter=""/);
});

test("signed-out greeting words stay solid white in dark and solid ink in light", () => {
  assert.match(css, /\[data-theme\] \[data-welcome\] \{[^}]*color:\s*#ffffff !important/);
  assert.match(css, /\[data-theme="light"\] \[data-welcome\] \{[^}]*color:\s*#0e0f12 !important/);
  assert.match(css, /\[data-welcome\] \[data-model-slot\][\s\S]*?color:\s*inherit !important/);
  assert.doesNotMatch(css, /linear-gradient\(90deg,\s*#5b8cff/);
  assert.doesNotMatch(css, /#1a5fe0|#1570d6/);
  assert.doesNotMatch(css, /blur\(/);
});

test("no ancestor of [data-model-slot] gets background-clip: text; the clip is on the name", () => {
  const h1 = app.slice(app.indexOf('data-welcome=""'), app.indexOf("</h1>"));
  // The signed-out line is a fragment of three direct children of the heading, not one wrapping span.
  assert.match(h1, /<><span>How can <\/span>\s*<RotatingModelName \/>\s*<span> help you today\?<\/span><\/>/);
  // The slot element is the component's own root, so its parent is the heading.
  assert.match(src, /return \(\s*<>\s*<span className=\{s\.slot\} data-model-slot=""/);
  const subjects = textClipSubjects(css);
  assert.ok(subjects.length > 0, "the name clips its own gradient");
  for (const subject of subjects) {
    assert.match(subject, /^\[data-model(?:=|\])/, `clip subject ${subject}`);
    assert.doesNotMatch(subject, /data-model-slot/);
    assert.doesNotMatch(subject, /data-welcome\]$/);
  }
  // Transparent text-fill is what lets the gradient show, and it belongs on the name only.
  for (const match of stripped(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/-webkit-text-fill-color:\s*transparent/.test(match[2])) continue;
    for (const part of selectorList(match[1])) {
      const subject = (part.trim().split(/\s+/).pop() ?? "").trim();
      assert.match(subject, /^\[data-model(?:=|\])/, `transparent fill subject ${subject}`);
    }
  }
});
