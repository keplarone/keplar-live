import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ago, resumable } from "../src/components/app-ui/resume";
import type { Thread } from "../src/components/app-ui/state/types";

/**
 * Interface overhaul (docs/interface-overhaul.md): the contracts that keep the product's design system one system.
 */
const read = (f: string) => readFileSync(f, "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("product surface tokens exist in both themes, in tokens.css", () => {
  const t = read("src/styles/tokens.css");
  for (const name of ["surface-panel", "surface-raised", "surface-overlay", "hairline", "hairline-strong", "hover-wash", "press-wash", "elev-1", "elev-2", "elev-3"]) {
    assert.match(t, new RegExp(`:root \\{[^}]*--${name}:`), `--${name} (light)`);
    assert.match(t, new RegExp(`:root\\[data-theme="dark"\\] \\{[^}]*--${name}:`), `--${name} (dark)`);
  }
});

test("the app layout and the composer are one block for both themes (no hex-copied dark twin)", () => {
  for (const f of ["src/components/app-ui/App.module.css", "src/components/app-ui/Composer.module.css"]) {
    const css = strip(read(f));
    assert.doesNotMatch(css, /generated from the light/i, `${f}: no generated dark copy`);
    assert.doesNotMatch(css, /:root\[data-theme="dark"\]\) \.(composer|sidebar|topTitle|userMsg|homeChip|send)\b/, `${f}: no dark-only redefinition of a shared surface`);
    assert.doesNotMatch(css, /:root\[data-theme="light"\]\) \.(composer|sidebar|topTitle|userMsg|homeChip|send)\b/, `${f}: no light-only redefinition of a shared surface`);
  }
});

test("menus, the composer and the sidebar stay opaque", () => {
  // The composer's Attach, Modes and routing pop-ups stay on the opaque overlay surface.
  const composer = strip(read("src/components/app-ui/Composer.module.css"));
  assert.match(composer, /\.panel\.panel, \.moreMenu\.moreMenu, \.attachMenu\.attachMenu \{[^}]*background: var\(--surface-overlay\)/);
  assert.doesNotMatch(composer, /backdrop-filter|--lg-|--c-glass/, "no glass in the composer");
  const tsx = read("src/components/app-ui/Composer.tsx");
  assert.equal((tsx.match(/<Popover /g) ?? []).length, 3, "Attach, Modes and routing are kit Popovers");
  const app = strip(read("src/components/app-ui/App.module.css"));
  assert.match(app, /\.app \{[^}]*--lg-fill: var\(--surface-overlay\)[^}]*--lg-bf: none/, "menus that read the glass tokens stay opaque");
  assert.match(app, /\.sidebar \{[^}]*background: var\(--lg-solid\)/);
  assert.doesNotMatch(app, /\.sidebar \{[^}]*backdrop-filter: blur/);
  assert.match(app, /\.app \{[^}]*background: transparent/);
  assert.doesNotMatch(app, /isolation:\s*isolate/);
});

test("no backdrop art, corner glow or animated gradient text in the app", () => {
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.doesNotMatch(app, /SkyBackdrop|welcomeGreet/);
  const css = strip(read("src/components/app-ui/App.module.css"));
  assert.doesNotMatch(css, /background-clip: text/, "no gradient-filled text");
  assert.doesNotMatch(css, /welcome-flow/);
  assert.equal(existsSync("src/styles/aura.css"), false, "the aura stylesheet is gone");
  assert.equal(existsSync("src/components/app-ui/WelcomeBack.tsx"), false, "one home: the welcome-back overlay is gone");
});

