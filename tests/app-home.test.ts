import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { APP_HOME, isAppPath, pathForView, viewForPath } from "../src/components/app-ui/app-paths";
import { EXPLORE_LINKS } from "../src/components/app-ui/explore-links";
import { isChatSurface, isProductHost } from "../src/components/space/surface";
import { variantFor } from "../src/field/monolith/math";
import { sitemapPaths } from "../src/app/sitemap";
import { whopPixelAllowed } from "../src/lib/whop-pixel";

test("the site root is the chat, and /app still opens it", () => {
  assert.equal(APP_HOME, "/");
  assert.equal(pathForView("thread"), "/");
  assert.equal(viewForPath("/"), "thread");
  assert.equal(viewForPath("/app"), "thread");
  assert.equal(viewForPath("/app/ask"), "thread");
  assert.equal(isAppPath("/"), true);
  assert.equal(isAppPath("/overview"), false);
  assert.equal(isAppPath("/pricing"), false);
  const home = readFileSync("src/app/(chat)/page.tsx", "utf8");
  assert.match(home, /localeAlternates\("\/", "en"\)/);
  assert.match(home, /Free to try, no signup/);
  const shell = readFileSync("src/components/app-ui/ChatHome.tsx", "utf8");
  assert.match(shell, /How can Keplar help you today\?/);
  assert.match(shell, /softwareApp\(\)/);
  assert.match(readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8"), /Log in/);
  assert.match(readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8"), /Sign up for free/);
  assert.match(readFileSync("next.config.ts", "utf8"), /source: "\/app", destination: "\/", permanent: true/);
});

test("the marketing landing moved to /overview and stays in the sitemap", () => {
  const page = readFileSync("src/app/(marketing)/overview/page.tsx", "utf8");
  assert.match(page, /<SkyHome /);
  assert.match(page, /pageMeta\(\s*"\/overview"/);
  assert.ok(sitemapPaths.includes("/overview"));
  assert.ok(sitemapPaths.includes("/"));
  assert.equal(variantFor("/"), null);
  assert.equal(variantFor("/overview"), "home");
  assert.equal(variantFor("/app/ask"), null);
});

test("the chat home links to the rest of the site, and the sky stays off the chat", () => {
  const hrefs: string[] = EXPLORE_LINKS.map((l) => l.href);
  for (const h of ["/overview", "/pricing", "/docs", "/guides", "/tools", "/privacy", "/terms"]) assert.ok(hrefs.includes(h), h);
  assert.equal(isChatSurface("/"), true);
  assert.equal(isChatSurface("/app/create"), true);
  assert.equal(isChatSurface("/overview"), false);
  assert.equal(isChatSurface("/pricing"), false);
  assert.equal(isProductHost("keplar.one"), true);
  assert.equal(isProductHost("space.keplar.one"), false);
  assert.equal(isProductHost("business.keplar.one"), false);
  assert.equal(whopPixelAllowed("/"), false);
  assert.equal(whopPixelAllowed("/overview"), false);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /APP_SURFACE_SCRIPT/);
  assert.match(readFileSync("src/styles/app-surface.css", "utf8"), /data-app-surface/);
});
