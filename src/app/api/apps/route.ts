/** Keplar Apps: list app projects with the builder's configuration (GET), create an app project (POST). */
import { breakerLevel } from "@/lib/create/platform/breaker";
import { meter } from "@/lib/create/platform/compute";
import { errorResponse, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { createSite, listSites, sites, toSummary } from "@/lib/site-builder/store";
import { FONT_PAIRINGS, STYLES } from "@/lib/app-builder/design/presets";
import { APP_BUILD_LIMITS, chainFor } from "@/lib/app-builder/models";
import { buildEstimateUnits, buildMaxUnits, previewUrlFor } from "@/lib/app-builder/public";
import { now } from "@/lib/create/platform/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The app's palette and display face, so the studio can draw a poster for an app the tester has no screenshot of. */
function lookOf(d: { style: string; mode: "light" | "dark"; palette?: { bg: string; surface: string; ink: string; accent: string } | null; fonts: string } | undefined) {
  if (!d) return null;
  const st = STYLES.find((x) => x.id === d.style) ?? STYLES[0];
  const p = d.palette ?? (d.mode === "dark" ? st.dark : st.light);
  const f = FONT_PAIRINGS.find((x) => x.id === d.fonts) ?? FONT_PAIRINGS.find((x) => x.id === st.fonts);
  return { bg: p.bg, surface: p.surface, ink: p.ink, accent: p.accent, display: f?.display ?? "inherit", mode: d.mode };
}

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const origin = new URL(req.url).origin;
    const [rows, m, level] = await Promise.all([listSites(ws), meter(ws), breakerLevel()]);
    const L = APP_BUILD_LIMITS[ws.plan];
    return json({
      apps: rows.filter((s) => s.kind === "app").map((s) => ({ ...toSummary(s, origin), appName: s.app?.spec.name ?? s.name, kind: s.app?.spec.kind ?? null, previewUrl: s.headVersion && s.app ? previewUrlFor(s, s.headVersion) : null, thumb: s.app?.report?.shots?.[0]?.url ?? null, look: lookOf(s.app?.design), liveUrl: s.publishedVersion ? `${origin}/s/${s.slug}/` : null })),
      config: {
        plan: ws.plan,
        planLabel: ws.entitlements.label,
        verified: ws.verified,
        maxProjects: ws.entitlements.projects,
        projects: rows.length,
        model: chainFor(ws.plan, "code", level)[0].label,
        estimateUnits: buildEstimateUnits(ws.plan),
        maxUnits: buildMaxUnits(ws.plan),
        limits: { files: L.maxFiles, pages: L.maxPages, collections: L.collections, backend: L.backend, ai: L.ai, images: L.images, fixAttempts: L.fixAttempts, visual: L.visualPass },
        styles: STYLES.map((s) => ({ id: s.id, name: s.name, line: s.line, light: s.light, dark: s.dark, fonts: s.fonts, shape: s.shape, density: s.density, motion: s.motion })),
        fonts: FONT_PAIRINGS.map((f) => ({ id: f.id, name: f.name, display: f.displayName, body: f.bodyName, google: f.google, displayStack: f.display, bodyStack: f.body })),
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
    await rateLimit(`apps:create:${ws.id}`, 10, 60, { shared: true });
    const input = await body<{ name?: string }>(req);
    const site = await createSite(ws, { name: input.name || "New app" });
    const updated = (await sites().update(ws.id, site.id, { kind: "app", updatedAt: now() })) ?? { ...site, kind: "app" as const };
    return json({ app: toSummary(updated, new URL(req.url).origin) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
