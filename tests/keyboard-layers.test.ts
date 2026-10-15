/** UX-3 / UX-4 (docs/rebirth/AUDIT.md): the Slides presenter and the Lightbox work by keyboard. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isInteractive, nextTrapIndex } from "@/lib/ui/focus-trap";
import { presentAction } from "@/components/slides/present-keys";

const el = (tagName: string, role?: string, isContentEditable = false) => ({ tagName, isContentEditable, getAttribute: (n: string) => (n === "role" ? role ?? null : null) });

test("presenter: Enter and Space press a focused bar button instead of advancing the slide", () => {
  assert.equal(presentAction("Enter", true), null);
  assert.equal(presentAction(" ", true), null);
  assert.equal(presentAction("Enter", false), "next");
  assert.equal(presentAction(" ", false), "next");
});

test("presenter: arrows, paging, Home/End, N and Esc keep working wherever focus is", () => {
  for (const onControl of [true, false]) {
    assert.equal(presentAction("ArrowRight", onControl), "next");
    assert.equal(presentAction("PageDown", onControl), "next");
    assert.equal(presentAction("ArrowLeft", onControl), "prev");
    assert.equal(presentAction("Backspace", onControl), "prev");
    assert.equal(presentAction("Home", onControl), "first");
    assert.equal(presentAction("End", onControl), "last");
    assert.equal(presentAction("n", onControl), "notes");
    assert.equal(presentAction("N", onControl), "notes");
    assert.equal(presentAction("Escape", onControl), "exit");
    assert.equal(presentAction("x", onControl), null);
  }
  const src = readFileSync("src/components/slides/Present.tsx", "utf8");
  assert.match(src, /presentAction\(e\.key, isInteractive\(e\.target/, "the window handler asks whether focus is on a control");
});

test("isInteractive: buttons, links, fields and widget roles have their own Enter/Space", () => {
  for (const t of ["BUTTON", "a", "input", "select", "textarea", "summary"]) assert.equal(isInteractive(el(t)), true, t);
  assert.equal(isInteractive(el("div", "button")), true);
  assert.equal(isInteractive(el("div", "switch")), true);
  assert.equal(isInteractive(el("div", undefined, true)), true, "contenteditable");
  assert.equal(isInteractive(el("div")), false);
  assert.equal(isInteractive(el("div", "dialog")), false, "the presenter itself");
  assert.equal(isInteractive(null), false);
});

test("focus trap: Tab and Shift+Tab cycle through every control and wrap at both ends", () => {
  // Lightbox controls: Actual size (0), Download original (1), Close (2)
  assert.equal(nextTrapIndex(3, 2, false), 0, "Tab from Close wraps to Actual size");
  assert.equal(nextTrapIndex(3, 0, false), 1, "Tab from Actual size reaches Download");
  assert.equal(nextTrapIndex(3, 1, false), 2);
  assert.equal(nextTrapIndex(3, 0, true), 2, "Shift+Tab from the first wraps to the last");
  assert.equal(nextTrapIndex(3, 2, true), 1);
  assert.equal(nextTrapIndex(3, -1, false), 0, "focus outside the list enters at the first control");
  assert.equal(nextTrapIndex(3, -1, true), 2);
  assert.equal(nextTrapIndex(0, -1, false), -1);
});

test("Lightbox: Tab is trapped across its controls, not forced back to Close", () => {
  const src = readFileSync("src/components/app-ui/Lightbox.tsx", "utf8");
  assert.match(src, /trapTab\(e, layerRef\.current\)/);
  assert.doesNotMatch(src, /e\.key === "Tab"\) \{ e\.preventDefault\(\); closeRef\.current\?\.focus\(\)/);
});
