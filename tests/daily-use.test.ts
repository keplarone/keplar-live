import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimDaily, claimOne, DailyLimitError, dailyMeter, dailySubjects, dayOf, meterOf, newDeviceId, readDeviceId, releaseOne, resetOf, usedToday } from "@/lib/usage/daily";
import { dailyLeftText, formatDailyReset } from "@/lib/usage/format";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { GET as computeGET } from "@/app/api/compute/route";
import { FREE_NO_RESPONSE_MESSAGE } from "@/lib/orchestration/no-response";
import type { KeplarEvent } from "@/lib/orchestration/types";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const subj = (over: Partial<Parameters<typeof dailySubjects>[0]> = {}) => dailySubjects({ workspaceId: `ws_${Math.random().toString(36).slice(2)}`, anonymous: false, ip: ip(), cookie: null, secure: true, limit: 50, ipLimit: 150, ...over });

test("daily: exactly one per claim, 50 allowed, the 51st refused with the reset time; release gives one back", async () => {
  const s = subj();
  const claims = [];
  for (let i = 1; i <= 50; i++) {
    const c = await claimDaily(s);
    assert.equal(c.meter.used, i);
    assert.equal(c.meter.left, 50 - i, "the meter goes down by exactly 1 per question");
    claims.push(c);
  }
  await assert.rejects(claimDaily(s), (e: unknown) => {
    assert.ok(e instanceof DailyLimitError);
    assert.match(e.message, /all 50 of today's questions/);
    assert.match(e.message, /reset at 00:00 UTC/);
    assert.equal(e.meter.left, 0);
    assert.equal(e.meter.resetsAt, resetOf());
    return true;
  });
  const m = await claims[49].release();
  assert.equal(m.used, 49);
  assert.equal((await claims[49].release()).used, 49, "release is idempotent");
  assert.equal((await claimDaily(s)).meter.used, 50, "the given-back question can be used again");
});

test("daily: parallel claims never exceed the limit (atomic)", async () => {
  const s = subj({ limit: 20 });
  const r = await Promise.allSettled(Array.from({ length: 35 }, () => claimDaily(s)));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 20);
  assert.equal(await usedToday(s.primary), 20);
});

test("daily: the day is UTC, the meter reports the next 00:00 UTC", () => {
  const d = new Date("2026-10-03T23:30:00Z");
  assert.equal(dayOf(d), "2026-10-03");
  assert.equal(resetOf(d), "2026-10-04T00:00:00.000Z");
  assert.deepEqual(meterOf(3, 50, d), { used: 3, limit: 50, left: 47, resetsAt: "2026-10-04T00:00:00.000Z" });
  assert.equal(dailyLeftText(meterOf(3, 50, d)), "47 of 50 left");
  assert.match(formatDailyReset("2026-10-04T00:00:00.000Z", "en-US"), /(today|tomorrow) at \d/);
});

test("daily: a new day starts at zero", async () => {
  const s = subj({ limit: 5 });
  const today = new Date("2026-10-03T12:00:00Z");
  const tomorrow = new Date("2026-10-04T00:00:01Z");
  for (let i = 0; i < 5; i++) await claimDaily(s, today);
  await assert.rejects(claimDaily(s, today), DailyLimitError);
  assert.equal((await claimDaily(s, tomorrow)).meter.used, 1);
  assert.equal((await dailyMeter(s, today)).used, 5);
});

test("daily: signed-out visitors count per signed browser id; a forged id is ignored; the network ceiling still applies", async () => {
  const dev = newDeviceId();
  const cookie = `keplar_dev=${dev.setCookie(true).split(";")[0].slice("keplar_dev=".length)}`;
  assert.equal(readDeviceId(cookie), dev.id);
  assert.equal(readDeviceId(`keplar_dev=${dev.id}.forged`), null);
  assert.equal(readDeviceId(`keplar_dev=abc.def`), null);
  const a = dailySubjects({ workspaceId: "ws_anon", anonymous: true, ip: "10.1.1.1", cookie, secure: true, limit: 50, ipLimit: 3 });
  assert.equal(a.primary, `dev:${dev.id}`);
  assert.equal(a.setCookie, null, "a known browser keeps its id");
  const fresh = dailySubjects({ workspaceId: "ws_anon", anonymous: true, ip: "10.1.1.1", cookie: null, secure: true, limit: 50, ipLimit: 3 });
  assert.match(fresh.setCookie ?? "", /^keplar_dev=.+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure/);
  // network ceiling: 3 questions per IP per day across browsers
  for (let i = 0; i < 3; i++) await claimDaily({ ...a, primary: `dev:other${i}` });
  await assert.rejects(claimDaily(a), (e: unknown) => e instanceof DailyLimitError && e.kind === "network" && /network/.test(e.message));
  assert.equal(await usedToday(a.primary), 0, "a refused claim leaves no count behind");
});

