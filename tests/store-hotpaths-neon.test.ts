import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { chatRoutes, customDomains, dashboardTraffic, projectCounts, storeMethods } from "./helpers/store-hotpaths";
import { neonQuery } from "@/lib/create/platform/neon";
import { collection } from "@/lib/create/platform/store";

// The same checks as tests/store-hotpaths.test.ts, against real Postgres semantics (PGlite behind a fake Neon endpoint).
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon("ep-hotpaths.us-east-2.aws.neon.tech");
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const skip = "@electric-sql/pglite is not installed";
test("postgres: listFields / count / countBy / listSystemBy / scoped findSystemBy", async (t) => (fake ? storeMethods("hot_pg_docs") : t.skip(skip)));
test("postgres: GET /api/chats lists without messages, same shape; the saved-chat cap still holds", async (t) => (fake ? chatRoutes("hot-chats-pg@example.com") : t.skip(skip)));
test("postgres: GET /api/projects counts per project", async (t) => (fake ? projectCounts("hot-projects-pg@example.com") : t.skip(skip)));
test("postgres: Business dashboard traffic reads only the last 14 days", async (t) => (fake ? dashboardTraffic("hotdashpg") : t.skip(skip)));
test("postgres: custom domains resolve by name, active only, www for apex", async (t) => (fake ? customDomains("p") : t.skip(skip)));

test("postgres: the projection is built in SQL (the heavy field never crosses the wire) and lookups have their indexes", async (t) => {
  if (!fake) return t.skip(skip);
  const c = collection<{ id: string; workspaceId: string; title: string; messages: string[] }>("hot_pg_wire");
  await c.insert({ id: "x1", workspaceId: "w", title: "T", messages: ["m".repeat(50_000)] });
  const real = globalThis.fetch;
  let bytes = 0;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    const res = await real(...a);
    bytes += (await res.clone().text()).length;
    return res;
  }) as typeof fetch;
  try {
    assert.deepEqual(await c.listFields("w", ["title"]), [{ id: "x1", workspaceId: "w", title: "T" }]);
    assert.equal(await c.count("w"), 1);
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(bytes < 2_000, `response bytes ${bytes}`);
  const idx = (await neonQuery("SELECT indexname FROM pg_indexes WHERE tablename = 'keplar_rows'")).map((r) => String(r.indexname));
  for (const name of ["keplar_rows_checkout_session", "keplar_rows_payment_intent", "keplar_rows_stripe_account", "keplar_rows_domain_name"]) assert.ok(idx.includes(name), name);
});
