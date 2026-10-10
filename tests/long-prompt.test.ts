import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as keplarPOST } from "@/app/api/keplar/route";

// QA 2026-10-05: pasting more than 16,000 characters showed "prompt must be under 16000 characters." in the answer card.
test("an over-long question gets a readable message, not the raw field error", async () => {
  const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.77.1.2" }, body: JSON.stringify({ prompt: "a".repeat(16_001) }) }));
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.match(text, /That message is too long \(up to 16,000 characters\)\. Shorten it and try again\./);
  assert.doesNotMatch(text, /prompt must be under/);
});
