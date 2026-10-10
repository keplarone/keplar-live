import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite, listLeads } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const site = await getSite(ws, (await params).id);
    const rows = await listLeads(site, 1000);
    if (new URL(req.url).searchParams.get("format") === "csv") {
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r.fields)))].slice(0, 20);
      const csv = [["received", "page", ...cols].map(csvCell).join(","), ...rows.map((r) => [r.createdAt, r.page, ...cols.map((c) => r.fields[c] ?? "")].map(csvCell).join(","))].join("\n");
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${site.slug}-leads.csv"`, "cache-control": "no-store" } });
    }
    return json({ leads: rows.slice(0, 200), total: site.leadCount });
  } catch (e) {
    return errorResponse(e);
  }
}
