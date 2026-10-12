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

test("Comparison pages (approved 2026-10-12): indexable, with Keplar's real prices", async () => {
  for (const f of ["src/app/(marketing)/compare/page.tsx", "src/app/(marketing)/compare/[slug]/page.tsx"]) assert.doesNotMatch(readFileSync(f, "utf8"), /noindex/, f);
  const { keplarPlans } = await import("@/lib/compare");
  const { tiers } = await import("@/lib/tiers");
  for (const t of tiers) if (t.price) assert.ok(keplarPlans.includes(`$${t.price}/mo`), `${t.name} price on the comparison pages`);
  assert.match(keplarPlans, /Business from \$\d/);
  assert.doesNotMatch(readFileSync("src/lib/compare.ts", "utf8"), /Business custom/);
  assert.ok(landingPages.some((p) => (p.related ?? []).includes("/compare")), "landing pages link to the hub");
});
