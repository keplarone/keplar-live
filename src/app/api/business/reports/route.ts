import { assertSameOrigin } from "@/lib/security/origin";
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { requireBusiness } from "@/lib/business/require";
import { reportsStore, saveReport } from "@/lib/business/reports";

export const runtime = "nodejs";

/** Saved Deep Research and Reason reports, newest first (?kind=research|reason). Lists carry no report bodies. */
export async function GET(req: Request) {
  try {
    const ws = await requireBusiness(req);
    const kind = new URL(req.url).searchParams.get("kind");
    const list = await reportsStore().list(ws.id, (r) => !kind || r.kind === kind);
    return json({ reports: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200).map((r) => ({ id: r.id, kind: r.kind, title: r.title, template: r.template, projectId: r.projectId, sources: r.sources.length, createdAt: r.createdAt })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    const r = await saveReport(ws.id, await body<Record<string, unknown>>(req));
    return json({ report: { id: r.id, title: r.title, createdAt: r.createdAt } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
