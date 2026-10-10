import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { sanitizeHourly, setControls, type ControlsPatch } from "@/lib/ops/controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOL = ["globalStop", "pauseMedia", "pauseAgents", "pausePayments"] as const;

/**
 * Kill switches. Admin only; the proxy already requires same-origin for POSTs.
 * Body: { globalStop?, pauseMedia?, pauseAgents?, pausePayments?, disabledProviders?: string[], disabledModels?: string[], clearAutoPause?: true, reason?: string }
 * Every change is written to the admin audit log (actor, what changed, why).
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:controls:${admin.email}`, 30);
    const b = await body<Record<string, unknown>>(req);
    const patch: ControlsPatch = {};
    const changes: string[] = [];
    for (const k of BOOL) if (b[k] !== undefined) {
      if (typeof b[k] !== "boolean") throw new HttpError(400, `${k} must be true or false.`);
      patch[k] = b[k] as boolean;
      changes.push(`${k}=${b[k]}`);
    }
    for (const k of ["disabledProviders", "disabledModels"] as const) if (b[k] !== undefined) {
      if (!Array.isArray(b[k]) || (b[k] as unknown[]).some((x) => typeof x !== "string")) throw new HttpError(400, `${k} must be a list of names.`);
      patch[k] = b[k] as string[];
      changes.push(`${k}=[${(b[k] as string[]).join(",")}]`);
    }
    if (b.hourly !== undefined) {
      patch.hourly = sanitizeHourly(b.hourly); // throws 400 on junk
      changes.push(`hourly=${JSON.stringify(patch.hourly).slice(0, 300)}`);
    }
    if (b.clearAutoPause === true) {
      patch.autoPauseUntil = null;
      changes.push("clearAutoPause");
    }
    if (!changes.length) throw new HttpError(400, "Nothing to change.");
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
    if (patch.globalStop === true && !reason) throw new HttpError(400, "Give a reason for the global stop (it is shown in the audit log).");
    if (reason) patch.reason = reason;
    const next = await setControls(patch, admin.email);
    await writeAudit(admin.email, "controls", `${changes.join("; ")}${reason ? ` — ${reason}` : ""}`);
    return json({ controls: next });
  } catch (e) {
    return errorResponse(e);
  }
}
