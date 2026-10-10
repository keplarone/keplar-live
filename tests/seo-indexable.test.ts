import "./setup";
import "./helpers/indexable-env";
import assert from "node:assert/strict";
import { test } from "node:test";
import { site } from "../src/lib/site";
import robots from "../src/app/robots";
import { GET as llms } from "../src/app/llms.txt/route";

test("robots.txt keeps noindex pages crawlable (so noindex is seen) and only blocks /api and /dev", () => {
  const r = robots();
  const rules = ([] as NonNullable<typeof r.rules extends infer T ? (T extends unknown[] ? T[number] : T) : never>[]).concat(r.rules as never);
  const dis = rules.flatMap((x) => (Array.isArray(x.disallow) ? x.disallow : x.disallow ? [x.disallow] : []));
  assert.deepEqual([...new Set(dis)].sort(), ["/api/", "/dev/"]);
  assert.match(String(r.sitemap), /sitemap\.xml$/);
});

test("llms.txt lists the pillar and supporting pages with absolute URLs and no hype", async () => {
  const body = await (await llms()).text();
  for (const p of ["/superintelligence", "/multi-model-ai", "/si-vs-ai", "/ai-vs-agi-vs-superintelligence", "/pricing", "/models"]) assert.ok(body.includes(`${site.url}${p}`), p);
  assert.ok(body.startsWith("# "));
  assert.match(body.toLowerCase(), /not (agi|superintelligence)/);
});
