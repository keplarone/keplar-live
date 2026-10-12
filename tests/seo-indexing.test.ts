import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { businessMoved } from "@/proxy";
import { landingPages } from "@/lib/content/landing";

test("Search Console: no page inherits the home page's canonical", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /alternates:\s*\{\s*canonical:\s*"\/"\s*\}/, "a default canonical would mark every page without one as a copy of the home page");
  assert.ok(readFileSync("src/app/(marketing)/specialists/page.tsx", "utf8").includes(`export const metadata: Metadata = pageMeta("/specialists"`), "the directory names itself as canonical");
});

test("Search Console: keplar.one/business goes to Keplar Business instead of a 404", () => {
  const loc = businessMoved(new NextRequest("https://keplar.one/business"))?.headers.get("location") ?? "";
  assert.match(loc, /^https?:\/\/business\.[^/]+\/$/);
});

test("Search Console: landing pages don't link to the noindexed comparison pages", () => {
  for (const p of landingPages) assert.ok(!(p.related ?? []).includes("/compare"), p.slug);
});
