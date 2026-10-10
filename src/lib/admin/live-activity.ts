/**
 * Live chat activity for the admin card, from the per-request records the product already writes (system_request_costs, one row
 * per /api/keplar request that reached the engine). It exposes ONLY: when the request finished, whether it was an answer or an
 * instant reply, the plan label, which model ids answered, how long it took, and whether it was answered. Never message or answer
 * text (none is stored in these records), never an account id, email or any user identity.
 */
import { collection } from "@/lib/create/platform/store";
import type { RequestCostRow } from "@/lib/ops/request-cost";

export const ACTIVITY_WINDOW_MS = 5 * 60_000;
export const FEED_LIMIT = 25;

export type ActivityEntry = {
  at: string;
  kind: "answer" | "instant";
  plan: string;
  answered: boolean;
  /** Model ids that answered; empty for instant replies and for rows written before models were recorded. */
  models: string[];
  /** True when the row predates model recording (so an empty list means "not recorded", not "none"). */
  modelsRecorded: boolean;
  durationMs: number;
};

export type LiveActivity = {
  generatedAt: string;
  last5m: number;
  today: number;
  /** Chats that got a model answer (not instant replies) in the same windows. */
  modelAnswers5m: number;
  modelAnswersToday: number;
  /** Per-model count of answers in the last 5 minutes (model ids only). */
  models5m: { model: string; answers: number }[];
  feed: ActivityEntry[];
  truncated: boolean;
};

/** Pure: build the response from request rows. Unit-tested, including that nothing but the fields above can leave. */
export function summarizeActivity(rows: RequestCostRow[], now = Date.now()): LiveActivity {
  const since5 = now - ACTIVITY_WINDOW_MS;
  const day = new Date(now).toISOString().slice(0, 10);
  const today = rows.filter((r) => r.at.slice(0, 10) === day);
  const recent = rows.filter((r) => Date.parse(r.at) >= since5);
  const counts = new Map<string, number>();
  for (const r of recent) if (r.kind === "answer" && r.answered) for (const m of r.answeredBy ?? []) counts.set(m, (counts.get(m) ?? 0) + 1);
  const feed = [...rows]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, FEED_LIMIT)
    .map((r): ActivityEntry => ({
      at: r.at,
      kind: r.kind,
      plan: r.plan,
      answered: r.answered,
      models: (r.answeredBy ?? []).filter((m) => typeof m === "string").slice(0, 6).map((m) => m.slice(0, 80)),
      modelsRecorded: r.kind === "instant" || Array.isArray(r.answeredBy),
      durationMs: Math.max(0, Math.round(r.durationMs || 0)),
    }));
  return {
    generatedAt: new Date(now).toISOString(),
    last5m: recent.length,
    today: today.length,
    modelAnswers5m: recent.filter((r) => r.kind === "answer" && r.answered).length,
    modelAnswersToday: today.filter((r) => r.kind === "answer" && r.answered).length,
    models5m: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([model, answers]) => ({ model, answers })),
    feed,
    truncated: false,
  };
}

const LIMIT = 20_000;
export async function liveActivity(now = Date.now()): Promise<LiveActivity> {
  const startOfDay = new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const rows = await collection<RequestCostRow>("system_request_costs").listSystemRange({ field: "at", gte: startOfDay }, LIMIT);
  const out = summarizeActivity(rows, now);
  out.truncated = rows.length >= LIMIT;
  return out;
}
