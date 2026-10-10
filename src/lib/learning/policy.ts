/**
 * Router policy: the only thing the learning loop is allowed to change. A closed shape, validated field by field, so a bad or
 * hostile candidate cannot express anything except "multiply this model's routing score by a number in a narrow range for this
 * kind of question". Models, plans, prices, guards, prompts and code are not representable here.
 */
import { BOOST_CEIL, BOOST_FLOOR, POLICY_SPAN } from "./bandit";
import type { Boosts, Category, Tier } from "./types";

export const MAX_ENTRIES = 600;
/** A change this big is never applied on its own: an admin approves it. */
export const LARGE_CATEGORIES = 4;
export const LARGE_DELTA = 0.15;
export const LARGE_COST_PCT = 3;

const CATEGORY = /^[a-z]{3,16}:(simple|moderate|complex)$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{1,79}$/;

export const keyOf = (tier: Tier, category: Category) => `${tier}|${category}`;

/** Returns the cleaned policy, or the first problem. Never throws. */
export function validateBoosts(input: unknown): { ok: true; boosts: Boosts } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "A policy is an object." };
  const out: Boosts = {};
  let n = 0;
  for (const [key, models] of Object.entries(input as Record<string, unknown>)) {
    const [tier, category, ...rest] = key.split("|");
    if (rest.length || (tier !== "free" && tier !== "paid")) return { ok: false, error: `Unknown tier in "${key}".` };
    if (!CATEGORY.test(category ?? "")) return { ok: false, error: `Unknown question type in "${key}".` };
    if (!models || typeof models !== "object" || Array.isArray(models)) return { ok: false, error: `"${key}" must map models to numbers.` };
    const row: Record<string, number> = {};
    for (const [id, v] of Object.entries(models as Record<string, unknown>)) {
      if (!MODEL.test(id)) return { ok: false, error: `Bad model id in "${key}".` };
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `Boost for ${id} must be a number.` };
      if (v < 1 / (1 + POLICY_SPAN) - 1e-9 || v > 1 + POLICY_SPAN + 1e-9) return { ok: false, error: `Boost for ${id} is outside the allowed range.` };
      if (++n > MAX_ENTRIES) return { ok: false, error: "Too many entries." };
      row[id] = Math.round(v * 1000) / 1000;
    }
    if (Object.keys(row).length) out[key] = row;
  }
  return { ok: true, boosts: out };
}

/** Plain-language list of every change from `from` to `to`. */
export function diffBoosts(from: Boosts, to: Boosts): string[] {
  const lines: string[] = [];
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const k of [...keys].sort()) {
    const a = from[k] ?? {};
    const b = to[k] ?? {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[id] ?? 1;
      const y = b[id] ?? 1;
      if (Math.abs(x - y) >= 0.005) lines.push(`${k.replace("|", " / ")}: ${id} ${x.toFixed(2)} → ${y.toFixed(2)}`);
    }
  }
  return lines;
}

/** "large" needs an admin: many question types, a big single move, or a plan that costs noticeably more. */
export function sizeOf(from: Boosts, to: Boosts, costDeltaPct: number): "small" | "large" {
  const touched = new Set<string>();
  let biggest = 0;
  for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[k] ?? {};
    const b = to[k] ?? {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = Math.abs((a[id] ?? 1) - (b[id] ?? 1));
      if (d >= 0.005) touched.add(k);
      biggest = Math.max(biggest, d);
    }
  }
  return touched.size >= LARGE_CATEGORIES || biggest > LARGE_DELTA || costDeltaPct > LARGE_COST_PCT ? "large" : "small";
}

export const boostOf = (b: Boosts, tier: Tier, category: Category, modelId: string) => b[keyOf(tier, category)]?.[modelId] ?? 1;
export const clampBoost = (x: number) => Math.min(BOOST_CEIL, Math.max(BOOST_FLOOR, x));
