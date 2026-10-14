import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampSize,
  effectiveSize,
  parsePersistedSplit,
  serializeSplit,
  sizeFromPointer,
  splitKeyStep,
  SPLIT_STORAGE_PREFIX,
} from "@/components/kit/split-storage";
import { computePlacement } from "@/components/kit/position";
import { detectPlatform, formatKey, spokenKey } from "@/components/kit/keys";
import { defaultToastDuration, progressRatio } from "@/components/kit/feedback-logic";

const B = { min: 20, max: 80 };

test("persisted split sizes: round trip, clamping, and rejecting anything malformed", () => {
  assert.equal(SPLIT_STORAGE_PREFIX, "keplar.studio.split.");
  const v = { size: 42.123, collapsed: true };
  assert.deepEqual(parsePersistedSplit(serializeSplit(v), B), { size: 42.12, collapsed: true });
  assert.deepEqual(parsePersistedSplit(JSON.stringify({ v: 1, size: 95, collapsed: false }), B), { size: 80, collapsed: false });
  assert.deepEqual(parsePersistedSplit(JSON.stringify({ v: 1, size: 3 }), B), { size: 20, collapsed: false });
  for (const bad of [null, undefined, "", "nope", "{", "[]", "42", "null", JSON.stringify({ size: 40 }), JSON.stringify({ v: 2, size: 40 }), JSON.stringify({ v: 1, size: "40" }), '{"v":1,"size":1e999}']) {
    assert.equal(parsePersistedSplit(bad as string | null, B), null, String(bad));
  }
});

test("clampSize handles inverted bounds and non-finite input", () => {
  assert.equal(clampSize(50, B), 50);
  assert.equal(clampSize(NaN, B), 20);
  assert.equal(clampSize(150, { min: 0, max: 100 }), 100);
  assert.equal(clampSize(50, { min: 70, max: 30 }), 50);
});

test("separator keyboard: arrows by axis, Shift x4, Home/End, Enter collapse, restore from collapsed edge", () => {
  const cur = { size: 50, collapsed: false };
  const h = { ...B, orientation: "horizontal" as const, collapsible: "start" as const };
  assert.deepEqual(splitKeyStep(cur, "ArrowRight", h), { size: 52, collapsed: false });
  assert.deepEqual(splitKeyStep(cur, "ArrowLeft", { ...h, shift: true }), { size: 42, collapsed: false });
  assert.equal(splitKeyStep(cur, "ArrowDown", h), null, "vertical keys do nothing on a horizontal split");
  assert.deepEqual(splitKeyStep(cur, "ArrowDown", { ...h, orientation: "vertical" }), { size: 52, collapsed: false });
  assert.deepEqual(splitKeyStep(cur, "Home", h), { size: 20, collapsed: false });
  assert.deepEqual(splitKeyStep(cur, "End", h), { size: 80, collapsed: false });
  assert.deepEqual(splitKeyStep(cur, "Enter", h), { size: 50, collapsed: true });
  assert.equal(splitKeyStep(cur, "Enter", { ...h, collapsible: false }), null);
  const collapsed = { size: 37, collapsed: true };
  assert.deepEqual(splitKeyStep(collapsed, "ArrowRight", h), { size: 37, collapsed: false }, "growing a collapsed start pane restores it");
  assert.equal(splitKeyStep(collapsed, "ArrowLeft", h), null);
  assert.deepEqual(splitKeyStep(collapsed, "ArrowLeft", { ...h, collapsible: "end" }), { size: 37, collapsed: false });
  assert.equal(splitKeyStep(cur, "x", h), null);
  assert.deepEqual(splitKeyStep({ size: 79, collapsed: false }, "ArrowRight", h), { size: 80, collapsed: false });
});

test("pointer sizing clamps and collapses past half the minimum", () => {
  const cur = { size: 50, collapsed: false };
  assert.deepEqual(sizeFromPointer(300, 100, 1000, cur, B), { size: 20, collapsed: false });
  assert.deepEqual(sizeFromPointer(600, 100, 1000, cur, B), { size: 50, collapsed: false });
  assert.deepEqual(sizeFromPointer(105, 100, 1000, cur, { ...B, collapsible: "start" }), { size: 50, collapsed: true });
  assert.deepEqual(sizeFromPointer(1095, 100, 1000, cur, { ...B, collapsible: "end" }), { size: 50, collapsed: true });
  assert.deepEqual(sizeFromPointer(500, 0, 0, cur, B), { size: 50, collapsed: false }, "zero-size container keeps the current size");
  assert.equal(effectiveSize({ size: 30, collapsed: true }, "start"), 0);
  assert.equal(effectiveSize({ size: 30, collapsed: true }, "end"), 100);
  assert.equal(effectiveSize({ size: 30, collapsed: true }, false), 30);
});

test("floating placement: preferred side, flip when there is no room, clamp into the viewport", () => {
  const vp = { width: 440, height: 760 };
  const floating = { width: 120, height: 40 };
  const p = computePlacement({ anchor: { top: 100, left: 100, width: 28, height: 28 }, floating, viewport: vp, side: "bottom", align: "start" });
  assert.deepEqual(p, { top: 134, left: 100, side: "bottom" });
  const flipped = computePlacement({ anchor: { top: 730, left: 100, width: 28, height: 28 }, floating, viewport: vp, side: "bottom" });
  assert.equal(flipped.side, "top");
  assert.equal(flipped.top, 730 - 6 - 40);
  const clamped = computePlacement({ anchor: { top: 100, left: 420, width: 16, height: 16 }, floating, viewport: vp, side: "top", align: "center" });
  assert.equal(clamped.left, 440 - 8 - 120);
  const right = computePlacement({ anchor: { top: 100, left: 10, width: 20, height: 20 }, floating, viewport: vp, side: "right", align: "center" });
  assert.deepEqual(right, { top: 90, left: 36, side: "right" });
});

test("shortcut formatting per platform", () => {
  assert.equal(formatKey("Mod", "mac"), "⌘");
  assert.equal(formatKey("Mod", "other"), "Ctrl");
  assert.equal(formatKey("enter", "mac"), "↵");
  assert.equal(formatKey("k", "other"), "K");
  assert.equal(formatKey("shift", "mac"), "⇧");
  assert.equal(spokenKey("Mod", "mac"), "Command");
  assert.equal(spokenKey("Mod", "other"), "Control");
  assert.equal(detectPlatform({ platform: "MacIntel" }), "mac");
  assert.equal(detectPlatform({ platform: "Win32", userAgent: "Windows NT" }), "other");
  assert.equal(detectPlatform(undefined), "other");
});

test("progress only exists for a real total; errors toast until dismissed", () => {
  assert.equal(progressRatio(3, 7), 3 / 7);
  assert.equal(progressRatio(9, 7), 1);
  assert.equal(progressRatio(-1, 7), 0);
  assert.equal(progressRatio(1, 0), null);
  assert.equal(progressRatio(NaN, 5), null);
  assert.equal(progressRatio(1, Infinity), null);
  assert.equal(defaultToastDuration("danger"), 0);
  assert.equal(defaultToastDuration("success"), 5000);
});
