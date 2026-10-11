import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn } from "./helpers/session";
import { newNonce, nonceHash, signTicket } from "@/lib/business/handoff";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const BIZ = "https://business.keplar.one";
const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");

test("signing out on business.keplar.one revokes the Business session on the server and leaves keplar.one signed in", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { auth, getSession } = await import("@/lib/accounts/auth");
  const { authSecret } = await import("@/lib/accounts/secret");

  // Signed in on keplar.one, then into Business through the real handoff (ticket bound to this browser's nonce).
  const one = await signIn("biz-signout@example.com");
  const me = (await getSession(new Headers({ cookie: one.cookie })))!;
  const nonce = newNonce();
  const ticket = signTicket(authSecret(), { userId: me.user.id, email: me.user.email, name: null }, nonceHash(nonce));
  const finish = await auth.handler(new Request(`${BIZ}/api/auth/business/finish?t=${encodeURIComponent(ticket)}&next=%2Fwork`, { headers: { host: "business.keplar.one", cookie: `kb_handoff=${nonce}` } }));
  assert.ok([302, 303].includes(finish.status), `finish: ${finish.status}`);
  const biz = cookies(finish);
  assert.ok(await getSession(new Headers({ cookie: biz })), "signed in to Business");

  // Sign out on the Business host (what the Sign out buttons call).
  const { POST } = await import("@/app/api/account/accounts/route");
  const out = await POST(new Request(`${BIZ}/api/account/accounts`, { method: "POST", headers: { host: "business.keplar.one", origin: BIZ, "content-type": "application/json", cookie: biz, "x-forwarded-for": "10.99.1.1" }, body: JSON.stringify({ action: "signout_all" }) }));
  assert.equal(out.status, 200);
  assert.ok(out.headers.getSetCookie().some((c) => /max-age=0|expires=thu, 01 jan 1970/i.test(c)), "the session cookies are cleared");

  // Replaying the old Business cookie no longer works: the session was revoked, not only forgotten by the browser.
  const { forgetAllSessions } = await import("@/lib/accounts/session-guard");
  forgetAllSessions();
  assert.equal(await getSession(new Headers({ cookie: biz })), null, "Business session revoked on the server");
  assert.ok(await getSession(new Headers({ cookie: one.cookie })), "keplar.one stays signed in (separate host-only session)");
});

test("a cross-site page can't sign someone out of Business", async () => {
  const { POST } = await import("@/app/api/account/accounts/route");
  const r = await POST(new Request(`${BIZ}/api/account/accounts`, { method: "POST", headers: { host: "business.keplar.one", origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ action: "signout_all" }) }));
  assert.equal(r.status, 403);
});

test("Sign out is offered in the Business workspace (and so the desktop app), the storefront and account setup", () => {
  const ws = readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8");
  assert.equal((ws.match(/onClick=\{\(\) => void signOut\(\)\}/g) ?? []).length, 2, "sidebar account footer and the no-plan screen");
  assert.match(readFileSync("src/components/business-site/Storefront.tsx", "utf8"), /<SignOutButton email=\{status\.email\} \/>/);
  assert.match(readFileSync("src/components/business-site/AccountSetup.tsx", "utf8"), /<SignOutButton /);
  const helper = readFileSync("src/components/business-site/sign-out.ts", "utf8");
  assert.match(helper, /action: "signout_all"/);
  assert.match(helper, /if \(!res\?\.ok\) return false;/, "a failed sign-out is reported, never shown as success");
  assert.match(helper, /desktop \? "\/work" : "\/"/, "the desktop app lands on its own signed-out screen");
});
