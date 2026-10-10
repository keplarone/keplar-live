/**
 * Outcome tracking for every Ask turn Core touched: what depth ran, which variants were used, how confident the answer was,
 * what the checks found, and what the person did next (thumbs, copy, regenerate, correction, confusion, an edited question,
 * moving on). Content-free unless the person turned on "Help improve Keplar" (then a few redacted topic words are kept so
 * failures can be grouped by topic). People can opt out entirely (Settings): nothing about their turns is recorded.
 */
import { now } from "@/lib/create/platform/ids";
import { turnKey } from "@/lib/learning/repo";
import { shareFailures } from "@/lib/learning/repo";
import { redactCase } from "@/lib/learning/redact";
import { terms } from "../retrieval";
import { getPrefs, savePrefs, SYSTEM, turnRows } from "./repo";
import { credit } from "./variants";
import { SIGNALS, type Signal, type TurnRow, type VariantTarget } from "./types";

/** What each signal says about a turn (positive = it helped). */
export const SIGNAL_WEIGHT: Record<Signal, number> = { up: 1, copy: 0.4, complete: 0.3, down: -1, regenerate: -0.6, correct: -1, confused: -0.5, edit: -0.3 };

/** A turn's reward in [0,1]: the checks' own verdict (critic score or confidence) blended with what the person did. */
export function turnReward(row: Pick<TurnRow, "criticScore" | "confidence" | "fb" | "checksFailed">): number {
  const quality = row.criticScore !== null && row.criticScore !== undefined ? row.criticScore / 10 : row.confidence;
  const fb = Object.entries(row.fb ?? {}).reduce((a, [k, n]) => a + (SIGNAL_WEIGHT[k as Signal] ?? 0) * Math.min(1, n ?? 0), 0);
  const human = 0.5 + 0.5 * Math.tanh(fb);
  const hasHuman = Object.keys(row.fb ?? {}).length > 0;
  const r = hasHuman ? 0.4 * quality + 0.6 * human : quality - Math.min(0.2, row.checksFailed * 0.05);
  return Math.max(0, Math.min(1, r));
}

const TOPIC_STOP = new Set(["please", "explain", "help", "need", "want", "know", "tell", "give", "make", "like", "thing", "something", "question"]);

/** A few topic words (redacted, consented people only), for grouping failures by topic. */
export function topicWords(prompt: string): string {
  const clean = redactCase(prompt);
  if (!clean) return "";
  const counts = new Map<string, number>();
  for (const t of terms(clean)) if (t.length > 3 && !TOPIC_STOP.has(t) && !/^\d+$/.test(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w).join(" ");
}

export type TurnInput = {
  workspaceId: string;
  anonymous: boolean;
  answerId: string;
  prompt: string;
  plan: string | undefined;
  category: string;
  depth: TurnRow["depth"];
  escalated: boolean;
  variants: Partial<Record<VariantTarget, string>>;
  confidence: number;
  criticScore: number | null;
  latencyMs: number;
  calls: number;
  units: number;
  stoppedBy: string;
  checksFailed: number;
  tags: string[];
};

export async function recordTurn(i: TurnInput): Promise<boolean> {
  if (process.env.KEPLAR_LEARNING_OFF === "1") return false;
  try {
    if (!i.anonymous && (await getPrefs(i.workspaceId)).optOut) return false;
    const topic = !i.anonymous && (await shareFailures(i.workspaceId)) ? topicWords(i.prompt) : "";
    const row: TurnRow = {
      id: turnKey(i.workspaceId, i.answerId),
      workspaceId: SYSTEM,
      at: now(),
      tier: i.plan === "free" || !i.plan ? "free" : "paid",
      category: i.category,
      depth: i.depth,
      escalated: i.escalated,
      variants: i.variants,
      confidence: Math.round(i.confidence * 1000) / 1000,
      criticScore: i.criticScore,
      latencyMs: i.latencyMs,
      calls: i.calls,
      units: i.units,
      stoppedBy: i.stoppedBy,
      checksFailed: i.checksFailed,
      tags: i.tags.slice(0, 12),
      ...(topic ? { topic } : {}),
      fb: {},
      credited: 0,
    };
    row.credited = turnReward(row);
    const { inserted } = await turnRows().insertIfAbsent(row);
    if (inserted) await credit(i.variants, row.credited);
    return inserted;
  } catch (e) {
    console.error("[core] turn not recorded:", e instanceof Error ? e.name : "error");
    return false;
  }
}

/** A signal about a turn. Counted once per kind (a vote can flip). Adjusts the variants' credit by the change in reward. */
export async function noteSignal(i: { workspaceId: string; anonymous?: boolean; answerId: string; kind: string }): Promise<boolean> {
  if (!SIGNALS.includes(i.kind as Signal)) return false;
  try {
    if (!i.anonymous && (await getPrefs(i.workspaceId)).optOut) return false;
    const key = turnKey(i.workspaceId, String(i.answerId).slice(0, 80));
    const row = await turnRows().get(SYSTEM, key);
    if (!row) return false;
    const kind = i.kind as Signal;
    if ((row.fb?.[kind] ?? 0) >= 1) return false;
    const fb = { ...row.fb };
    // A vote can flip: up replaces down and vice versa.
    if (kind === "up" || kind === "down") { delete fb.up; delete fb.down; }
    fb[kind] = 1;
    const next = { ...row, fb };
    const reward = turnReward(next);
    await turnRows().update(SYSTEM, key, { fb, credited: reward });
    await credit(row.variants, reward, row.credited);
    // Per-person preference memory: a regenerate or thumbs-down on a long answer nudges toward shorter, a thumbs-up on a deep one toward more detail.
    if (!i.anonymous) {
      const nudge = kind === "up" && row.depth !== "quick" ? 0.1 : kind === "confused" ? -0.15 : kind === "regenerate" && row.depth !== "quick" ? -0.05 : 0;
      if (nudge) { const p = await getPrefs(i.workspaceId); await savePrefs(i.workspaceId, { brevity: p.brevity + nudge }); }
    }
    return true;
  } catch {
    return false;
  }
}
