import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS_DEFAULT_THEME_PREF, DEFAULT_THEME_PREF, isThemePref, resolveTheme, THEME_SCRIPT } from "@/lib/theme";

/** Runs the real pre-paint script against a minimal fake DOM. */
function runScript({ stored, cookie = "", osDark = false }: { stored?: string | null; cookie?: string; osDark?: boolean }) {
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();
  const root = { setAttribute: (k: string, v: string) => (attrs[k] = v), classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) }, style: {} as Record<string, string> };
  const g = {
    localStorage: { getItem: () => stored ?? null },
    document: { cookie, documentElement: root },
    window: { matchMedia: () => ({ matches: osDark }) },
    matchMedia: () => ({ matches: osDark }),
  };
  new Function("localStorage", "document", "window", "matchMedia", THEME_SCRIPT)(g.localStorage, g.document, g.window, g.matchMedia);
  return { theme: attrs["data-theme"], pref: attrs["data-theme-pref"], classes: [...classes], scheme: root.style.colorScheme };
}

test("theme: Dark graphite by default; Light and Auto stay selectable; bad values fall back to Dark", () => {
  assert.equal(DEFAULT_THEME_PREF, "dark");
  assert.deepEqual(runScript({}), { theme: "dark", pref: "dark", classes: ["dark"], scheme: "dark" });
  assert.equal(runScript({ osDark: false }).theme, "dark", "a light device still gets dark until the user chooses Light or Auto");
  assert.equal(runScript({ osDark: true }).theme, "dark");
  assert.equal(runScript({ stored: "dark" }).theme, "dark");
  assert.equal(runScript({ stored: "light" }).theme, "light");
  assert.equal(runScript({ stored: "auto", osDark: false }).theme, "light");
  assert.equal(runScript({ stored: "auto", osDark: true }).theme, "dark");
  assert.equal(runScript({ stored: null, cookie: "a=1; keplar-theme-v2=light" }).theme, "light", "cookie used when storage is empty");
  assert.equal(runScript({ stored: "neon" }).pref, "dark");
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(isThemePref("auto"), true);
  assert.equal(isThemePref("system"), false);
});

test("theme: storedThemePref reads the saved choice (storage, then cookie), not the possibly-stale <html data-theme-pref>", async () => {
  const { storedThemePref } = await import("@/lib/theme");
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = { document: g.document, localStorage: g.localStorage };
  try {
    let stored: string | null = "light";
    // data-theme-pref says "dark" (server default on a client-rendered not-found shell); the saved choice is Light.
    g.document = { cookie: "", documentElement: { getAttribute: () => "dark" } };
    g.localStorage = { getItem: () => stored };
    assert.equal(storedThemePref(), "light");
    stored = null;
    (g.document as { cookie: string }).cookie = "x=1; keplar-theme-v2=auto";
    assert.equal(storedThemePref(), "auto", "cookie when storage is empty");
    (g.document as { cookie: string }).cookie = "keplar-theme-v2=neon";
    assert.equal(storedThemePref(), null, "no valid saved choice");
    g.localStorage = { getItem: () => { throw new Error("blocked"); } };
    (g.document as { cookie: string }).cookie = "keplar-theme-v2=light";
    assert.equal(storedThemePref(), "light", "storage blocked falls back to the cookie");
  } finally {
    g.document = prev.document;
    g.localStorage = prev.localStorage;
  }
});

test("theme: Keplar Business defaults to Light (Apple-led); a stored choice still wins, and other hosts keep Dark", () => {
  const run = (hostname: string, stored: string | null = null) => {
    const attrs: Record<string, string> = {};
    const root = { setAttribute: (k: string, v: string) => (attrs[k] = v), classList: { add: () => {}, remove: () => {} }, style: {} as Record<string, string> };
    const mm = () => ({ matches: false });
    new Function("localStorage", "document", "window", "matchMedia", "location", THEME_SCRIPT)(
      { getItem: () => stored }, { cookie: "", documentElement: root }, { matchMedia: mm }, mm, { hostname },
    );
    return attrs["data-theme"];
  };
  assert.equal(BUSINESS_DEFAULT_THEME_PREF, "light");
  assert.equal(run("business.keplar.one"), "light");
  assert.equal(run("business.localhost"), "light");
  assert.equal(run("business.keplar.one", "dark"), "dark", "a saved Dark choice is kept");
  assert.equal(run("keplar.one"), "dark");
  assert.equal(run("businessxkeplar.one"), "dark", "only the business. subdomain");
});
