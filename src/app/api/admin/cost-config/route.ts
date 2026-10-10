/**
 * Admin-only cost-guard controls (404 for everyone else).
 *   GET    current merged config, stored overrides, active throttles, balance state
 *   PUT    merge a config patch (flags, kill switches, quotas, multipliers, thresholds); invalid fields are dropped and listed
 *   POST   { action: "throttle" | "clear_throttle", feature, hours? } | { action: "run_watch" } | { action: "clear_balance_exhausted" }
 * Every change is written to the audit log.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { writeAudit } from "@/lib/ops/audit";
import { costConfig, costConfigOverrides, saveCostConfigPatch } from "@/lib/cost/config";
import { activeThrottles, clearBalanceExhausted, clearThrottle, guardState, setThrottle } from "@/lib/cost/guard";
import { isFeature } from "@/lib/cost/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const [config, overrides, throttles, st] = await Promise.all([costConfig(), costConfigOverrides(), activeThrottles(), guardState()]);
    return json({ config, overrides, throttles, balanceExhausted: st.exhausted, exhaustedSince: st.exhaustedSince });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:${admin.email}:cost-config`, 30, 60);
    const patch = await body<unknown>(req);
    const { config, rejected } = await saveCostConfigPatch(patch, admin.email);
    await writeAudit(admin.email, "cost_config", JSON.stringify(patch).slice(0, 600));
    return json({ ok: true, config, rejected });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:${admin.email}:cost-config`, 30, 60);
    const b = await body<{ action?: string; feature?: string; hours?: number; mode?: "free_models" | "block" }>(req);
    if (b.action === "throttle" || b.action === "clear_throttle") {
      if (!isFeature(b.feature)) throw new HttpError(400, "Unknown feature.");
      if (b.action === "clear_throttle") await clearThrottle(b.feature);
      else {
        const hours = Math.max(1, Math.min(720, Number(b.hours) || 24));
        const until = new Date(Date.now() + hours * 3600_000).toISOString();
        await setThrottle(b.feature, { action: b.mode === "block" ? "block" : "free_models", until, reason: "Set by an admin", at: new Date().toISOString(), by: admin.email });
      }
      await writeAudit(admin.email, b.action, `${b.feature}${b.action === "throttle" ? ` ${b.mode ?? "free_models"} ${b.hours ?? 24}h` : ""}`);
      return json({ ok: true, throttles: await activeThrottles() });
    }
    if (b.action === "clear_balance_exhausted") {
      await clearBalanceExhausted();
      await writeAudit(admin.email, "clear_balance_exhausted", "");
      return json({ ok: true });
    }
    if (b.action === "run_watch") {
      const { runCostWatch } = await import("@/lib/cost/watch");
      const r = await runCostWatch({ trigger: "admin" });
      await writeAudit(admin.email, "cost_watch", r ? `${r.balance}; ${r.margin}; throttled ${r.throttled.join(",") || "none"}` : "");
      return json({ ok: true, result: r });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errorResponse(e);
  }
}
