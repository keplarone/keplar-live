import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { neonQuery } from "@/lib/create/platform/neon";
import { call, jsonReq, signIn } from "./helpers/session";

process.env.BETTER_AUTH_SECRET = "test-secret-for-onboarding-0123456789abcdef";
process.env.BETTER_AUTH_URL = "https://keplar.one";
process.env.KEPLAR_DEV_TOOLS = "1";
const ORIGIN = "https://keplar.one";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) {
    process.env.DATABASE_URL = fake.url;
    // An account that existed BEFORE onboarding shipped: the old table shape, no onboarding columns.
    await neonQuery("CREATE TABLE keplar_users (id text PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), last_login timestamptz, providers jsonb NOT NULL DEFAULT '[]'::jsonb, sessions_valid_after timestamptz)");
    await neonQuery("INSERT INTO keplar_users (id, email, name) VALUES ('usr_old', 'old@example.com', 'Olive')");
  }
});
after(() => fake?.restore());

const api = async () => await import("@/app/api/onboarding/route");
const body = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let ipN = 0;
const ip = () => `10.77.${(++ipN >> 8) & 255}.${ipN & 255}`;

/** Magic-link sign-in that returns the redirect the server chose. */
async function magic(email: string, callbackURL: string) {
  const { auth } = await import("@/lib/accounts/auth");
  const { listOutbox } = await import("@/lib/accounts/outbox");
  const h = { "content-type": "application/json", origin: ORIGIN };
  const send = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: { ...h, "x-forwarded-for": ip() }, body: JSON.stringify({ email, callbackURL }) }));
  assert.equal(send.status, 200);
  const mail = (await listOutbox()).filter((m) => m.to.toLowerCase() === email.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at))[0];
  const token = new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get("token") as string;
  const ok = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/confirm`, { method: "POST", headers: { ...h, "x-forwarded-for": ip() }, body: JSON.stringify({ token }) }));
  assert.equal(ok.status, 200);
  return { redirectTo: ((await ok.json()) as { redirectTo: string }).redirectTo, cookie: ok.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

test("migration is idempotent; existing accounts are not required, new ones are", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { ensureAuthSchema } = await import("@/lib/accounts/persist");
  await ensureAuthSchema();
  await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_required boolean NOT NULL DEFAULT false"); // running it again is harmless
  const { getOnboarding } = await import("@/lib/onboarding/store");
  const old = await getOnboarding("usr_old");
  assert.equal(old.enabled, true);
  assert.equal(old.required, false, "the account that predates onboarding is not forced");
  assert.equal(old.status, "legacy");
  assert.deepEqual(old.answers, {});
  const { upsertUser } = await import("@/lib/accounts/persist");
  const fresh = await upsertUser({ email: "fresh@example.com", name: "Fran", provider: "password" });
  assert.equal((await getOnboarding(fresh.id)).status, "pending");
  const again = await upsertUser({ email: "fresh@example.com", provider: "google" });
  assert.equal(again.id, fresh.id);
  assert.equal((await getOnboarding(fresh.id)).required, true, "a second sign-in does not reset or re-flag anything");
  const adopted = await upsertUser({ email: "adopted@example.com", firstRun: false });
  assert.equal((await getOnboarding(adopted.id)).required, false, "adopted legacy sessions are not sent through onboarding");
});

test("sign-in sends a new account to /welcome (keeping ?next), an existing one straight to next", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const a = await magic("brandnew@example.com", "/pricing?from=x");
  assert.equal(a.redirectTo, `/welcome?next=${encodeURIComponent("/pricing?from=x")}`);
  const dflt = await magic("brandnew2@example.com", "/app?welcome=1");
  assert.equal(dflt.redirectTo, `/welcome?next=${encodeURIComponent("/app?welcome=1")}`);
  const old = await magic("old@example.com", "/pricing");
  assert.equal(old.redirectTo, "/pricing", "existing accounts are never forced through it");
  // A hostile callback is refused by the sign-in itself, and welcomePath() would flatten it anyway (see onboarding.test.ts).
  const { auth } = await import("@/lib/accounts/auth");
  const bad = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip() }, body: JSON.stringify({ email: "brandnew3@example.com", callbackURL: "//evil.example/x" }) }));
  assert.ok(bad.status >= 400, "hostile callbackURL refused");
});

test("API: auth, same-origin, validation, resume, skip, complete, replay", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { GET, PATCH, POST } = await api();
  // signed out
  assert.equal((await GET(call(null, "/api/onboarding"))).status, 401);
  assert.equal((await PATCH(jsonReq(null, "/api/onboarding", "PATCH", { step: 1 }))).status, 401);

  const { cookie } = await signIn("api-user@example.com", "free");
  let j = await body(await GET(call(cookie, "/api/onboarding")));
  assert.equal(j.state.status, "pending");
  assert.equal(j.state.step, 0);
  assert.equal(j.plan.id, "free");
  assert.match(j.plan.line, /free models only/i);
  assert.equal(j.plan.connectorsAllowed, false);
  assert.ok(j.starters.length >= 3 && j.starters.length <= 4);
  assert.deepEqual(j.checklist.map((c: { id: string }) => c.id), ["ask", "create", "connect", "plan"]);

  // cross-site write is refused
  const evil = await PATCH(new Request(`${ORIGIN}/api/onboarding`, { method: "PATCH", headers: { cookie, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ step: 1 }) }));
  assert.equal(evil.status, 403);

  // validation
  for (const bad of [{}, { step: 9 }, { step: "1" }, { answers: { uses: ["x"] } }, { answers: { admin: true } }, { answers: { name: "<b>" } }]) {
    assert.equal((await PATCH(jsonReq(cookie, "/api/onboarding", "PATCH", bad))).status, 400, JSON.stringify(bad));
  }
  assert.equal((await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "wipe" }))).status, 400);
  assert.equal((await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "progress", key: "completedAt" }))).status, 400);
  assert.equal((await POST(jsonReq(cookie, "/api/onboarding", "POST", {}))).status, 400, "POST needs an action");
  assert.equal((await PATCH(jsonReq(cookie, "/api/onboarding", "PATCH", { action: "complete" }))).status, 400, "PATCH cannot run actions");

  // progress is saved: a "refresh" (a fresh GET) resumes
  const saved = await body(await PATCH(jsonReq(cookie, "/api/onboarding", "PATCH", { step: 2, answers: { uses: ["research", "coding"], role: "Founder" } })));
  assert.equal(saved.state.step, 2);
  assert.equal(saved.state.status, "in_progress");
  j = await body(await GET(call(cookie, "/api/onboarding")));
  assert.equal(j.state.step, 2);
  assert.deepEqual(j.state.answers.uses, ["research", "coding"]);
  assert.match(j.starters[0].hint, /Research/);
  // answers merge, they don't replace
  j = await body(await PATCH(jsonReq(cookie, "/api/onboarding", "PATCH", { step: 3, answers: { theme: "light", memory: false, name: "Casey" } })));
  assert.deepEqual(j.state.answers, { uses: ["research", "coding"], role: "Founder", theme: "light", memory: false, name: "Casey" });
  const row = await neonQuery("SELECT name FROM keplar_users WHERE email = 'api-user@example.com'");
  assert.equal(row[0].name, "Casey", "the chosen name becomes the account name");

  // complete
  j = await body(await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "complete" })));
  assert.equal(j.state.status, "completed");
  assert.ok(j.state.completedAt);
  assert.equal(j.state.step, 4);
  // after the flow the step no longer moves, answers can still be edited
  j = await body(await PATCH(jsonReq(cookie, "/api/onboarding", "PATCH", { step: 0, answers: { theme: "dark" } })));
  assert.equal(j.state.step, 4);
  assert.equal(j.state.answers.theme, "dark");

  // a finished account signs in straight to next
  const again = await magic("api-user@example.com", "/pricing");
  assert.equal(again.redirectTo, "/pricing");

  // real progress markers
  j = await body(await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "progress", key: "viewedPlan" })));
  assert.ok(j.state.progress.viewedPlan);
  const first = j.state.progress.viewedPlan;
  j = await body(await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "progress", key: "viewedPlan" })));
  assert.equal(j.state.progress.viewedPlan, first, "the first timestamp is kept");
  j = await body(await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "progress", key: "resumeDismissed" })));
  assert.ok(j.state.progress.resumeDismissed, "closing the setup reminder is remembered");
  assert.equal(j.checklist.find((c: { id: string }) => c.id === "plan").done, true);
  assert.equal(j.checklist.find((c: { id: string }) => c.id === "ask").done, false, "no chat yet: not ticked");

  // replay: starts over from the saved answers
  j = await body(await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "replay" })));
  assert.equal(j.state.status, "pending");
  assert.equal(j.state.step, 0);
  assert.equal(j.state.completedAt, null);
  assert.equal(j.state.answers.name, "Casey");
  const rp = await magic("api-user@example.com", "/account");
  assert.equal(rp.redirectTo, `/welcome?next=${encodeURIComponent("/account")}`);
});

test("API: skip works at any step, and an existing account can replay the tour on request", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { GET, POST } = await api();
  const { cookie } = await signIn("skipper@example.com", "free");
  let j = await body(await POST(jsonReq(cookie, "/api/onboarding", "POST", { action: "skip", answers: { theme: "auto" } })));
  assert.equal(j.state.status, "skipped");
  assert.equal(j.state.answers.theme, "auto");
  assert.equal((await magic("skipper@example.com", "/app")).redirectTo, "/app");

  const old = await signIn("old@example.com", "free");
  j = await body(await GET(call(old.cookie, "/api/onboarding")));
  assert.equal(j.state.status, "legacy", "an older account sees the gentle tour entry, not the flow");
  j = await body(await POST(jsonReq(old.cookie, "/api/onboarding", "POST", { action: "progress", key: "tourDismissed" })));
  assert.ok(j.state.progress.tourDismissed);
  j = await body(await POST(jsonReq(old.cookie, "/api/onboarding", "POST", { action: "replay" })));
  assert.equal(j.state.status, "pending", "taking the tour is opt-in");
});

test("API: one account can never read or change another's onboarding", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { GET, PATCH } = await api();
  const a = await signIn("iso-a@example.com", "free");
  const b = await signIn("iso-b@example.com", "free");
  await PATCH(jsonReq(a.cookie, "/api/onboarding", "PATCH", { step: 3, answers: { name: "Alpha" } }));
  const jb = await body(await GET(call(b.cookie, "/api/onboarding")));
  assert.equal(jb.state.step, 0);
  assert.deepEqual(jb.state.answers, {});
});

test("connected-app step is honest per plan", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { GET } = await api();
  const plus = await signIn("plus-user@example.com", "plus");
  const j = await body(await GET(call(plus.cookie, "/api/onboarding")));
  assert.equal(j.plan.connectorsAllowed, true);
  assert.match(j.plan.line, /Plus/);
  const lite = await signIn("lite-user@example.com", "lite" as never);
  assert.equal((await body(await GET(call(lite.cookie, "/api/onboarding")))).plan.connectorsAllowed, false);
});
