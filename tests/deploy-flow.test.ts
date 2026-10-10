import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import { addVersion, createSite, sites } from "@/lib/site-builder/store";
import { listDeploys, runDeploy, deployOverview, type DeployHooks } from "@/lib/deploy/service";
import type { Deploy } from "@/lib/deploy/machine";

const ws: Workspace = { id: "ws_deploy_flow", name: "Deploy", plan: "pro", verified: true, entitlements: ENTITLEMENTS.pro, anonymous: false, admin: false, userId: "u_d", email: "d@example.com", period: { start: "", end: "" } };
const page = (h: string) => ({ "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h}</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>${h}</h1><p>Fresh fish, every morning, from the harbour.</p></main></body></html>`, "styles.css": "body { color: #111; background: #fff; font-family: system-ui; }" });

async function drain(gen: AsyncGenerator<Deploy, Deploy>) {
  const seen: Deploy[] = [];
  for (;;) { const n = await gen.next(); if (n.done) return { final: n.value, seen }; seen.push(n.value); }
}

test("deploy service: deploy v1, deploy v2 (v1 superseded), instant rollback to v1, failed verify leaves the live pointer intact", async () => {
  let verifyOk = true;
  let purged = 0;
  const hooks: DeployHooks = { purge: async () => ++purged, verify: async () => ({ ok: verifyOk, status: verifyOk ? 200 : 500, ms: 4 }) };
  let site = await createSite(ws, { name: "Harbour" });
  site = (await addVersion(ws, site, page("One"), { kind: "edit", summary: "v1", prompt: "", model: null, units: 0 })).site;
  site = (await addVersion(ws, site, page("Two"), { kind: "edit", summary: "v2", prompt: "", model: null, units: 0 })).site;
  const run = (version: number) => drain(runDeploy(ws, site, { version, by: "u_d", byName: "Dee", origin: "https://keplar.one", plan: "pro", hooks }));

  const a = await run(1);
  assert.equal(a.final.status, "live", String(a.final.error));
  assert.equal(a.final.kind, "deploy");
  assert.ok(a.seen.length >= 3, "streams progress");
  assert.ok(a.final.steps.every((s) => s.state === "ok" || s.state === "warn"));
  assert.ok(a.final.steps.flatMap((s) => s.lines).every((l) => !Number.isNaN(Date.parse(l.at))), "every log line is timestamped");
  site = (await sites().get(ws.id, site.id))!;
  assert.equal(site.publishedVersion, 1);

  const b = await run(2);
  assert.equal(b.final.status, "live", String(b.final.error));
  site = (await sites().get(ws.id, site.id))!;
  assert.equal(site.publishedVersion, 2);
  assert.equal((await listDeploys(site)).find((d) => d.id === a.final.id)!.status, "superseded");

  const r = await run(1);
  assert.equal(r.final.kind, "rollback");
  assert.equal(r.final.status, "live", String(r.final.error));
  assert.ok(!r.final.steps.some((s) => s.id === "critic" || s.id === "scan"), "rollback skips re-checks");
  site = (await sites().get(ws.id, site.id))!;
  assert.equal(site.publishedVersion, 1);

  verifyOk = false;
  const f = await run(2);
  assert.equal(f.final.status, "failed");
  site = (await sites().get(ws.id, site.id))!;
  assert.equal(site.publishedVersion, 1, "a failed verify rolls the pointer back to the last good version");
  assert.ok(purged >= 3);

  const o = await deployOverview(site, "https://keplar.one");
  assert.equal(o.live?.version, 1);
  assert.ok(o.versions.length >= 2);
  assert.ok(o.versions.every((v) => typeof v.previewUrl === "string" && v.previewUrl.length > 0));
});

test("deploy service: unverified accounts and concurrent deploys are refused", async () => {
  const site = (await addVersion(ws, await createSite(ws, { name: "Busy" }), page("B"), { kind: "edit", summary: "v1", prompt: "", model: null, units: 0 })).site;
  const hooks: DeployHooks = { purge: async () => 0, verify: async () => ({ ok: true, status: 200, ms: 1 }) };
  await assert.rejects(runDeploy({ ...ws, verified: false }, site, { by: "u", byName: "U", origin: "https://keplar.one", plan: "pro", hooks }).next(), /Verify your email/);
  const g = runDeploy(ws, site, { by: "u", byName: "U", origin: "https://keplar.one", plan: "pro", hooks });
  await g.next();
  await assert.rejects(runDeploy(ws, site, { by: "u", byName: "U", origin: "https://keplar.one", plan: "pro", hooks }).next(), /already running/);
  await drain(g);
});
