import "./setup";
import { signIn, jsonReq } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/feedback/route";
import { feedbackCounts, recentFeedback, validateFeedback } from "../src/lib/growth/feedback";
import { RESEARCH_QUESTIONS } from "../src/lib/growth/research";

let n = 0;
const send = (body: unknown, cookie: string | null = null) => {
  const r = jsonReq(cookie, "/api/feedback", "POST", body);
  r.headers.set("x-forwarded-for", `8.8.${(++n >> 8) & 255}.${n & 255}`);
  return POST(r);
};

test("there are exactly ten research questions with unique keys", () => {
  assert.equal(RESEARCH_QUESTIONS.length, 10);
  assert.equal(new Set(RESEARCH_QUESTIONS.map((q) => q.key)).size, 10);
});

test("validation: kind required, honeypot rejected, email only with permission, research needs an answer", () => {
  assert.equal(validateFeedback({ kind: "nope", message: "x" }).ok, false);
  assert.equal(validateFeedback({ kind: "idea", message: "" }).ok, false);
  assert.equal(validateFeedback({ kind: "idea", message: "hi", website: "http://spam" }).ok, false);
  assert.equal(validateFeedback({ kind: "research" }).ok, false);
  assert.equal(validateFeedback({ kind: "research", answers: { q1: "I use two chatbots" } }).ok, true);
  const noPerm = validateFeedback({ kind: "idea", message: "hi", email: "a@b.co" });
  assert.ok(noPerm.ok && noPerm.value.email === undefined);
  assert.equal(validateFeedback({ kind: "idea", message: "hi", contactOk: true, email: "bad" }).ok, false);
  const withPerm = validateFeedback({ kind: "idea", message: "hi", contactOk: true, email: "a@b.co", role: "Independent developer" });
  assert.ok(withPerm.ok && withPerm.value.email === "a@b.co" && withPerm.value.role === "Independent developer");
  const long = validateFeedback({ kind: "general", message: "x".repeat(9000) });
  assert.ok(long.ok && long.value.message.length === 3000);
});

test("route: anonymous feedback is stored without an account; cancellation reason works; unknown fields are not stored", async () => {
  const r = await send({ kind: "cancel", message: "Too expensive for how often I use it", extra: "ignored" });
  assert.equal(r.status, 200);
  const list = await recentFeedback(50);
  const hit = list.find((x) => x.message.includes("Too expensive"));
  assert.ok(hit);
  assert.equal(hit.workspaceId, "anon");
  assert.equal(hit.signedIn, false);
  assert.equal("extra" in hit, false);
  assert.ok((await feedbackCounts(30)).cancel >= 1);
});

test("route: signed-in feedback records the plan, bad input is 400, cross-site is 403, bursts are limited", async () => {
  const u = await signIn("fb-user@example.com", "plus");
  const ok = await send({ kind: "idea", message: "Add a Slack share" }, u.cookie);
  assert.equal(ok.status, 200);
  const row = (await recentFeedback(50)).find((x) => x.message === "Add a Slack share");
  assert.equal(row?.plan, "plus");
  assert.equal(row?.signedIn, true);
  assert.equal((await send({ kind: "idea", message: "" })).status, 400);
  const cross = new Request("https://keplar.one/api/feedback", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ kind: "idea", message: "hi" }) });
  assert.equal((await POST(cross)).status, 403);
  const same = () => new Request("https://keplar.one/api/feedback", { method: "POST", headers: { origin: "https://keplar.one", "content-type": "application/json", "x-forwarded-for": "6.6.6.6" }, body: JSON.stringify({ kind: "general", message: "burst" }) });
  const codes: number[] = [];
  for (let i = 0; i < 10; i++) codes.push((await POST(same())).status);
  assert.ok(codes.includes(429), codes.join(","));
});
