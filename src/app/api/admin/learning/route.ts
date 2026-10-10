import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { approve, LearningAdminError, reject, restoreVersion, rollbackActive, setFrozen } from "@/lib/learning/admin";
import { liveRosters } from "@/lib/learning/rosters";
import { runNightly } from "@/lib/learning/pipeline";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { EVAL_SET } from "../../../../../tests/fixtures/eval-set";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Admin only (the proxy also requires same-origin for POSTs). Body: { action, version?, reason? }
 *   rollback          put the previous policy (or the plain baseline) back, now
 *   approve / reject  decide a large proposal that is waiting for an admin (approve re-runs the safety checks)
 *   restore           re-activate an earlier version (safety checks re-run)
 *   freeze / unfreeze stop applying anything learned (the router is exactly the baseline) / resume
 *   run               run the nightly job now; { dry: true } evaluates without saving anything
 * Every action is written to the admin audit log with who and why.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:learning:${admin.email}`, 20);
    const b = await body<{ action?: unknown; version?: unknown; reason?: unknown; dry?: unknown }>(req);
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
    const version = typeof b.version === "number" && Number.isInteger(b.version) ? b.version : 0;
    const act = String(b.action ?? "");
    let result: unknown = { ok: true };
    switch (act) {
      case "rollback":
        result = { ok: true, ...(await rollbackActive(admin.email, reason)) };
        break;
      case "approve":
        await approve(version, admin.email, liveRosters(), EVAL_SET);
        break;
      case "reject":
        await reject(version, admin.email);
        break;
      case "restore":
        await restoreVersion(version, admin.email, liveRosters(), EVAL_SET);
        break;
      case "freeze":
      case "unfreeze":
        await setFrozen(act === "freeze");
        break;
      case "run":
        result = { ok: true, ...(await runNightly({ rosters: liveRosters(), evalSet: EVAL_SET, dryRun: b.dry === true })) };
        break;
      default:
        throw new HttpError(400, "Unknown action.", "invalid");
    }
    await writeAudit(admin.email, `learning:${act}`, `${version ? `v${version}` : ""}${reason ? ` — ${reason}` : ""}`.trim());
    return json(result);
  } catch (e) {
    if (e instanceof LearningAdminError) return json({ error: e.message, code: "learning" }, { status: e.status });
    return errorResponse(e);
  }
}
