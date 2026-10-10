import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { BILLED_USD, feeFor, growthDashboard } from "../src/lib/growth/dashboard";
import { developersPage } from "../src/lib/growth/developers-page";

test("dashboard with no data says so instead of inventing numbers", async () => {
  const d = await growthDashboard(30);
  assert.equal(d.windowDays, 30);
  const json = JSON.stringify(d);
  assert.ok(!/NaN|Infinity/.test(json));
  for (const s of d.funnel.steps) assert.ok(s.browsers === null || s.browsers >= 0);
});

test("billed amounts are what Whop charges, and the fee is 2.7% + $0.30", () => {
  assert.deepEqual(BILLED_USD, { lite: 19.99, plus: 44.99, pro: 99.99 });
  assert.equal(Math.round(feeFor(44.99) * 100) / 100, 1.51);
});

test("the in-app answer badge never shows a percentage", () => {
  const src = readFileSync("src/components/app-ui/KeplarTurn.tsx", "utf8");
  assert.equal(/Math\.round\([^)]*score[^)]*\*\s*100/.test(src), false, "no score*100 percentage in the answer card");
  assert.match(src, /Models agree|Models split/);
});

test("/for-developers makes no forbidden claims and states real limits and prices", () => {
  const text = JSON.stringify(developersPage);
  for (const bad of [/smartest/i, /always accurate/i, /guarantee/i, /better than (every|all)/i, /\b\d{1,3}%\b/, /testimonial/i, /\b\d+,?\d* (users|customers|developers)\b/i, /rated/i])
    assert.equal(bad.test(text), false, String(bad));
  assert.match(text, /not proof|Agreement is a signal/i);
  assert.match(text, /\$20/);
  assert.match(text, /\$45/);
  assert.match(text, /\$99/);
  assert.match(text, /50 questions a day/);
  assert.match(text, /web/i);
  assert.equal(/born|birth|years old|\bage\b/i.test(text), false);
});
