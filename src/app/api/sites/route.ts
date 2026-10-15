import { keepAlive } from "@/lib/create/platform/after";
import { breakerLevel, BREAKER_NOTICE } from "@/lib/create/platform/breaker";
import { meter } from "@/lib/create/platform/compute";
import { errorResponse, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { builderConfigured } from "@/lib/site-builder/job";
import { BUILDER_LIMITS, modelChain } from "@/lib/site-builder/limits";
import { DIRECTIONS } from "@/lib/site-builder/design";
import { previewToken } from "@/lib/site-builder/render";
import { purgeDueSites } from "@/lib/site-builder/deletion";
import { createSite, listSites, toSummary } from "@/lib/site-builder/store";
import { TEMPLATES } from "@/lib/site-builder/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const origin = new URL(req.url).origin;
    keepAlive(() => purgeDueSites({ workspaceId: ws.id }), "site purge"); // backstop for deletes whose finalize call never arrived; after the response
    const [rows, m, level] = await Promise.all([listSites(ws), meter(ws), breakerLevel()]);
    const L = BUILDER_LIMITS[ws.plan];
    return json({
      sites: rows.map((s) => ({ ...toSummary(s, origin), thumbUrl: s.headVersion ? `/sites/draft/${s.id}/${s.headVersion}?t=${previewToken(s.id)}&thumb=1` : null })),
      config: {
        ready: builderConfigured(),
        plan: ws.plan,
        planLabel: ws.entitlements.label,
        verified: ws.verified,
        maxSites: ws.entitlements.projects,
        limits: { promptChars: L.promptChars, pages: L.pages, siteKB: Math.round(L.siteBytes / 1024), jobsPerDay: L.jobsPerDay, concurrent: L.concurrent },
        model: modelChain(ws.plan, level)[0].label,
        textOnly: ws.plan === "free",
        templates: TEMPLATES,
        directions: DIRECTIONS.map((d) => ({ id: d.id, name: d.name, tagline: d.tagline, swatch: d.swatch, mode: d.mode, display: d.fonts.displayName, body: d.fonts.bodyName, effect: d.effect })),
        breakerNotice: BREAKER_NOTICE[level],
      },
      meter: m,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:create:${ws.id}`, 10, 60, { shared: true });
    const input = await body<{ name?: string; template?: string }>(req);
    const site = await createSite(ws, { name: input.name, template: input.template && TEMPLATES.some((t) => t.id === input.template) ? input.template : undefined });
    return json({ site: toSummary(site, new URL(req.url).origin) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