test("no class-name button rule anywhere: every component draws its own buttons from the tokens (UI v2)", () => {
  const r = strip(read("src/styles/redesign.css"));
  assert.doesNotMatch(r, /\[class\*="btn" i\]|--button-shadow|\[class\*="__card"\][^{]*:hover/);
  assert.match(read("src/components/app-ui/KeplarApp.tsx"), /className=\{s\.app\} data-product=""/);
  assert.match(read("src/components/account/SettingsDialog.tsx"), /className=\{s\.dlg\} data-product=""/);
});

test("one button motion model: no swell, squash or default pointer pull", () => {
  const files = ["src/components/ui/Button.module.css", "src/styles/glass.css", "src/styles/lit.css", "src/components/auth/auth.module.css", "src/components/app-ui/App.module.css", "src/components/app-ui/Composer.module.css", "src/components/app-ui/KeplarTurn.module.css"];
  for (const f of files) {
    const css = strip(read(f));
    assert.doesNotMatch(css, /scale\(1\.03, 1\.015\)|scale\(1\.035, 1\.02\)|scale\(0\.97, 0\.92\)|scale\(0\.98, 0\.95\)/, `${f}: no swell or squash`);
  }
  const button = read("src/components/ui/Button.tsx");
  assert.doesNotMatch(button, /import \{ Magnetic \}|data-lit=/, "Button has no pointer pull and no proximity light");
});

test("radius tokens are declared once (tokens.css), not re-declared down the cascade", () => {
  for (const f of ["src/styles/redesign.css", "src/styles/glass.css"]) {
    assert.doesNotMatch(strip(read(f)), /--(r-(xs|sm|md|card|card-lg)|shape-(pill|control|card)):/, f);
  }
});

test("one sign-in word: 'Sign in' in English copy", () => {
  for (const f of ["src/lib/i18n/messages/client/en.ts", "src/lib/i18n/messages/marketing/en.ts", "src/lib/i18n/messages/common/en.ts", "src/components/auth/AuthShell.tsx", "src/components/auth/RecoveryForms.tsx"]) {
    assert.doesNotMatch(read(f), /Log in|log in|Sign In/, f);
  }
});

test("the app has its own error boundary and an offline notice, both on shared components", () => {
  const err = read("src/app/app/error.tsx");
  assert.match(err, /<StatusScreen/);
  assert.match(err, /Your saved chats are safe/);
  assert.match(read("src/app/error.tsx"), /<StatusScreen/);
  const off = read("src/components/app-ui/OfflineNotice.tsx");
  assert.match(off, /navigator\.onLine/);
  assert.match(off, /role="status"/);
  assert.match(read("src/components/app-ui/KeplarApp.tsx"), /<OfflineNotice \/>/);
});

const thread = (id: string, over: Partial<Thread> = {}): Thread => ({ id, title: `Chat ${id}`, createdAt: 0, updatedAt: 0, messages: [], ...over }) as Thread;

test("resume list: newest three, never private or untitled", () => {
  const list = resumable([
    thread("a", { updatedAt: 1 }),
    thread("b", { updatedAt: 5 }),
    thread("p", { updatedAt: 9, private: true }),
    thread("u", { updatedAt: 8, title: "  " }),
    thread("c", { updatedAt: 3 }),
    thread("d", { updatedAt: 4 }),
  ]);
  assert.deepEqual(list.map((t) => t.id), ["b", "d", "c"]);
});

test("resume list: relative dates", () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const day = 86_400_000;
  assert.equal(ago(now - 1000, now), "Today");
  assert.equal(ago(now - day, now), "Yesterday");
  assert.equal(ago(now - 3 * day, now), "3 days ago");
  assert.equal(ago(now - 10 * day, now), "Last week");
  assert.equal(ago(now - 30 * day, now), "4 weeks ago");
});

test("the kit hosts (toasts, confirmAction) stay usable inside the app, which makes the rest of the page inert", () => {
  assert.match(read("src/components/kit/Hosts.tsx"), /<div data-kit-host="">/);
  assert.match(read("src/components/app-ui/KeplarApp.tsx"), /!el\.hasAttribute\("data-kit-host"\)/);
});

test("a toast replaced in place by id restarts its timer (a sticky toast turned timed is not dismissed at once)", () => {
  const src = read("src/components/kit/Toast.tsx");
  assert.match(src, /rev: \+\+seq/);
  assert.match(src, /if \(rev\.current !== toast\.rev\) \{\s*rev\.current = toast\.rev;\s*remaining\.current = toast\.duration;/);
});
