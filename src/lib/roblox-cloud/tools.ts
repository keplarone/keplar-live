/**
 * The tools a Roblox Cloud job gives the model. They work on the job's script snapshot (model.ts), never on the real game:
 * reading, searching and editing scripts, checking them with Luau's analyzer, keeping the plan and finishing with a report.
 * Results are kept short (line ranges, capped matches) so a long job doesn't pay to re-read what it already knows.
 */
import type { Risk } from "@/lib/studio/agent";
import { docsIndex, formatDocsHits, searchDocs } from "@/lib/studio/roblox-docs";
import { ROBLOX_DOCS_TOOL, ROBLOX_DOCS_TOOL_NAME } from "@/lib/studio/roblox-docs-tool";
import { checkLuau, type LuauResult } from "./luau-check";
import { CLOUD_LIMITS, currentSource, PATH, SCRIPT_CLASSES, type CloudFile, type CloudReport, type PlanStep } from "./model";

export const CLOUD_TOOL_DEFS = [
  { name: "list_scripts", description: "List the game's scripts (path, class, line count, whether you changed it). Optionally only those under a path prefix.", inputSchema: { type: "object", properties: { under: { type: "string" } } } },
  { name: "read_tree", description: "The game's instance tree as captured from Studio (services, folders, models, parts, UI, remotes; long lists summarized).", inputSchema: { type: "object", properties: {} } },
  { name: "read_script", description: "Read a script with line numbers. Use from/to for a range of a long script instead of reading it all.", inputSchema: { type: "object", properties: { path: { type: "string" }, from: { type: "integer" }, to: { type: "integer" } }, required: ["path"] } },
  { name: "search_scripts", description: "Find text in every script (case-insensitive; set regex true for a Lua pattern-free JavaScript regex). Returns path:line: text, at most 60 matches.", inputSchema: { type: "object", properties: { query: { type: "string" }, regex: { type: "boolean" }, under: { type: "string" } }, required: ["query"] } },
  { name: "edit_script", description: "Replace old_string with new_string in a script. old_string must match exactly once (include enough surrounding lines), or set replace_all. The script is checked with Luau's analyzer right after and the problems are returned.", inputSchema: { type: "object", properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, required: ["path", "old_string", "new_string"] } },
  { name: "create_script", description: "Create a new Script, LocalScript or ModuleScript at a path such as ServerScriptService/Pets/PetService. Parent folders that don't exist yet are created as Folders when the person applies the changes. Checked right after.", inputSchema: { type: "object", properties: { path: { type: "string" }, class_name: { type: "string", enum: ["Script", "LocalScript", "ModuleScript"] }, source: { type: "string" } }, required: ["path", "class_name", "source"] } },
  { name: "delete_script", description: "Propose deleting a script (the person confirms each deletion when applying). Say why.", inputSchema: { type: "object", properties: { path: { type: "string" }, reason: { type: "string" } }, required: ["path", "reason"] } },
  { name: "check_scripts", description: "Check scripts with Luau's analyzer (syntax, unknown globals, type errors). No paths: every script you changed or created.", inputSchema: { type: "object", properties: { paths: { type: "array", items: { type: "string" } } } } },
  { name: "update_plan", description: "Set the plan: the full list of steps with their status (todo, doing, done, skipped). Call it when you start, and whenever a step changes.", inputSchema: { type: "object", properties: { steps: { type: "array", items: { type: "object", properties: { title: { type: "string" }, status: { type: "string", enum: ["todo", "doing", "done", "skipped"] } }, required: ["title", "status"] } } }, required: ["steps"] } },
  { name: "finish", description: "End the job with the report the person reads in the morning.", inputSchema: { type: "object", properties: { summary: { type: "string" }, done: { type: "array", items: { type: "string" } }, unresolved: { type: "array", items: { type: "string" } }, testing: { type: "array", items: { type: "string" } } }, required: ["summary", "done", "unresolved", "testing"] } },
  ROBLOX_DOCS_TOOL,
] as const;

export const CLOUD_TOOL_POLICY: Record<string, Risk> = {
  list_scripts: "read", read_tree: "read", read_script: "read", search_scripts: "read", check_scripts: "read", [ROBLOX_DOCS_TOOL_NAME]: "read",
  edit_script: "change", create_script: "change", delete_script: "change", update_plan: "change", finish: "change",
};

export type ToolEffects = { edited?: string; plan?: PlanStep[]; finished?: Omit<CloudReport, "files" | "checks"> };
export type ToolState = { files: Map<string, CloudFile>; tree: string; jobId: string; workspaceId: string; dirty: Set<string> };

