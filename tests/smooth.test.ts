import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CARET_SNAP_PX, caretStep, lerpTo, settled, smoothCaretAllowed, splitForEase } from "@/lib/typing/smooth";

test("lerp is frame-rate independent, monotonic and never overshoots", () => {
  let a = 0; for (let i = 0; i < 6; i++) a = lerpTo(a, 100, 16, 48);           // 6 frames at 60fps
  let b = 0; for (let i = 0; i < 3; i++) b = lerpTo(b, 100, 32, 48);           // 3 frames at 30fps (same 96 ms)
  assert.ok(Math.abs(a - b) < 0.5, `${a} vs ${b}`);
  let x = 0; const seen: number[] = [];
  for (let i = 0; i < 60; i++) { x = lerpTo(x, 50, 16, 48); seen.push(x); }
  assert.ok(seen.every((v, i) => v <= 50 + 1e-9 && (i === 0 || v >= seen[i - 1])));
  assert.ok(settled(x, 50));
  assert.equal(lerpTo(3, 9, 0, 48), 9, "no time, no tween: jumps");
  assert.ok(lerpTo(0, 100, 5000, 48) < 100 && lerpTo(0, 100, 5000, 48) > 60, "a stalled frame is clamped, not a teleport");
});
test("the caret glides a short way and snaps across large jumps", () => {
  const near = caretStep({ x: 0, y: 0 }, { x: 8, y: 0 }, 16);
  assert.ok(!near.snapped && near.x > 0 && near.x < 8);
  const far = caretStep({ x: 0, y: 0 }, { x: CARET_SNAP_PX + 10, y: 0 }, 16);
  assert.ok(far.snapped && far.x === CARET_SNAP_PX + 10);
});
test("gates: reduced motion, forced colors and the opt-out keep the native caret", () => {
  const e = { finePointer: true, reducedMotion: false, forcedColors: false, off: false };
  assert.ok(smoothCaretAllowed(e));
  for (const k of ["reducedMotion", "forcedColors", "off"] as const) assert.ok(!smoothCaretAllowed({ ...e, [k]: true }), k);
});
test("text ease wraps only the newest words and keeps every character", () => {
  const text = "one two  three four five six seven eight nine ten";
  const { head, words } = splitForEase(text, 4);
  assert.equal(head + words.map((w) => w.text).join(""), text, "lossless");
  assert.deepEqual(words.filter((w) => w.word).map((w) => w.text), ["seven", "eight", "nine", "ten"]);
  assert.deepEqual(words.filter((w) => w.word).map((w) => w.index), [6, 7, 8, 9], "indexes are stable as the text grows");
  const longer = splitForEase(text + " eleven", 4);
  assert.deepEqual(longer.words.filter((w) => w.word).map((w) => w.index), [7, 8, 9, 10]);
  const big = splitForEase(Array.from({ length: 5000 }, (_, i) => "w" + i).join(" "));
  assert.equal(big.words.filter((w) => w.word).length, 28, "a huge answer still wraps only the tail");
  assert.deepEqual(splitForEase("", 4), { head: "", words: [] });
  assert.equal(splitForEase("hello", 4).head, "");
});
test("wiring: visual only, never hides the real cursor, never touches the input path", () => {
  const c = readFileSync("src/components/glass/SmoothCaret.tsx", "utf8");
  assert.ok(!/preventDefault|stopPropagation|\.value\s*=|setSelectionRange|execCommand/.test(c), "never touches the field's value, selection or events");
  assert.match(c, /compositionstart/);
  assert.match(c, /localStorage\.getItem\("keplar-smooth"\)/);
  assert.match(c, /catch \{ fail\(\); \}/);
  assert.match(c, /data-typing-mode/);
  assert.ok(!existsSync("src/components/glass/PointerFollower.tsx"), "the pointer follower is gone");
  assert.ok(!/cursor:\s*none/.test(readFileSync("src/styles/fit.css", "utf8")) && !/ptr-ring|ptr-dot/.test(readFileSync("src/styles/fit.css", "utf8")), "the real cursor is never hidden");
  const css = readFileSync("src/styles/fit.css", "utf8");
  assert.match(css, /\[data-sc\] \{ caret-color: transparent; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\)[^{]*\{ \.smooth-caret \{ display: none; \}/);
  assert.match(readFileSync("src/components/app-ui/Markdown.module.css", "utf8"), /@media \(prefers-reduced-motion: reduce\) \{ \.w \{ animation: none; \} \}/);
  assert.match(readFileSync("src/components/chrome/LegacyDecor.tsx", "utf8"), /<SmoothCaret \/>/);
  assert.match(readFileSync("src/components/chrome/LegacyDecor.tsx", "utf8"), /space-studio/);
  assert.ok(!/<SmoothCaret \/>/.test(readFileSync("src/app/layout.tsx", "utf8")));
  assert.ok(!/PointerFollower/.test(readFileSync("src/app/layout.tsx", "utf8")));
});
