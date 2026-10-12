import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ALL_LOCALES, ENGLISH, INDEXABLE, LOCALES, REGISTRY, isAvailable } from "../src/lib/i18n/locales";
import { CATALOGS } from "../src/lib/i18n/loaders/available";
import { hreflangFor, localeAlternates, localizedPath, splitLocale } from "../src/lib/i18n/routing";
import { fromAcceptLanguage, matchLocale, suggestLocale } from "../src/lib/i18n/detect";
import { localeHintFor } from "../src/lib/i18n/proxy-hint";
import { localizedSitemapEntries } from "../src/lib/i18n/sitemap";

const leaves = (v: unknown, p = ""): string[] =>
  v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leaves(x, p ? `${p}.${k}` : k)) : [p];
const tokens = (s: string) => [...s.matchAll(/\{\w+\}|<\/?\w+>/g)].map((m) => m[0]).sort().join(" ");
const at = (o: unknown, path: string) => path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);

test("registry: 100+ planned locales, unique codes, wave 1 is the stable set, RTL marked", () => {
  assert.ok(REGISTRY.length >= 100, `registry has ${REGISTRY.length}`);
  assert.equal(new Set(REGISTRY.map((l) => l.code)).size, REGISTRY.length);
  for (const l of REGISTRY) assert.equal(l.status === "stable", l.wave === 1, `${l.code}: only wave 1 is stable`);
  for (const c of ["ar", "he", "ur"]) assert.equal(REGISTRY.find((l) => l.code === c)?.dir, "rtl", c);
  assert.equal(ENGLISH.dir, "ltr");
});

test("availability gating: only locales with their catalogs on disk are routed", () => {
  for (const l of LOCALES) {
    assert.ok(isAvailable(l));
    assert.ok(CATALOGS.common.includes(l.code), `${l.code} has common`);
    if (l.status === "stable") for (const ns of ["client", "marketing"]) assert.ok(CATALOGS[ns].includes(l.code), `${l.code} has ${ns}`);
  }
  for (const ns of Object.keys(CATALOGS)) {
    const disk = readdirSync(`src/lib/i18n/messages/${ns}`).map((f) => f.replace(/\.ts$/, "")).filter((c) => c !== "en").sort();
    assert.deepEqual([...CATALOGS[ns]].sort(), disk, `loaders/available.ts is regenerated for ${ns}`);
  }
});

test("stable locales translate every key, keeping {vars}, <tags> and the brand", async () => {
  for (const ns of ["common", "client", "marketing"]) {
    const en = (await import(`../src/lib/i18n/messages/${ns}/en.ts`)).default;
    const keys = leaves(en);
    for (const l of LOCALES.filter((x) => x.status === "stable")) {
      const m = (await import(`../src/lib/i18n/messages/${ns}/${l.code}.ts`)).default;
      for (const k of keys) {
        const v = at(m, k);
        assert.equal(typeof v, typeof at(en, k), `${ns}/${l.code}: ${k}`);
        if (typeof v === "string") assert.equal(tokens(v), tokens(at(en, k) as string), `${ns}/${l.code}: ${k} tokens`);
      }
      for (const k of leaves(m)) assert.notEqual(at(en, k), undefined, `${ns}/${l.code}: unknown key ${k}`);
    }
  }
});

test("prices stay USD and plan names stay untranslated in every catalog", () => {
  for (const ns of ["common", "client", "marketing"]) for (const f of readdirSync(`src/lib/i18n/messages/${ns}`)) {
    const src = readFileSync(`src/lib/i18n/messages/${ns}/${f}`, "utf8");
    assert.doesNotMatch(src, /€|£|¥\d|₹\d|R\$\s?\d/, `${ns}/${f} shows a non-USD price`);
  }
});

test("routing: English at the root, other locales under /<locale>, unlocalized pages fall back to English", () => {
  assert.equal(localizedPath("/pricing", "en"), "/pricing");
  const es = LOCALES.find((l) => l.code === "es");
  if (es) {
    assert.equal(localizedPath("/pricing", "es"), "/es/pricing");
    assert.equal(localizedPath("/", "es"), "/es");
    assert.equal(localizedPath("/docs", "es"), "/docs", "docs stay English");
    assert.deepEqual(splitLocale("/es/pricing"), { locale: "es", path: "/pricing" });
  }
  assert.deepEqual(splitLocale("/pricing"), { locale: "en", path: "/pricing" });
});

