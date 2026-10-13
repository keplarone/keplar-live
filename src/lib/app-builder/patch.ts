/**
 * Fast edits ("Refine" on an existing app): one coder call returns small SEARCH/REPLACE edits instead of whole files, so a
 * change like "make the header sticky" or "rename Tasks to To-dos" lands in seconds and leaves every other line untouched.
 * The model can decline with <needs-plan> when the change is structural (new screens, data collections, accounts, AI actions,
 * or a large rewrite); the pipeline then runs the full plan -> generate path as before. Pure parsing and applying are exported
 * for tests; nothing here writes to storage.
 */
import { llm } from "./llm";
import { parseFileBlocks, systemFor } from "./generate";
import type { AppBuildLimits, AppModel } from "./models";
import type { AppSpec } from "./types";

export type Edit = { path: string; search: string; replace: string };
export type ParsedEdits = { needsPlan: string | null; edits: Edit[]; files: Record<string, string>; summary: string };

const EDIT_BLOCK = /<edit\s+path="([^"]+)"\s*>\s*\n?<{7}\s*SEARCH\s*\n([\s\S]*?)\n?={7}\s*\n([\s\S]*?)\n?>{7}\s*REPLACE\s*\n?<\/edit>/g;
const HAS_EDIT = new RegExp(EDIT_BLOCK.source); // non-global copy for .test (a global regex keeps lastIndex between calls)
const NEEDS_PLAN = /<needs-plan(?:\s+reason="([^"]*)")?\s*\/?>/;
const SUMMARY = /<summary>([\s\S]*?)<\/summary>/;

/** Reads the model's answer: SEARCH/REPLACE edits, whole new files, an optional one-line summary, or a request for a full plan. */
export function parseEdits(text: string): ParsedEdits {
  const np = text.match(NEEDS_PLAN);
  const edits: Edit[] = [];
  for (const m of text.matchAll(EDIT_BLOCK)) edits.push({ path: m[1].trim(), search: m[2], replace: m[3] });
  // Whole files are only for files that do not exist yet (the caller drops any that would overwrite an existing file).
  const files = parseFileBlocks(text.replace(EDIT_BLOCK, ""));
  return { needsPlan: np ? (np[1] || "The change needs a new plan.").trim() : null, edits, files, summary: (text.match(SUMMARY)?.[1] ?? "").trim().slice(0, 300) };
}

/** Finds `search` in `src`: exactly first, then ignoring trailing spaces and indentation per line. Returns [start, end] or null; ambiguous matches count as not found. */
export function locate(src: string, search: string): [number, number] | null {
  if (!search.trim()) return null;
  const first = src.indexOf(search);
  if (first !== -1) return src.indexOf(search, first + 1) === -1 ? [first, first + search.length] : null;
  // Loose match: same lines once each is trimmed (models often re-indent the SEARCH text).
  const want = search.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  while (want.length && !want[0]) want.shift();
  while (want.length && !want[want.length - 1]) want.pop();
  if (!want.length) return null;
  const lines = src.split("\n");
  const offsets: number[] = [];
  let acc = 0;
  for (const l of lines) { offsets.push(acc); acc += l.length + 1; }
  let hit: [number, number] | null = null;
  for (let i = 0; i + want.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) if (lines[i + j].trim() !== want[j]) { ok = false; break; }
    if (!ok) continue;
    if (hit) return null; // ambiguous
    const end = offsets[i + want.length - 1] + lines[i + want.length - 1].length;
    hit = [offsets[i], end];
  }
  return hit;
}

/** Applies edits in order. Files that are not in the project and edits whose SEARCH text cannot be found uniquely are reported, not guessed. */
export function applyEdits(files: Record<string, string>, edits: Edit[]): { files: Record<string, string>; changed: string[]; failed: { path: string; search: string; why: string }[] } {
  const out = { ...files };
  const changed = new Set<string>();
  const failed: { path: string; search: string; why: string }[] = [];
  for (const e of edits) {
    const src = out[e.path];
    if (src === undefined) { failed.push({ path: e.path, search: e.search, why: "no such file" }); continue; }
    const at = locate(src, e.search);
    if (!at) { failed.push({ path: e.path, search: e.search, why: src.includes(e.search.trim()) ? "matches more than one place" : "not found" }); continue; }
    out[e.path] = src.slice(0, at[0]) + e.replace + src.slice(at[1]);
    if (out[e.path] !== src) changed.add(e.path);
  }
  return { files: out, changed: [...changed], failed };
}

