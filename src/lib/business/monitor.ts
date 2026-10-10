/**
 * Page monitors (BETA). A monitor agent reads ONE public web page on its schedule and tells the owner, in their Keplar inbox, when the
 * text changed, with the lines that were added and removed. Honest limits:
 *   - it reads the page's text as the server sees it (no JavaScript is run), so pages that build themselves in the browser, show a
 *     clock/ad rotation, or need a login can't be watched reliably;
 *   - it only follows public pages (the same SSRF-safe fetch and robots.txt / noai rules as the product importer) and sends no cookies;
 *   - an optional keyword narrows it to the lines that contain that word, so unrelated page noise doesn't raise alerts;
 *   - the alert is an in-app inbox note. Nothing is emailed or posted by a monitor.
 */
import { createHash } from "node:crypto";
import { checkUrl, safeFetch } from "@/lib/mcp/ssrf";
import { assertRobotsAllow } from "@/lib/site-builder/product/fetch";
import { BOT_UA } from "@/lib/site-builder/product/robots";
import { HttpError } from "@/lib/create/platform/http";

export const MONITOR_MAX_CHARS = 20_000;

/** Test seam: replaced in tests so no network is needed. */
export const monitorDeps: { read: (url: string) => Promise<string> } = { read: readPage };

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** HTML to plain text lines: scripts, styles and tags removed, whitespace collapsed, one block per line. */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|br|table)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m] ?? " ");
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 2);
}

export async function readPage(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = checkUrl(rawUrl);
  } catch {
    throw new HttpError(400, "That isn't a public web address (https://…).", "bad_url");
  }
  try {
    await assertRobotsAllow(url.toString(), new Map());
    const res = await safeFetch(url.toString(), { headers: { "user-agent": BOT_UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" }, timeoutMs: 12_000, maxBytes: 1_500_000, maxRedirects: 3 });
    if (res.status < 200 || res.status >= 300) throw new Error(`The page answered ${res.status}.`);
    const ct = (res.headers["content-type"] ?? "").toLowerCase();
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)\b/.test(ct)) throw new Error("That address isn't a web page.");
    if (/\bnoai\b/.test((res.headers["x-robots-tag"] ?? "").toLowerCase())) throw new Error("That page asks not to be used by AI tools.");
    return res.body.toString("utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    throw new Error(`Couldn't read the page${msg ? `: ${msg}` : "."}`);
  }
}

/** The lines the monitor compares: all of them, or only those containing the keyword. Capped. */
export function watchedLines(html: string, keyword?: string): string[] {
  const all = htmlToLines(html);
  const k = keyword?.trim().toLowerCase();
  const picked = k ? all.filter((l) => l.toLowerCase().includes(k)) : all;
  let used = 0;
  const out: string[] = [];
  for (const l of picked) {
    const line = l.slice(0, 300);
    if (used + line.length > MONITOR_MAX_CHARS) break;
    out.push(line);
    used += line.length + 1;
  }
  return out;
}

export const hashLines = (lines: string[]) => createHash("sha256").update(lines.join("\n")).digest("hex");

export function diffLines(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const b = new Set(before);
  const a = new Set(after);
  return { added: after.filter((l) => !b.has(l)), removed: before.filter((l) => !a.has(l)) };
}

export type MonitorResult =
  | { kind: "baseline"; hash: string; snapshot: string; lines: number }
  | { kind: "unchanged"; hash: string }
  | { kind: "changed"; hash: string; snapshot: string; added: string[]; removed: string[] }
  | { kind: "keyword_missing"; hash: string };

export async function checkPage(m: { url: string; keyword?: string; hash?: string; snapshot?: string }): Promise<MonitorResult> {
  const lines = watchedLines(await monitorDeps.read(m.url), m.keyword);
  const hash = hashLines(lines);
  if (m.keyword && !lines.length) return { kind: "keyword_missing", hash };
  if (!m.hash) return { kind: "baseline", hash, snapshot: lines.join("\n"), lines: lines.length };
  if (m.hash === hash) return { kind: "unchanged", hash };
  const { added, removed } = diffLines((m.snapshot ?? "").split("\n").filter(Boolean), lines);
  return { kind: "changed", hash, snapshot: lines.join("\n"), added, removed };
}

const short = (l: string) => (l.length > 160 ? `${l.slice(0, 159)}…` : l);
/** The alert text: counts and up to 5 lines each way. Page text is data; it is only ever shown, never executed or sent anywhere. */
export function changeSummary(url: string, r: Extract<MonitorResult, { kind: "changed" }>): string {
  const part = (title: string, ls: string[]) => (ls.length ? `${title} (${ls.length}):\n${ls.slice(0, 5).map((l) => `  ${short(l)}`).join("\n")}${ls.length > 5 ? `\n  …and ${ls.length - 5} more` : ""}` : "");
  return [`The page ${url} changed since the last check.`, part("Added", r.added), part("Removed", r.removed)].filter(Boolean).join("\n\n");
}
