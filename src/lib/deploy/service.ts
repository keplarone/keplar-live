/**
 * One-click deploy, rollback (promote any retained version) and deploy logs, on top of Keplar's existing publishing: a live
 * creation is served from keplar.one/s/<slug> (TLS managed by Vercel) and from any custom domain attached to it (Vercel
 * Domains API + DNS verification in src/lib/domains). "Deploying" a version runs the same checks as Publish, swaps the
 * site's published pointer atomically, purges the edge cache and verifies the live route renders, logging every step.
 */
import { createHash } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import type { PlanId } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import { scanAppCode } from "@/lib/app-builder/files";
import { previewUrlFor } from "@/lib/app-builder/public";
import { getVersion, isDeleted, sites, versionList } from "@/lib/site-builder/store";
import { previewToken } from "@/lib/site-builder/render";
import { scanFiles } from "@/lib/site-builder/safety";
import type { Site } from "@/lib/site-builder/types";
import { normalizeFor } from "@/lib/collab/session";
import { getReport, quickReport } from "@/lib/critic/service";
import { createDeploy, isStale, kindFor, liveOf, reduce, rollbackTargets, type Deploy, type DeployEvent, type DeployKind, type StepId } from "./machine";

export const deploys = () => collection<Deploy>("sb_deploys");

export type VerifyFn = (site: Site, url: string) => Promise<{ ok: boolean; status: number; ms: number; note?: string }>;
export type DeployHooks = { verify: VerifyFn; purge: (site: Site, files: Record<string, string>) => Promise<number>; afterPromote?: (site: Site, files: Record<string, string>) => Promise<void> };

