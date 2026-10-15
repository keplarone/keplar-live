/**
 * Admin only. GET: Keplar Core's dashboard data (quality, latency, cost and calibration by day; variants, canaries, evals,
 * gaps, proposals, change log). POST { action, ... }:
 *   kill / unkill          switch Core off (Ask runs exactly as before) / on
 *   freeze / unfreeze      use only the built-in prompts and stop promotions / resume
 *   rollback {target}      stop that target's canary, or restore the champion it replaced (one click)
 *   approve {id}           approve a candidate that passed evals: it becomes a canary (nothing learned serves traffic before this)
 *   promote {id}           promote a canary (the pipeline only marks it ready)   reject {id}   reject a candidate or canary
 *   canary {pct}           first share of traffic a canary gets (1-50%)
 *   approve-proposal / reject-proposal {id}   decide a code proposal (approval records the decision; code still goes through review)
 *   run                    run the daily pipeline now
 * Every action is written to the admin audit log and Core's change log.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { approveCandidate, CoreAdminError, dashboard, decideProposal, promote, rejectVariant, rollback, setCanaryPct, setFrozen, setKilled } from "@/lib/core/selfdev/admin";
import { runCorePipeline } from "@/lib/core/selfdev/pipeline";
import type { VariantTarget } from "@/lib/core/selfdev/types";
import { engineDeps } from "@/lib/orchestration/orchestrator";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json(await dashboard(Number(new URL(req.url).searchParams.get("days")) || 30));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:core:${admin.email}`, 30);
    const b = await body<{ action?: unknown; id?: unknown; target?: unknown; pct?: unknown; reason?: unknown }>(req);
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
    const id = typeof b.id === "string" ? b.id.slice(0, 80) : "";
    const act = String(b.action ?? "");
    let result: unknown = { ok: true };
    try {
      switch (act) {
        case "kill": await setKilled(true, admin.email, reason); break;
        case "unkill": await setKilled(false, admin.email, reason); break;
        case "freeze": await setFrozen(true, admin.email, reason); break;
        case "unfreeze": await setFrozen(false, admin.email, reason); break;
        case "rollback": await rollback(String(b.target ?? "") as VariantTarget, admin.email, reason); break;
        case "approve": await approveCandidate(id, admin.email); break;
        case "promote": await promote(id, admin.email); break;
        case "reject": await rejectVariant(id, admin.email); break;
        case "canary": await setCanaryPct(Number(b.pct), admin.email); break;
        case "approve-proposal": await decideProposal(id, true, admin.email); break;
        case "reject-proposal": await decideProposal(id, false, admin.email); break;
        case "run": result = { ok: true, report: await runCorePipeline({ deps: () => engineDeps({ keyTier: "free" }), deadline: Date.now() + 270_000 }) }; break;
        default: throw new HttpError(400, "Unknown action.", "invalid");
      }
    } catch (e) {
      if (e instanceof CoreAdminError) throw new HttpError(409, e.message, "conflict");
      throw e;
    }
    await writeAudit(admin.email, `core:${act}`, [id, typeof b.target === "string" ? b.target : "", reason].filter(Boolean).join(" · "));
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
