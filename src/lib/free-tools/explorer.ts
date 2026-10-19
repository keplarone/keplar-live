/**
 * Rows for the AI model comparison explorer, from the live rosters the router reads (src/lib/orchestration/live-catalog.ts).
 * Names, providers, lane, role, weights, context and input kinds only. No prices and no scores: Keplar does not publish them.
 */
import { FREE_LIVE_SEEDS, LIVE_SEEDS, type LiveSeed } from "@/lib/orchestration/live-catalog";

export type ModelRow = {
  id: string;
  name: string;
  provider: string;
  family: string;
  lane: "free" | "paid";
  role: string;
  openWeights: boolean;
  context: number;
  contextLabel: string;
  images: boolean;
  video: boolean;
  strengths: string[];
};

const ROLE: Record<string, string> = { primary: "Panelist", verifier: "Verifier", judge: "Synthesizer (judge)", "fast-cheap": "Fast or fallback" };
const ctx = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/\.?0+$/, "")}M` : `${Math.round(n / 1000)}k`);

const row = (m: LiveSeed, lane: "free" | "paid"): ModelRow => ({
  id: `${lane}:${m.id}`,
  name: m.name.replace(/ \(free\)$/, ""),
  provider: m.provider,
  family: m.family,
  lane,
  role: ROLE[m.role] ?? m.role,
  openWeights: m.openWeights,
  context: m.contextWindow,
  contextLabel: ctx(m.contextWindow),
  images: m.input.includes("image"),
  video: m.input.includes("video"),
  strengths: m.strengths.slice(0, 4),
});

export function modelRows(): ModelRow[] {
  return [...FREE_LIVE_SEEDS.map((m) => row(m, "free")), ...LIVE_SEEDS.map((m) => row(m, "paid"))].sort((a, b) => a.lane.localeCompare(b.lane) || a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

export const providers = (rows: ModelRow[]) => [...new Set(rows.map((r) => r.provider))].sort();
