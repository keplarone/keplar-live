import "./setup";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { sitemapPaths } from "../src/app/sitemap";
import { assessReport, CORE_EVAL_NOTE, publishedReports } from "../src/lib/seo/reports";
import { fetchSearchAnalytics, searchConsoleStatus, serviceAccountJwt } from "../src/lib/seo/search-console";

test("Search Console without credentials returns a reason and no rows", async () => {
  const status = searchConsoleStatus({});
  assert.equal(status.configured, false);
  if (!status.configured) assert.deepEqual(status.missing, ["GSC_CLIENT_EMAIL", "GSC_PRIVATE_KEY", "GSC_SITE_URL"]);
  const result = await fetchSearchAnalytics({ env: {} });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /not configured/);
    assert.equal("rows" in result, false);
  }
});

test("a configured client shows API rows and treats a refused token as no data", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwt = serviceAccountJwt("seo@keplar.one", pem, 1_700_000_000_000);
  assert.equal(jwt.split(".").length, 3);
  const env = { GSC_CLIENT_EMAIL: "seo@keplar.one", GSC_PRIVATE_KEY: pem, GSC_SITE_URL: "https://keplar.one/" };
  let calls = 0;
  const ok = await fetchSearchAnalytics({
    env,
    now: Date.parse("2026-10-17T00:00:00Z"),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
      return new Response(JSON.stringify({ rows: [{ keys: ["keplar"], clicks: 2, impressions: 10, ctr: 0.2, position: 4.5 }] }), { status: 200 });
    },
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.rows[0]?.clicks, 2);
  const refused = await fetchSearchAnalytics({
    env,
    fetchImpl: async () => new Response("no", { status: 401 }),
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.reason, /No metrics are shown/);
});

test("the Core eval note is complete and unpublished, so it is not a public report", () => {
  const note = assessReport(CORE_EVAL_NOTE);
  assert.equal(note.ok, true, note.reasons.join("; "));
  assert.equal(note.indexable, false);
  assert.deepEqual(publishedReports(), []);
  const thin = assessReport({ ...CORE_EVAL_NOTE, slug: "thin", published: true, limitations: "Too short." });
  assert.equal(thin.indexable, false);
  assert.equal(sitemapPaths.includes("/reports"), false);
  assert.equal(sitemapPaths.some((p) => p.startsWith("/reports/")), false);
});
