import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq } from "./helpers/session";
import { POST } from "@/app/api/keplar/wants/orchestrate/route";
import { POST as pinPOST } from "@/app/api/keplar/wants/pin/route";
import { POST as oauthStart } from "@/app/api/keplar/wants/oauth/[provider]/start/route";
import { POST as oauthCallback } from "@/app/api/keplar/wants/oauth/callback/route";
import { QUESTION, wantsTestHooks } from "@/lib/wants/orchestrate";
import { setPin } from "@/lib/wants/pin";
import { FORM_HTML } from "@/lib/wants/fixtures";
import { collection } from "@/lib/create/platform/store";
import type { PendingWant } from "@/lib/wants/confirmations";
import { scriptedPage } from "./helpers/wants-page";

// These legacy fixture tests explicitly opt into the non-production sandbox.
process.env.KEPLAR_WANTS_SANDBOX = "1";
const origin = "https://keplar.one";
const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

function resetHooks() {
  wantsTestHooks.timeoutMs = null;
  wantsTestHooks.plan = null;
  wantsTestHooks.openPage = null;
}

test("orchestrate requires a session", async () => {
  assert.equal((await POST(jsonReq(null, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want pizza" }))).status, 401);
  const forged = new Request(`${origin}/api/keplar/wants/orchestrate`, {
    method: "POST",
    headers: { cookie: "better-auth.session_token=not-a-session", origin, "content-type": "application/json" },
    body: JSON.stringify({ prompt: "I want pizza" }),
  });
  assert.equal((await POST(forged)).status, 401);
});

test("refusals and escalations are structured and do not run anything", async () => {
  const u = await signIn("wants-safety@example.com");
  const refused = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want you to bypass the captcha on ticketmaster" }))).json();
  assert.equal(refused.status, "refused");
  assert.equal(refused.code, "circumvention");
  assert.equal(refused.confirmationId, undefined);

  const medical = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want a prescription dosage for this" }))).json();
  assert.equal(medical.status, "escalated");
  assert.equal(medical.code, "regulated_advice");

  const wire = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want to wire 25000 to an account" }))).json();
  assert.equal(wire.status, "escalated");
  assert.equal(wire.code, "high_value_transfer");
});

test("question, then PIN, then a dry-run; a bad PIN and another account do nothing", async () => {
  const page = scriptedPage(FORM_HTML);
  wantsTestHooks.openPage = page.open;
  try {
    const u = await signIn("wants-flow@example.com");
    const other = await signIn("wants-flow-other@example.com");
    await setPin(u.workspaceId, "1234");

    const ask = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want pizza" }))).json();
    assert.equal(ask.ui.type, "question");
    assert.equal(ask.ui.question, QUESTION);

    const plan = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want pizza", answers: { [QUESTION]: "Tomorrow" } }))).json();
    assert.equal(plan.ui.type, "pin");
    assert.equal(plan.track, "B");
    assert.ok(plan.confirmationId);

    const unset = await signIn("wants-nopin@example.com");
    const noPinPlan = await (await POST(jsonReq(unset.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want pizza", answers: { [QUESTION]: "Tomorrow" } }))).json();
    const noPin = await (await POST(jsonReq(unset.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: noPinPlan.confirmationId, pin: "1234" }))).json();
    assert.equal(noPin.reason, "pin_not_set");

    const bad = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: plan.confirmationId, pin: "0000" }))).json();
    assert.equal(bad.reason, "bad_pin");

    const stolen = await (await POST(jsonReq(other.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: plan.confirmationId, pin: "1234" }))).json();
    assert.equal(stolen.status, "error");

    const ok = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: plan.confirmationId, pin: "1234" }))).json();
    assert.equal(ok.status, "dry_run", JSON.stringify(ok));
    assert.equal(ok.submitted, false);
    assert.deepEqual(page.clicks, []);
    assert.ok(page.fills.some(([, v]) => v.includes("pizza")));

    const again = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: plan.confirmationId, pin: "1234" }))).json();
    assert.equal(again.reason, "unknown_or_expired_confirmation");
  } finally {
    resetHooks();
  }
});

