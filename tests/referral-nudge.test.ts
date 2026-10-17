import { test } from "node:test";
import assert from "node:assert/strict";
import { nudgeDue } from "../src/components/app-ui/referral-nudge-logic";

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

test("referral nudge: waits for the third app open, then stays due until it has been seen", () => {
  const s = memory();
  assert.equal(nudgeDue(s), false);
  assert.equal(nudgeDue(s), false);
  assert.equal(nudgeDue(s), true);
  assert.equal(nudgeDue(s), true, "still due if the toast never got shown (e.g. the fetch failed)");
});

test("referral nudge: never due again once seen", () => {
  const s = memory({ kp_invite_nudge_seen: "1", kp_invite_nudge_opens: "9" });
  assert.equal(nudgeDue(s), false);
  assert.equal(s.m.get("kp_invite_nudge_opens"), "9", "a seen nudge stops counting");
});