test("daily: claim/release primitives never go below zero", async () => {
  const k = `acct:${Math.random()}`;
  await releaseOne(k);
  assert.equal(await usedToday(k), 0);
  assert.equal(await claimOne(k, 2), 1);
  assert.equal(await claimOne(k, 2), 2);
  assert.equal(await claimOne(k, 2), null);
});

/* ── through the real route ── */
const KEYS = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };
async function withKeys<T>(fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(KEYS)) { prev[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const post = (prompt: string, headers: Record<string, string>) =>
  keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ prompt }) }));
const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as KeplarEvent);
const dailyEvents = (ev: KeplarEvent[]) => ev.filter((e): e is Extract<KeplarEvent, { type: "daily" }> => e.type === "daily").map((e) => e.daily);
const compute = async (headers: Record<string, string>) => (await (await computeGET(new Request("https://keplar.one/api/compute", { headers }))).json()) as { plan: string; daily: { used: number; limit: number; left: number; resetsAt: string } | null };

test("/api/keplar Free: each answered question costs exactly 1, the meter agrees everywhere and survives a refresh", async () => {
  const dev = newDeviceId();
  const cookie = `keplar_dev=${dev.setCookie(true).split(";")[0].slice("keplar_dev=".length)}`;
  const headers = { "x-forwarded-for": ip(), cookie };
  assert.equal((await compute(headers)).daily?.left, 50);
  for (let i = 1; i <= 3; i++) {
    const res = await withKeys(() => post("who made you?", headers));
    assert.equal(res.status, 200);
    const ev = await lines(res);
    assert.ok(ev.some((e) => e.type === "answer"));
    const d = dailyEvents(ev);
    assert.equal(d[0].used, i, "the count is taken as soon as the question is accepted");
    assert.equal(d[0].left, 50 - i);
    assert.equal(d.length, 1, "an answered question is not given back");
    assert.equal((await compute(headers)).daily?.left, 50 - i, "a refresh shows the same number");
  }
});

test("/api/keplar Free: failed / no-response questions do not consume a question", async () => {
  const dev = newDeviceId();
  const cookie = `keplar_dev=${dev.setCookie(true).split(";")[0].slice("keplar_dev=".length)}`;
  const headers = { "x-forwarded-for": ip(), cookie };
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 })) as unknown as typeof fetch;
  try {
    for (let i = 0; i < 3; i++) {
      const ev = await lines(await withKeys(() => post("Should a small bakery switch to a four-day week? Weigh the trade-offs.", headers)));
      const last = ev.filter((e) => e.type === "error").at(-1) as Extract<KeplarEvent, { type: "error" }>;
      assert.equal(last.code, "no_response");
      assert.equal(last.message, FREE_NO_RESPONSE_MESSAGE);
      const d = dailyEvents(ev);
      assert.equal(d[0].used, 1, "taken while it runs");
      assert.equal(d.at(-1)!.used, 0, "given back when no answer reached the screen");
      assert.equal(d.at(-1)!.left, 50);
    }
  } finally {
    globalThis.fetch = real;
  }
  assert.equal((await compute(headers)).daily?.used, 0);
});

test("/api/keplar Free: the 51st question is refused with a friendly message and the reset time; nothing runs", async () => {
  const dev = newDeviceId();
  const cookie = `keplar_dev=${dev.setCookie(true).split(";")[0].slice("keplar_dev=".length)}`;
  const headers = { "x-forwarded-for": ip(), cookie };
  for (let i = 0; i < 49; i++) await claimOne(`dev:${dev.id}`, 50);
  const ok = await withKeys(() => post("who made you?", headers));
  assert.equal(ok.status, 200);
  assert.equal(dailyEvents(await lines(ok))[0].left, 0);
  const res = await withKeys(() => post("who made you?", headers));
  assert.equal(res.status, 429);
  const j = (await res.json()) as { code: string; error: string; daily: { left: number; resetsAt: string } };
  assert.equal(j.code, "daily_limit");
  assert.match(j.error, /all 50 of today's questions/);
  assert.match(j.error, /00:00 UTC/);
  assert.equal(j.daily.left, 0);
  assert.equal(j.daily.resetsAt, resetOf());
  assert.ok(Number(res.headers.get("retry-after")) > 0);
  assert.equal((await compute(headers)).daily?.left, 0);
});

test("/api/keplar Free signed-out: a first visit gets a signed browser id and the meter starts at 49", async () => {
  const res = await withKeys(() => post("who made you?", { "x-forwarded-for": ip() }));
  const set = res.headers.getSetCookie().find((c) => c.startsWith("keplar_dev="));
  assert.ok(set && /HttpOnly/.test(set) && /SameSite=Lax/.test(set));
  assert.equal(dailyEvents(await lines(res))[0].left, 49);
  const cookie = set!.split(";")[0];
  assert.equal((await compute({ "x-forwarded-for": ip(), cookie })).daily?.left, 49);
});
