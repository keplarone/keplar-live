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
  const tw = (other.twitter as { images?: string[] }).images ?? [];
  assert.equal(tw.length, 1);
  assert.ok(tw[0] === "/twitter-image" || tw[0]!.startsWith("/og/page?t=T&s="), tw[0]);
});

test("per-page share cards: signed with the page's own title, and only signed titles verify", async () => {
  const prev = process.env.OG_SIGNING_SECRET;
  process.env.OG_SIGNING_SECRET = "test-og-secret";
  try {
    const { pageOgUrl, verifyOgTitle } = await import("../src/lib/og-page");
    const m = pageMeta("/features", "Everything in Keplar", "D");
    const img = ((m.openGraph as { images?: { url: string }[] }).images ?? [])[0]!.url;
    assert.equal(img, pageOgUrl("Everything in Keplar"));
    assert.deepEqual((m.twitter as { images?: string[] }).images, [img]);
    const u = new URL(img, "https://keplar.one");
    assert.equal(verifyOgTitle(u.searchParams.get("t")!, u.searchParams.get("s")!), true);
    assert.equal(verifyOgTitle("Something else", u.searchParams.get("s")!), false, "a signature only fits its own title");
    assert.equal(verifyOgTitle("Everything in Keplar", "x"), false);
    const noindex = pageMeta("/x", "T", "D", { noindex: true });
    assert.ok(!((noindex.openGraph as { images?: { url: string }[] }).images ?? []).some((i) => i.url.startsWith("/og/page")), "noindex pages keep the site card");
  } finally {
    if (prev === undefined) delete process.env.OG_SIGNING_SECRET; else process.env.OG_SIGNING_SECRET = prev;
  }
});

test("noindex pages keep following links and carry no article dates unless asked", () => {
  const m = pageMeta("/x", "T", "D", { noindex: true });
  assert.deepEqual(m.robots, { index: false, follow: true });
  assert.equal((m.openGraph as { type?: string }).type, "website");
});
