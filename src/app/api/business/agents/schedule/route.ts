/**
 * Agent schedules.
 * GET: the current workspace's scheduled agents with their next run (UTC) and the driver.
 * POST: run one scheduler tick in-process (mock mode only; production uses the Inngest
 *   cron at /api/inngest). Cross-tenant, so it needs KEPLAR_DEV_TOOLS=1 (or `next dev`)
 *   or `Authorization: Bearer $KEPLAR_ADMIN_TOKEN`. Body (optional):
 *   { at?: ISO time (dev tools only), windowMinutes?: number }.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { inngestEnabled } from "@/lib/inngest/client";
import { nextRunFor, tick } from "@/lib/business/scheduler";
import { owner } from "../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const driver = () => (inngestEnabled() ? "inngest" : "local");

export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json({ driver: driver(), agents: await nextRunFor(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const token = process.env.KEPLAR_ADMIN_TOKEN?.trim();
    const admin = Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
    if (!admin && !devToolsEnabled()) throw new HttpError(403, "Scheduler tick needs dev tools or the admin token.", "forbidden");
    if (inngestEnabled()) throw new HttpError(409, "Inngest is enabled; schedules run from its cron function.", "inngest_enabled");
    const b = (await req.json().catch(() => ({}))) as { at?: string; windowMinutes?: number };
    const at = b.at && devToolsEnabled() ? new Date(b.at) : new Date();
    if (Number.isNaN(at.getTime())) throw new HttpError(400, "Invalid `at`.");
    const windowMinutes = typeof b.windowMinutes === "number" ? Math.min(Math.max(1, Math.floor(b.windowMinutes)), 24 * 60) : undefined;
    return json(await tick(at, { windowMinutes }));
  } catch (e) {
    return errorResponse(e);
  }
}
