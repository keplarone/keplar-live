/**
 * PERF-7: saving and listing site versions reads version metadata only, never every version's files. Run against both backends:
 * tests/site-versions-meta.test.ts (file store) and tests/site-versions-meta-neon.test.ts (Postgres through PGlite, with bytes measured).
 */
import assert from "node:assert/strict";
import { addVersion, createSite, deleteSite, getVersion, versionList, versions } from "@/lib/site-builder/store";
import type { Site } from "@/lib/site-builder/types";
import { testWorkspace } from "./workspace";

const files = (site: number, v: number) => ({ "index.html": `<h1>Site ${site} v${v}</h1>${"<p>lorem ipsum</p>".repeat(1_500)}`, "about.html": "<h1>About</h1>", "styles.css": "body{margin:0}" });
const meta = (v: number) => ({ kind: "edit" as const, summary: `v${v}`, prompt: "", model: null, units: 0 });

/** Three sites with 12 saved versions each (~27 KB of files per version), as a free plan keeps them. */
export async function fixture(label: string) {
  const ws = await testWorkspace(label, "pro");
  const out: Site[] = [];
  for (let s = 0; s < 3; s++) {
    let site = await createSite(ws, { name: `${label} ${s}` });
    for (let v = 1; v <= 12; v++) site = (await addVersion({ plan: "free" }, site, files(s, v), meta(v))).site;
    out.push(site);
  }
  return { ws, sites: out };
}

export async function behaviour(label: string, bytes?: () => number) {
  const { ws, sites } = await fixture(label);
  const [a, b] = sites;
  // Listing: newest first, page counts, never the files.
  const list = await versionList(a);
  assert.equal(list.length, 12);
  assert.deepEqual(list.map((v) => v.n), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.ok(list.every((v) => v.pages === 2 && !("files" in v) && v.siteId === a.id && v.summary === `v${v.n}`));
  // Pruning on save (free keeps 12): the oldest goes, the published one stays.
  const pub = { ...a, publishedVersion: 2 };
  const before = bytes?.() ?? 0;
  const saved = await addVersion({ plan: "free" }, pub, files(0, 13), meta(13));
  const saveBytes = (bytes?.() ?? 0) - before;
  const ns = (await versionList(saved.site)).map((v) => v.n);
  assert.deepEqual(ns, [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2], "v1 pruned, published v2 kept");
  assert.equal(await getVersion(a, 1), null);
  assert.ok(await getVersion(a, 2));
  // Another site's versions are untouched.
  assert.equal((await versionList(b)).length, 12);
  // A version saved before page counts were stored: counted once from its files, then stored.
  await versions().update(ws.id, `${b.id}_v5`, { pages: undefined });
  assert.equal((await versions().get(ws.id, `${b.id}_v5`))?.pages, undefined);
  assert.equal((await versionList(b)).find((v) => v.n === 5)?.pages, 2);
  assert.equal((await versions().get(ws.id, `${b.id}_v5`))?.pages, 2, "backfilled");
  // Deleting a site removes exactly its versions.
  await deleteSite(ws, b);
  assert.equal((await versionList(b)).length, 0);
  assert.equal((await versionList(sites[2])).length, 12);
  return { saveBytes };
}
