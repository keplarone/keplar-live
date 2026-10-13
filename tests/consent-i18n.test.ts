import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES } from "@/lib/i18n/locales";
import { loaders } from "@/lib/i18n/loaders/consent";
import { CONSENT_EN, loadConsent } from "@/lib/i18n/consent";
import { consentLocale } from "@/lib/i18n/consent-client";

const KEYS = Object.keys(CONSENT_EN) as (keyof typeof CONSENT_EN)[];

test("every live language has a complete cookie banner (all strings, translated, names kept)", async () => {
  assert.equal(Object.keys(loaders).length, LOCALES.length);
  for (const { code } of LOCALES) {
    assert.ok(loaders[code], `${code} has a consent catalog`);
    const raw = (await loaders[code]()).default as Record<string, string>;
    for (const k of KEYS) assert.ok(typeof raw[k] === "string" && raw[k].trim().length > 0, `${code}.${k}`);
    assert.notEqual(raw.text, CONSENT_EN.text, `${code}: the explanation is translated`);
    assert.notEqual(raw.acceptAll, CONSENT_EN.acceptAll, `${code}: "Accept all" is translated`);
    assert.ok(raw.text.includes("Keplar") && raw.text.includes("IP"), `${code}: keeps "Keplar" and "IP"`);
    assert.ok(raw.analyticsDesc.includes("Vercel"), `${code}: keeps "Vercel"`);
  }
});

test("loading: the locale's strings over English; unknown or English gets English", async () => {
  assert.equal((await loadConsent("ja")).acceptAll, "すべて許可");
  assert.equal((await loadConsent("pt-br")).reject, "Recusar os não essenciais");
  assert.equal(await loadConsent("en"), CONSENT_EN);
  assert.deepEqual(await loadConsent("xx"), CONSENT_EN);
});

test("which language the banner speaks: the URL's, and in the app the saved choice", () => {
  const saved = () => "de";
  assert.equal(consentLocale("/pt-br", saved), "pt-br");
  assert.equal(consentLocale("/ar/pricing", saved), "ar");
  assert.equal(consentLocale("/pricing", saved), "en", "English pages stay English");
  assert.equal(consentLocale("/app", saved), "de");
  assert.equal(consentLocale("/app/create", saved), "de");
  assert.equal(consentLocale("/apps", saved), "en", "only the app itself, not /apps");
});

test("no English is hard-coded in the banner; the footer's Cookie settings label is translated on the server", () => {
  const src = readFileSync("src/components/consent/CookieBanner.tsx", "utf8");
  for (const s of ["Accept all", "Reject non-essential", "Customize", "Save choices", "Cookie categories", "always uses the cookies", ">Details<", ">Cookies<", "All cookies accepted"]) assert.ok(!src.includes(s), s);
  assert.match(src, /lang=\{info\?\.code \?\? "en"\} dir=\{info\?\.dir \?\? "ltr"\}/, "Arabic, Hebrew and Urdu banners read right to left even in the English app");
  assert.match(src, /if \(!banner\.mounted \|\| !ready\)/, "no flash of English while the strings load");
  assert.match(readFileSync("src/components/chrome/Footer.tsx", "utf8"), /<CookieSettingsButton className=\{s\.cookieLink\}>\{consent\.settings\}<\/CookieSettingsButton>/);
});
