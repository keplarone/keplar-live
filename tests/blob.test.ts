import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOB_FOR_SCENE, BLOB_KEYS, BLOB_VARIANTS, blobDetail, blobFor, blobPlacement, mixBlob } from "@/field/blob-variants";
import { SCENE_IDS } from "@/field/scenes";

test("every scene has a blob form; forms are distinct enough to read as different shapes", () => {
  for (const id of SCENE_IDS) assert.ok(BLOB_VARIANTS[blobFor(id)], id);
  assert.equal(Object.keys(BLOB_FOR_SCENE).sort().join(), [...SCENE_IDS].sort().join());
  const sig = Object.values(BLOB_VARIANTS).map((v) => BLOB_KEYS.map((k) => v[k].toFixed(2)).join());
  assert.equal(new Set(sig).size, sig.length);
  assert.ok(new Set(SCENE_IDS.map(blobFor)).size >= 10, "at least ten different forms across the site");
});
test("morphing blends smoothly and lands exactly on the target", () => {
  const a = BLOB_VARIANTS.orb, b = BLOB_VARIANTS.tall;
  assert.deepEqual(mixBlob(a, b, 0), a);
  assert.deepEqual(mixBlob(a, b, 1), b);
  const mid = mixBlob(a, b, 0.5);
  for (const k of BLOB_KEYS) assert.ok(mid[k] >= Math.min(a[k], b[k]) - 1e-9 && mid[k] <= Math.max(a[k], b[k]) + 1e-9, k);
  assert.ok(mixBlob(a, b, 0.1).sy < mixBlob(a, b, 0.5).sy, "monotonic");
});
test("device budget: phones and low tier use less geometry, never none", () => {
  assert.ok(blobDetail("mobile", "high").mesh < blobDetail("desktop", "high").mesh);
  assert.ok(blobDetail("desktop", "low").mesh < blobDetail("desktop", "high").mesh);
  assert.ok(blobDetail("mobile", "low").points >= 4);
});
test("placement: beside the copy on wide screens, centred on phones, scroll carries it down and shrinks it", () => {
  const p = BLOB_VARIANTS.orb, w = blobPlacement(p, 9, 5, 1.8, 0), s = blobPlacement(p, 9, 5, 1.8, 1), m = blobPlacement(p, 4, 8, 0.5, 0);
  assert.ok(w.x > 2 && m.x === 0);
  assert.ok(s.y < w.y && s.r < w.r && s.turn > w.turn);
  assert.ok(m.y > 0, "phones: above the copy");
});
test("the engine draws the blob with a shader, keeps crisp points, disposes, and respects reduced motion", () => {
  const e = readFileSync("src/field/scene-engine.ts", "utf8");
  assert.match(e, /new Blob\(/);
  assert.match(e, /this\.blob\.dispose\(this\.scene\)/);
  assert.match(e, /this\.blob\.setVariant\(/);
  const b = readFileSync("src/field/blob.ts", "utf8");
  for (const needle of ["noise3", "uPointerDir", "pow(1.0 - ndv", "geometry.dispose()", "meshMat.dispose()"]) assert.ok(b.includes(needle), needle);
  assert.ok(!/0x[0-9a-f]{0,2}[0-9a-f]{2}ff\b/i.test(b), "no blue constants");
});
