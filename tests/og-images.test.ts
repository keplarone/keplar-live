import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { guides } from "@/lib/content/guides";
import { pageMeta } from "@/lib/seo";
import { allPosts } from "@/lib/kb/blog";
import { allDocs } from "@/lib/kb/docs";
import { promptCategories } from "@/lib/kb/prompts";
import { allUseCases } from "@/lib/kb/usecases";
import * as guideOg from "../src/app/og/guides/[slug]/route";
import * as blogOg from "../src/app/og/blogs/[slug]/route";
import * as docsOg from "../src/app/og/docs/[...slug]/route";
import * as promptsOg from "../src/app/og/prompts/[category]/route";
import * as useCaseOg from "../src/app/og/use-cases/[slug]/route";

/**
 * Share images (og:image / twitter:image) must answer 200 with an image. Live check of every page type: scripts/og-smoke.mjs.
 *
 * 7 Oct 2026: every guide's og:image 404'd in production. guides/[slug]/opengraph-image.tsx used generateImageMetadata under a
 * dynamic segment with dynamicParams = false; Next emitted /guides/<slug>/opengraph-image-<hash>/og in the page metadata but
 * never served that route. Per-item cards are route handlers under /og/<kind>/... instead (like blogs, docs, prompts, use cases).
 */

const APP = "src/app";
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(APP);

test("file-based share images never sit under a dynamic segment or use generateImageMetadata", () => {
  const images = files.filter((f) => /\/(opengraph|twitter)-image\.(tsx?|jsx?|png|jpe?g)$/.test(f));
  assert.ok(images.length > 10);
  for (const f of images) {
    assert.ok(!/\[/.test(path.relative(APP, f)), `${f}: use a route handler under src/app/og/... for per-item cards`);
    if (/\.(tsx?|jsx?)$/.test(f)) assert.doesNotMatch(readFileSync(f, "utf8"), /generateImageMetadata/, f);
  }
});

test("every per-page share-image URL in the source points at a route handler that exists", () => {
  const pages = files.filter((f) => /\/page\.tsx$/.test(f));
  let seen = 0;
  for (const f of pages) {
    for (const m of readFileSync(f, "utf8").matchAll(/image: `\/og\/([a-z-]+)\/\$\{/g)) {
      seen++;
      const dir = path.join(APP, "og", m[1]);
      assert.ok(existsSync(dir), `${f}: /og/${m[1]}/ has no route`);
      assert.ok(walk(dir).some((x) => /\/\[[^/]+\]\/route\.tsx$/.test(x)), `${f}: /og/${m[1]}/[param]/route.tsx missing`);
    }
  }
  assert.ok(seen >= 5, `found ${seen} per-page share images`);
  // guides point at their card, and pageMeta puts it on both og:image and twitter:image
  assert.match(readFileSync("src/app/(marketing)/guides/[slug]/page.tsx", "utf8"), /pageMeta\(g\.path, g\.title, g\.metaDescription, \{ image: `\/og\/guides\/\$\{g\.slug\}` \}\)/);
  const m = pageMeta(guides[0].path, guides[0].title, guides[0].metaDescription, { image: `/og/guides/${guides[0].slug}` });
  assert.equal((m.openGraph?.images as { url: string }[])[0].url, `/og/guides/${guides[0].slug}`);
  assert.deepEqual(m.twitter && "images" in m.twitter ? m.twitter.images : null, [`/og/guides/${guides[0].slug}`]);
});

async function png(res: Response, what: string) {
  assert.equal(res.status, 200, what);
  assert.equal(res.headers.get("content-type"), "image/png", what);
  const b = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...b.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${what}: PNG bytes`);
}
const req = new Request("http://localhost/og");

test("og route handlers prerender every item and render a PNG (every guide; one blog, doc, prompt category, use case)", async () => {
  assert.deepEqual(guideOg.generateStaticParams().map((p) => p.slug), guides.map((g) => g.slug));
  assert.equal(blogOg.generateStaticParams().length, allPosts().length);
  assert.ok(docsOg.generateStaticParams().length >= allDocs().length);
  assert.equal(promptsOg.generateStaticParams().length, promptCategories.length);
  assert.equal(useCaseOg.generateStaticParams().length, allUseCases().length);
  for (const g of guides) await png(await guideOg.GET(req, { params: Promise.resolve({ slug: g.slug }) }), `guide ${g.slug}`);
  assert.equal((await guideOg.GET(req, { params: Promise.resolve({ slug: "no-such-guide" }) })).status, 404);
  await png(await blogOg.GET(req, { params: Promise.resolve({ slug: allPosts()[0].slug }) }), "blog");
  await png(await docsOg.GET(req, { params: Promise.resolve({ slug: allDocs()[0].slug.split("/") }) }), "doc");
  await png(await promptsOg.GET(req, { params: Promise.resolve({ category: promptCategories[0].slug }) }), "prompts");
  await png(await useCaseOg.GET(req, { params: Promise.resolve({ slug: allUseCases()[0].slug }) }), "use case");
});
