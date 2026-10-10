import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { claimDaily, claimOne, dailySubjects, releaseOne, usedToday } from "@/lib/usage/daily";

// Separate file: Postgres must be configured before the first use (the table is created on first use).
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => { fake?.restore(); delete process.env.DATABASE_URL; });

test("daily on Postgres (PGlite): atomic claims never pass the limit, release gives back, counts are per key and per day", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const s = dailySubjects({ workspaceId: "ws_pg", anonymous: false, ip: "10.9.9.9", cookie: null, secure: true, limit: 50, ipLimit: 150 });
  const r = await Promise.allSettled(Array.from({ length: 70 }, () => claimDaily(s)));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 50, "exactly 50 of 70 parallel questions get in");
  assert.equal(await usedToday(s.primary), 50);
  assert.equal(await usedToday(s.ip), 50, "the network count only grew for questions that got in");
  const first = r.find((x): x is PromiseFulfilledResult<Awaited<ReturnType<typeof claimDaily>>> => x.status === "fulfilled")!;
  assert.equal((await first.value.release()).used, 49);
  assert.equal(await usedToday(s.primary), 49);
  assert.equal(await claimOne(s.primary, 50), 50);
  assert.equal(await claimOne(s.primary, 50), null);
  // another day / another key are separate counters; release never goes below zero
  assert.equal(await claimOne(s.primary, 50, "2030-01-01"), 1);
  await releaseOne("acct:nobody");
  assert.equal(await usedToday("acct:nobody"), 0);
  const rows = await fake.db.query("SELECT count(*)::int AS n FROM keplar_daily_use");
  assert.ok((rows.rows[0] as { n: number }).n >= 3);
});
