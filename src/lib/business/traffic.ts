/**
 * First-party page views for published sites (no cookies, no IPs stored), kept as per-day counters.
 *
 * Each counted view bumps up to three counter rows of its site and UTC day (an atomic upsert each; on Postgres one
 * INSERT ... ON CONFLICT DO UPDATE): the day's total (and its visitors, when this is the visitor's first view that day), the page's
 * count and, when there is one, the referring host's count. A busy site therefore holds a few rows per day instead of a row per view.
 * Rows older than KEEP_DAYS go in one bulk delete per collection (pruneOldViews), together with the legacy one-row-per-view records,
 * which readers still include until then.
 */
import { createHash } from "node:crypto";
import { now } from "@/lib/create/platform/ids";
import { pageViewCounts, pageViews } from "./repo";
import type { PageViewCount } from "./types";

export const KEEP_DAYS = 90;

const keyHash = (k: string) => createHash("sha256").update(k).digest("base64url").slice(0, 16);
export const countId = (projectId: string, day: string, kind: PageViewCount["kind"], key = "") => `${projectId}:${day}:${kind}${kind === "day" ? "" : `:${keyHash(key)}`}`;

export async function countView(input: { workspaceId: string; projectId: string; path: string; day?: string; ref?: string; newVisitor?: boolean }) {
  const day = input.day ?? now().slice(0, 10);
  const base = { workspaceId: input.workspaceId, projectId: input.projectId, day, at: `${day}T00:00:00.000Z`, views: 0, visitors: 0 };
  const bump = (kind: PageViewCount["kind"], key: string, deltas: Record<string, number>) => {
    const id = countId(input.projectId, day, kind, key);
    return pageViewCounts().increment(input.workspaceId, id, deltas, { ...base, id, kind, key });
  };
  await Promise.all([
    bump("day", "", input.newVisitor ? { views: 1, visitors: 1 } : { views: 1 }),
    bump("path", input.path.slice(0, 200), { views: 1 }),
    ...(input.ref ? [bump("ref", input.ref.slice(0, 60), { views: 1 })] : []),
  ]);
}

/** Legacy Create-project serving (src/lib/create/serve.ts): counts the home page, no visitor mark. */
export async function recordView(workspaceId: string, projectId: string, path: string) {
  await countView({ workspaceId, projectId, path });
}

/** Views per day for a workspace (all its sites) since `sinceDay` (YYYY-MM-DD): aggregates plus legacy per-view rows since `sinceIso`. */
export async function viewsByDay(workspaceId: string, sinceDay: string, sinceIso: string): Promise<Map<string, number>> {
  const [legacy, counts] = await Promise.all([
    // Legacy rows, counted by the store (never shipped row by row).
    pageViews().countBy(workspaceId, "day", { field: "at", gte: sinceIso }),
    // Counter rows: only the three small fields come back.
    pageViewCounts().listFields(workspaceId, ["kind", "day", "views"]),
  ]);
  const out = new Map(legacy);
  for (const r of counts) if (r.kind === "day" && r.day >= sinceDay) out.set(r.day, (out.get(r.day) ?? 0) + (Number(r.views) || 0));
  return out;
}

/**
 * Retention: every view counter and legacy view older than KEEP_DAYS, all sites at once, in one bulk delete per collection
 * (each capped at `batch` rows so it can never become a long query; the next run takes the rest).
 */
export async function pruneOldViews(at = Date.now(), batch = 20_000): Promise<{ counts: number; legacy: number }> {
  const cutoff = new Date(at - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const [counts, legacy] = await Promise.all([
    pageViewCounts().purgeSystemBefore("day", cutoff, batch),
    pageViews().purgeSystemBefore("day", cutoff, batch),
  ]);
  return { counts, legacy };
}

let lastPrune = 0;
/** At most once an hour per instance (owners opening their stats, the hourly retention trigger). Never throws. */
export async function maybePruneViews(at = Date.now()) {
  if (at - lastPrune < 3_600_000) return;
  lastPrune = at;
  await pruneOldViews(at).catch((e) => console.error("[traffic] prune failed:", e instanceof Error ? e.name : "error"));
}
export const resetViewPruneClock = () => {
  lastPrune = 0;
};

/** Everything counted for one site (site deletion). */
export async function deleteSiteViews(workspaceId: string, projectId: string) {
  for (const v of await pageViews().list(workspaceId, (x) => x.projectId === projectId)) await pageViews().remove(workspaceId, v.id);
  for (const c of await pageViewCounts().listFields(workspaceId, ["projectId"])) if (c.projectId === projectId) await pageViewCounts().remove(workspaceId, c.id);
}
