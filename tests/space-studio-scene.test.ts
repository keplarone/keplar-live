import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSpaceStudioSurface, SPACE_SKY_SCRIPT } from "@/components/space/surface";
import { SPACE_HOST } from "@/lib/site";

const read = (f: string) => readFileSync(f, "utf8");

test("Space Studio is the space host or the /space-studio routes, and nothing else", () => {
  assert.equal(isSpaceStudioSurface(SPACE_HOST, "/"), true);
  assert.equal(isSpaceStudioSurface(SPACE_HOST, "/space-studio"), true);
  assert.equal(isSpaceStudioSurface("keplar.one", "/space-studio"), true);
  assert.equal(isSpaceStudioSurface("keplar.one", "/space-studio/app"), true);
  assert.equal(isSpaceStudioSurface("keplar.one", "/"), false);
  assert.equal(isSpaceStudioSurface("keplar.one", "/space"), false);
  assert.equal(isSpaceStudioSurface("keplar.one", "/docs"), false);
  assert.equal(isSpaceStudioSurface("business.keplar.one", "/"), false);
  assert.equal(isSpaceStudioSurface("localhost:3000", "/pricing"), false);
  assert.equal(isSpaceStudioSurface("", "/space-studio"), true);
});

test("the root layout skips the shared sky on Space Studio before paint, and the page keeps its star field", () => {
  const root = read("src/app/layout.tsx");
  assert.match(root, /SPACE_SKY_SCRIPT/);
  assert.match(root, /data-site-sky/);
  assert.match(root, /<SpaceSkyExempt>\s*<SiteClouds \/>/);
  assert.match(SPACE_SKY_SCRIPT, new RegExp(SPACE_HOST.replace(".", "\\.")));
  assert.match(SPACE_SKY_SCRIPT, /\/space-studio\//);
  const space = read("src/app/(space)/layout.tsx");
  assert.match(space, /SpaceBackground/);
  assert.match(space, /SpaceAura/);
  assert.match(read("src/components/space/SpaceChrome.tsx"), /function SpaceBackground/);
  assert.match(read("src/components/space/SpaceChrome.tsx"), /Leaving orbit/);
  const css = read("src/components/space/space.module.css");
  assert.match(css, /--sp-word: linear-gradient\(100deg, #b27cff 0%, #f08bd8/);
  assert.match(css, /#c58cff 0%, #f08bd8 18%, #a98cff 36%, #d76cff/);
  assert.match(css, /background-image: var\(--sp-word\)/);
  assert.match(css, /data-site-sky/);
  assert.match(css, /data-glass-pill/);
  assert.match(css, /backdrop-filter: none !important/);
  assert.doesNotMatch(read("src/components/sky/clouds/LandingClouds.tsx"), /space-studio|SPACE_HOST/);
  assert.doesNotMatch(read("src/styles/glass.css"), /data-space-root|data-space-studio/);
});
