/**
 * The repair step of the verify -> fix loop. Problems from the static check, the browser run, the rubric and the reviewer are
 * grouped by the file that must change; each group is rewritten in parallel by the coder model, which sees the whole project
 * (read-only) so a fix never breaks an import or a class name used elsewhere. Problems without a known file go to one extra
 * call that may change any file not claimed by another group.
 */
import { llm } from "./llm";
import { parseFileBlocks, systemFor } from "./generate";
import type { AppBuildLimits, AppModel } from "./models";
import type { AppSpec } from "./types";

export type Problem = { file?: string; message: string; source: "static" | "browser" | "rubric" | "review" | "visual"; severity?: "high" | "medium" | "low" };

function projectText(files: Record<string, string>, exclude: Set<string>, budget: number): string {
  const entries = Object.entries(files).filter(([p]) => !exclude.has(p));
  const total = entries.reduce((a, [, c]) => a + c.length, 0);
  const ratio = Math.min(1, budget / Math.max(1, total));
  return entries.map(([p, c]) => {
    const keep = Math.max(2500, Math.floor(c.length * ratio));
    return `<file path="${p}">\n${c.length > keep ? `${c.slice(0, keep)}\n/* ...truncated... */` : c}\n</file>`;
  }).join("\n");
}

export async function fixProblems(o: {
  spec: AppSpec;
  designBrief: string;
  files: Record<string, string>;
  problems: Problem[];
  chain: AppModel[];
  L: AppBuildLimits;
  deadline: number;
  onFile?: (path: string) => void;
}): Promise<{ files: Record<string, string>; changed: string[]; usd: number; failed: number; skipped: number }> {
  const byFile = new Map<string, Problem[]>();
  const loose: Problem[] = [];
  for (const p of o.problems) {
    if (p.file && (o.files[p.file] !== undefined || /^styles\/[a-z0-9_-]+\.css$/.test(p.file)) && p.file !== "index.html") {
      byFile.set(p.file, [...(byFile.get(p.file) ?? []), p]);
    } else loose.push(p);
  }
  const groups: { files: string[]; problems: Problem[]; any: boolean }[] = [];
  const paths = [...byFile.keys()];
  for (let i = 0; i < paths.length; i += 2) {
    const fs = paths.slice(i, i + 2);
    groups.push({ files: fs, problems: fs.flatMap((f) => byFile.get(f)!), any: false });
  }
  if (loose.length) groups.push({ files: [], problems: loose, any: true });
  const claimed = new Set(paths);
  let usd = 0;
  const out: Record<string, string> = {};
  const changed: string[] = [];
  const queue = groups.slice(0, 8);
  const skipped = Math.max(0, groups.length - queue.length);
  let failed = 0;
  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      const editable = g.any ? Object.keys(o.files).filter((p) => !claimed.has(p) && p !== "index.html") : g.files;
      const list = g.problems.map((p, i) => `${i + 1}. [${p.source}${p.severity ? `/${p.severity}` : ""}]${p.file ? ` ${p.file}:` : ""} ${p.message}`).join("\n");
      const own = g.any ? "" : g.files.map((f) => `<file path="${f}">\n${o.files[f] ?? "(new file)"}\n</file>`).join("\n");
      try {
        const r = await llm(
          o.chain,
          [
            { role: "system", content: systemFor(o.spec, o.designBrief) },
            {
              role: "user",
              content: `The app below was verified in a real browser against a real backend and has these problems:\n${list}\n\nTHE WHOLE PROJECT (read-only context)\n${projectText(o.files, new Set(g.files), 70_000)}\n${own ? `\nFILES YOU OWN (rewrite these)\n${own}\n` : ""}\nFix every problem at its root cause. ${g.any ? `You may rewrite any of: ${editable.join(", ")}.` : `Rewrite only: ${g.files.join(", ")}.`} Keep every export name, route and class name other files rely on. Keep everything that already works. Return each changed file complete, as <file path="..."> blocks, and nothing else.`,
            },
          ],
          { maxTokens: o.L.outTokensPerCall, temperature: 0.3, deadline: o.deadline, reasoning: "low", accept: (t) => Object.keys(parseFileBlocks(t)).some((p) => editable.includes(p) || (!g.any && /^styles\/[a-z0-9_-]+\.css$/.test(p))) },
        );
        usd += r.usd;
        for (const [p, c] of Object.entries(parseFileBlocks(r.text))) {
          const ok = editable.includes(p) || (g.files.includes(p) && /^styles\//.test(p));
          if (!ok || c.trim().length < 20) continue;
          out[p] = c;
          changed.push(p);
          o.onFile?.(p);
        }
      } catch (e) {
        usd += (e as { usd?: number }).usd ?? 0;
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.L.parallel, queue.length)) }, worker));
  return { files: { ...o.files, ...out }, changed, usd, failed, skipped };
}
