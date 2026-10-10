import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: string; workspaceId: string; label: string; usdMonthly: number; from: string; to?: string | null };
const rows = () => collection<Row>("ops_fixed_costs");

/** Admin only. The business's own fixed costs (hosting, database, email, domains...) so "Net profit" on the card can be computed. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json({ costs: (await rows().listSystem()).map(({ id: i, label, usdMonthly, from, to }) => ({ id: i, label, usdMonthly, from, to: to ?? null })) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST { label, usdMonthly, from: "YYYY-MM-DD", to?: "YYYY-MM-DD" } adds a cost; { remove: id } deletes one. Audited. */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:fixedcosts:${admin.email}`, 30);
    const b = await body<{ label?: unknown; usdMonthly?: unknown; from?: unknown; to?: unknown; remove?: unknown }>(req);
    if (typeof b.remove === "string") {
      const ok = await rows().remove("system", b.remove);
      await writeAudit(admin.email, "fixed_cost.remove", b.remove);
      return json({ ok });
    }
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 60) : "";
    const usd = typeof b.usdMonthly === "number" ? b.usdMonthly : NaN;
    const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null);
    const from = date(b.from);
    const to = b.to === undefined || b.to === null || b.to === "" ? null : date(b.to);
    if (!label || !Number.isFinite(usd) || usd < 0 || usd > 1_000_000 || !from || (b.to && !to)) throw new HttpError(400, "Send a label, a monthly USD amount and a start date (YYYY-MM-DD).");
    const row: Row = { id: id("fc"), workspaceId: "system", label, usdMonthly: Math.round(usd * 100) / 100, from, to };
    await rows().insert(row);
    await writeAudit(admin.email, "fixed_cost.add", `${label} $${row.usdMonthly}/mo from ${from}`);
    return json({ ok: true, id: row.id });
  } catch (e) {
    return errorResponse(e);
  }
}
