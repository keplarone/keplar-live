import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLowBalanceAlert, checkOpenRouterBalance, computeBalance, fetchOpenRouterBalance, lowBalanceEmail, alertRecipient, opsAuthorized } from "@/lib/ops/openrouter-balance";
import { GET } from "@/app/api/ops/openrouter-balance/route";

const KEY = "sk-or-test-key-should-never-leak-123456";
const ENV = { OPENROUTER_API_KEY: KEY };
const credits = (total: number, usage: number, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => {
  assert.equal(String(url), "https://openrouter.ai/api/v1/credits");
  assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${KEY}`);
  return Response.json({ data: { total_credits: total, total_usage: usage } }, { status });
}) as typeof fetch;

type Mail = { to: string; subject: string; text: string; kind: string };

test("balance math: remaining, percent, low at or below 1%", () => {
  const b = computeBalance(100, 99.5, new Date("2026-10-06T00:00:00Z"));
  assert.deepEqual({ ...b }, { totalCredits: 100, totalUsage: 99.5, remaining: 0.5, percent: 0.5, low: true, checkedAt: "2026-10-06T00:00:00.000Z", basisUsd: 100, basis: "total" });
  assert.equal(computeBalance(100, 25).low, false);
  assert.equal(computeBalance(100, 98.9).low, false, "1.1% is not low");
  assert.equal(computeBalance(100, 99).low, true, "exactly 1% is low (≤ threshold)");
  assert.equal(computeBalance(0, 0).percent, 0);
  assert.equal(computeBalance(0, 0).low, true, "no credits at all counts as low");
});

test("fetch: parses OpenRouter credits; errors are graceful and never echo the key", async () => {
  const ok = await fetchOpenRouterBalance({ env: ENV, fetchImpl: credits(50, 10) });
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.remaining, 40);
  assert.equal(ok.ok && ok.percent, 80);

  const none = await fetchOpenRouterBalance({ env: {} });
  assert.equal(!none.ok && none.code, "not_configured");

  const cases: [typeof fetch, string][] = [
    ((async () => Response.json({ error: { code: 500 } }, { status: 500 })) as unknown) as typeof fetch,
    ((async () => Response.json({ error: { code: 403 } }, { status: 403 })) as unknown) as typeof fetch,
    ((async () => Response.json({ error: { code: 401 } }, { status: 401 })) as unknown) as typeof fetch,
    ((async () => new Response("<html>", { status: 200 })) as unknown) as typeof fetch,
    ((async () => Response.json({ data: { total_credits: "10" } })) as unknown) as typeof fetch,
    ((async () => { throw new TypeError("fetch failed"); }) as unknown) as typeof fetch,
  ].map((f, i) => [f, ["upstream_error", "management_key_required", "unauthorized", "bad_response", "bad_response", "upstream_error"][i]]);
  for (const [f, code] of cases) {
    const r = await fetchOpenRouterBalance({ env: ENV, fetchImpl: f });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, code);
    assert.ok(!JSON.stringify(r).includes(KEY));
  }
  const mgmt = await fetchOpenRouterBalance({ env: { OPENROUTER_API_KEY: "other", OPENROUTER_MANAGEMENT_KEY: KEY }, fetchImpl: credits(10, 1) });
  assert.ok(mgmt.ok, "management key is preferred when set");
});

test("alert email: subject and balance line; recipient follows the ops owner address", () => {
  const m = lowBalanceEmail(computeBalance(20, 19.9));
  assert.equal(m.subject, "Keplar: the system is running low");
  assert.match(m.text, /balance \$0\.10 of \$20\.00 \(0\.50%\)/);
  assert.equal(alertRecipient({}), "team@keplar.one");
  assert.equal(alertRecipient({ ADMIN_EMAIL: "a@x.test" }), "a@x.test");
  assert.equal(alertRecipient({ KEPLAR_OWNER_EMAIL: "o@x.test", ADMIN_EMAIL: "a@x.test" }), "o@x.test");
});

test("dedupe: one email per crossing below 1%, re-armed once back above", async () => {
  const sent: Mail[] = [];
  const send = async (m: Mail) => (sent.push(m), true);
  const env = { KEPLAR_OWNER_EMAIL: "owner@x.test" };
  const low = computeBalance(100, 99.6);
  const high = computeBalance(100, 50);
  assert.equal((await applyLowBalanceAlert(low, { send, env })).alerted, true);
  assert.equal((await applyLowBalanceAlert(low, { send, env })).alerted, false, "second low reading: no repeat");
  assert.equal((await applyLowBalanceAlert(low, { send, env })).alerted, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@x.test");
  assert.equal((await applyLowBalanceAlert(high, { send, env })).alerted, false);
  assert.equal((await applyLowBalanceAlert(high, { send, env })).alerted, false);
  assert.equal((await applyLowBalanceAlert(low, { send, env })).alerted, true, "new crossing alerts again");
  assert.equal(sent.length, 2);
  // Concurrent low readings in a new episode send once.
  await applyLowBalanceAlert(high, { send, env });
  const both = await Promise.all([applyLowBalanceAlert(low, { send, env }), applyLowBalanceAlert(low, { send, env })]);
  assert.equal(both.filter((b) => b.alerted).length, 1);
  assert.equal(sent.length, 3);
});

test("dedupe: a failed delivery is retried on the next check", async () => {
  await applyLowBalanceAlert(computeBalance(100, 10), { send: async () => true }); // re-arm from the previous test
  let n = 0;
  const flaky = async () => (++n === 1 ? false : true);
  const low = computeBalance(100, 99.9);
  assert.equal((await applyLowBalanceAlert(low, { send: flaky })).alerted, false);
  assert.equal((await applyLowBalanceAlert(low, { send: flaky })).alerted, true);
  assert.equal(n, 2);
});

test("check: API error returns the error and sends nothing", async () => {
  let mails = 0;
  const r = await checkOpenRouterBalance({ env: ENV, fetchImpl: (async () => new Response("", { status: 502 })) as unknown as typeof fetch, send: async () => (++mails, true) });
  assert.equal(r.ok, false);
  assert.equal(mails, 0);
});

test("ops auth: constant-time bearer match on OPS_CHECK_SECRET or CRON_SECRET; short or missing secrets never match", () => {
  const S = "0123456789abcdef0123456789abcdef";
  assert.equal(opsAuthorized(`Bearer ${S}`, { OPS_CHECK_SECRET: S }), true);
  assert.equal(opsAuthorized(`Bearer ${S}`, { CRON_SECRET: S }), true);
  assert.equal(opsAuthorized(`Bearer ${S}x`, { OPS_CHECK_SECRET: S }), false);
  assert.equal(opsAuthorized(S, { OPS_CHECK_SECRET: S }), false);
  assert.equal(opsAuthorized(null, { OPS_CHECK_SECRET: S }), false);
  assert.equal(opsAuthorized("Bearer ", {}), false);
  assert.equal(opsAuthorized("Bearer short", { OPS_CHECK_SECRET: "short" }), false);
});

test("route: 401 without the secret; balance JSON with it; key never in the body", async () => {
  const S = "ops-secret-for-tests-0123456789abcdef";
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.OPS_CHECK_SECRET = S;
  process.env.OPENROUTER_API_KEY = KEY;
  delete process.env.OPENROUTER_MANAGEMENT_KEY;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://openrouter.ai/")) return credits(40, 10)(url, init);
    return realFetch(url, init);
  }) as typeof fetch;
  try {
    const bad = await GET(new Request("https://keplar.one/api/ops/openrouter-balance", { headers: { authorization: "Bearer nope", "x-forwarded-for": "203.0.113.9" } }));
    assert.equal(bad.status, 401);
    const res = await GET(new Request("https://keplar.one/api/ops/openrouter-balance", { headers: { authorization: `Bearer ${S}`, "x-forwarded-for": "203.0.113.9" } }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    assert.ok(!text.includes(KEY));
    const j = JSON.parse(text);
    assert.deepEqual(Object.keys(j).sort(), ["alerted", "checkedAt", "low", "percent", "remaining", "totalCredits", "totalUsage"]);
    assert.equal(j.remaining, 30);
    assert.equal(j.percent, 75);
    assert.equal(j.low, false);
    // Rate limit per IP (20/min) also applies to wrong guesses.
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await GET(new Request("https://keplar.one/api/ops/openrouter-balance", { headers: { authorization: "Bearer guess", "x-forwarded-for": "203.0.113.77" } }))).status;
    assert.equal(last, 429);
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});
