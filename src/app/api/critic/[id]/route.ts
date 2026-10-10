/**
 * AI Critic for one creation.
 * GET  ?v=<n>|live&quick=1 → the stored report for that version (quick=1 runs the instant rule pass when none exists yet).
 * POST { version?, live?, ai?, axe? } → NDJSON stream: each pass as it runs (rules, axe-core in Chromium, model), then the report.
 * Who: anyone who can see the creation can read reports; editors and up can run the critic (owner, team, or invited editor).
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import { assertCan } from "@/lib/collab/access";
import { access } from "@/lib/collab/caller";
import { liveFiles, openRoom } from "@/lib/collab/session";
import { critique, getReport, quickReport } from "@/lib/critic/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { access: a } = await access(req, (await params).id);
    const u = new URL(req.url);
    const raw = u.searchParams.get("v");
    const v = raw === "live" ? "live" : Number(raw) || a.site.headVersion;
    if (!a.site.headVersion) return json({ report: null });
    let report = await getReport(a.site, v);
    if (!report && v !== "live" && u.searchParams.get("quick") === "1") report = await quickReport(a.site, v);
    return json({ report, headVersion: a.site.headVersion, publishedVersion: a.site.publishedVersion });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a, user } = await access(req, (await params).id);
    assertCan(a, "run");
    await rateLimit(`critic:run:${user.id}`, 12, 600, { shared: true });
    const input = await body<{ version?: number; live?: boolean; ai?: boolean; axe?: boolean }>(req);
    const plan = await siteOwnerPlan(a.site.workspaceId);
    let files: Record<string, string> | undefined;
    let version = Number(input.version) || a.site.headVersion;
    if (input.live) {
      const room = await openRoom(a.site);
      files = (await liveFiles(a.site.id)) ?? undefined;
      version = room.base;
    }
    if (!version) throw new HttpError(400, "Build something first.");
    const started = Date.now();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        const send = (o: unknown) => { try { ctl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* closed */ } };
        try {
          for await (const ev of critique(a.site, { version, files, live: Boolean(input.live), ai: input.ai !== false, axe: input.axe !== false, plan, deadline: started + 105_000 })) send(ev);
        } catch (e) {
          send({ t: "error", error: e instanceof HttpError ? e.message : "The critic stopped unexpectedly." });
          if (!(e instanceof HttpError)) console.error("[critic]", e);
        } finally {
          ctl.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform" } });
  } catch (e) {
    return errorResponse(e);
  }
}