test("a confirmation older than ten minutes is refused", async () => {
  const u = await signIn("wants-expire@example.com");
  await setPin(u.workspaceId, "1234");
  const plan = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want pizza", answers: { [QUESTION]: "Tomorrow" } }))).json();
  await collection<PendingWant>("wants_confirmations").update(u.workspaceId, plan.confirmationId, { createdAt: Date.now() - 11 * 60 * 1000 });
  const expired = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: plan.confirmationId, pin: "1234" }))).json();
  assert.equal(expired.reason, "unknown_or_expired_confirmation");
});

test("payloads over 50MB are rejected before they are parsed", async () => {
  const req = new Request(`${origin}/api/keplar/wants/orchestrate`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "content-length": String(60 * 1024 * 1024) },
    body: "{}",
  });
  const res = await POST(req);
  assert.equal(res.status, 413);
  assert.equal((await res.json()).reason, "payload_too_large");
});

test("the orchestrator stops at its timeout", async () => {
  const u = await signIn("wants-timeout@example.com");
  wantsTestHooks.timeoutMs = 200;
  wantsTestHooks.plan = () => new Promise((resolve) => setTimeout(() => resolve({ status: "answered" }), 2_000));
  try {
    const res = await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want pizza" }));
    assert.equal(res.status, 504);
    assert.equal((await res.json()).status, "timeout");
  } finally {
    resetHooks();
  }
});

test("official gateway connect is a placeholder and stays PIN-gated", async () => {
  const u = await signIn("wants-oauth@example.com");
  const pin = await pinPOST(jsonReq(u.cookie, "/api/keplar/wants/pin", "POST", { pin: "4321" }));
  assert.equal(pin.status, 200, await pin.clone().text());
  assert.equal((await pinPOST(jsonReq(u.cookie, "/api/keplar/wants/pin", "POST", { pin: "9999" }))).status, 403);
  assert.equal((await pinPOST(jsonReq(u.cookie, "/api/keplar/wants/pin", "POST", { pin: "9999", currentPin: "4321" }))).status, 200);
  await pinPOST(jsonReq(u.cookie, "/api/keplar/wants/pin", "POST", { pin: "4321", currentPin: "9999" }));

  const start = await (await oauthStart(jsonReq(u.cookie, "/api/keplar/wants/oauth/commerce/start", "POST", {}), ctx("commerce"))).json();
  assert.equal(start.placeholder, true);
  assert.match(start.authorizeUrl, /client_id=PLACEHOLDER_CLIENT_ID/);
  assert.match(start.authorizeUrl, /example\.com/);

  const bad = await (await oauthCallback(jsonReq(u.cookie, "/api/keplar/wants/oauth/callback", "POST", { state: start.state, code: "x", pin: "0000" }))).json();
  assert.equal(bad.reason, "pin_required");

  const again = await (await oauthStart(jsonReq(u.cookie, "/api/keplar/wants/oauth/commerce/start", "POST", {}), ctx("commerce"))).json();
  const ok = await (await oauthCallback(jsonReq(u.cookie, "/api/keplar/wants/oauth/callback", "POST", { state: again.state, code: "x", pin: "4321" }))).json();
  assert.equal(ok.status, "connected");
  assert.equal(ok.simulated, true);

  const plan = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "I want shoes", answers: { [QUESTION]: "Tomorrow" } }))).json();
  assert.equal(plan.track, "A");
  const done = await (await POST(jsonReq(u.cookie, "/api/keplar/wants/orchestrate", "POST", { prompt: "confirm", confirmationId: plan.confirmationId, pin: "4321" }))).json();
  assert.equal(done.status, "simulated");
  assert.match(done.note ?? "", /Placeholder/);
});

