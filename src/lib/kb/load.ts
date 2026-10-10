import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PLAN_ALLOWANCES, WINDOW_LIMITS, type PlanId } from "@/lib/orchestration/plans";
import { tiers } from "@/lib/tiers";
import { nodesToText, parseBlocks, parseFront, wordCount, type Front, type Node } from "./md";

export const CONTENT_ROOT = path.join(process.cwd(), "content");

export type Loaded = { file: string; rel: string; front: Front; nodes: Node[]; words: number; text: string };

function walk(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
    })
    .sort();
}

const cache = new Map<string, Loaded[]>();

const fmt = (n: number) => n.toLocaleString("en-US");
/**
 * Numbers that can change live in the product's own data, so content files reference them by token instead of retyping them:
 * {{price:plus}} → $45 · {{credits:plus}} → 6,000 · {{win5:plus}} / {{weekly:plus}} → rolling-window credits.
 */
export function applyTokens(src: string): string {
  return src.replace(/\{\{(price|credits|win5|weekly):(\w+)\}\}/g, (m, kind: string, id: string) => {
    const plan = id as PlanId;
    if (kind === "price") {
      const t = tiers.find((x) => x.id === id);
      return t && t.price !== null ? `$${t.price}` : m;
    }
    if (kind === "credits") {
      const u = PLAN_ALLOWANCES[plan]?.monthlyUnits;
      return u == null ? m : fmt(u);
    }
    const w = WINDOW_LIMITS[plan];
    if (!w) return m;
    return fmt(kind === "win5" ? w.fiveHour : w.weekly);
  });
}

/** Read every .md file under content/<dir>. Build-time only (static generation and tests). */
export function loadDir(dir: string): Loaded[] {
  const hit = cache.get(dir);
  if (hit) return hit;
  const root = path.join(CONTENT_ROOT, dir);
  const list = walk(root).map((file) => {
    const { front, body } = parseFront(applyTokens(readFileSync(file, "utf8")));
    const nodes = parseBlocks(body);
    const text = nodesToText(nodes);
    return { file, rel: path.relative(root, file).replace(/\\/g, "/").replace(/\.md$/, ""), front, nodes, words: wordCount(text), text };
  });
  cache.set(dir, list);
  return list;
}

export const csv = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
