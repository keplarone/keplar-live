/**
 * Dev tool: render a locally built Keplar app (from scripts/apps-run.ts) in the real test browser and save screenshots.
 *   KEPLAR_DATA_DIR=/tmp/kapps node --import tsx scripts/apps-shots.ts /tmp/kapps-out/puzzle screenshots/apps/puzzle
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const [runDir, outDir] = process.argv.slice(2);
  const { siteId, workspaceId, version } = JSON.parse(readFileSync(path.join(runDir, "site.json"), "utf8"));
  const { sites, getVersion } = await import("@/lib/site-builder/store");
  const { smokeTest } = await import("@/lib/app-builder/verify/smoke");
  const site = (await sites().get(workspaceId, siteId))!;
  const v = await getVersion(site, version);
  if (!site?.app || !v) throw new Error("App or version not found.");
  const plan = (process.env.PLAN ?? "pro") as never;
  const r = await smokeTest({ site, meta: site.app, files: v.files, plan, deadline: Date.now() + 240_000, aiCalls: false, shots: true });
  mkdirSync(outDir, { recursive: true });
  r.shots.forEach((s, i) => writeFileSync(path.join(outDir, `${String(i + 1).padStart(2, "0")}-${s.viewport}-${s.route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.jpg`), s.png));
  if (process.env.TEXTS) console.log(JSON.stringify(r.texts, null, 1).slice(0, 6000));
  console.log(JSON.stringify({ checks: r.checks.map((c) => `${c.ok ? "ok " : "BAD"} ${c.label}: ${c.detail}`), issues: r.issues.slice(0, 12), shots: r.shots.length, skipped: r.skipped }, null, 2));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
