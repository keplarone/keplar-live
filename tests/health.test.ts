import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { GET } from "@/app/api/health/route";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon("ep-health.us-east-2.aws.neon.tech");
});
after(() => fake?.restore());

test("health: file store when no database is configured", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.store, "file");
  assert.equal(body.durable, true);
  assert.deepEqual(body.security, { authSecret: false, rateLimit: "memory" });
});

test("health: postgres round trip works, falls back to POSTGRES_URL, and leaks nothing", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  process.env.POSTGRES_URL = fake.url;
  try {
    const res = await GET();
    const text = await res.text();
    assert.equal(res.status, 200);
    const body = JSON.parse(text);
    assert.equal(body.ok, true);
    assert.equal(body.store, "postgres");
    assert.ok(!/secret-pass|ep-health|postgres(ql)?:\/\//.test(text), "no connection details in the response");
    const left = (await fake.db.query("SELECT count(*)::int AS n FROM keplar_rows WHERE collection = '_health'")).rows[0] as { n: number };
    assert.equal(left.n, 0, "probe row is cleaned up");
  } finally {
    delete process.env.POSTGRES_URL;
  }
});
