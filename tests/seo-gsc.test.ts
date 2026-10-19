import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { gscConfig, gscReport, parseRows, parseSitemaps, searchAnalyticsBody, serviceAccountAssertion } from "../src/lib/seo/gsc";

test("search console: not configured without credentials, and the report says so instead of inventing numbers", async () => {
  assert.equal(gscConfig({}), null);
  assert.equal(gscConfig({ GSC_CLIENT_EMAIL: "a@b.iam.gserviceaccount.com" }), null);
  assert.deepEqual(await gscReport(28, {}), { configured: false });
  const c = gscConfig({ GSC_CLIENT_EMAIL: "a@b.iam.gserviceaccount.com", GSC_PRIVATE_KEY: "-----BEGIN\\nKEY\\n-----END" })!;
  assert.equal(c.siteUrl, "sc-domain:keplar.one");
  assert.ok(c.privateKey.includes("\n") && !c.privateKey.includes("\\n"), "escaped newlines are restored");
});

test("search console: the service-account assertion is a signed RS256 JWT with the read-only scope", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const jwt = serviceAccountAssertion({ clientEmail: "svc@example.iam.gserviceaccount.com", privateKey, siteUrl: "sc-domain:keplar.one" }, 1_760_000_000);
  const [h, c, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.iss, "svc@example.iam.gserviceaccount.com");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");
  assert.equal(claims.exp - claims.iat, 3600);
  const v = createVerify("RSA-SHA256");
  v.update(`${h}.${c}`);
  assert.equal(v.verify(publicKey, Buffer.from(sig, "base64url")), true);
});

test("search console: request bodies cover full days and responses parse into sorted rows", () => {
  const b = searchAnalyticsBody({ days: 28, dimensions: ["page"], now: Date.UTC(2026, 9, 19, 12) });
  assert.deepEqual(b, { startDate: "2026-09-20", endDate: "2026-10-18", dimensions: ["page"], rowLimit: 500, dataState: "final" });
  const rows = parseRows({ rows: [{ keys: ["/a"], clicks: "2", impressions: 10, ctr: 0.2, position: 4.5 }, { keys: ["/b"], clicks: 5, impressions: 8, ctr: 0.625, position: 2 }] });
  assert.deepEqual(rows.map((r) => r.keys[0]), ["/b", "/a"]);
  assert.deepEqual(parseRows({}), []);
  const sm = parseSitemaps({ sitemap: [{ path: "https://keplar.one/sitemap.xml", lastSubmitted: "2026-10-01T00:00:00.000Z", errors: 0, warnings: 1, contents: [{ type: "web", submitted: "230", indexed: "180" }] }] });
  assert.deepEqual(sm, [{ path: "https://keplar.one/sitemap.xml", lastSubmitted: "2026-10-01T00:00:00.000Z", lastDownloaded: undefined, errors: 0, warnings: 1, submitted: 230, indexed: 180 }]);
});