const str = (v: unknown, max = 200_000) => (typeof v === "string" ? v.slice(0, max) : "");
const list = (v: unknown, n = 30) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 400)).slice(0, n) : []);
const lineCount = (s: string) => (s === "" ? 0 : s.split("\n").length);

export function formatCheck(path: string, r: LuauResult): string {
  if (!r.checked) return `${path}: not checked (${r.reason}).`;
  if (!r.problems.length) return `${path}: no problems.`;
  return `${path}: ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}\n${r.problems.slice(0, 20).map((p) => `  line ${p.line} (${p.kind}): ${p.message}`).join("\n")}`;
}

function find(st: ToolState, path: string): CloudFile | null {
  const f = st.files.get(path);
  return f && currentSource(f) !== null ? f : null;
}

/** Edit distance, capped (only small typos matter for suggestions). */
function distance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

const missing = (st: ToolState, path: string) => {
  const want = path.split("/").pop()!.toLowerCase();
  const near = [...st.files.keys()].filter((p) => { const name = p.split("/").pop()!.toLowerCase(); return name.includes(want) || want.includes(name) || distance(name, want) <= 2; }).slice(0, 5);
  return `No script at ${path}.${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use list_scripts or search_scripts."}`;
};

/** Runs one tool call against the snapshot. Never throws: errors come back as text the model can act on. */
export async function runCloudTool(st: ToolState, name: string, args: Record<string, unknown>): Promise<{ text: string; effects: ToolEffects }> {
  switch (name) {
    case "list_scripts": {
      const under = str(args.under, 300);
      const rows = [...st.files.values()].filter((f) => currentSource(f) !== null && (!under || f.path.startsWith(under))).sort((a, b) => a.path.localeCompare(b.path));
      const out = rows.slice(0, 400).map((f) => `${f.path} [${f.className}] ${lineCount(currentSource(f)!)} lines${f.created ? " (new)" : f.next !== undefined ? " (changed)" : ""}`);
      return { text: `${rows.length} scripts${under ? ` under ${under}` : ""}${rows.length > 400 ? " (first 400 shown; narrow with under)" : ""}:\n${out.join("\n")}`, effects: {} };
    }
    case "read_tree":
      return { text: st.tree || "(no tree was captured)", effects: {} };
    case "read_script": {
      const path = str(args.path, 600);
      const f = find(st, path);
      if (!f) return { text: missing(st, path), effects: {} };
      const lines = currentSource(f)!.split("\n");
      const from = Math.max(1, Math.floor(Number(args.from) || 1));
      const to = Math.min(lines.length, Math.floor(Number(args.to) || from + 599), from + 599);
      const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}  ${l}`).join("\n").slice(0, 40_000);
      return { text: `${path} [${f.className}], lines ${from}-${to} of ${lines.length}${to < lines.length ? " (more below: read from " + (to + 1) + ")" : ""}\n${body}`, effects: {} };
    }
    case "search_scripts": {
      const q = str(args.query, 300);
      if (!q) return { text: "Give a query.", effects: {} };
      let re: RegExp;
      try { re = args.regex === true ? new RegExp(q, "i") : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); } catch { return { text: "That regex is not valid.", effects: {} }; }
      const under = str(args.under, 300);
      const hits: string[] = [];
      let total = 0;
      for (const f of [...st.files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
        const src = currentSource(f);
        if (src === null || (under && !f.path.startsWith(under))) continue;
        src.split("\n").forEach((l, i) => { if (re.test(l)) { total++; if (hits.length < 60) hits.push(`${f.path}:${i + 1}: ${l.trim().slice(0, 200)}`); } });
      }
      return { text: total ? `${total} match${total === 1 ? "" : "es"}${total > 60 ? " (first 60)" : ""}:\n${hits.join("\n")}` : `No matches for ${q}.`, effects: {} };
    }
    case "edit_script": {
      const path = str(args.path, 600);
      const f = find(st, path);
      if (!f) return { text: missing(st, path), effects: {} };
      const oldS = str(args.old_string), newS = str(args.new_string);
      const src = currentSource(f)!;
      if (!oldS) return { text: "old_string is empty. To add to a script, include an existing line in old_string.", effects: {} };
      const count = src.split(oldS).length - 1;
      if (count === 0) return { text: `old_string was not found in ${path}. Read the script again; it must match exactly, including indentation.`, effects: {} };
      if (count > 1 && args.replace_all !== true) return { text: `old_string matches ${count} times in ${path}. Include more surrounding lines, or set replace_all.`, effects: {} };
      const next = args.replace_all === true ? src.split(oldS).join(newS) : src.replace(oldS, () => newS);
      if (Buffer.byteLength(next, "utf8") > CLOUD_LIMITS.maxScriptBytes) return { text: `That would make ${path} larger than ${CLOUD_LIMITS.maxScriptBytes / 1000} KB. Split it into modules instead.`, effects: {} };
      f.next = next === f.base && !f.created ? undefined : next;
      st.dirty.add(path);
      return { text: `Saved ${path} (${count} replacement${count === 1 ? "" : "s"}).\n${formatCheck(path, await checkLuau(next))}`, effects: { edited: path } };
    }
    case "create_script": {
      const path = str(args.path, 600);
      const cls = str(args.class_name, 20);
      const source = str(args.source, CLOUD_LIMITS.maxScriptBytes);
      if (!PATH.test(path) || path.includes("#")) return { text: `${path} is not a valid path: use Service/Folder/Name, with / between names.`, effects: {} };
      if (!SCRIPT_CLASSES.has(cls)) return { text: "class_name must be Script, LocalScript or ModuleScript.", effects: {} };
      if (find(st, path)) return { text: `${path} already exists. Edit it instead.`, effects: {} };
      if (st.files.size >= CLOUD_LIMITS.maxScripts) return { text: "This job has reached its script limit.", effects: {} };
      const existing = st.files.get(path);
      const f: CloudFile = existing ?? { id: `${st.jobId}:new:${st.files.size}`, workspaceId: st.workspaceId, jobId: st.jobId, path, className: cls as CloudFile["className"], base: "", baseHash: "", created: true };
      f.className = cls as CloudFile["className"];
      f.next = source;
      f.created = existing ? existing.created : true;
      st.files.set(path, f);
      st.dirty.add(path);
      return { text: `Created ${path} [${cls}].\n${formatCheck(path, await checkLuau(source))}`, effects: { edited: path } };
    }
    case "delete_script": {
      const path = str(args.path, 600);
      const f = find(st, path);
      if (!f) return { text: missing(st, path), effects: {} };
      f.next = null; // a script created by this job and deleted again simply drops out of the changes
      st.dirty.add(path);
      return { text: `Marked ${path} for deletion (the person confirms it when applying). Reason noted: ${str(args.reason, 300) || "none given"}.`, effects: { edited: path } };
    }
    case "check_scripts": {
      const asked = list(args.paths, 60);
      const paths = asked.length ? asked : [...st.files.values()].filter((f) => f.next !== undefined && f.next !== null).map((f) => f.path);
      if (!paths.length) return { text: "Nothing to check: no script was changed yet.", effects: {} };
      const out: string[] = [];
      for (const p of paths.slice(0, 60)) {
        const f = find(st, p);
        out.push(f ? formatCheck(p, await checkLuau(currentSource(f)!)) : missing(st, p));
      }
      return { text: out.join("\n"), effects: {} };
    }
    case "update_plan": {
      const steps = Array.isArray(args.steps) ? (args.steps as { title?: unknown; status?: unknown }[]).slice(0, 14).map((s) => ({ title: str(s?.title, 160), status: (["todo", "doing", "done", "skipped"].includes(s?.status as string) ? s.status : "todo") as PlanStep["status"] })).filter((s) => s.title) : [];
      if (!steps.length) return { text: "Give the plan as a list of steps.", effects: {} };
      return { text: `Plan saved (${steps.filter((s) => s.status === "done").length} of ${steps.length} done).`, effects: { plan: steps } };
    }
    case ROBLOX_DOCS_TOOL_NAME: {
      const q = str(args.query, 300).trim();
      if (!q) return { text: "Say what to look up.", effects: {} };
      try {
        const index = docsIndex();
        return { text: formatDocsHits(q, searchDocs(index, q, typeof args.limit === "number" ? args.limit : 5), index.commit), effects: {} };
      } catch {
        return { text: "The Roblox docs could not be searched right now. Write defensive code and note the uncertainty in the report.", effects: {} };
      }
    }
    case "finish":
      return { text: "Report saved. The job is finished.", effects: { finished: { summary: str(args.summary, 3000), done: list(args.done), unresolved: list(args.unresolved), testing: list(args.testing, 10) } } };
    default:
      return { text: `${name} is not a Roblox Cloud tool.`, effects: {} };
  }
}
