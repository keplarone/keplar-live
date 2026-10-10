/**
 * Voice Live Create: transcript → theater script. Pure (no DOM, no network).
 * The UI paints a cinematic coding session from this while Web Speech fills the prompt;
 * a real build starts only when the owner confirms (or after a long pause + ready prompt).
 */
import { inferBlueprint, type Blueprint, type BlueprintKind } from "@/components/create/apps/blueprint";

export const VOICE_LIVE_DEBOUNCE_MS = 700;
export const VOICE_LIVE_PAUSE_BUILD_MS = 2800;
export const VOICE_LIVE_MIN_CHARS = 12;

/** Phrases that mean "change what you just made" rather than add more. */
const REVISION = /\b(actually|instead|wait|no[, ]|scratch that|change (it|that|the)|make it|forget|not that|rather|better yet|redo|restart|start over)\b/i;

export function isRevision(chunk: string): boolean {
  return REVISION.test(chunk);
}

/** After a revision cue, keep the text from the cue onward (drop the abandoned brief). */
export function applyRevision(full: string): { text: string; revised: boolean } {
  const m = REVISION.exec(full);
  if (!m || m.index < 8) return { text: full, revised: false };
  const after = full.slice(m.index).replace(REVISION, "").replace(/^[,.\s]+/, "").trim();
  if (after.length < VOICE_LIVE_MIN_CHARS) return { text: full, revised: false };
  return { text: after, revised: true };
}

export type TheaterFile = { path: string; language: "js" | "css" | "html" | "json" | "md"; content: string };
export type TheaterLine = { kind: "info" | "ok" | "run" | "warn"; text: string };
export type TheaterFrame = {
  blueprint: Blueprint;
  files: TheaterFile[];
  activePath: string;
  /** How many characters of active file to reveal (typewriter). */
  reveal: number;
  terminal: TheaterLine[];
  previewHtml: string;
  phase: "listening" | "scaffolding" | "writing" | "testing" | "preview" | "paused" | "ready";
};



/** Deterministic sample code for a screen — looks real, never claims to be the final build. */
function screenCode(kind: BlueprintKind, title: string, route: string, layout: string, i: number): string {
  const id = title.replace(/\W+/g, "") || `Screen${i}`;
  return `// ${title} · ${route}
import { html, render } from "../lib/ui.js";
import { db } from "../lib/db.js";

export async function ${id}(root, { user }) {
  const rows = await db.list(${JSON.stringify(layout === "feed" || layout === "grid" ? "items" : "records")}, { limit: 24 });
  render(root, html\`
    <section class="screen screen--${layout}" data-route="${route}">
      <header class="screen__head">
        <h1>${title}</h1>
        <p class="muted">Live from your brief · ${kind}</p>
      </header>
      <div class="screen__body">
        \${rows.length ? rows.map(rowCard) : emptyState("${title}")}
      </div>
    </section>
  \`);
}

function rowCard(row) {
  return html\`<article class="card"><h2>\${row.title}</h2><p>\${row.summary}</p></article>\`;
}

function emptyState(label) {
  return html\`<div class="empty"><p>No \${label.toLowerCase()} yet.</p><button type="button" class="btn">Add the first</button></div>\`;
}
`;
}

function stylesFor(kind: BlueprintKind): string {
  return `/* ${kind} · design tokens from your Look pick */
:root {
  --bg: #0b0b0d;
  --surface: #141416;
  --ink: #f2f2f3;
  --muted: #9a9aa0;
  --accent: #c8a46a;
  --line: rgba(255,255,255,.08);
  --radius: 12px;
  --font: "Google Sans", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 var(--font); }
.screen { min-height: 100%; padding: 28px 22px 48px; }
.screen__head h1 { margin: 0 0 6px; font-size: 1.65rem; letter-spacing: -0.03em; }
.muted { color: var(--muted); margin: 0; }
.screen__body { display: grid; gap: 12px; margin-top: 22px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
.card h2 { margin: 0 0 4px; font-size: 1rem; }
.empty { border: 1px dashed var(--line); border-radius: var(--radius); padding: 28px; text-align: center; color: var(--muted); }
.btn { margin-top: 12px; background: var(--ink); color: var(--bg); border: 0; border-radius: 999px; padding: 10px 16px; font: inherit; font-weight: 600; }
`;
}

