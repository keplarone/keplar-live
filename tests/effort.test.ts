import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CostAwareRouter } from "@/lib/orchestration/router";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { EFFORTS, EFFORT_INFO, isEffort, panelParamsForEffort, routingForEffort } from "@/lib/orchestration/effort";

const prompt = "Compare PostgreSQL and MongoDB for a new analytics product, explain the trade-offs and recommend one.";

test("effort presets cost more at each step, keep the person's data choices, and warn on High and Max", () => {
  const router = new CostAwareRouter();
  const classifier = new HeuristicClassifier();
  const units = EFFORTS.map((e) => {
    const req = { prompt, routing: routingForEffort(e, { tier: "sensitive", excludeProviders: ["x"] }) };
    assert.equal(req.routing.tier, "sensitive");
    assert.deepEqual(req.routing.excludeProviders, ["x"]);
    assert.equal(req.routing.effort, e);
    return router.route(classifier.classify(req), req).estimate.units;
  });
  for (let i = 1; i < units.length; i++) assert.ok(units[i] >= units[i - 1], `${EFFORTS[i]} should not cost less than ${EFFORTS[i - 1]}: ${units}`);
  assert.ok(units[3] > units[0]);
  assert.equal(routingForEffort("low").maxModels, 1);
  assert.deepEqual(EFFORTS.filter((e) => EFFORT_INFO[e].warn), ["high", "max"]);
  assert.ok(isEffort("max") && !isEffort("extreme") && !isEffort(undefined));
});

test("effort sets how hard each panel model thinks; medium leaves Keplar's choice alone", () => {
  const p = { reasoningEffort: "medium" as const, maxOutputTokens: 1400 };
  assert.deepEqual(panelParamsForEffort(p, "medium"), p);
  assert.deepEqual(panelParamsForEffort(p, undefined), p);
  assert.equal(panelParamsForEffort(p, "low").reasoningEffort, "low");
  assert.ok(panelParamsForEffort(p, "low").maxOutputTokens! <= 1000);
  assert.equal(panelParamsForEffort(p, "max").reasoningEffort, "high");
  assert.ok(panelParamsForEffort(p, "max").maxOutputTokens! > panelParamsForEffort(p, "high").maxOutputTokens!);
});

test("the API only accepts a known effort, and the composer shows the warning with the usage multiple", () => {
  const api = readFileSync("src/app/api/keplar/route.ts", "utf8");
  assert.match(api, /isEffort\(effort\) \? routingForEffort\(effort, r\) : r/);
  const ui = readFileSync("src/components/app-ui/Composer.tsx", "utf8");
  assert.match(ui, /× or more usage/);
  assert.match(ui, /Fewest credits/);
});
