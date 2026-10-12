import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frameSignature, shareErrorMessage, surfaceLabel, SHARE_TIMEOUT_MS } from "../src/components/app-ui/screen-share";

const frame = (w: number, h: number, paint: (x: number, y: number) => number) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = paint(x, y);
    px.set([v, v, v, 255], (y * w + x) * 4);
  }
  return px;
};

test("screen share: identical frames match, a changed screen does not, a one-pixel flicker does not count", () => {
  const white = frame(128, 72, () => 255);
  const sig = frameSignature(white, 128, 72);
  assert.equal(sig.length, 32 * 18);
  assert.equal(frameSignature(frame(128, 72, () => 255), 128, 72), sig, "same screen, same fingerprint");
  const flicker = frame(128, 72, (x, y) => (x === 5 && y === 5 ? 250 : 255));
  assert.equal(frameSignature(flicker, 128, 72), sig, "a cursor blink is not a new screen");
  const dialog = frame(128, 72, (x, y) => (x > 30 && x < 90 && y > 20 && y < 50 ? 0 : 255));
  assert.notEqual(frameSignature(dialog, 128, 72), sig, "a new window or error dialog is");
});

test("screen share: plain-language errors, readable labels and a time limit", () => {
  assert.match(shareErrorMessage({ name: "NotAllowedError" }), /cancelled or blocked\. Nothing was captured/);
  assert.match(shareErrorMessage({ name: "NotSupportedError" }), /can't share a screen/);
  assert.match(shareErrorMessage(new Error("x")), /didn't start/);
  assert.equal(surfaceLabel("window"), "a window");
  assert.equal(surfaceLabel("browser"), "a tab");
  assert.equal(surfaceLabel(undefined), "your screen");
  assert.equal(SHARE_TIMEOUT_MS, 15 * 60_000);
});

test("screen share: only the browser's own picker, only on request, always stoppable", () => {
  const src = readFileSync("src/components/app-ui/screen-share.ts", "utf8");
  assert.match(src, /getDisplayMedia\(\{ video: \{ frameRate: 5 \}, audio: false \}\)/, "the browser's picker, video only");
  assert.doesNotMatch(src, /setInterval/, "no background capture loop");
  assert.match(src, /addEventListener\("ended", stop\)/, "stopping from the browser's own bar ends sharing");
  const composer = readFileSync("src/components/app-ui/Composer.tsx", "utf8");
  assert.match(composer, /data-attach-item="screen"/);
  assert.match(composer, /Keplar sees it only when you capture\./);
  assert.match(composer, /share\.stop/);
});
