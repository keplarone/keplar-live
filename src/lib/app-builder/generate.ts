/**
 * Multi-file generation. The file plan is split into two waves so parallel writers stay coherent:
 *   wave 1: the foundation (styles.css and shared modules: lib/*, game/*) - written in parallel groups;
 *   wave 2: the entry (app.js) and the screens (pages/*, extra .html pages) - written in parallel groups that see wave 1's code.
 * Each group may also add a stylesheet for its own markup (styles/<group>.css), which index.html links automatically.
 */
import { llm, type Msg } from "./llm";
import { SDK_DOC, CODE_RULES } from "./sdk-doc";
import { RUBRIC } from "./rubric";
import { appIndexHtml } from "./files";
import type { AppBuildLimits, AppModel } from "./models";
import type { AppSpec, FilePlan } from "./types";

export type Group = { id: string; files: FilePlan[]; css: string | null };

const isSite = (spec: AppSpec) => spec.kind === "site" && !spec.uses.includes("ui");

/** Splits the file plan into waves of groups. */
export function planWaves(spec: AppSpec, L: AppBuildLimits): Group[][] {
  const files = spec.files.filter((f) => !(f.path === "index.html" && !isSite(spec)));
  // Paid plans write one file per call (latency = the slowest single file); Free keeps calls few for the free models' rate limits.
  const perGroup = L.parallel <= 2 ? 3 : 1;
  const chunk = (list: FilePlan[], prefix: string, css: boolean): Group[] => {
    const out: Group[] = [];
    for (let i = 0; i < list.length; i += perGroup) {
      const id = `${prefix}${out.length + 1}`;
      out.push({ id, files: list.slice(i, i + perGroup), css: css ? `styles/${id}.css` : null });
    }
    return out;
  };
  if (isSite(spec)) {
    const first = files.filter((f) => f.path === "index.html" || f.path === "styles.css");
    const rest = files.filter((f) => !first.includes(f));
    return [[{ id: "base", files: first, css: null }], chunk(rest, "pages", false)].filter((w) => w.length && w.some((g) => g.files.length));
  }
  const css = files.filter((f) => f.role === "css" && !f.path.startsWith("styles/"));
  const shared = files.filter((f) => f.role === "js" && /^(lib|game|core|engine|state|data)\//.test(f.path));
  const rest = files.filter((f) => !css.includes(f) && !shared.includes(f));
  const wave1: Group[] = [...(css.length ? [{ id: "theme", files: css, css: null }] : []), ...chunk(shared, "lib", true)];
  const entry = rest.filter((f) => f.path === "app.js");
  const screens = rest.filter((f) => f.path !== "app.js");
  const wave2: Group[] = [...(entry.length ? [{ id: "app", files: entry, css: "styles/app.css" }] : []), ...chunk(screens, "screens", true)];
  return [wave1, wave2].filter((w) => w.length);
}

const SITE_RULES = `MULTI-PAGE SITE CONVENTIONS
- Every .html page is a complete document: <!doctype html>, <html lang>, <head> with <meta charset>, viewport, <title>, meta description, <link rel="stylesheet" href="styles.css">, then <body> with header (site name + nav linking every page with relative hrefs like "about.html", current page marked aria-current="page"), <main>, and a real footer.
- Pages share the exact same header/footer markup and class names as index.html.
- Optional interactions go in site.js (type="module" script tag at the end of body): menu toggle, reveal on scroll, gallery, tabs. No inline scripts or inline event handlers.
- Forms that should work post through keplar.db when a collection exists (then site.js handles submit), otherwise do not invent a form backend.
- Images: "keplar-image:<slot>" for the spec's slots; otherwise SVG/CSS illustration.`;

/** Dates in example content (events, schedules, posts) must look current, not like the model's training year. */
export const todayLine = () => {
  const d = new Date();
  return `TODAY: ${d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}. Upcoming dates in content are after today; past dates (posts, history) are recent. Compute dates in code from new Date() where the screen is about "now".`;
};

export function systemFor(spec: AppSpec, designBrief: string): string {
  return `You are a principal product engineer and award-winning product designer at Keplar. You write complete, production-quality files for a real product that ships today. Your work is judged on: it runs without errors, every requested feature works end to end, and it looks like a distinctive, art-directed product made by a top studio, never like a template.

${todayLine()}

${isSite(spec) ? SITE_RULES : `${SDK_DOC}\n\n${CODE_RULES}`}

${RUBRIC}

ART DIRECTION
${designBrief}
Translate this direction into composition, not just colors: layout rhythm, type scale, imagery treatment, signature details (a distinctive nav, a characteristic card/list treatment, purposeful micro-interactions). Every screen should feel like the same product.

OUTPUT FORMAT
Return only file blocks, each exactly like:
<file path="pages/feed.js">
...complete file content...
</file>
No markdown fences, no commentary before, between or after the blocks. Write every file you are asked for, complete; never truncate, never leave TODOs.`;
}

function specDigest(spec: AppSpec): string {
  const { files, images, ...rest } = spec;
  return JSON.stringify({ ...rest, images: images.map((i) => ({ slot: i.slot, aspect: i.aspect, alt: i.alt })), ai: spec.ai.map((a) => ({ name: a.name, label: a.label, purpose: a.purpose, input: a.input, output: a.output, ...(a.output === "json" ? { outputShape: /\{[\s\S]*\}/.exec(a.system)?.[0]?.slice(0, 600) } : {}) })), collections: spec.collections.map(({ seed, ...c }) => ({ ...c, seedExample: seed?.[0] })) });
}

function fileList(spec: AppSpec, css: string[]): string {
  const lines = spec.files.map((f) => `- ${f.path}${f.exports?.length ? ` (exports: ${f.exports.join(", ")})` : ""}: ${f.purpose}`);
  if (!isSite(spec)) lines.unshift("- index.html: written by Keplar; loads the stylesheets and app.js");
  if (css.length) lines.push(...css.map((c) => `- ${c}: styles for one group's own markup`));
  return lines.join("\n");
}

export function groupMessages(spec: AppSpec, designBrief: string, group: Group, context: Record<string, string>, allCss: string[]): Msg[] {
  const ctxText = Object.entries(context)
    .filter(([p]) => !group.files.some((f) => f.path === p))
    .map(([p, c]) => `<file path="${p}">\n${c}\n</file>`)
    .join("\n");
  const want = group.files.map((f) => `- ${f.path}: ${f.purpose}${f.exports?.length ? `\n  Must export exactly: ${f.exports.join(", ")}` : ""}`).join("\n");
  return [
    { role: "system", content: systemFor(spec, designBrief) },
    {
      role: "user",
      content: `PRODUCT SPEC\n${specDigest(spec)}\n\nTHE WHOLE PROJECT (other engineers write the other files in parallel; rely only on what is listed)\n${fileList(spec, allCss)}\n${ctxText ? `\nALREADY WRITTEN (use these exact exports, class names and helpers; do not rewrite them)\n${ctxText}\n` : ""}\nWRITE NOW\n${want}${group.css ? `\n- ${group.css} (optional): CSS for the markup in your files only, using the design tokens. Prefix your classes so they do not clash with other groups.` : ""}\n\nCover every feature and screen these files are responsible for, with real states (loading, empty, error, signed-out), designed for mobile and desktop.`,
    },
  ];
}

const FILE_BLOCK = /<file\s+path\s*=\s*"([^"]+)"\s*>\r?\n?([\s\S]*?)<\/file>/g;

