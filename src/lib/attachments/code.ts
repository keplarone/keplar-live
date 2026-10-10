/**
 * Zipped code projects: a file map, a language breakdown and the contents of the files that explain the project
 * (README, manifests, entry points, then the smallest source files) within a character budget. Dependencies, build
 * output, VCS folders, binaries, lockfiles and secrets files are skipped; nothing is executed or written to disk.
 */
import { CODE_LANG, extOf } from "./kinds";
import { listZip, readEntry, type ZipLimits } from "./zip";

const SKIP_DIR = /(^|\/)(node_modules|\.git|\.hg|\.svn|dist|build|out|target|vendor|\.next|\.nuxt|\.venv|venv|env|__pycache__|\.idea|\.vscode|coverage|\.gradle|Pods|DerivedData|\.turbo|\.cache|bin|obj)\//;
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|\.DS_Store|\.env(\..*)?|id_rsa.*|.*\.pem|.*\.key|.*\.p12|.*\.keystore)$/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|psd|mp[34]|mov|avi|wav|ogg|flac|woff2?|ttf|otf|eot|zip|gz|tgz|rar|7z|jar|war|class|o|a|so|dylib|dll|exe|bin|wasm|pdf|docx?|xlsx?|pptx?|sqlite|db|pyc)$/i;
const KEY_FILE = /(^|\/)(readme(\.md|\.txt|\.rst)?|package\.json|pyproject\.toml|requirements\.txt|setup\.py|cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|gemfile|composer\.json|dockerfile|docker-compose\.ya?ml|makefile|tsconfig\.json|next\.config\.[jt]s|vite\.config\.[jt]s)$/i;
const ENTRY = /(^|\/)(main|index|app|server|cli|lib|mod)\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|c|cpp|cs)$/i;

export function readCodeZip(buf: Uint8Array, limits: ZipLimits & { maxChars: number }): { text: string; summary: string; truncated: boolean; files: number } {
  const entries = listZip(buf, limits).filter((e) => !e.dir && !e.name.startsWith("__MACOSX/"));
  const kept = entries.filter((e) => !SKIP_DIR.test(e.name) && !SKIP_FILE.test(e.name));
  // Strip one shared top folder ("project-main/…") from the display names.
  const top = kept.length && kept.every((e) => e.name.split("/")[0] === kept[0].name.split("/")[0] && e.name.includes("/")) ? kept[0].name.split("/")[0] + "/" : "";
  const show = (n: string) => (top && n.startsWith(top) ? n.slice(top.length) : n);
  const langs = new Map<string, number>();
  for (const e of kept) {
    const lang = CODE_LANG[extOf(e.name)];
    if (lang) langs.set(lang, (langs.get(lang) ?? 0) + e.size);
  }
  const totalCode = [...langs.values()].reduce((a, b) => a + b, 0) || 1;
  const langLine = [...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, b]) => `${l} ${Math.round((b / totalCode) * 100)}%`).join(", ");
  const tree = kept.slice(0, 400).map((e) => `${show(e.name)} (${e.size < 1024 ? `${e.size} B` : `${Math.round(e.size / 1024)} KB`})`);
  const header = [`[Code archive: ${kept.length} files${entries.length > kept.length ? ` (${entries.length - kept.length} dependency, build or binary files skipped)` : ""}${langLine ? `; languages by size: ${langLine}` : ""}]`, "File map:", ...tree, kept.length > 400 ? `… and ${kept.length - 400} more files` : ""].filter(Boolean).join("\n");
  const readable = kept.filter((e) => !BINARY.test(e.name) && e.size <= 400_000);
  const rank = (n: string) => (KEY_FILE.test(n) ? 0 : ENTRY.test(n) ? 1 : CODE_LANG[extOf(n)] ? 2 : 3);
  readable.sort((a, b) => rank(a.name) - rank(b.name) || a.name.split("/").length - b.name.split("/").length || a.size - b.size);
  const parts = [header];
  let len = header.length;
  let included = 0;
  let truncated = false;
  for (const e of readable) {
    const bytes = readEntry(buf, e, 400_000);
    if (!bytes || bytes.subarray(0, 4096).includes(0)) continue;
    let body = new TextDecoder("utf-8").decode(bytes).replace(/\r\n?/g, "\n");
    const room = limits.maxChars - len - 200;
    if (room < 400) { truncated = true; break; }
    if (body.length > room) { body = body.slice(0, room) + "\n… (cut)"; truncated = true; }
    const lang = (CODE_LANG[extOf(e.name)] ?? "").toLowerCase().replace(/[^a-z+#]/g, "");
    const block = `\n--- ${show(e.name)} ---\n\`\`\`${lang}\n${body}\n\`\`\``;
    parts.push(block);
    len += block.length;
    included++;
  }
  if (included < readable.length) truncated = true;
  return { text: parts.join("\n"), summary: `${kept.length} files${langLine ? ` · ${langLine.split(",")[0].replace(/ \d+%$/, "")}` : ""}`, truncated, files: kept.length };
}

/** Jupyter notebook → markdown and code cells in order (outputs dropped). */
export function readNotebook(json: string, maxChars: number): string | null {
  try {
    const nb = JSON.parse(json) as { cells?: { cell_type?: string; source?: string | string[] }[]; metadata?: { kernelspec?: { language?: string } } };
    if (!Array.isArray(nb.cells)) return null;
    const lang = nb.metadata?.kernelspec?.language ?? "python";
    const out: string[] = [];
    let len = 0;
    for (const [i, c] of nb.cells.entries()) {
      const src = Array.isArray(c.source) ? c.source.join("") : c.source ?? "";
      if (!src.trim()) continue;
      const block = c.cell_type === "code" ? `In [${i + 1}]:\n\`\`\`${lang}\n${src}\n\`\`\`` : src;
      if (len + block.length > maxChars) break;
      out.push(block);
      len += block.length;
    }
    return out.join("\n\n");
  } catch {
    return null;
  }
}
