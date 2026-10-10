import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { disableFamily, enableFamily, FamilyError, FAMILY_LIMITS, familyBlock, familyView, getFamily, pinProblem, resetFamilyPin, updateFamily } from "@/lib/personalize/family";
import { personalContext } from "@/lib/personalize/turn";
import { USER_COLLECTIONS } from "@/lib/privacy/account-data";

const code = (c: string) => (e: unknown) => e instanceof FamilyError && e.code === c;

test("family mode: PIN rules", () => {
  assert.equal(pinProblem("12a4") !== null, true);
  assert.equal(pinProblem("123") !== null, true);
  assert.match(pinProblem("0000")!, /repeated/);
  assert.match(pinProblem("1234")!, /straight run/);
  assert.match(pinProblem("9876")!, /straight run/);
  assert.equal(pinProblem("4831"), null);
  assert.equal(pinProblem("27081993"), null);
});

test("family mode: on with a PIN, the PIN is hashed, wrong PINs lock it, and only the right PIN turns it off", async () => {
  const ws = `ws_family_${Date.now()}`;
  const t0 = Date.parse("2026-10-06T22:00:00-04:00");
  await assert.rejects(enableFamily(ws, "1111", {}, t0), code("weak_pin"));
  const on = await enableFamily(ws, "4831", {}, t0);
  assert.equal(on.enabled, true);
  assert.equal(on.guideHomework, true, "homework guidance defaults on");
  assert.ok(!JSON.stringify(on).includes("4831"), "the PIN itself is never stored");
  await assert.rejects(enableFamily(ws, "5555", {}, t0), code("already_on"));
  for (let i = 1; i < FAMILY_LIMITS.maxTries; i++) await assert.rejects(disableFamily(ws, "0001", t0 + i), code("bad_pin"));
  await assert.rejects(disableFamily(ws, "0001", t0 + 10), code("locked"));
  await assert.rejects(disableFamily(ws, "4831", t0 + 20), code("locked"), "even the right PIN waits out the lock");
  assert.equal(familyView(await getFamily(ws), t0 + 20).locked, true);
  const after = t0 + FAMILY_LIMITS.lockMinutes * 60_000 + 1000;
  await updateFamily(ws, "4831", { guideHomework: false, newPin: "7302" }, after);
  await assert.rejects(disableFamily(ws, "4831", after + 1), code("bad_pin"), "the old PIN stopped working");
  await disableFamily(ws, "7302", after + 2);
  assert.equal((await getFamily(ws))!.enabled, false);
});

test("family mode: a forgotten PIN resets only right after a fresh sign-in", async () => {
  const ws = `ws_family_reset_${Date.now()}`;
  const t0 = Date.now();
  await enableFamily(ws, "4831", {}, t0);
  await assert.rejects(resetFamilyPin(ws, new Date(t0 - 11 * 60_000), "6620", t0), code("not_fresh"));
  await assert.rejects(resetFamilyPin(ws, null, "6620", t0), code("not_fresh"));
  await resetFamilyPin(ws, new Date(t0 - 60_000), "6620", t0);
  await disableFamily(ws, "6620", t0 + 1);
});

test("family mode: the rules lead every answer's context, even where personal settings aren't read (API, embed, Private chat)", async () => {
  const ws = `ws_family_ctx_${Date.now()}`;
  assert.equal(familyBlock(null), "");
  await enableFamily(ws, "4831", { guideHomework: true });
  const web = await personalContext({ workspaceId: ws, personalAllowed: true, withhold: false });
  assert.equal(web.family, true);
  assert.ok(web.block.startsWith("<family_mode>"), "it goes first");
  assert.match(web.block, /age-appropriate/);
  assert.match(web.block, /guide the person to their own answer/);
  const api = await personalContext({ workspaceId: ws, personalAllowed: false, withhold: false });
  assert.match(api.block, /<family_mode>/);
  const other = await personalContext({ workspaceId: `${ws}_none`, personalAllowed: true, withhold: false });
  assert.equal(other.family, false);
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("family_settings"));
});
