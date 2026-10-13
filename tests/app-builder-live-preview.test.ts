/**
 * Live preview while building: the draft route serves "b.<buildId>" from the running build's files (with the build's own
 * spec), so the studio can show the app while it is tested and fixed instead of waiting for the save.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Site } from "@/lib/site-builder/types";
import type { AppSpec } from "@/lib/app-builder/types";

const site: Site = {
  id: "sit_livepv", workspaceId: "ws_livepv", name: "Tasks", slug: "tasks-livepv", template: null, headVersion: 0, versionCount: 0,
  seo: { title: "Tasks", description: "", ogImage: "", indexable: false, pages: {} }, publishedVersion: null, publishedAt: null,
  needsReview: false, takenDown: false, leadCount: 0, messages: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};

test("draft route: b.<buildId> serves the running build's files; an unknown build says it is still writing", async () => {
  const { sites } = await import("@/lib/site-builder/store");
  const { collection } = await import("@/lib/create/platform/store");
  const { previewUrlForBuild } = await import("@/lib/app-builder/public");
  const { normalizeDesign } = await import("@/lib/app-builder/design/tokens");
  const route = await import("@/app/apps/draft/[siteId]/[version]/[token]/[[...path]]/route");
  await sites().insert(site);
  const spec = { name: "Tasks", tagline: "", kind: "tool", summary: "", scope: "", uses: [], notBuilt: [], features: [], pages: [{ route: "/", title: "Home", purpose: "" }], collections: [], ai: [], auth: { enabled: false }, images: [], files: [{ path: "app.js", role: "js", purpose: "" }] } as unknown as AppSpec;
  await collection<Record<string, unknown> & { id: string; workspaceId: string }>("app_builds").insert({ id: "abl_live1", workspaceId: site.workspaceId, siteId: site.id, prompt: "tasks", design: normalizeDesign(undefined), stage: "verify", spec, files: { "app.js": "export const marker = 'LIVE-BUILD-MARKER';\n" }, images: {}, attempts: 0, checks: [], verdicts: [], visual: null, shots: [], usd: 0, model: null, log: [], startedAt: site.createdAt, updatedAt: site.createdAt, error: null, version: null });
  const url = previewUrlForBuild(site, "abl_live1");
  const [, , , siteId, version, token] = url.split("/");
  const get = (path: string[], v = version) => route.GET(new Request(`http://localhost:3000${url}${path.join("/")}`), { params: Promise.resolve({ siteId, version: v, token, path }) });
  const js = await get(["app.js"]);
  assert.equal(js.status, 200);
  assert.match(await js.text(), /LIVE-BUILD-MARKER/);
  const page = await get([]);
  assert.equal(page.status, 200, "index.html is written for the build");
  const missing = await get(["app.js"], "b.abl_nope");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Still writing/);
});

test("studio: the preview follows the running build once its code runs, and reloads on every re-test", () => {
  const src = readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8");
  assert.match(src, /const LIVE_STAGES = \["verify", "visual", "fix", "save"\]/);
  assert.match(src, /if \(ev\.type === "stage" && ev\.stage === "verify"\) \{ setFrameReady\(false\); setFrameKey/);
  assert.match(readFileSync("src/lib/app-builder/pipeline.ts", "utf8"), /preview: previewUrlForBuild\(site, b\.id\)/);
});

test("draft previews (only) load the error reporter; the studio turns reports and open items into one Fix action", async () => {
  const { renderAppPage } = await import("@/lib/app-builder/files");
  const { normalizeDesign } = await import("@/lib/app-builder/design/tokens");
  const spec = { name: "Tasks", tagline: "", kind: "tool", summary: "", scope: "", uses: [], notBuilt: [], features: [], pages: [], collections: [], ai: [], auth: { enabled: false, methods: [] }, images: [], files: [] } as unknown as AppSpec;
  const meta = { spec, design: normalizeDesign(undefined), admins: [], settings: { signups: true, ai: true, uploads: true } };
  const page = (env: "draft" | "live" | "qa") => renderAppPage("<!doctype html><html><head></head><body></body></html>", { meta, siteId: "s", env, api: "/_api", plan: "business", reportHref: null, images: {}, title: "Tasks" } as never);
  assert.match(page("draft"), /\/fx\/kapp-report\.1\.js/);
  assert.doesNotMatch(page("live"), /kapp-report/, "published apps never report to anyone");
  assert.doesNotMatch(page("qa"), /kapp-report/);
  const reporter = readFileSync("public/fx/kapp-report.1.js", "utf8");
  assert.match(reporter, /source: "keplar-app", type: "error"/);
  assert.match(reporter, /sent >= 8/, "bounded");
  const studio = readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8");
  assert.match(studio, /e\.source !== frameRef\.current\?\.contentWindow/, "only messages from our own preview frame count");
  assert.match(studio, /Fix these problems in the app \(keep everything else as it is\)/);
  assert.match(readFileSync("src/lib/app-builder/pipeline.ts", "utf8"), /b\.open = blocking/);
});

test("click-to-edit: the preview helper picks elements only on the studio's word, and the studio aims a fast edit at the pick", () => {
  const helper = readFileSync("public/fx/kapp-report.1.js", "utf8");
  assert.match(helper, /e\.source !== window\.parent \|\| !d \|\| d\.source !== "keplar-studio"/, "only the hosting studio can turn pick mode on");
  assert.match(helper, /type: "pick", tag:/);
  assert.match(helper, /e\.preventDefault\(\); e\.stopPropagation\(\);/, "a pick never runs the app's own click handler");
  assert.match(helper, /e\.key === "Escape"/);
  const studio = readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8");
  assert.match(studio, /change only this element: \$\{p\.label\} \(CSS path: \$\{p\.path\}\)/);
  assert.match(studio, /if \(d\.type === "ready"\) \{ if \(pickingRef\.current\) tellFrame/, "a reloaded preview re-enters pick mode");
});

test("studio previews are signed for a day and renewed by the studio before they run out", async () => {
  const { previewUrlFor, STUDIO_PREVIEW_TTL_MS } = await import("@/lib/app-builder/public");
  const exp = Number(/\/(\d{9,})\.[^/]+\/$/.exec(previewUrlFor({ id: "sit_ttl" }, 3))![1]) * 1000;
  assert.ok(Math.abs(exp - (Date.now() + STUDIO_PREVIEW_TTL_MS)) < 5_000);
  assert.equal(STUDIO_PREVIEW_TTL_MS, 24 * 3_600_000);
  assert.match(readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8"), /previewExp - 30 \* 60_000/);
});
