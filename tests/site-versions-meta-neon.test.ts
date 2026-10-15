import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { behaviour, fixture } from "./helpers/site-versions";
import { addVersion, versionList, versions } from "@/lib/site-builder/store";

// PERF-7 against Postgres semantics (PGlite behind a fake Neon endpoint), with the bytes that cross the wire measured.
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
let bytes = 0;
before(async () => {
  fake = await installFakeNeon("ep-versions.us-east-2.aws.neon.tech");
  if (!fake) return;
  process.env.DATABASE_URL = fake.url;
  const inner = globalThis.fetch;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    const res = await inner(...a);
    bytes += (await res.clone().text()).length;
    return res;
  }) as typeof fetch;
});
after(() => fake?.restore());
const skip = "@electric-sql/pglite is not installed";

test("postgres: same behaviour", async (t) => (fake ? void (await behaviour("svm-pg", () => bytes)) : t.skip(skip)));

test("postgres: a save and a version listing read kilobytes, not every version's files", async (t) => {
  if (!fake) return t.skip(skip);
  const { sites } = await fixture("svm-measure");
  const site = sites[0];
  // Before: the store returned every version of the workspace with its files (versions().list), on every save and listing.
  let at = bytes;
  await versions().list(site.workspaceId, (v) => v.siteId === site.id);
  const oldRead = bytes - at;
  at = bytes;
  await addVersion({ plan: "free" }, site, { "index.html": "<h1>new</h1>" }, { kind: "edit", summary: "x", prompt: "", model: null, units: 0 });
  const save = bytes - at;
  at = bytes;
  await versionList(site);
  const list = bytes - at;
  console.log(`[measure] bytes read: before ${oldRead} per save and per listing (36 versions x ~27 KB); after ${save} for a whole save, ${list} for a listing`);
  assert.ok(oldRead > 900_000, `old read ${oldRead}`);
  assert.ok(save < 40_000, `save ${save}`);
  assert.ok(list < 30_000, `list ${list}`);
});
