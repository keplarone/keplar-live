import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { ensureSchema, neonQuery, resetSchemaCheck, SCHEMA_VERSION } from "@/lib/create/platform/neon";
import { collection } from "@/lib/create/platform/store";

// PERF-8 (DDL on every cold start): once the schema marker matches, a cold start checks it with one read instead of running every DDL statement.
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon("ep-schema.us-east-2.aws.neon.tech");
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());
const skip = "@electric-sql/pglite is not installed";

test("postgres: first start creates everything and the marker; later cold starts read the marker only", async (t) => {
  if (!fake) return t.skip(skip);
  resetSchemaCheck();
  let at = fake.calls.n;
  await ensureSchema();
  const first = fake.calls.n - at;
  const idx = (await neonQuery("SELECT indexname FROM pg_indexes WHERE tablename = 'keplar_rows'")).map((r) => String(r.indexname));
  for (const name of ["keplar_rows_ws", "keplar_rows_slug", "keplar_rows_checkout_session", "keplar_rows_domain_name"]) assert.ok(idx.includes(name), name);
  const marker = await neonQuery("SELECT data ->> 'version' AS v FROM keplar_rows WHERE collection = '_schema'");
  assert.equal(marker[0]?.v, SCHEMA_VERSION);

  resetSchemaCheck(); // a new cold start
  at = fake.calls.n;
  await ensureSchema();
  const later = fake.calls.n - at;
  console.log(`[measure] schema statements on a cold start: before ${first - 2} (every time), after ${later} once the marker is set`);
  assert.equal(later, 1);
  assert.ok(first >= 12, `first start ran ${first}`);

  // The marker is invisible to collections and never read as data.
  assert.equal((await collection("_schema_probe").list("_schema")).length, 0);
});

test("postgres: a different marker (new statements in a release) runs the DDL again and rewrites it", async (t) => {
  if (!fake) return t.skip(skip);
  await neonQuery("UPDATE keplar_rows SET data = '{\"version\":\"old\"}'::jsonb WHERE collection = '_schema'");
  resetSchemaCheck();
  const at = fake.calls.n;
  await ensureSchema();
  assert.ok(fake.calls.n - at >= 12);
  assert.equal((await neonQuery("SELECT data ->> 'version' AS v FROM keplar_rows WHERE collection = '_schema'"))[0]?.v, SCHEMA_VERSION);
});

test("postgres: no marker is written while an index build fails, so the next cold start tries again", async (t) => {
  if (!fake) return t.skip(skip);
  await neonQuery("DELETE FROM keplar_rows WHERE collection = '_schema'");
  resetSchemaCheck();
  // Fail every CONCURRENTLY build (as a lost catalog race or a timeout would) by answering 400 to them.
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(init?.body ?? "").includes("CONCURRENTLY")) return Response.json({ message: "canceling statement", code: "57014" }, { status: 400 });
    return inner(input, init);
  }) as typeof fetch;
  try {
    await ensureSchema();
  } finally {
    globalThis.fetch = inner;
  }
  assert.equal((await neonQuery("SELECT count(*)::text AS n FROM keplar_rows WHERE collection = '_schema'"))[0]?.n, "0");
  resetSchemaCheck();
  await ensureSchema();
  assert.equal((await neonQuery("SELECT data ->> 'version' AS v FROM keplar_rows WHERE collection = '_schema'"))[0]?.v, SCHEMA_VERSION);
});
