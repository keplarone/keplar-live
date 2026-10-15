import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import "./helpers/session";

// AUTH-11 (docs/rebirth/AUDIT.md): a known browser+OS signing in from a network the account never used gets the new-sign-in
// email, at most once a day; the network is stored only as a keyed hash of its /16 (never the address).
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const origin = "https://keplar.one";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async function signInFrom(email: string, ip: string) {
  const { auth } = await import("../src/lib/accounts/auth");
  const { listOutbox } = await import("../src/lib/accounts/outbox");
  const headers = { "content-type": "application/json", origin, "x-forwarded-for": ip, "user-agent": UA };
  const send = await auth.handler(new Request(`${origin}/api/auth/sign-in/magic-link`, { method: "POST", headers, body: JSON.stringify({ email, callbackURL: "/account" }) }));
  assert.equal(send.status, 200);
  const mail = (await listOutbox()).filter((m) => m.to === email && /token=/.test(m.text)).sort((a, b) => b.at.localeCompare(a.at))[0];
  const token = new URL(mail!.text.match(/https:\/\/\S+/)![0]).searchParams.get("token");
  const ok = await auth.handler(new Request(`${origin}/api/auth/magic-link/confirm`, { method: "POST", headers, body: JSON.stringify({ token }) }));
  assert.equal(ok.status, 200);
}

test("same browser+OS from a new network: one notice, then quiet for the day; the address itself is never stored", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { listOutbox } = await import("../src/lib/accounts/outbox");
  const { neonQuery } = await import("../src/lib/create/platform/neon");
  const email = `net-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const notices = async () => (await listOutbox()).filter((m) => m.to === email && m.kind === "new-device");

  await signInFrom(email, "203.0.113.10"); // first sign-in: nothing
  await signInFrom(email, "203.0.77.4"); // same /16: the same network
  assert.equal((await notices()).length, 0);
  await signInFrom(email, "198.51.100.23"); // same Chrome on Windows, a network never used
  const sent = await notices();
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /network we haven't seen/);

  // Another new network the same day: no second email (at most one a day per account).
  const { noticeIfNewDevice } = await import("../src/lib/accounts/new-device");
  const userId = String((await neonQuery("SELECT id FROM keplar_users WHERE email = $1", [email]))[0].id);
  await noticeIfNewDevice({ userId, email, provider: "magic-link", headers: new Headers({ "user-agent": UA, "x-forwarded-for": "192.0.2.50" }) });
  assert.equal((await notices()).length, 1);
  // A different browser+OS is still always a new device.
  await noticeIfNewDevice({ userId, email, provider: "magic-link", headers: new Headers({ "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:128.0) Gecko/20100101 Firefox/128.0", "x-forwarded-for": "203.0.113.10" }) });
  assert.equal((await notices()).length, 2);

  const rows = await neonQuery("SELECT s.ip_hash, s.net_hash FROM keplar_sessions s JOIN keplar_users u ON u.id = s.user_id WHERE u.email = $1", [email]);
  assert.ok(rows.length >= 3 && rows.every((r) => /^[0-9a-f]{24}$/.test(String(r.net_hash))));
  assert.ok(!JSON.stringify(rows).includes("198.51") && !JSON.stringify(rows).includes("203.0"), "no address or prefix in the clear");
});
