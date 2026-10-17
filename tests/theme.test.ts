import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_THEME_PREF, isThemePref, resolveTheme, THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

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

test("theme: Dark by default for everyone, ignoring the OS and the old key; Light and Auto persist once chosen", () => {
  assert.equal(THEME_KEY, "keplar-theme-v3");
  assert.equal(DEFAULT_THEME_PREF, "dark");
  assert.doesNotMatch(THEME_SCRIPT, /keplar-theme-v2/);
  assert.deepEqual(runScript({}), { theme: "dark", pref: "dark", classes: ["dark"], scheme: "dark" });
  assert.equal(runScript({ osDark: false }).theme, "dark", "a light device still gets dark until the user chooses Light or Auto");
  assert.equal(runScript({ stored: "dark" }).theme, "dark");
  assert.equal(runScript({ stored: "light" }).theme, "light");
  assert.equal(runScript({ stored: "auto", osDark: false }).theme, "light");
  assert.equal(runScript({ stored: "auto", osDark: true }).theme, "dark");
  assert.equal(runScript({ stored: null, cookie: "a=1; keplar-theme-v2=light" }).theme, "dark", "the old key is ignored");
  assert.equal(runScript({ stored: null, cookie: "a=1; keplar-theme-v3=light" }).theme, "light", "the new cookie is used when storage is empty");
  assert.equal(runScript({ stored: "neon" }).pref, "dark");
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(isThemePref("auto"), true);
  assert.equal(isThemePref("system"), false);
  const html = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /data-theme-pref="dark"/);
  assert.match(html, /colorScheme: "dark"/);
  assert.match(html, /\$\{mono\.variable\} dark`/);
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
    (g.document as { cookie: string }).cookie = "x=1; keplar-theme-v2=light; keplar-theme-v3=auto";
    assert.equal(storedThemePref(), "auto", "the v3 cookie is used when storage is empty; v2 is ignored");
    (g.document as { cookie: string }).cookie = "keplar-theme-v3=neon";
    assert.equal(storedThemePref(), null, "no valid saved choice");
    g.localStorage = { getItem: () => { throw new Error("blocked"); } };
    (g.document as { cookie: string }).cookie = "keplar-theme-v3=light";
    assert.equal(storedThemePref(), "light", "storage blocked falls back to the cookie");
  } finally {
    g.document = prev.document;
    g.localStorage = prev.localStorage;
  }
});
