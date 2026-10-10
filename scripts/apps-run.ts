/**
 * Dev tool: run a Keplar Apps build end to end without the web server (real models, real browser tests, local PGlite data).
 *   KEPLAR_DATA_DIR=/tmp/kapps node --import tsx scripts/apps-run.ts --plan pro --out /tmp/out "a social app for ..." [--design '{"style":"brutalist"}']
 *   ... --reverify /tmp/out   re-runs verify -> fix -> save on a finished build (same data dir), saving a new version
 * Prints the build events; writes the generated files and the build record to --out.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k: string, d = "") => {
  const i = args.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const plan = opt("plan", "pro") as "free" | "lite" | "plus" | "pro" | "business";
const out = opt("out", "/tmp/kapps-out");
const design = JSON.parse(opt("design", "{}"));
const reverify = opt("reverify", "");
const resumeStage = opt("stage", "verify");
const prompt = args.join(" ");

async function main() {
  const { ENTITLEMENTS } = await import("@/lib/create/platform/plans");
  const { createSite, sites, getVersion } = await import("@/lib/site-builder/store");
  const { startBuild, runBuild, getBuild } = await import("@/lib/app-builder/pipeline");
  const t = new Date();
  const ws = { id: `ws_run_${plan}`, name: "Run", plan, entitlements: { ...ENTITLEMENTS[plan], projects: 999, monthlyUnits: 10_000_000 }, anonymous: false, admin: false, period: { start: new Date(t.getTime() - 86_400_000).toISOString(), end: new Date(t.getTime() + 20 * 86_400_000).toISOString() }, verified: true, userId: "u_run", email: "owner@keplar.test" } as never;
  let site: Awaited<ReturnType<typeof createSite>>;
  let b: { id: string };
  if (reverify) {
    const { readFileSync } = await import("node:fs");
    const prev = JSON.parse(readFileSync(path.join(reverify, "site.json"), "utf8"));
    const rec = JSON.parse(readFileSync(path.join(reverify, "build.json"), "utf8"));
    (ws as { id: string }).id = prev.workspaceId;
    site = (await sites().get(prev.workspaceId, prev.siteId))!;
    const { builds } = await import("@/lib/app-builder/pipeline");
    await builds().update(prev.workspaceId, rec.id, { stage: resumeStage, attempts: 0, runs: 0, problems: [], error: null, version: null } as never);
    b = { id: rec.id };
  } else {
    site = await createSite(ws, { name: "Run" });
    site = (await sites().update((ws as { id: string }).id, site.id, { kind: "app" })) ?? site;
    b = await startBuild(ws, site, { prompt, design, confirm: true });
  }
  console.log(`site ${site.id} build ${b.id}`);
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) {
    let cont = false;
    const fresh = (await sites().get((ws as { id: string }).id, site.id))!;
    for await (const ev of runBuild(ws, fresh, b.id, { origin: "https://localhost:3999" })) {
      const s = Math.round((Date.now() - t0) / 1000);
      if (ev.type === "progress") continue;
      if (ev.type === "plan") console.log(`[${s}s] plan`, JSON.stringify({ name: ev.spec.name, kind: ev.spec.kind, pages: ev.spec.pages.map((p) => p.route), collections: ev.spec.collections.map((c) => c.name), ai: ev.spec.ai.map((a) => a.name), files: ev.spec.files, features: ev.spec.features.length, notBuilt: ev.spec.notBuilt }));
      else if (ev.type === "done") console.log(`[${s}s] done v${ev.version} units=${ev.units} preview=${ev.previewUrl}`);
      else console.log(`[${s}s]`, JSON.stringify(ev).slice(0, 400));
      if (ev.type === "continue") cont = true;
    }
    if (!cont) break;
  }
  const fin = await getBuild(ws, b.id);
  mkdirSync(out, { recursive: true });
  for (const [p, c] of Object.entries(fin.files)) {
    mkdirSync(path.dirname(path.join(out, "files", p)), { recursive: true });
    writeFileSync(path.join(out, "files", p), c);
  }
  writeFileSync(path.join(out, "build.json"), JSON.stringify({ ...fin, files: Object.keys(fin.files) }, null, 2));
  writeFileSync(path.join(out, "site.json"), JSON.stringify({ siteId: site.id, workspaceId: (ws as { id: string }).id, version: fin.version }, null, 2));
  console.log(`stage=${fin.stage} usd=${fin.usd.toFixed(4)} attempts=${fin.attempts} version=${fin.version} -> ${out}`);
  if (fin.version) void getVersion;
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