function previewShell(bp: Blueprint, accent = "#c8a46a"): string {
  const screens = bp.screens.slice(0, 4).map((s) => `<button type="button" class="nav">${escapeHtml(s.title)}</button>`).join("");
  const cards = bp.screens.slice(0, 3).map((s) =>
    `<article class="tile"><span class="k">${escapeHtml(s.layout)}</span><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.route)}</p></article>`).join("");
  const data = bp.data.length ? bp.data.map((d) => `<li>${escapeHtml(d)}</li>`).join("") : "<li>collections pending</li>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(bp.label)} · preview</title>
<style>
:root{--bg:#0b0b0d;--surf:#141416;--ink:#f2f2f3;--mut:#9a9aa0;--acc:${accent};--line:rgba(255,255,255,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
.shell{min-height:100vh;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
.brand{font-weight:600;letter-spacing:-.02em}
.navs{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.nav{background:transparent;border:1px solid var(--line);color:var(--mut);border-radius:999px;padding:6px 12px;font:inherit;font-size:12px}
.nav:first-child{color:var(--ink);border-color:color-mix(in srgb,var(--acc) 50%,var(--line))}
main{padding:22px 18px 40px;display:grid;gap:16px}
.hero h1{margin:0 0 8px;font-size:clamp(1.6rem,4vw,2.2rem);letter-spacing:-.03em}
.hero p{margin:0;color:var(--mut);max-width:42ch}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.tile{background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:14px}
.tile .k{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--acc)}
.tile h2{margin:6px 0 4px;font-size:15px}
.tile p{margin:0;color:var(--mut);font-size:12px}
.side{display:grid;grid-template-columns:1fr 1fr;gap:16px}
ul{margin:8px 0 0;padding-left:1.1em;color:var(--mut);font-size:13px}
.note{font-size:11px;color:var(--mut);border-top:1px solid var(--line);padding-top:12px}
</style></head><body><div class="shell">
<header class="top"><span class="brand">${escapeHtml(bp.label)}</span><nav class="navs" aria-label="Screens">${screens}</nav></header>
<main>
  <div class="hero"><h1>${escapeHtml(bp.confident ? bp.label : "Your app")}</h1>
  <p>${bp.traits.length ? escapeHtml(bp.traits.join(" · ")) : "Listening for structure — screens appear as you speak."}</p></div>
  <div class="grid">${cards}</div>
  <div class="side"><div><strong>Data</strong><ul>${data}</ul></div>
  <div><strong>Status</strong><ul><li>Preview skeleton</li><li>Not the final build</li><li>Say more or press Build</li></ul></div></div>
  <p class="note">Keplar Create showcase of the live voice session — final code is written when you build.</p>
</main></div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function filesFor(bp: Blueprint): TheaterFile[] {
  const pages = bp.screens.slice(0, 5).map((sc, i) => ({
    path: `pages/${sc.title.replace(/\W+/g, "-").toLowerCase() || `screen-${i}`}.js`,
    language: "js" as const,
    content: screenCode(bp.kind, sc.title, sc.route, sc.layout, i),
  }));
  return [
    { path: "package.json", language: "json", content: `{\n  "name": "${bp.label.toLowerCase().replace(/\s+/g, "-").slice(0, 32) || "app"}",\n  "private": true,\n  "type": "module"\n}\n` },
    { path: "styles/app.css", language: "css", content: stylesFor(bp.kind) },
    { path: "app.js", language: "js", content: `import { router } from "./lib/router.js";\n${bp.screens.slice(0, 5).map((sc) => {
      const id = sc.title.replace(/\W+/g, "") || "Screen";
      const file = sc.title.replace(/\W+/g, "-").toLowerCase() || "screen";
      return `import { ${id} } from "./pages/${file}.js";`;
    }).join("\n")}\n\nrouter.define([\n${bp.screens.slice(0, 5).map((sc) => {
      const id = sc.title.replace(/\W+/g, "") || "Screen";
      return `  { path: "${sc.route}", mount: ${id} },`;
    }).join("\n")}\n]);\n\nrouter.start();\n` },
    ...pages,
    { path: "README.md", language: "md", content: `# ${bp.label}\n\nScaffolded live from your voice brief. Press **Build** for the real tested app.\n\nScreens: ${bp.screens.map((s) => s.title).join(", ") || "—"}\n` },
  ];
}

function terminalFor(bp: Blueprint, phase: TheaterFrame["phase"], fileCount: number): TheaterLine[] {
  const lines: TheaterLine[] = [
    { kind: "run", text: "$ keplar create --live --from voice" },
    { kind: "info", text: `detect kind → ${bp.kind}${bp.confident ? "" : " (listening…)"}` },
  ];
  if (bp.screens.length) lines.push({ kind: "info", text: `screens ${bp.screens.map((s) => s.title).join(", ")}` });
  if (bp.data.length) lines.push({ kind: "info", text: `collections ${bp.data.join(", ")}` });
  if (phase === "scaffolding" || phase === "writing") {
    lines.push({ kind: "run", text: `$ write ${fileCount} files` });
    lines.push({ kind: "ok", text: `ok  scaffold ${bp.label}` });
  }
  if (phase === "testing" || phase === "preview" || phase === "ready") {
    lines.push({ kind: "run", text: "$ verify --quick" });
    lines.push({ kind: "ok", text: "ok  routes resolve" });
    lines.push({ kind: "ok", text: "ok  preview shell ready" });
  }
  if (phase === "paused") lines.push({ kind: "warn", text: "paused — keeping last frame" });
  if (phase === "ready") lines.push({ kind: "info", text: "ready — press Build for the real app" });
  return lines;
}

/**
 * Build one theater frame from the current transcript.
 * `tick` (0…) advances the typewriter; `paused` keeps the last visible state semantics.
 */
export function theaterFromTranscript(raw: string, opts: { tick?: number; paused?: boolean; revised?: boolean } = {}): TheaterFrame {
  const { text } = applyRevision(raw);
  const bp = inferBlueprint(text);
  const files = filesFor(bp);
  const tick = Math.max(0, opts.tick ?? 0);
  const activeIndex = Math.min(files.length - 1, Math.floor(tick / 40) % files.length);
  const active = files[Math.max(0, activeIndex)] ?? files[0];
  const charsPerTick = 12;
  const localTick = tick % 40;
  const reveal = Math.min(active.content.length, 24 + localTick * charsPerTick + Math.min(text.length, 200));
  let phase: TheaterFrame["phase"] = "listening";
  if (opts.paused) phase = "paused";
  else if (text.trim().length < VOICE_LIVE_MIN_CHARS) phase = "listening";
  else if (!bp.confident) phase = "scaffolding";
  else if (reveal < active.content.length * 0.85) phase = "writing";
  else if (tick % 40 < 32) phase = "testing";
  else phase = text.trim().length >= 40 ? "ready" : "preview";

  return {
    blueprint: bp,
    files,
    activePath: active.path,
    reveal,
    terminal: terminalFor(bp, phase, files.length),
    previewHtml: previewShell(bp),
    phase,
  };
}

/**
 * Token rules per language for highlightLine. Each rule is tried at the current position, in order; the first that matches wins.
 * A rule whose class is null is plain text (kept so it is consumed whole, e.g. a CSS colon before a value).
 */
type HlRule = [cls: string | null, re: RegExp];
const STR = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;
const HL_RULES: Partial<Record<TheaterFile["language"], HlRule[]>> = {
  js: [
    ["k-cmt", /\/\/.*/y],
    ["k-str", new RegExp(String.raw`\`[^\`]*\`|${STR}`, "y")],
    ["k-kw", /\b(?:import|export|from|async|await|function|const|let|return|new|if|else)\b/y],
    ["k-num", /\b\d+(?:\.\d+)?\b/y],
    [null, /[A-Za-z_$][\w$]*/y], // identifiers whole, so "h1" or "item2" never light up a number
  ],
  json: [
    ["k-key", new RegExp(String.raw`"(?:[^"\\]|\\.)*"(?=\s*:)`, "y")],
    ["k-str", new RegExp(String.raw`"(?:[^"\\]|\\.)*"`, "y")],
  ],
  css: [
    ["k-cmt", /\/\*.*?(?:\*\/|$)/y],
    ["k-sel", /(?:--[\w-]+|[.#:]?[\w-]+)(?=\s*\{)/y],
    ["k-val", /(?<=:\s*)[^;{}\s][^;{}]*/y], // the value after a property colon, up to ; { or }
  ],
};

/**
 * Light syntax classes for the theater editor (no highlighter dependency). Returns HTML for one line.
 * The RAW line is tokenized first and every token's text is escaped exactly once as it is emitted, so the output is safe for
 * innerHTML (no tag or attribute can come from the source) and the markup of one rule is never re-matched by the next
 * (the old escape-then-regex order turned `"k-kw">` into a string token and showed CSS quotes as `&quot;`).
 */
export function highlightLine(line: string, language: TheaterFile["language"]): string {
  const rules = HL_RULES[language];
  if (!rules) return escapeHtml(line);
  let out = "";
  let plain = "";
  let i = 0;
  while (i < line.length) {
    let hit: { cls: string | null; text: string } | null = null;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(line);
      if (m && m[0].length) {
        hit = { cls, text: m[0] };
        break;
      }
    }
    if (!hit) {
      plain += line[i++];
      continue;
    }
    if (hit.cls) {
      out += escapeHtml(plain) + `<span class="${hit.cls}">${escapeHtml(hit.text)}</span>`;
      plain = "";
    } else plain += hit.text;
    i += hit.text.length;
  }
  return out + escapeHtml(plain);
}
