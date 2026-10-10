/** One app project: status for the builder (GET), owner settings (PATCH). */
import { errorResponse, json, body, HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { now } from "@/lib/create/platform/ids";
import { getSite, sites, toSummary, versionList } from "@/lib/site-builder/store";
import { builds, failStaleBuild } from "@/lib/app-builder/pipeline";
import { previewUrlFor, publicSpec } from "@/lib/app-builder/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const site = await getSite(ws, (await params).id);
    const origin = new URL(req.url).origin;
    let recent = (await builds().list(ws.id, (b) => b.siteId === site.id)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
    if (recent) recent = await failStaleBuild(recent);
    const app = site.app;
    return json({
      app: {
        ...toSummary(site, origin),
        kind: site.kind ?? "site",
        spec: app ? publicSpec(app.spec) : null,
        design: app?.design ?? null,
        settings: app?.settings ?? null,
        admins: app?.admins ?? [],
        report: app?.report ?? null,
        images: app?.images ?? {},
        previewUrl: site.headVersion && app ? previewUrlFor(site, site.headVersion) : null,
        liveUrl: site.publishedVersion ? `${origin}/s/${site.slug}/` : null,
        messages: site.messages.slice(-30),
      },
      build: recent && recent.stage !== "done" ? { id: recent.id, stage: recent.stage, error: recent.error, startedAt: recent.startedAt, updatedAt: recent.updatedAt, spec: recent.spec ? publicSpec(recent.spec) : null, checks: recent.checks, verdicts: recent.verdicts, log: recent.log.slice(-12) } : null,
      versions: (await versionList(site)).slice(0, 30),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`apps:settings:${ws.id}`, 30, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    if (!site.app) throw new HttpError(400, "Build the app first.");
    const input = await body<{ settings?: { signups?: unknown; ai?: unknown; uploads?: unknown }; admins?: unknown }>(req);
    const settings = { ...site.app.settings };
    for (const k of ["signups", "ai", "uploads"] as const) if (typeof input.settings?.[k] === "boolean") settings[k] = input.settings[k] as boolean;
    let admins = site.app.admins;
    if (Array.isArray(input.admins)) {
      admins = [...new Set(input.admins.map((a) => String(a).trim().toLowerCase()).filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)))].slice(0, 10);
      if (!admins.length && ws.email) admins = [ws.email.toLowerCase()];
    }
    const updated = await sites().update(ws.id, site.id, { app: { ...site.app, settings, admins }, updatedAt: now() });
    return json({ settings: updated?.app?.settings ?? settings, admins: updated?.app?.admins ?? admins });
  } catch (e) {
    return errorResponse(e);
  }
}
