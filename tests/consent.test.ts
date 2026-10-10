import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptAll, allows, CATEGORIES, CONSENT_MAX_AGE_MS, CONSENT_VERSION, makeRecord, parseRecord, rejectAll, serialize } from "@/lib/consent";

const read = (p: string) => readFileSync(p, "utf8");

test("consent: records round-trip; a valid record is honoured", () => {
  const r = makeRecord(acceptAll());
  const back = parseRecord(serialize(r));
  assert.ok(back);
  assert.equal(back.version, CONSENT_VERSION);
  assert.equal(allows(back, "analytics"), true);
  assert.equal(allows(parseRecord(serialize(makeRecord(rejectAll()))), "analytics"), false);
});

test("consent: nothing is allowed without a record (optional categories default OFF)", () => {
  assert.equal(allows(null, "analytics"), false);
  assert.equal(parseRecord(undefined), null);
  assert.equal(parseRecord(""), null);
});

test("consent: re-ask after 12 months, when categories change, and on tampered or future-dated records", () => {
  const now = Date.now();
  assert.ok(parseRecord(serialize(makeRecord(acceptAll(), now - CONSENT_MAX_AGE_MS + 864e5)), now));
  assert.equal(parseRecord(serialize(makeRecord(acceptAll(), now - CONSENT_MAX_AGE_MS - 1000)), now), null);
  assert.equal(parseRecord(encodeURIComponent(JSON.stringify({ version: "v0-old", at: now, choices: { analytics: true } })), now), null);
  assert.equal(parseRecord(serialize(makeRecord(acceptAll(), now + 10 * 864e5)), now), null);
  assert.equal(parseRecord("%7Bnot-json", now), null);
  assert.equal(parseRecord(encodeURIComponent(JSON.stringify({ version: CONSENT_VERSION, at: now, choices: { analytics: "yes" } })), now)?.choices.analytics, false);
});

test("consent: the version is derived from the real category list (only analytics exists today)", () => {
  assert.deepEqual([...CATEGORIES], ["analytics"]);
  assert.match(CONSENT_VERSION, /analytics/);
});

test("consent gating: analytics scripts and events only run with consent; banner, footer and account link exist", () => {
  const tel = read("src/components/growth/Telemetry.tsx");
  assert.match(tel, /consentAllows\("analytics"\)/);
  assert.match(tel, /if \(!on\) return null;/);
  assert.match(read("src/lib/analytics.ts"), /if \(!consentAllows\("analytics"\)\) return;/);
  assert.match(read("src/app/layout.tsx"), /<CookieBanner \/>/);
  assert.match(read("src/components/chrome/Footer.tsx"), /CookieSettingsButton/);
  assert.match(read("src/app/(marketing)/account/page.tsx"), /CookieSettingsButton/);
  const banner = read("src/components/consent/CookieBanner.tsx");
  for (const label of ["Accept all", "Reject non-essential", "Customize"]) assert.ok(banner.includes(label), label);
  assert.match(banner, /role="region"/);
  assert.doesNotMatch(banner, /role="dialog"/);
  const priv = read("src/components/legal/content/privacy.ts");
  assert.match(priv, /keplar_consent/);
  assert.match(priv, /off by default/);
});

test("consent: no other analytics/third-party tracking script is loaded outside the gate", () => {
  const files = ["src/app/layout.tsx", "src/app/(marketing)/layout.tsx"];
  for (const f of files) assert.doesNotMatch(read(f), /vercel\/analytics|speed-insights|googletagmanager|gtag\(|plausible/);
});
