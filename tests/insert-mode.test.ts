import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertEnabled, isInsertKey, isTextTarget, overtypeSpan, INSERT_PREF_KEY } from "../src/lib/typing/insert-mode";

const k = (key: string, extra: Record<string, unknown> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...extra });

test("insert key: bare Insert toggles; Shift/Ctrl/Alt/Meta+Insert (paste, copy) stay native", () => {
  assert.equal(isInsertKey({ ...k("Insert"), shiftKey: false }), true);
  assert.equal(isInsertKey({ ...k("Insert"), shiftKey: true }), false);
  assert.equal(isInsertKey({ ...k("Insert", { ctrlKey: true }), shiftKey: false }), false);
  assert.equal(isInsertKey({ ...k("a"), shiftKey: false }), false);
});

test("overtype replaces exactly the next character, and only when that is safe", () => {
  assert.equal(overtypeSpan(k("X"), "hello", 1, 1), 1);
  assert.equal(overtypeSpan(k("X"), "hello", 5, 5), 0, "caret at the end inserts");
  assert.equal(overtypeSpan(k("X"), "hello", 1, 3), 0, "a selection is replaced natively");
  assert.equal(overtypeSpan(k("X"), "ab\ncd", 2, 2), 0, "never swallows a line break");
  assert.equal(overtypeSpan(k("X"), "ab\r\ncd", 2, 2), 0);
  assert.equal(overtypeSpan(k("Enter"), "hello", 1, 1), 0);
  assert.equal(overtypeSpan(k("Backspace"), "hello", 1, 1), 0);
  assert.equal(overtypeSpan(k("ArrowLeft"), "hello", 1, 1), 0);
  assert.equal(overtypeSpan(k("a", { ctrlKey: true }), "hello", 1, 1), 0, "shortcuts are left alone");
  assert.equal(overtypeSpan(k("a", { metaKey: true }), "hello", 1, 1), 0);
  assert.equal(overtypeSpan(k("@", { ctrlKey: true, altKey: true, altGraph: true }), "hello", 1, 1), 1, "AltGr characters are typed characters");
  assert.equal(overtypeSpan(k("a", { isComposing: true }), "hello", 1, 1), 0, "IME composition is untouched");
  assert.equal(overtypeSpan(k("Process", { keyCode: 229 }), "hello", 1, 1), 0);
  assert.equal(overtypeSpan(k("X"), "hello", null, null), 0, "inputs without a caret (email, number) insert");
  assert.equal(overtypeSpan(k("X"), "a😀b", 1, 1), 2, "an emoji (surrogate pair) is one character");
});

test("text targets: textarea and text-like inputs only; never read-only, disabled, or non-text types", () => {
  const el = (tagName: string, type: string | null, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: () => type, readOnly: false, disabled: false, ...extra });
  assert.equal(isTextTarget(el("TEXTAREA", null)), true);
  assert.equal(isTextTarget(el("INPUT", "text")), true);
  assert.equal(isTextTarget(el("INPUT", null)), true);
  assert.equal(isTextTarget(el("INPUT", "search")), true);
  assert.equal(isTextTarget(el("INPUT", "email")), false);
  assert.equal(isTextTarget(el("INPUT", "checkbox")), false);
  assert.equal(isTextTarget(el("TEXTAREA", null, { readOnly: true })), false);
  assert.equal(isTextTarget(el("INPUT", "text", { disabled: true })), false);
  assert.equal(isTextTarget(el("DIV", null)), false);
  assert.equal(isTextTarget(null), false);
});

function readSettings() { return readFileSync("src/components/account/TypingSettings.tsx", "utf8"); }

test("insert mode is on by default (only an explicit \"0\" disables it): wired in the layout, block caret + badge styles, Settings toggle", () => {
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.match(read("src/app/layout.tsx"), /<InsertMode \/>/);
  const comp = read("src/components/glass/InsertMode.tsx");
  assert.match(comp, /insertEnabled\(localStorage\.getItem\(INSERT_PREF_KEY\)\)/); // absent key = on
  assert.equal(insertEnabled(null), true);
  assert.equal(insertEnabled("1"), true);
  assert.equal(insertEnabled("0"), false);
  assert.match(readSettings(), /setItem\(INSERT_PREF_KEY, "0"\)/);
  assert.match(comp, /if \(!enabled\) return;/); // Insert key ignored while disabled
  assert.match(comp, /execCommand\("insertText"/); // keeps native undo
  assert.match(read("src/styles/glass.css"), /data-typing-mode="ovr"\][^{]*\{[^}]*caret-shape: block/);
  assert.match(read("src/components/account/AccountSettings.tsx"), /<TypingSettings \/>/);
  // The Settings toggle is the kit's Switch (role="switch" lives in src/components/kit/Toggles.tsx).
  assert.match(read("src/components/account/TypingSettings.tsx"), /<Switch [^>]*checked=\{on === true\}/);
  assert.match(read("src/components/kit/Toggles.tsx"), /role="switch"/);
  assert.equal(INSERT_PREF_KEY, "kp-insert-key");
});

test("insert mode: a field that was focused before the listeners attached is still tracked, and Insert shows the OVR badge", () => {
  const comp = readFileSync("src/components/glass/InsertMode.tsx", "utf8");
  assert.match(comp, /if \(enabled && isTextTarget\(document\.activeElement\)\) onFocusIn/);
  assert.match(comp, /if \(field !== el\) onFocusIn/);
});

test("insert mode: no badge in normal insert mode; OVR shows only while overtype is on; leaving it flashes INS briefly", () => {
  const comp = readFileSync("src/components/glass/InsertMode.tsx", "utf8");
  assert.match(comp, /if \(ovr\) showBadge\(\); \/\/ insert mode is the normal state/, "focus in insert mode creates nothing");
  assert.match(comp, /flash = window\.setTimeout\(removeBadge, FLASH_MS\)/, "INS confirmation disappears on its own");
  const onKey = comp.slice(comp.indexOf("const onKeyDown"), comp.indexOf("const onScroll"));
  assert.doesNotMatch(onKey, /getBoundingClientRect|offsetWidth|getComputedStyle/, "no layout reads on the keystroke path");
});

test("insert mode has a real-browser check that fails when the feature is off by default", () => {
  const e2e = readFileSync("scripts/insert-e2e.mjs", "utf8");
  assert.match(e2e, /keyboard\.press\("Insert"\)/);
  assert.match(e2e, /no badge in normal insert mode \(feature on by default\)/);
  assert.match(e2e, /caretShape/);
});