export async function listDeploys(site: Pick<Site, "id" | "workspaceId">, limit = 40): Promise<Deploy[]> {
  const all = (await deploys().list(site.workspaceId, (d) => d.siteId === site.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // A function that died mid-deploy leaves a running record; show it as failed instead of spinning forever.
  const t = Date.now();
  for (const d of all) {
    if (!isStale(d, t)) continue;
    const failed = reduce(d, { type: "fail", error: "The deploy stopped reporting (the server restarted). Nothing was changed after the last finished step." }, now());
    await deploys().update(d.workspaceId, d.id, failed).catch(() => undefined);
    Object.assign(d, failed);
  }
  return all.slice(0, limit);
}

export const liveUrlOf = (site: Pick<Site, "slug">, origin: string) => `${origin}/s/${site.slug}/`;

export function previewOf(site: Pick<Site, "id" | "kind" | "app">, n: number) {
  return site.kind === "app" && site.app ? previewUrlFor(site, n) : `/sites/draft/${site.id}/${n}?t=${previewToken(site.id)}`;
}

/** Everything the Deploy panel shows. */
export async function deployOverview(site: Site, origin: string) {
  const history = await listDeploys(site);
  const versions = (await versionList(site)).slice(0, 30);
  const live = liveOf(history);
  const liveVersion = site.publishedVersion;
  const targets = rollbackTargets(versions.map((v) => v.n), history, liveVersion);
  return {
    site: { id: site.id, name: site.name, slug: site.slug, kind: site.kind ?? "site", headVersion: site.headVersion, publishedVersion: liveVersion, publishedAt: site.publishedAt, needsReview: site.needsReview, takenDown: site.takenDown },
    live: liveVersion !== null ? { version: liveVersion, url: liveUrlOf(site, origin), deployId: live && live.version === liveVersion ? live.id : null, at: site.publishedAt, legacy: !live || live.version !== liveVersion } : null,
    versions: versions.map((v) => ({ n: v.n, summary: v.summary, kind: v.kind, createdAt: v.createdAt, bytes: v.bytes, previewUrl: previewOf(site, v.n), ...targets.find((t) => t.version === v.n) })),
    deploys: history,
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Runs one deploy, yielding the deploy record after every change (the route streams these). Fails closed: any error before
 * "promote" leaves the live site untouched; the pointer swap is a single row update.
 */
export async function* runDeploy(ws: Workspace, site0: Site, o: { version?: number; by: string; byName: string; origin: string; plan: PlanId; hooks: DeployHooks; kind?: DeployKind }): AsyncGenerator<Deploy, Deploy> {
  if (!ws.verified) throw new HttpError(403, "Verify your email address before deploying.", "unverified");
  if (site0.takenDown) throw new HttpError(451, "This creation was taken down for breaking the terms. Contact support.", "taken_down");
  const history = await listDeploys(site0, 100);
  if (history.some((d) => d.status === "running" || d.status === "queued")) throw new HttpError(409, "A deploy is already running for this creation. Watch it finish, then try again.", "busy");
  const version = o.version ?? site0.headVersion;
  if (!version) throw new HttpError(400, "Build something first.");
  const kind = o.kind ?? kindFor(version, history);
  let d = createDeploy({ id: newId("dpl"), workspaceId: site0.workspaceId, siteId: site0.id, kind, version, fromVersion: site0.publishedVersion, by: o.by, byName: o.byName, at: now() });
  await deploys().insert(d);
  const apply = async (ev: DeployEvent, persist = true) => {
    d = reduce(d, ev, now());
    if (persist) await deploys().update(d.workspaceId, d.id, d).catch(() => undefined);
    return d;
  };
  const step = async function* (id: StepId, fn: (log: (t: string, l?: "info" | "ok" | "warn" | "error") => Promise<void>) => Promise<"ok" | "warn" | "skipped">) {
    yield await apply({ type: "step-start", step: id });
    const pending: Deploy[] = [];
    const log = async (text: string, level: "info" | "ok" | "warn" | "error" = "info") => { pending.push(await apply({ type: "log", step: id, text, level }, false)); };
    const state = await fn(log);
    for (const p of pending.splice(0)) yield p;
    yield await apply({ type: "step-end", step: id, state });
  };

  let site = site0;
  let files: Record<string, string> = {};
  try {
    yield await apply({ type: "start" });

    yield* step("resolve", async (log) => {
      const v = await getVersion(site, version);
      if (!v) throw new HttpError(404, `Version ${version} isn't kept any more (older versions are pruned by plan).`, "not_found");
      files = v.files;
      const bytes = Object.values(files).reduce((a, x) => a + Buffer.byteLength(x), 0);
      await log(`v${version} · ${Object.keys(files).length} files · ${(bytes / 1024).toFixed(1)} KB`);
      if (v.summary) await log(`“${v.summary.slice(0, 140)}”`);
      await log(kind === "rollback" ? `Rollback: v${version} was live before, re-checks skipped` : site.publishedVersion ? `Replacing live v${site.publishedVersion}` : "First deploy of this creation", "ok");
      return "ok";
    });

    yield* step("validate", async (log) => {
      const published = (await sites().list(ws.id, (s) => s.publishedVersion !== null && s.id !== site.id && !isDeleted(s))).length;
      const max = ws.plan === "free" ? 1 : ws.entitlements.projects;
      if (site.publishedVersion === null && published >= max) throw new HttpError(402, `Your plan can have ${max} creation${max === 1 ? "" : "s"} live at once. Unpublish another first${ws.plan === "free" ? " or upgrade" : ""}.`, "entitlement");
      const canon = normalizeFor(site, o.plan, files);
      const changed = Object.keys(canon).filter((k) => canon[k] !== files[k]).length;
      await log(changed ? `Sanitizer normalized ${changed} file${changed === 1 ? "" : "s"} (unsafe markup removed)` : "Every file passes the sanitizer unchanged", changed ? "warn" : "ok");
      files = canon;
      if (site.kind === "app") {
        const abuse = scanAppCode(files);
        if (abuse) throw new HttpError(422, `This app can't go live: ${abuse}`, "blocked");
        await log("Code abuse scan clean (miners, credential kits, exfiltration)", "ok");
      }
      return changed ? "warn" : "ok";
    });

    let review = false;
    if (kind === "deploy") {
      yield* step("scan", async (log) => {
        const text: Record<string, string> = {};
        for (const [p, c] of Object.entries(files)) {
          if (p.endsWith(".html")) text[p] = c;
          else if (/\.m?js$/.test(p)) text[p.replace(/[^a-z0-9]/g, "-") + ".html"] = `<p>${(c.match(/(["'`])(?:(?!\1)[^\\\n]|\\.){12,}\1/g) ?? []).map((x) => x.slice(1, -1)).join(" ").slice(0, 60_000)}</p>`;
        }
        const scan = await scanFiles(text);
        if (scan.verdict === "block") throw new HttpError(422, "This creation can't go live: it breaks the rules for what Keplar sites may contain.", "blocked");
        review = scan.verdict === "review";
        await log(review ? "Content flagged for a human look; it goes live and is queued for review" : "Content safety scan passed", review ? "warn" : "ok");
        return review ? "warn" : "ok";
      });
      yield* step("critic", async (log) => {
        const r = (await getReport(site, version)) ?? (await quickReport(site, version));
        if (!r) return "skipped";
        d = { ...d, criticScore: r.score };
        const crit = r.findings.filter((f) => f.severity === "critical").length;
        await log(`Score ${r.score}/100 · ${r.grade} · ${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}${crit ? ` · ${crit} blocker${crit === 1 ? "" : "s"}` : ""}`, crit ? "warn" : "ok");
        if (crit) await log("Deploying anyway (the publish gate showed these). Fix them from the Critic tab and redeploy.", "warn");
        return crit ? "warn" : "ok";
      });
    }

    yield* step("snapshot", async (log) => {
      const entries = Object.keys(files).sort().map((p) => ({ path: p, hash: sha(files[p]).slice(0, 12), bytes: Buffer.byteLength(files[p]) }));
      const hash = sha(entries.map((e) => `${e.path}:${e.hash}`).join("\n")).slice(0, 12);
      d = { ...d, manifest: { hash, files: entries.length, bytes: entries.reduce((a, e) => a + e.bytes, 0), entries: entries.slice(0, 80) } };
      await log(`Manifest ${hash} · ${entries.length} files · content-addressed, immutable`, "ok");
      return "ok";
    });

    let before: Pick<Site, "publishedVersion" | "publishedAt" | "needsReview" | "app"> | null = null;
    yield* step("promote", async (log) => {
      const fresh = (await sites().get(site.workspaceId, site.id)) ?? site;
      before = { publishedVersion: fresh.publishedVersion, publishedAt: fresh.publishedAt, needsReview: fresh.needsReview, app: fresh.app };
      const patch: Partial<Site> = { publishedVersion: version, publishedAt: now(), needsReview: review || (kind === "rollback" && fresh.needsReview && fresh.publishedVersion === version), updatedAt: now() };
      if (fresh.kind === "app" && fresh.app) patch.app = { ...fresh.app, live: { spec: fresh.app.spec, design: fresh.app.design, images: fresh.app.images ?? {} } };
      site = (await sites().update(site.workspaceId, site.id, patch)) ?? { ...fresh, ...patch };
      await log(`Live pointer moved ${fresh.publishedVersion ? `v${fresh.publishedVersion} → ` : ""}v${version} (atomic)`, "ok");
      await o.hooks.afterPromote?.(site, files).catch((e: Error) => log(`Data seeding skipped: ${e.message.slice(0, 80)}`, "warn"));
      return "ok";
    });
    yield* step("purge", async (log) => {
      const n = await o.hooks.purge(site, files);
      await log(`Purged ${n} cached path${n === 1 ? "" : "s"} at the edge`, "ok");
      return "ok";
    });

    const url = liveUrlOf(site, o.origin);
    yield* step("verify", async (log) => {
      const r = await o.hooks.verify(site, url);
      if (!r.ok) {
        await log(`Live route answered ${r.status}${r.note ? ` (${r.note})` : ""}`, "error");
        // Never leave a broken version live: put the pointer back exactly as it was and purge again.
        const prev = before;
        if (prev) {
          site = (await sites().update(site.workspaceId, site.id, { ...prev, updatedAt: now() })) ?? site;
          await o.hooks.purge(site, files).catch(() => 0);
          await log(prev.publishedVersion ? `Auto-reverted: live pointer back on v${prev.publishedVersion}` : "Auto-reverted: the creation stays unpublished", "warn");
        }
        throw new HttpError(502, `v${version} failed its live check (HTTP ${r.status}), so it was taken back down${prev?.publishedVersion ? ` and v${prev.publishedVersion} stays live` : ""}. Nothing your visitors see changed.`, "verify_failed");
      }
      await log(`GET /s/${site.slug}/ → ${r.status} in ${r.ms} ms, serving v${version}`, "ok");
      return "ok";
    });
    // the previous live deploy is superseded once the new version is verified live
    for (const prev of history.filter((x) => x.status === "live")) await deploys().update(prev.workspaceId, prev.id, reduce(prev, { type: "supersede" }, now())).catch(() => undefined);

    yield* step("domains", async (log) => {
      await log(`${url.replace(/\/$/, "")} · HTTPS (certificate managed and renewed by Vercel)`, "ok");
      const { domainStore } = await import("@/lib/domains/store");
      const rows = await domainStore().listBySite(site.workspaceId, site.id).catch(() => []);
      for (const r of rows) await log(r.status === "active" ? `https://${r.hostname} · active · SSL issued automatically` : `${r.hostname} · ${r.status === "error" ? "needs attention" : "waiting for DNS"} (SSL is issued once DNS points at Keplar)`, r.status === "active" ? "ok" : "warn");
      if (!rows.length) await log("No custom domain yet. Add one below; records, verification and SSL are automatic.");
      return rows.some((r) => r.status !== "active") ? "warn" : "ok";
    });

    yield await apply({ type: "live", url });
    return d;
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "The deploy stopped unexpectedly.";
    if (!(e instanceof HttpError)) console.error("[deploy]", e);
    yield await apply({ type: "fail", error: msg });
    return d;
  }
}
