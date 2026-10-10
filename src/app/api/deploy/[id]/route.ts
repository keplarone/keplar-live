/**
 * One-click deploy for a creation.
 * GET  → live status (URL, version, SSL), every retained version with its own preview URL and rollback eligibility, and the
 *        deploy history with timestamped step logs.
 * POST { version? } → deploys that version (default: latest) and streams the deploy record after every step (NDJSON).
 *        A version that was live before takes the fast rollback path. Owners and team admins only.
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { workspaceById } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import { purgeSiteCaches } from "@/lib/site-builder/revalidate";
import { seedBlogs } from "@/lib/site-builder/features/blog";
import { seedCollections } from "@/lib/site-builder/features/data";
import { appCtx } from "@/lib/app-runtime/context";
import { seedLiveIfEmpty } from "@/lib/app-runtime/data";
import { assertCan } from "@/lib/collab/access";
import { access } from "@/lib/collab/caller";
import { collabCan } from "@/lib/collab/roles";
import { deployOverview, runDeploy, type DeployHooks } from "@/lib/deploy/service";
import { GET as serveLive } from "@/app/s/[slug]/[[...path]]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { access: a } = await access(req, (await params).id);
    const o = await deployOverview(a.site, new URL(req.url).origin);
    return json({ ...o, canDeploy: collabCan(a.role, "deploy") });
  } catch (e) {
    return errorResponse(e);
  }
}

const hooks = (plan: Awaited<ReturnType<typeof siteOwnerPlan>>): DeployHooks => ({
  purge: async (site, files) => (await purgeSiteCaches(site, files)).length,
  afterPromote: async (site, files) => {
    if (site.kind === "app") {
      const ctx = appCtx(site, "live", plan);
      if (ctx?.limits.backend) await seedLiveIfEmpty(ctx);
      return;
    }
    await seedBlogs(site, files).catch(() => undefined);
    await seedCollections(site, files).catch(() => undefined);
  },
  // The real live route, called in-process: proves the published pointer, the renderer and the data all line up.
  verify: async (site, url) => {
    const t = Date.now();
    const u = new URL(url);
    try {
      const res = await serveLive(new Request(u.toString(), { headers: { host: u.host, accept: "text/html" } }), { params: Promise.resolve({ slug: site.slug, path: [] }) });
      const text = await res.text();
      const ok = res.status === 200 && /<html|<!doctype/i.test(text);
      return { ok, status: res.status, ms: Date.now() - t, note: ok ? undefined : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) };
    } catch (e) {
      return { ok: false, status: 0, ms: Date.now() - t, note: (e as Error).message.slice(0, 80) };
    }
  },
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a, user } = await access(req, (await params).id);
    assertCan(a, "deploy");
    await rateLimit(`deploy:${a.site.id}`, 12, 600, { shared: true });
    const input = await body<{ version?: number }>(req).catch(() => ({}) as { version?: number });
    const owner = await workspaceById(a.site.workspaceId);
    if (!owner) throw new HttpError(404, "Not found.", "not_found");
    const plan = await siteOwnerPlan(a.site.workspaceId);
    const ws = { ...owner, verified: user.verified };
    const origin = new URL(req.url).origin;
    const gen = runDeploy(ws, a.site, { version: Number(input.version) || undefined, by: user.id, byName: user.name, origin, plan, hooks: hooks(plan) });
    // Surface "can't start" errors (busy, unverified) as a normal JSON error before streaming begins.
    const first = await gen.next();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        const send = (o: unknown) => { try { ctl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* closed */ } };
        try {
          if (!first.done) send({ t: "deploy", deploy: first.value });
          for (;;) {
            const n = await gen.next();
            if (n.done) { send({ t: "done", deploy: n.value }); break; }
            send({ t: "deploy", deploy: n.value });
          }
        } catch (e) {
          send({ t: "error", error: e instanceof HttpError ? e.message : "The deploy stream stopped." });
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
