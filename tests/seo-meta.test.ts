import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { OWN_SHARE_IMAGE, pageMeta } from "../src/lib/seo";

test("OWN_SHARE_IMAGE lists exactly the marketing routes that ship an opengraph-image file", () => {
  const dir = path.resolve("src/app/(marketing)");
  const onDisk = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "opengraph-image.tsx")))
    .map((d) => `/${d.name}`)
    .sort();
  assert.deepEqual([...OWN_SHARE_IMAGE].sort(), onDisk);
});

test("pages with their own card leave images to the file convention; others get the site card", () => {
  const own = pageMeta("/superintelligence", "T", "D");
  assert.equal((own.openGraph as { images?: unknown }).images, undefined);
  assert.equal((own.twitter as { images?: unknown }).images, undefined);
  const other = pageMeta("/product", "T", "D");
  assert.ok((other.openGraph as { images?: unknown[] }).images?.length);
  assert.deepEqual((other.twitter as { images?: string[] }).images, ["/twitter-image"]);
});

test("noindex pages keep following links and carry no article dates unless asked", () => {
  const m = pageMeta("/x", "T", "D", { noindex: true });
  assert.deepEqual(m.robots, { index: false, follow: true });
  assert.equal((m.openGraph as { type?: string }).type, "website");
});
