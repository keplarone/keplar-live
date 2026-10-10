import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite, listLeads, versionList } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export type ActivityEvent = { at: string; type: "created" | "version" | "published" | "lead" | "restore" | "style"; title: string; detail?: string; version?: number; units?: number };

/** Per-project activity: real timestamps from versions, publishing and leads. Nothing is inferred. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const site = await getSite(ws, (await params).id);
    const [versions, leads] = await Promise.all([versionList(site), listLeads(site, 25)]);
    const events: ActivityEvent[] = [{ at: site.createdAt, type: "created", title: site.duplicatedFrom ? "Copied from another site" : "Project created" }];
    for (const v of versions) {
      events.push({
        at: v.createdAt,
        type: v.kind === "restore" ? "restore" : /style to/i.test(v.summary) ? "style" : "version",
        title: `v${v.n} · ${v.kind === "ai" ? (v.prompt ? "Built by Keplar" : "Built by Keplar") : v.kind === "restore" ? "Restored" : v.kind === "template" ? "Started from template" : "Edited"}`,
        detail: v.summary,
        version: v.n,
        units: v.units || undefined,
      });
    }
    if (site.publishedAt && site.publishedVersion !== null) events.push({ at: site.publishedAt, type: "published", title: `Published v${site.publishedVersion}`, detail: `/s/${site.slug}` });
    for (const l of leads) events.push({ at: l.createdAt, type: "lead", title: "New message from the site", detail: l.email ?? l.page });
    events.sort((a, b) => b.at.localeCompare(a.at));
    return json({ events: events.slice(0, 80), versions: versions.map((v) => ({ n: v.n, kind: v.kind, summary: v.summary, createdAt: v.createdAt, units: v.units, pages: v.pages, bytes: v.bytes, lint: v.lint ?? null })), leadCount: site.leadCount });
  } catch (e) {
    return errorResponse(e);
  }
}