/** File blocks from a model answer. Inner markdown fences are stripped. */
export function parseFileBlocks(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(FILE_BLOCK)) {
    let body = m[2];
    body = body.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n\s*```\s*$/i, "");
    out[m[1].trim().replace(/^\.?\//, "").toLowerCase()] = body.replace(/\s+$/, "") + "\n";
  }
  // An unterminated last block (model hit its token limit) is kept only if it looks complete enough to verify/fix.
  const open = text.lastIndexOf("<file ");
  const close = text.lastIndexOf("</file>");
  if (open > close) {
    const m = /<file\s+path\s*=\s*"([^"]+)"\s*>\r?\n?([\s\S]*)$/.exec(text.slice(open));
    if (m && m[2].length > 200) out[m[1].trim().replace(/^\.?\//, "").toLowerCase()] = m[2];
  }
  return out;
}

export type GenEvent = { type: "file"; path: string; bytes: number } | { type: "progress"; group: string; chars: number };

/** Runs one wave (groups in parallel, bounded by the plan's parallelism). */
export async function runWave(o: {
  spec: AppSpec;
  designBrief: string;
  groups: Group[];
  context: Record<string, string>;
  allCss: string[];
  chain: AppModel[];
  L: AppBuildLimits;
  deadline: number;
  onEvent: (e: GenEvent) => void;
}): Promise<{ files: Record<string, string>; usd: number; model: string | null; failed: string[] }> {
  const files: Record<string, string> = {};
  let usd = 0;
  let model: string | null = null;
  const failed: string[] = [];
  const queue = [...o.groups];
  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      const group = g;
      let lastTick = 0;
      try {
        const r = await llm(o.chain, groupMessages(o.spec, o.designBrief, group, o.context, o.allCss), {
          maxTokens: o.L.outTokensPerCall,
          temperature: 0.55,
          deadline: o.deadline,
          reasoning: "low",
          onDelta: (_d, total) => {
            if (total - lastTick > 1500) {
              lastTick = total;
              o.onEvent({ type: "progress", group: group.id, chars: total });
            }
          },
          accept: (t) => group.files.some((f) => parseFileBlocks(t)[f.path] !== undefined),
        });
        usd += r.usd;
        model = model ?? r.model.id;
        const got = parseFileBlocks(r.text);
        const allowed = new Set([...group.files.map((f) => f.path), ...(group.css ? [group.css] : [])]);
        for (const [p, c] of Object.entries(got)) {
          if (!allowed.has(p)) continue;
          files[p] = c;
          o.onEvent({ type: "file", path: p, bytes: c.length });
        }
        for (const f of group.files) if (files[f.path] === undefined) failed.push(f.path);
      } catch (e) {
        usd += (e as { usd?: number }).usd ?? 0;
        failed.push(...group.files.map((f) => f.path));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.L.parallel, o.groups.length)) }, worker));
  return { files, usd, model, failed };
}

/** Adds Keplar-owned files (index.html for single-page apps) to a generated set. */
export function finishFiles(spec: AppSpec, files: Record<string, string>): Record<string, string> {
  if (isSite(spec)) return files;
  const css = ["styles.css", ...Object.keys(files).filter((p) => p.startsWith("styles/") && p.endsWith(".css")).sort()].filter((p) => files[p] !== undefined);
  return { ...files, "index.html": appIndexHtml(spec, css) };
}
