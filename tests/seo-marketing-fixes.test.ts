import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { softwareApp } from "../src/lib/structuredData";
import { tiers } from "../src/lib/tiers";

test("pricing title, description and OG name Lite at the real $20 price, in every locale", () => {
  const lite = tiers.find((t) => t.id === "lite");
  assert.equal(lite?.price, 20);
  for (const f of ["src/app/(marketing)/pricing/page.tsx", "src/app/(marketing)/pricing/opengraph-image.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /Lite \$20/, f);
    assert.match(src, /Plus \$45/, f);
    assert.match(src, /Pro \$99/, f);
  }
  const dir = "src/lib/i18n/messages/marketing";
  for (const name of readdirSync(dir)) {
    const src = readFileSync(`${dir}/${name}`, "utf8");
    const block = src.match(/["']?pricing["']?\s*:\s*\{[\s\S]*?\btitle\b[\s\S]*?\bdescription\b[\s\S]*?\}/)?.[0] ?? "";
    assert.match(block, /Lite/, name);
    assert.ok(block.includes("$20"), `${name} meta is missing $20`);
    assert.ok(block.includes("$45") && block.includes("$99"), name);
  }
  const offers = softwareApp().offers as { price: string }[];
  assert.ok(offers.some((o) => o.price === "20"), "SoftwareApplication offers include Lite");
  const raw = JSON.stringify(softwareApp());
  assert.equal(raw.includes("aggregateRating"), false);
  assert.equal(raw.includes('"Review"'), false);
});
