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

test("health: production on the file store is unhealthy and logs loudly, without a connection string", async (t) => {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET, DATABASE_URL: process.env.DATABASE_URL, POSTGRES_URL: process.env.POSTGRES_URL, POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING };
  const errors: string[] = [];
  t.mock.method(console, "error", (...a: unknown[]) => void errors.push(a.map(String).join(" ")));
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  process.env.VERCEL_ENV = "production";
  process.env.BETTER_AUTH_SECRET = "a-long-enough-production-secret-0123456789";
  const res = await GET();
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.store, "file");
  assert.equal(body.error, "database not configured");
  assert.equal(body.security.authSecret, true);
  const logged = errors.join("\n");
  assert.match(logged, /CRITICAL: production is on the ephemeral file store/);
  assert.match(logged, /"event":"health.file_store"/);
  assert.doesNotMatch(logged, /postgres(ql)?:\/\//);
});

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
