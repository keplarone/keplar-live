import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  challengeOf, cleanLabel, CODE_TTL_SECONDS, deepLinkFor, displayCode, FINISH_TTL_SECONDS, hashSecret, isChallenge, isRequestId, isSecret,
  isVerifier, MAX_BAD_ATTEMPTS, newRequestId, newSecret, parseAuthDeepLink, REQUEST_TTL_SECONDS, verifierMatches,
} from "@/lib/desktop-auth/core";
import { approveRequest, cancelRequest, denyRequest, describeRequest, exchangeCode, pollRequest, redeemTicket, startRequest, type Deps } from "@/lib/desktop-auth/service";
import { memoryStore } from "@/lib/desktop-auth/store";

const KEY = "unit-test-key";
const who = { userId: "u1", email: "a@example.com", name: "Alex" };
function rig() {
  let t = 1_000_000;
  const deps: Deps = { store: memoryStore, key: KEY, now: () => t };
  return { deps, tick: (s: number) => void (t += s * 1000) };
}
const pair = () => {
  const verifier = newSecret();
  return { verifier, challenge: challengeOf(verifier) };
};
async function approved(r = rig()) {
  const p = pair();
  const s = await startRequest(r.deps, { challenge: p.challenge, label: "Keplar One on Windows" });
  assert.ok(s.ok);
  const a = await approveRequest(r.deps, s.rid, who);
  assert.ok(a.ok);
  return { r, p, rid: s.rid, code: a.code, a };
}

test("PKCE: the challenge is base64url(sha256(verifier)) and only that verifier matches", () => {
  const v = newSecret();
  assert.equal(challengeOf(v), createHash("sha256").update(v).digest("base64url"));
  assert.ok(isChallenge(challengeOf(v)) && isVerifier(v) && isSecret(v));
  assert.ok(verifierMatches(challengeOf(v), v));
  assert.ok(!verifierMatches(challengeOf(v), newSecret()));
  assert.ok(!isVerifier("short") && !isVerifier("a".repeat(129)) && !isVerifier("a b".repeat(20)));
  assert.ok(!isChallenge("x".repeat(42)) && !isChallenge(`${"x".repeat(42)}=`));
  assert.ok(isRequestId(newRequestId()) && !isRequestId("../../etc"));
});

test("ids and secrets are unguessable and never repeat", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
  const secrets = new Set(Array.from({ length: 500 }, () => newSecret()));
  assert.equal(ids.size, 500);
  assert.equal(secrets.size, 500);
  assert.equal(newSecret().length, 43); // 256 bits
  assert.equal(hashSecret("x").length, 64);
});

test("deep link: keplar://auth?code&rid round-trips; anything else is refused", () => {
  const code = newSecret();
  const rid = newRequestId();
  assert.deepEqual(parseAuthDeepLink(deepLinkFor(code, rid)), { code, rid });
  for (const bad of ["keplar://app/chat", "https://keplar.one/?code=x", `keplar://auth?code=${code}`, `keplar://auth?code=short&rid=${rid}`, `keplar://evil@auth?code=${code}&rid=${rid}`, "not a url", `keplar://auth/x?code=${code}&rid=<script>`]) {
    assert.equal(parseAuthDeepLink(bad), null, bad);
  }
});

