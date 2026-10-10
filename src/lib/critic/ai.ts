/**
 * The model half of the AI Critic: design and UX judgment the rules can't make (hierarchy, rhythm, copy, states, the primary
 * action), optionally looking at a real screenshot. Free plans use only OpenRouter `:free` models.
 *
 * "No generic comments" is enforced, not hoped for: every suggestion must quote text that exists in a file and give the exact
 * replacement. Anything that can't be located, changes nothing, or reads like boilerplate is dropped (and counted).
 */
import { chainFor } from "@/lib/app-builder/models";
import { llm, parseJsonObject, type Msg } from "@/lib/app-builder/llm";
import type { PlanId } from "@/lib/create/platform/plans";
import { LineIndex, clip } from "./text";
import type { Category, Finding, Severity } from "./types";

const GENERIC = /\b(consider (improving|enhancing|adding more)|could be (better|improved)|looks (good|great|nice)|overall|in general|make sure to|ensure (that )?(the|your) (design|code|ux) is|best practices?|more (engaging|modern|appealing)|enhance the user experience|improve (the )?(ux|usability|readability) (overall|in general))\b/i;
const CATS = new Set<Category>(["design", "ux", "a11y", "code", "perf"]);
const SEVS = new Set<Severity>(["critical", "major", "minor", "info"]);

export type AiResult = { findings: Finding[]; kept: number; dropped: number; model?: string; usd: number; note?: string };

function pack(files: Record<string, string>, budget = 46_000): string {
  const order = Object.keys(files).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  let out = "";
  for (const p of order) {
    if (out.length > budget) break;
    const body = files[p].slice(0, Math.min(14_000, budget - out.length));
    out += `\n===== FILE ${p}${body.length < files[p].length ? " (truncated)" : ""} =====\n${body}\n`;
  }
  return out;
}
const rank = (p: string) => (p === "index.html" ? 0 : /\.css$/.test(p) ? 1 : /^(app|main)\.m?js$/.test(p) ? 2 : /^pages\//.test(p) ? 3 : /\.html$/.test(p) ? 4 : 5);

/** Finds `quote` in `src` exactly, or modulo whitespace runs; returns the exact span. */
export function locateQuote(src: string, quote: string): { start: number; end: number } | null {
  const i = src.indexOf(quote);
  if (i >= 0) return { start: i, end: i + quote.length };
  const parts = quote.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (parts.length < 2) return null;
  const m = new RegExp(parts.join("\\s+")).exec(src);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export function validateAiFindings(raw: unknown, files: Record<string, string>, known: Finding[]): { findings: Finding[]; dropped: number } {
  const list = Array.isArray((raw as { findings?: unknown })?.findings) ? ((raw as { findings: unknown[] }).findings) : [];
  const out: Finding[] = [];
  let dropped = 0;
  for (const r of list.slice(0, 16)) {
    const x = r as Record<string, unknown>;
    const file = String(x.file ?? "");
    const quote = String(x.quote ?? "");
    const replacement = typeof x.replacement === "string" ? x.replacement : null;
    const title = clip(String(x.title ?? ""), 90);
    const detail = clip(String(x.detail ?? ""), 400);
    const fix = clip(String(x.fix ?? ""), 300);
    const category = (CATS.has(x.category as Category) ? x.category : "design") as Category;
    const severity = (SEVS.has(x.severity as Severity) ? x.severity : "minor") as Severity;
    const src = files[file];
    const loc = src && quote.trim().length >= 8 ? locateQuote(src, quote) : null;
    if (!src || !loc || replacement === null || replacement.trim() === quote.trim() || title.length < 8 || detail.length < 24 || GENERIC.test(`${title} ${detail} ${fix}`)) { dropped++; continue; }
    const { line, col } = new LineIndex(src).pos(loc.start);
    if (known.some((k) => k.file === file && k.line === line && k.category === category) || out.some((k) => k.file === file && k.line === line)) { dropped++; continue; }
    const exact = src.slice(loc.start, loc.end);
    out.push({
      id: `ai/${category}@${file}:${line}:${col}`,
      rule: `ai/${category}`,
      category,
      severity: severity === "critical" ? "major" : severity, // the model never blocks on its own judgment
      source: "ai",
      file,
      line,
      col,
      element: clip(exact, 160),
      title,
      detail,
      fix: fix || `Replace with: ${clip(replacement, 140)}`,
      patch: [{ file, start: loc.start, end: loc.end, expect: exact, replace: replacement, pre: src.slice(Math.max(0, loc.start - 24), loc.start), post: src.slice(loc.end, loc.end + 24) }],
    });
  }
  return { findings: out, dropped };
}

export async function aiCritique(o: { files: Record<string, string>; known: Finding[]; plan: PlanId; brief?: string; screenshot?: Buffer | null; deadline: number; fetchImpl?: typeof fetch }): Promise<AiResult> {
  const vision = Boolean(o.screenshot);
  const chain = chainFor(o.plan, vision ? "vision" : "design");
  const already = o.known.slice(0, 40).map((f) => `- ${f.file}:${f.line} ${f.title}`).join("\n") || "(none)";
  const sys = `You are Keplar's senior design and UX critic reviewing a generated web creation BEFORE it is published. Be sharp and concrete, like a design lead marking up a page.
Judge: visual hierarchy (one clear focal point and primary action per screen), spacing rhythm, typographic pairing and scale, copy specificity (names, numbers, outcomes, no filler), empty/loading/error states, form feedback, navigation clarity, mobile layout, and "anti-vibe-code" craft (no gradient text, neon glows, glassmorphism, stock violet, emoji icons, centered-hero-plus-three-cards).
Return ONLY JSON: {"findings":[{"file":"<path>","quote":"<exact text copied from that file, 12-200 chars, unique>","replacement":"<the exact new text for that quote>","category":"design|ux|a11y|code|perf","severity":"major|minor|info","title":"<specific problem, max 80 chars>","detail":"<what is wrong and why it matters, naming the element>","fix":"<the exact change in words>"}]}
Rules: at most 10 findings, best first. Every quote MUST be copied character-for-character from the named file. Every replacement must be complete, working code or copy in the same language. Skip anything in ALREADY FOUND. Never write generic advice ("consider improving", "enhance UX", "follow best practices"): if you can't quote it and rewrite it, leave it out.`;
  const text = `${o.brief ? `WHAT IT IS: ${o.brief.slice(0, 600)}\n` : ""}ALREADY FOUND BY STATIC CHECKS:\n${already}\n\nFILES:${pack(o.files)}`;
  const content: Msg["content"] = vision ? [{ type: "text", text: `${text}\n\nThe attached image is the rendered first screen at 1280×800.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${o.screenshot!.toString("base64")}` } }] : text;
  const res = await llm(chain, [{ role: "system", content: sys }, { role: "user", content }], { maxTokens: 5000, temperature: 0.3, deadline: o.deadline, json: true, accept: (t) => parseJsonObject(t) !== null, fetchImpl: o.fetchImpl });
  const { findings, dropped } = validateAiFindings(parseJsonObject(res.text), o.files, o.known);
  return { findings, kept: findings.length, dropped, model: res.model.label, usd: res.usd };
}
