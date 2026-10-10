import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSENT_VERSION } from "../src/lib/consent";
import { growthConsentOk, growthRows, recordGrowthEvent, sanitizeGrowthEvent, summarizeAsks, ABANDON_AFTER_MS, type GrowthRow } from "../src/lib/growth/events";
import { POST } from "../src/app/api/growth/event/route";

const cookie = (analytics: boolean) => `keplar_consent=${encodeURIComponent(JSON.stringify({ version: CONSENT_VERSION, at: Date.now(), choices: { analytics } }))}`;
const vid = "b".repeat(24);
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://keplar.one/api/growth/event", { method: "POST", headers: { origin: "https://keplar.one", "content-type": "application/json", "x-forwarded-for": "7.7.7." + Math.floor(Math.random() * 200), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("sanitize keeps only allow-listed fields; free text and unknown events are dropped", () => {
  const ok = sanitizeGrowthEvent({ e: "ask_done", vid, aid: "abc_123xyz", mode: "consensus", secs: 18.4, consulted: 3, responded: 3, disagreed: true, prompt: "my secret question", text: "x", email: "a@b.co", tier: "free" });
  assert.deepEqual(ok, { event: "ask_done", vid, aid: "abc_123xyz", mode: "consensus", secs: 18, consulted: 3, responded: 3, disagreed: true, tier: "free" });
  assert.equal(JSON.stringify(ok).includes("secret"), false);
  assert.equal(sanitizeGrowthEvent({ e: "page_view", vid }), null);
  assert.equal(sanitizeGrowthEvent({ e: "ask_done", vid: "not hex!" }), null);
  assert.equal(sanitizeGrowthEvent(null), null);
  assert.equal(sanitizeGrowthEvent({ e: "ask_done", vid, secs: 99999 })?.secs, 600);
  assert.equal(sanitizeGrowthEvent({ e: "ask_error", vid, kind: "<script>" })?.kind, undefined);
});

test("consent: only an explicit analytics opt-in records, and GPC/DNT always wins", () => {
  assert.equal(growthConsentOk(new Headers({ cookie: cookie(true) })), true);
  assert.equal(growthConsentOk(new Headers({ cookie: cookie(false) })), false);
  assert.equal(growthConsentOk(new Headers()), false);
  assert.equal(growthConsentOk(new Headers({ cookie: "keplar_consent=garbage" })), false);
  assert.equal(growthConsentOk(new Headers({ cookie: cookie(true), "sec-gpc": "1" })), false);
  assert.equal(growthConsentOk(new Headers({ cookie: cookie(true), dnt: "1" })), false);
});

test("route: always 204, stores nothing without consent, stores sanitized rows with consent", async () => {
  const before = (await growthRows(1)).length;
  assert.equal((await POST(post({ e: "ask_started", vid, aid: "route0001" }))).status, 204);
  assert.equal((await growthRows(1)).length, before);
  assert.equal((await POST(post({ e: "ask_started", vid, aid: "route0002", prompt: "SECRET PROMPT TEXT" }, { cookie: cookie(true) }))).status, 204);
  const rows = await growthRows(1);
  assert.equal(rows.length, before + 1);
  assert.equal(JSON.stringify(rows).includes("SECRET PROMPT TEXT"), false);
  assert.equal((await POST(post("{not json", { cookie: cookie(true) }))).status, 204);
  assert.equal((await POST(post({ e: "ask_started", vid, pad: "x".repeat(2000) }, { cookie: cookie(true) }))).status, 204);
  assert.equal((await growthRows(1)).length, before + 1);
});

test("recordGrowthEvent writes a system row with a day bucket and no account id", async () => {
  const r = await recordGrowthEvent({ event: "share_dialog", vid });
  assert.equal(r.workspaceId, "system");
  assert.match(r.day, /^\d{4}-\d{2}-\d{2}$/);
});

const T0 = Date.parse("2026-10-01T12:00:00Z");
let n = 0;
const row = (v: string, event: GrowthRow["event"], offsetMs: number, extra: Partial<GrowthRow> = {}): GrowthRow => {
  const at = new Date(T0 + offsetMs).toISOString();
  return { id: `r${++n}`, workspaceId: "system", at, day: at.slice(0, 10), event, vid: v, ...extra };
};

test("summarizeAsks: activation needs an answer and then a deliberate action; abandonment waits 3 minutes", () => {
  const a = "a".repeat(20), b = "b".repeat(20), c = "c".repeat(20), d = "d".repeat(20);
  const list: GrowthRow[] = [
    // a: answered in 20 s, opened Disagreements -> activated
    row(a, "ask_started", 0, { aid: "a1" }), row(a, "ask_done", 20_000, { aid: "a1", secs: 20, mode: "consensus", disagreed: true }), row(a, "answer_action", 30_000, { action: "open_disagreements" }),
    // b: answered, did nothing -> not activated
    row(b, "ask_started", 0, { aid: "b1" }), row(b, "ask_done", 10_000, { aid: "b1", secs: 10, mode: "single" }),
    // c: started, never finished, long ago -> abandoned
    row(c, "ask_started", 0, { aid: "c1" }),
    // d: failed
    row(d, "ask_started", 0, { aid: "d1" }), row(d, "ask_error", 5_000, { aid: "d1", kind: "limit" }),
    // a again next day -> repeat
    row(a, "ask_started", 86_400_000, { aid: "a2" }), row(a, "ask_done", 86_400_000 + 15_000, { aid: "a2", secs: 15, mode: "consensus", disagreed: false }),
  ];
  const s = summarizeAsks(list, T0 + 2 * 86_400_000);
  assert.equal(s.browsers, 4);
  assert.equal(s.asksStarted, 5);
  assert.equal(s.asksDone, 3);
  assert.equal(s.asksFailed, 1);
  assert.equal(s.asksAbandoned, 1);
  assert.equal(s.activatedBrowsers, 1);
  assert.equal(s.browsersWithAnswer, 2);
  assert.equal(s.repeatBrowsers, 1);
  assert.equal(s.medianSecs, 15);
  assert.equal(s.multiModelShare, 2 / 3);
  assert.equal(s.disagreementShare, 0.5);
  assert.deepEqual(s.errorKinds, { limit: 1 });
  assert.equal(s.actions.open_disagreements, 1);
  // a fresh start is not yet "abandoned"
  assert.equal(summarizeAsks([row(c, "ask_started", 0, { aid: "z" })], T0 + ABANDON_AFTER_MS - 1).asksAbandoned, 0);
  assert.equal(summarizeAsks([]).medianSecs, null);
});