/** The project for the prompt: every file in full while it fits, otherwise the files that mention the request's words in full and the rest shortened. */
export function contextFor(files: Record<string, string>, request: string, budget = 150_000): { text: string; full: Set<string> } {
  const entries = Object.entries(files).filter(([p]) => p !== "index.html");
  const total = entries.reduce((a, [, c]) => a + c.length, 0);
  const full = new Set<string>();
  if (total <= budget) {
    entries.forEach(([p]) => full.add(p));
  } else {
    const words = [...new Set(request.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [])];
    const score = ([p, c]: [string, string]) => {
      const lc = c.toLowerCase();
      return words.reduce((a, w) => a + (lc.includes(w) ? 1 : 0), 0) + (/app\.js$|theme|styles\/app/.test(p) ? 0.5 : 0);
    };
    let used = 0;
    for (const e of [...entries].sort((a, b) => score(b) - score(a))) {
      if (used + e[1].length > budget * 0.85) continue;
      full.add(e[0]);
      used += e[1].length;
    }
  }
  const text = entries.map(([p, c]) => full.has(p) ? `<file path="${p}">\n${c}\n</file>` : `<file path="${p}" shortened="true">\n${c.slice(0, 1200)}\n/* ...shortened: do not edit this file... */\n</file>`).join("\n");
  return { text, full };
}

const RULES = `Answer with SEARCH/REPLACE edits only:

<summary>One short sentence saying what you changed, for the owner.</summary>
<edit path="screens/home.js">
<<<<<<< SEARCH
exact lines copied from the current file (enough to be unique, usually 2-8 lines)
=======
the new lines
>>>>>>> REPLACE
</edit>

Rules:
- Change as little as possible. Several small edits beat one big one. Never re-send a whole existing file.
- SEARCH must be copied character for character from the file as shown, and must match exactly one place.
- To add a brand-new file (for example a stylesheet), send it whole as <file path="...">...</file>; never do this for an existing file.
- Keep every export name, route, class name and data name other files rely on.
- Only edit files shown in full (not ones marked shortened).
- If the request needs new screens, new data collections, accounts, new AI actions, or rewriting more than about a third of the app, do not edit: answer only <needs-plan reason="one short sentence"/>.`;

/** One fast edit attempt (with one retry that sees exactly which edits did not apply). Never throws for a model answer it dislikes. */
export async function quickEdit(o: {
  spec: AppSpec;
  designBrief: string;
  files: Record<string, string>;
  request: string;
  problems?: string[];
  chain: AppModel[];
  L: AppBuildLimits;
  deadline: number;
}): Promise<{ ok: boolean; files: Record<string, string>; changed: string[]; usd: number; reason: string; summary: string }> {
  const ctx = contextFor(o.files, o.request + " " + (o.problems ?? []).join(" "));
  const task = o.problems?.length
    ? `The owner asked: ${o.request}\n\nAfter your change, testing found these problems. Fix them with edits:\n${o.problems.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
    : `THE OWNER'S CHANGE REQUEST: ${o.request}`;
  let usd = 0;
  let files = o.files;
  const changed = new Set<string>();
  let summary = "";
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      const r = await llm(
        o.chain,
        [
          { role: "system", content: systemFor(o.spec, o.designBrief) },
          { role: "user", content: `THE CURRENT PROJECT\n${ctx.text}\n\n${task}${feedback}\n\n${RULES}` },
        ],
        { maxTokens: Math.min(o.L.outTokensPerCall, 12_000), temperature: 0.2, deadline: o.deadline, reasoning: "low", accept: (t) => NEEDS_PLAN.test(t) || HAS_EDIT.test(t) || Object.keys(parseFileBlocks(t)).length > 0 },
      );
      usd += r.usd;
      text = r.text;
    } catch (e) {
      usd += (e as { usd?: number }).usd ?? 0;
      return { ok: false, files: o.files, changed: [], usd, reason: "The quick edit could not reach a model.", summary: "" };
    }
    const parsed = parseEdits(text);
    if (parsed.needsPlan) return { ok: false, files: o.files, changed: [], usd, reason: parsed.needsPlan, summary: "" };
    const editable = parsed.edits.filter((e) => ctx.full.has(e.path) || files[e.path] === undefined);
    const applied = applyEdits(files, editable);
    files = applied.files;
    applied.changed.forEach((p) => changed.add(p));
    for (const [p, c] of Object.entries(parsed.files)) {
      if (o.files[p] !== undefined || p === "index.html" || c.trim().length < 10) continue; // whole files only for new ones
      files = { ...files, [p]: c };
      changed.add(p);
    }
    summary = parsed.summary || summary;
    if (!applied.failed.length) {
      return changed.size
        ? { ok: true, files, changed: [...changed], usd, reason: "", summary }
        : { ok: false, files: o.files, changed: [], usd, reason: "The quick edit changed nothing.", summary: "" };
    }
    // Show the model exactly which SEARCH blocks missed; the edits that did apply stay applied.
    feedback = `\n\nSOME OF YOUR EDITS DID NOT APPLY (the others did and are already in the files above). Redo only these, copying SEARCH exactly from the current text:\n${applied.failed.slice(0, 6).map((f) => `- ${f.path}: ${f.why}. Your SEARCH began: ${JSON.stringify(f.search.slice(0, 160))}`).join("\n")}`;
    ctx.text = contextFor(files, o.request).text;
  }
  return { ok: false, files: o.files, changed: [], usd, reason: "Some edits could not be placed in the code.", summary: "" };
}
