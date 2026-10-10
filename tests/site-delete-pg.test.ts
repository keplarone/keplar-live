import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import type { Site } from "@/lib/site-builder/types";

/** The delete sweep and address holds against real Postgres semantics (PGlite): jsonb field range scan, null handling, tenant scoping. */
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => {
  fake?.restore();
  delete process.env.DATABASE_URL;
});

const site = (id: string, workspaceId: string, over: Partial<Site> = {}): Site => ({
  id, workspaceId, name: id, slug: id.replace(/_/g, "-"), template: null, headVersion: 0, versionCount: 0,
  seo: { title: id, description: "", ogImage: "", indexable: false, pages: {} }, publishedVersion: null, publishedAt: null,
  needsReview: false, takenDown: false, leadCount: 0, messages: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...over,
});

test("purgeDueSites finds only overdue soft-deleted sites; restored (null) and live sites are ignored; the address is held", async (t) => {
  if (!fake) return t.skip("PGlite not available");
  const { sites } = await import("@/lib/site-builder/store");
  const { purgeDueSites, softDeleteSite, restoreSite } = await import("@/lib/site-builder/deletion");
  const { activeHold } = await import("@/lib/site-builder/slug-holds");
  const past = new Date(Date.now() - 5000).toISOString();
  const future = new Date(Date.now() + 600_000).toISOString();
  await sites().insert(site("sit_live", "ws_pg"));
  await sites().insert(site("sit_due", "ws_pg", { deletedAt: past, purgeAfter: past }));
  await sites().insert(site("sit_wait", "ws_pg", { deletedAt: past, purgeAfter: future }));
  await sites().insert(site("sit_other", "ws_pg2", { deletedAt: past, purgeAfter: past }));
  // A real soft delete then restore leaves purgeAfter as JSON null: must not be picked up.
  await sites().insert(site("sit_back", "ws_pg"));
  await softDeleteSite({ id: "ws_pg" }, (await sites().get("ws_pg", "sit_back"))!);
  await restoreSite({ id: "ws_pg", entitlements: { projects: 10 } } as never, "sit_back");

  const mine = await purgeDueSites({ workspaceId: "ws_pg" });
  assert.deepEqual(mine, { purged: 1, failed: 0 });
  assert.equal(await sites().get("ws_pg", "sit_due"), null);
  assert.ok(await sites().get("ws_pg", "sit_wait"));
  assert.ok(await sites().get("ws_pg", "sit_live"));
  assert.ok(await sites().get("ws_pg", "sit_back"));
  assert.ok(await sites().get("ws_pg2", "sit_other"), "another workspace is untouched by a workspace-scoped sweep");

  const all = await purgeDueSites();
  assert.equal(all.purged, 1);
  assert.equal(await sites().get("ws_pg2", "sit_other"), null);
  assert.equal((await activeHold("sit-due"))?.ownerWorkspaceId, "ws_pg");
  assert.ok(await sites().get("ws_pg", "sit_wait"), "not yet due");
});