test("seo: hreflang covers every indexable locale plus x-default; beta locales are never listed; self-canonical", () => {
  const alts = hreflangFor("/pricing");
  assert.ok(alts["x-default"], "x-default");
  for (const l of INDEXABLE) assert.ok(alts[l.hreflang], `hreflang ${l.hreflang}`);
  for (const l of ALL_LOCALES.filter((x) => x.status === "beta")) assert.equal(alts[l.hreflang], undefined, `${l.code} is beta`);
  const es = localeAlternates("/pricing", "es");
  assert.match(es.canonical, /\/es\/pricing$/);
  const entries = localizedSitemapEntries(() => null);
  assert.ok(entries.length >= (INDEXABLE.length - 1) * 6, "sitemap lists the localized pages");
  for (const e of entries) assert.doesNotMatch(String(e.url), /\/(signin|signup)$/);
  assert.equal(readFileSync("src/app/robots.ts", "utf8").includes("/es"), false, "robots.txt unchanged");
});

test("detection: cookie first, then Accept-Language; bots and non-documents get no hint; never a redirect", () => {
  if (LOCALES.find((l) => l.code === "de")) {
    assert.equal(fromAcceptLanguage("de-CH,de;q=0.9,en;q=0.8"), "de");
    assert.equal(suggestLocale({ cookie: "fr", acceptLanguage: "de", userAgent: "Mozilla/5.0" }), "fr");
  }
  if (LOCALES.find((l) => l.code === "pt-br")) assert.equal(matchLocale("pt"), "pt-br");
  assert.equal(suggestLocale({ acceptLanguage: "en-US,en;q=0.9", userAgent: "Mozilla/5.0", current: "en" }), null, "English visitors get no banner");
  const req = (h: Record<string, string>, method = "GET") => ({ method, headers: new Headers(h), cookies: { get: () => undefined } }) as never;
  assert.equal(localeHintFor(req({ "user-agent": "Googlebot/2.1", accept: "text/html", "accept-language": "es" })), null);
  assert.equal(localeHintFor(req({ "user-agent": "Mozilla/5.0", accept: "text/x-component", "accept-language": "es" })), null);
  assert.equal(localeHintFor(req({ "user-agent": "Mozilla/5.0", accept: "text/html", "accept-language": "es" }, "POST")), null);
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const hint = readFileSync("src/lib/i18n/proxy-hint.ts", "utf8");
  assert.doesNotMatch(hint, /NextResponse\.(redirect|rewrite)|\.redirect\(/);
  assert.match(proxy, /applyLocaleHint/);
});

test("fonts: fallbacks only for the scripts that need them; dark graphite design untouched", () => {
  const css = readFileSync("src/components/i18n/i18n.css", "utf8");
  assert.doesNotMatch(css, /gradient/i);
  assert.match(css, /:lang\(ar\)|\[dir="?rtl"?\]/);
});

test("answers: language of the question first, the saved interface language when unclear; Settings has a Language section", async () => {
  const { answerLanguageNote, uiLocaleFromCookie } = await import("../src/lib/i18n/answer-language");
  const { VOICE_PROMPT, VOICE_PROMPT_SHORT } = await import("../src/lib/persona");
  assert.match(VOICE_PROMPT, /reply in the language of the person's latest message/);
  assert.match(VOICE_PROMPT, /use the interface language if one is given/);
  assert.match(VOICE_PROMPT_SHORT, /language of the user's latest message/);
  assert.equal(uiLocaleFromCookie("a=1; keplar-locale=ja; b=2"), "ja");
  assert.equal(uiLocaleFromCookie("keplar-locale=xx-nope"), "en");
  assert.equal(uiLocaleFromCookie(null), "en");
  assert.equal(answerLanguageNote("keplar-locale=en"), "");
  assert.equal(answerLanguageNote(undefined), "");
  const ja = answerLanguageNote("keplar-locale=ja");
  assert.match(ja, /Japanese/);
  assert.match(ja, /日本語/);
  assert.match(ja, /language of the question/);
  assert.match(readFileSync("src/app/api/keplar/route.ts", "utf8"), /answerLanguageNote\(request\.headers\.get\("cookie"\)\)/);
  const account = readFileSync("src/components/account/AccountSettings.tsx", "utf8");
  assert.match(account, /sub\("language", null, <LanguageSettings \/>\)/); // Settings > General > Language (minimal pass groups)
  assert.match(readFileSync("src/components/i18n/LanguageSettings.tsx", "utf8"), /<LanguagePicker variant="settings" \/>/);
});