test("display code is stable per request, readable, and differs between requests", () => {
  const a = newRequestId();
  assert.equal(displayCode(KEY, a), displayCode(KEY, a));
  assert.match(displayCode(KEY, a), /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
  assert.notEqual(displayCode(KEY, a), displayCode(KEY, newRequestId()));
  assert.notEqual(displayCode(KEY, a), displayCode("other-key", a));
});

test("device labels are short, printable and cannot carry markup", () => {
  const evil = cleanLabel("<script>alert('x')</script>\nKeplar One on Windows");
  assert.ok(!/[<>'"\n/]/.test(evil) && evil.length <= 40, evil);
  assert.equal(cleanLabel(undefined), "Keplar One desktop");
  assert.equal(cleanLabel("   "), "Keplar One desktop");
  assert.ok(cleanLabel("x".repeat(500)).length <= 40);
});

test("happy path: start -> approve -> exchange -> redeem ticket, and the state moves through the whole machine", async () => {
  const { r, p, rid, code, a } = await approved();
  assert.ok(a.deepLink.startsWith("keplar://auth?code="));
  assert.deepEqual(parseAuthDeepLink(a.deepLink), { code, rid });
  assert.equal((await describeRequest(r.deps, rid)).state, "approved");
  const x = await exchangeCode(r.deps, { rid, code, verifier: p.verifier });
  assert.ok(x.ok);
  const who2 = await redeemTicket(r.deps, x.ticket);
  assert.deepEqual(who2, { ...who, app: "one" }, "a request with no app is Keplar One");
  assert.equal((await describeRequest(r.deps, rid)).state, "finished");
});

test("the code is single use: a second exchange fails even with the right verifier", async () => {
  const { r, p, rid, code } = await approved();
  assert.ok((await exchangeCode(r.deps, { rid, code, verifier: p.verifier })).ok);
  const again = await exchangeCode(r.deps, { rid, code, verifier: p.verifier });
  assert.deepEqual(again, { ok: false, reason: "used" });
});

test("two racing exchanges: exactly one wins", async () => {
  const { r, p, rid, code } = await approved();
  const results = await Promise.all(Array.from({ length: 8 }, () => exchangeCode(r.deps, { rid, code, verifier: p.verifier })));
  assert.equal(results.filter((x) => x.ok).length, 1);
});

test("the ticket is single use and expires after a minute", async () => {
  const { r, p, rid, code } = await approved();
  const x = await exchangeCode(r.deps, { rid, code, verifier: p.verifier });
  assert.ok(x.ok);
  assert.ok(await redeemTicket(r.deps, x.ticket));
  assert.equal(await redeemTicket(r.deps, x.ticket), null);
  const late = await approved();
  const y = await exchangeCode(late.r.deps, { rid: late.rid, code: late.code, verifier: late.p.verifier });
  assert.ok(y.ok);
  late.r.tick(FINISH_TTL_SECONDS + 1);
  assert.equal(await redeemTicket(late.r.deps, y.ticket), null);
  assert.equal(await redeemTicket(r.deps, "not-a-ticket"), null);
});

test("a stolen code is useless without the app's verifier (PKCE binding)", async () => {
  const { r, rid, code } = await approved();
  const attacker = pair();
  const x = await exchangeCode(r.deps, { rid, code, verifier: attacker.verifier });
  assert.deepEqual(x, { ok: false, reason: "invalid" });
  // and the legitimate app can still finish afterwards (a wrong guess did not burn the code)
});

test("a code from another request does not work on this one", async () => {
  const a = await approved();
  const b = await approved(a.r);
  const x = await exchangeCode(a.r.deps, { rid: a.rid, code: b.code, verifier: a.p.verifier });
  assert.deepEqual(x, { ok: false, reason: "invalid" });
  assert.ok((await exchangeCode(a.r.deps, { rid: a.rid, code: a.code, verifier: a.p.verifier })).ok);
});

test("the code dies after two minutes; the request after ten", async () => {
  const { r, p, rid, code } = await approved();
  r.tick(CODE_TTL_SECONDS + 1);
  assert.deepEqual(await exchangeCode(r.deps, { rid, code, verifier: p.verifier }), { ok: false, reason: "expired" });
  const q = rig();
  const pr = pair();
  const s = await startRequest(q.deps, { challenge: pr.challenge });
  assert.ok(s.ok);
  q.tick(REQUEST_TTL_SECONDS + 1);
  assert.equal((await describeRequest(q.deps, s.rid)).state, "expired");
  assert.deepEqual(await approveRequest(q.deps, s.rid, who), { ok: false, reason: "expired" });
  assert.deepEqual(await pollRequest(q.deps, s.rid, pr.verifier), { status: "expired" });
});

test("exchanging before the browser approved is refused, not silently accepted", async () => {
  const r = rig();
  const p = pair();
  const s = await startRequest(r.deps, { challenge: p.challenge });
  assert.ok(s.ok);
  assert.deepEqual(await exchangeCode(r.deps, { rid: s.rid, code: newSecret(), verifier: p.verifier }), { ok: false, reason: "not_approved" });
});

test("polling fallback: pending until approved, then the verifier holder (only) receives a working code", async () => {
  const r = rig();
  const p = pair();
  const s = await startRequest(r.deps, { challenge: p.challenge });
  assert.ok(s.ok);
  assert.deepEqual(await pollRequest(r.deps, s.rid, p.verifier), { status: "pending" });
  assert.deepEqual(await pollRequest(r.deps, s.rid, pair().verifier), { status: "invalid" }); // someone with only the request id learns nothing
  const a = await approveRequest(r.deps, s.rid, who);
  assert.ok(a.ok);
  const polled = await pollRequest(r.deps, s.rid, p.verifier);
  assert.equal(polled.status, "approved");
  assert.ok(polled.status === "approved");
  const x = await exchangeCode(r.deps, { rid: s.rid, code: polled.code, verifier: p.verifier });
  assert.ok(x.ok);
  assert.deepEqual(await pollRequest(r.deps, s.rid, p.verifier), { status: "used" });
});

test("cancel: only the app (with its verifier) can cancel; afterwards nothing works", async () => {
  const { r, p, rid, code } = await approved();
  assert.deepEqual(await cancelRequest(r.deps, rid, pair().verifier), { ok: false });
  assert.deepEqual(await cancelRequest(r.deps, rid, p.verifier), { ok: true });
  assert.deepEqual(await exchangeCode(r.deps, { rid, code, verifier: p.verifier }), { ok: false, reason: "cancelled" });
  assert.deepEqual(await approveRequest(r.deps, rid, who), { ok: false, reason: "closed" });
  assert.deepEqual(await pollRequest(r.deps, rid, p.verifier), { status: "cancelled" });
  assert.equal((await describeRequest(r.deps, rid)).state, "cancelled");
});

test("deny from the browser closes the request", async () => {
  const r = rig();
  const p = pair();
  const s = await startRequest(r.deps, { challenge: p.challenge });
  assert.ok(s.ok);
  assert.deepEqual(await denyRequest(r.deps, s.rid), { ok: true });
  assert.equal((await describeRequest(r.deps, s.rid)).state, "denied");
  assert.deepEqual(await pollRequest(r.deps, s.rid, p.verifier), { status: "denied" });
  assert.deepEqual(await denyRequest(r.deps, "nope"), { ok: false });
});

test(`guessing: ${MAX_BAD_ATTEMPTS} wrong verifiers or codes burn the request`, async () => {
  const { r, p, rid, code } = await approved();
  for (let i = 0; i < MAX_BAD_ATTEMPTS; i++) await exchangeCode(r.deps, { rid, code: newSecret(), verifier: p.verifier });
  assert.deepEqual(await exchangeCode(r.deps, { rid, code, verifier: p.verifier }), { ok: false, reason: "cancelled" });
  const w = await approved(r);
  for (let i = 0; i < MAX_BAD_ATTEMPTS; i++) await pollRequest(w.r.deps, w.rid, newSecret());
  assert.deepEqual(await exchangeCode(w.r.deps, { rid: w.rid, code: w.code, verifier: w.p.verifier }), { ok: false, reason: "cancelled" });
});

test("malformed input never throws and never matches", async () => {
  const r = rig();
  for (const bad of [undefined, null, 42, {}, [], "", "x".repeat(10_000)]) {
    assert.deepEqual(await startRequest(r.deps, { challenge: bad }), { ok: false, reason: "bad_challenge" });
    assert.deepEqual(await exchangeCode(r.deps, { rid: bad, code: bad, verifier: bad }), { ok: false, reason: "invalid" });
    assert.deepEqual(await pollRequest(r.deps, bad, bad), { status: "invalid" });
    assert.deepEqual(await approveRequest(r.deps, bad, who), { ok: false, reason: "unknown" });
    assert.deepEqual((await describeRequest(r.deps, bad)).state, "unknown");
    assert.equal(await redeemTicket(r.deps, bad), null);
  }
});

test("approving twice (browser retry after the protocol prompt was dismissed) issues a fresh code and kills the old one", async () => {
  const { r, p, rid, code } = await approved();
  const second = await approveRequest(r.deps, rid, who);
  assert.ok(second.ok);
  assert.notEqual(second.code, code);
  assert.deepEqual(await exchangeCode(r.deps, { rid, code, verifier: p.verifier }), { ok: false, reason: "invalid" });
  assert.ok((await exchangeCode(r.deps, { rid, code: second.code, verifier: p.verifier })).ok);
});

test("the database never holds the code or the ticket in the clear", async () => {
  const { r, p, rid, code } = await approved();
  const row = await memoryStore.get(rid);
  assert.equal(row?.codeHash, hashSecret(code));
  assert.ok(!JSON.stringify(row).includes(code));
  const x = await exchangeCode(r.deps, { rid, code, verifier: p.verifier });
  assert.ok(x.ok);
  assert.ok(!JSON.stringify(await memoryStore.get(rid)).includes(x.ticket));
});

test("Keplar Business: its own link scheme and default label; unknown apps are Keplar One", async () => {
  const { appOf, deepLinkFor, parseAuthDeepLink: parse, cleanLabel: label, newRequestId: rid, newSecret: secret } = await import("@/lib/desktop-auth/core");
  const r = rid(), c = secret();
  assert.match(deepLinkFor(c, r, "business"), /^keplar-business:\/\/auth\?code=/);
  assert.deepEqual(parse(deepLinkFor(c, r, "business"), "business"), { code: c, rid: r });
  assert.equal(parse(deepLinkFor(c, r, "business")), null);
  assert.equal(parse(deepLinkFor(c, r), "business"), null);
  assert.equal(label(undefined, "business"), "Keplar Business desktop");
  assert.equal(appOf("business"), "business");
  for (const x of [undefined, "one", "Business", "evil", 1]) assert.equal(appOf(x), "one");
});
