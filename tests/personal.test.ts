import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { businessProminent, examplesFor, isUseFor, personalPrompts } from "@/components/app-ui/use-for";
import { tiers } from "@/lib/tiers";
import { useCases } from "@/lib/sections";

test("onboarding: personal by default; business tab prominent only for business/both", () => {
  assert.deepEqual(examplesFor(null), personalPrompts);
  assert.equal(businessProminent(null), false);
  assert.equal(businessProminent("personal"), false);
  assert.equal(businessProminent("business"), true);
  assert.equal(businessProminent("both"), true);
  assert.equal(examplesFor("both").length, 6);
  assert.ok(examplesFor("personal").some((p) => /not medical advice/i.test(p.hint)), "health example carries the caveat");
  for (const bad of ["", "admin", null, 1]) assert.equal(isUseFor(bad), false);
});

test("honest copy: prices unchanged, Plus doesn't promise web lookups, health use case has a caveat", () => {
  assert.deepEqual(tiers.map((t) => t.price), [0, 20, 45, 99]); // Business is sold at business.keplar.one
  const plus = tiers.find((t) => t.id === "plus")!;
  assert.ok(!plus.features.some((f) => /^web,/i.test(f)), "no 'Web, coding…' claim");
  assert.ok(plus.features.includes("Web search only in the desktop app (Live Research, beta)"), "web search is the desktop's Live Research, not browser answers");
  const free = tiers.find((t) => t.id === "free")!;
  for (const f of ["Free open models only", "Web search only in the desktop app (Live Research, beta)", "Image and video questions on free vision models"]) assert.ok(free.features.includes(f), f);
  assert.match(useCases.find((u) => u.id === "health")?.caveat ?? "", /not medical advice/i);
  const all = JSON.stringify({ tiers, useCases });
  assert.doesNotMatch(all, /against sources|accurate|accuracy/i);
  // Only Free (open models, fair use) is described as unlimited; paid plans have monthly allowances.
  assert.doesNotMatch(JSON.stringify({ tiers: tiers.filter((t) => t.id !== "free"), useCases }), /unlimited/i);
  assert.ok(free.features.some((f) => /fair use/i.test(f)), "Free's unlimited use is qualified");
});
