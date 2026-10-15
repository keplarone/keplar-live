import { test } from "node:test";
import assert from "node:assert/strict";
import { planWant, sandboxEnabled, orchestrateWant } from "../src/lib/wants/orchestrate";

const req = (prompt: string) => ({ prompt, answers: {}, confirmationId: null, pin: null });

test("default wants flow provides advice without opening a fixture, looking up synthetic agents or asking for a PIN", async () => {
  const old = process.env.KEPLAR_WANTS_SANDBOX;
  delete process.env.KEPLAR_WANTS_SANDBOX;
  try {
    assert.equal(sandboxEnabled(), false);
    const result = await orchestrateWant("account", req("I want advice on organizing my room"));
    assert.notEqual(result, "timeout");
    if (result === "timeout") return;
    assert.equal(result.status, "ready");
    assert.equal(result.agents, undefined);
    assert.equal(result.confirmationId, undefined);
    assert.equal(result.simulated, undefined);
  } finally { if (old === undefined) delete process.env.KEPLAR_WANTS_SANDBOX; else process.env.KEPLAR_WANTS_SANDBOX = old; }
});

test("production ignores the sandbox flag and rejects legacy confirmations", async () => {
  const oldMode = process.env.NODE_ENV;
  const oldSandbox = process.env.KEPLAR_WANTS_SANDBOX;
  Object.assign(process.env, { NODE_ENV: "production", KEPLAR_WANTS_SANDBOX: "1" });
  try {
    assert.equal(sandboxEnabled(), false);
    const result = await planWant("account", { ...req("confirm"), confirmationId: "fixture-token", pin: "1234" });
    assert.equal(result.reason, "legacy_confirmation");
    assert.equal(result.submitted, undefined);
    assert.equal(result.simulated, undefined);
  } finally {
    if (oldMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: oldMode });
    if (oldSandbox === undefined) delete process.env.KEPLAR_WANTS_SANDBOX; else process.env.KEPLAR_WANTS_SANDBOX = oldSandbox;
  }
});

test("the live route preserves the existing authorization and safety checks", async () => {
  const result = await planWant("account", req("I want you to bypass the captcha on a booking site"));
  assert.equal(result.status, "refused");
  assert.equal(result.code, "circumvention");
  assert.equal(result.confirmationId, undefined);
});
