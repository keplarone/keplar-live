import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTryCta, plainText, SIGNED_KEY, SIGNED_SCRIPT } from "@/lib/signed-hint";

test("which labels are the 'Try Keplar' call to action", () => {
  for (const t of ["Try Keplar", "Try Keplar free", "Try Keplar One free", "Try it free", " Try Keplar "]) assert.ok(isTryCta(t), t);
  for (const t of ["Try again", "Start free", "Try Keplar Pro today", "Open Keplar", "", null]) assert.ok(!isTryCta(t as string), String(t));
  assert.equal(plainText(["Try ", "Keplar"]), "Try Keplar");
  assert.equal(plainText(["Try ", { x: 1 }]), null);
});
test("no flash: the inline script sets data-signed before paint, CSS shows one of two labels, usePlan keeps the hint current", () => {
  assert.match(SIGNED_SCRIPT, new RegExp(SIGNED_KEY));
  assert.match(SIGNED_SCRIPT, /setAttribute\("data-signed","1"\)/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /SIGNED_SCRIPT/);
  const css = readFileSync("src/styles/fit.css", "utf8");
  assert.match(css, /\[data-cta="open"\] \{ display: none; \}/);
  assert.match(css, /html\[data-signed="1"\] \[data-cta="try"\] \{ display: none; \}/);
  const up = readFileSync("src/components/billing/usePlan.ts", "utf8");
  assert.match(up, /localStorage\.setItem\(SIGNED_KEY/);
  assert.match(up, /i === FAILED\) return i/);
  const btn = readFileSync("src/components/ui/Button.tsx", "utf8");
  assert.match(btn, /isTryCta\(plainText\(children\)\) \? <CtaLabel/);
});
