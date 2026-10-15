import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIN_ATTEMPTS, setPin, verifyPin } from "@/lib/wants/pin";
import { RateLimitError } from "@/lib/create/platform/ratelimit";

test("Wants PIN checks are limited per account, so a 4-digit PIN can't be brute forced at the request rate", async () => {
  const ws = "ws_pin_limit";
  assert.equal(await setPin(ws, "4821"), "set");
  for (let i = 0; i < PIN_ATTEMPTS.max - 1; i++) assert.equal(await verifyPin(ws, String(1000 + i)), "bad");
  assert.equal(await verifyPin(ws, "4821"), "ok", "the last allowed attempt still works");
  await assert.rejects(verifyPin(ws, "4821"), RateLimitError, "then even the right PIN waits for the window");
  await assert.rejects(setPin(ws, "1111", "4821"), RateLimitError, "changing the PIN counts as an attempt too");
  assert.equal(await verifyPin("ws_pin_other", "0000"), "unset", "other accounts are unaffected (and an unset PIN costs no attempt)");
});
