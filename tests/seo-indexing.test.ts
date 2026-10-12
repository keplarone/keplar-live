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

test("Search Console: Keplar's own pages send no noindex; private share links and preview hosts keep it", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(config, /\(app\|signin\|signup\|welcome\|account\|checkout/, "no X-Robots-Tag rule for the app, auth, account, checkout or /compare routes");
  assert.match(config, /vercel[^"]*app\)" \}\],\s*headers: \[\{ key: "X-Robots-Tag", value: "noindex, nofollow" \}\]/, "*.vercel.app and localhost copies stay out of search");
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.doesNotMatch(proxy, /if \(pathname !== "\/"\) res\.headers\.set\("x-robots-tag"/, "Business pages are indexable");
  assert.match(proxy, /pathname\.startsWith\("\/r\/"\)[\s\S]{0,120}"x-robots-tag", "noindex, nofollow, noarchive"/, "private shared answers stay noindex");
  for (const f of ["src/app/app/_tab.tsx", "src/app/(business-app)/layout.tsx", "src/app/embed/layout.tsx", "src/app/welcome/page.tsx", "src/app/not-found.tsx", "src/app/bot/route.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /noindex|index: false/, f);
  }
});
