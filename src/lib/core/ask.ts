/**
 * Glue between POST /api/keplar and Keplar Core: who is asking, where outcomes are recorded, where paused work is saved.
 * Kept out of the route so the route's change stays one line.
 */
import type { KeplarRequest } from "@/lib/orchestration/types";
import { categoryOf } from "@/lib/learning/record";
import { saveJob } from "./jobs";
import type { CoreRunOpts, CoreTurn } from "./run";
import { getPrefs } from "./selfdev/repo";
import { recordTurn } from "./selfdev/outcomes";

type Ws = { id: string; anonymous: boolean; plan: string; team?: unknown; via?: string };

export function tagsOf(t: CoreTurn): string[] {
  const n = t.assessment.needs;
  const tags = [
    ...(n.math ? ["needs:math"] : []), ...(n.code ? ["needs:code"] : []), ...(n.web ? ["needs:web"] : []), ...(n.multiStep ? ["multi-step"] : []), ...(n.longContext ? ["long-context"] : []),
    ...t.assessment.domains.map((d) => `domain:${d}`),
    `confidence:${t.answer.core?.confidence.level ?? "unknown"}`,
  ];
  if (n.web && !t.answer.core?.steps.some((s) => s.kind === "search" && s.check)) tags.push("tool:search-unavailable");
  if (t.answer.core?.checks.some((c) => c.kind === "execution" && c.outcome === "failed")) tags.push("tool:execution-failed");
  if (t.stoppedBy === "budget" || t.stoppedBy === "time") tags.push(`stopped:${t.stoppedBy}`);
  return tags;
}

export function coreRunOpts(i: { ws: Ws; req: KeplarRequest; askedPrompt: string; noPersonal: boolean; defer: (p: Promise<unknown>) => void }): CoreRunOpts {
  const { ws } = i;
  const personal = !ws.anonymous && !i.noPersonal;
  return {
    workspaceId: ws.id,
    anonymous: ws.anonymous,
    defer: i.defer,
    onTurn: (t) => {
      i.defer(recordTurn({
        workspaceId: ws.id, anonymous: ws.anonymous, answerId: t.answer.id, prompt: i.askedPrompt, plan: ws.plan,
        category: categoryOf(t.assessment.classification), depth: t.depth, escalated: t.escalated, variants: t.picked.ids,
        confidence: t.answer.core?.confidence.score ?? 0.5, criticScore: t.criticScore, latencyMs: t.latencyMs, calls: t.calls,
        units: t.answer.compute.units, stoppedBy: t.stoppedBy, checksFailed: t.checksFailed, tags: tagsOf(t),
      }));
    },
    ...(personal ? { saveJob: (w) => saveJob(ws.id, w), brevity: async () => (await getPrefs(ws.id)).brevity } : {}),
  };
}
