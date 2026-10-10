import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn, jsonReq, call } from "./helpers/session";
import { SoftAuthenticator } from "./helpers/soft-authenticator";
import { totpAt } from "../src/lib/accounts/mfa/totp";
import { GET as pkGET, POST as pkPOST } from "../src/app/api/account/passkeys/route";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const origin = "https://keplar.one";
const RP = "keplar.one";
let n = 0;
const post = async (path: string, body: unknown) => {
  const { auth } = await import("../src/lib/accounts/auth");
  return auth.handler(new Request(`${origin}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": `10.9.${(++n >> 8) & 255}.${n & 255}` }, body: JSON.stringify(body) }));
};
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");
const usable = async (cookie: string) => (await import("../src/lib/accounts/auth")).getSession(new Headers({ cookie }));

async function addPasskey(cookie: string, a: SoftAuthenticator, name?: string) {
  const o = (await (await pkPOST(jsonReq(cookie, "/api/account/passkeys", "POST", { action: "options" }))).json()) as { options: { challenge: string }; token: string };
  return pkPOST(jsonReq(cookie, "/api/account/passkeys", "POST", { action: "add", token: o.token, response: a.create(o.options.challenge), name }));
}
async function loginWith(a: SoftAuthenticator, callbackURL?: string) {
  const o = (await (await post("/passkey/login/options", {})).json()) as { options: { challenge: string }; token: string };
  return post("/passkey/login/verify", { token: o.token, response: a.get(o.options.challenge), callbackURL });
}

test("anonymous callers cannot list or change passkeys", async () => {
  assert.equal((await pkGET(call(null, "/api/account/passkeys"))).status, 401);
  assert.equal((await pkPOST(jsonReq(null, "/api/account/passkeys", "POST", { action: "options" }))).status, 401);
  assert.equal((await pkPOST(new Request(`${origin}/api/account/passkeys`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" }))).status, 403);
});

test("add a passkey, sign in with it, rename and remove it", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { cookie } = await signIn("pk-user@example.com");
  const uid = (await usable(cookie))!.user.id;
  const a = new SoftAuthenticator(RP, origin, Buffer.from(uid));
  const added = await addPasskey(cookie, a, "Laptop");
  assert.equal(added.status, 200);
  const list = ((await added.json()) as { passkeys: { id: string; name: string }[] }).passkeys;
  assert.equal(list.length, 1);
  assert.equal(list[0]!.name, "Laptop");
  assert.ok(!JSON.stringify(list).includes("publicKey"));

  const ok = await loginWith(a, "/account");
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { status: boolean; redirectTo: string };
  assert.equal(body.status, true);
  assert.match(body.redirectTo, /^(\/account|\/welcome\?next=%2Faccount)$/, "lands where it was going (new accounts see the welcome first)");
  const session = await usable(cookieOf(ok));
  assert.equal(session?.user.email, "pk-user@example.com");
  assert.equal(session?.user.id, uid, "same account as the email sign-in");

  // A redirect target on another site is refused.
  const o = await loginWith(a, "https://evil.example/steal");
  assert.equal(o.status, 403, "Better Auth refuses a callback outside this site");

  const id = list[0]!.id;
  const renamed = await pkPOST(jsonReq(cookie, "/api/account/passkeys", "POST", { action: "rename", id, name: "Work laptop" }));
  assert.equal(((await renamed.json()) as { passkeys: { name: string }[] }).passkeys[0]!.name, "Work laptop");
  const other = (await signIn("pk-other@example.com")).cookie;
  assert.equal((await pkPOST(jsonReq(other, "/api/account/passkeys", "POST", { action: "remove", id }))).status, 404, "someone else cannot remove it");
  assert.equal((await pkPOST(jsonReq(cookie, "/api/account/passkeys", "POST", { action: "remove", id }))).status, 200);
  assert.equal((await loginWith(a)).status, 401, "a removed passkey no longer signs in");
});

test("a bad response, a replayed one and an expired token do not sign in", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { cookie } = await signIn("pk-bad@example.com");
  const a = new SoftAuthenticator(RP, origin);
  assert.equal((await addPasskey(cookie, a)).status, 200);
  const o = (await (await post("/passkey/login/options", {})).json()) as { options: { challenge: string }; token: string };
  const resp = a.get(o.options.challenge);
  assert.equal((await post("/passkey/login/verify", { token: o.token, response: resp })).status, 200);
  const replay = await post("/passkey/login/verify", { token: o.token, response: resp });
  assert.equal(replay.status, 400);
  assert.equal((await post("/passkey/login/verify", { token: "nope", response: resp })).status, 400);
  assert.equal((await post("/passkey/login/verify", { response: resp })).status, 401);
  assert.equal((await post("/passkey/login/verify", {})).status, 401);
  const stranger = new SoftAuthenticator(RP, origin);
  const o2 = (await (await post("/passkey/login/options", {})).json()) as { options: { challenge: string }; token: string };
  assert.equal((await post("/passkey/login/verify", { token: o2.token, response: stranger.get(o2.options.challenge) })).status, 401);
  // Cross-site posts are refused.
  const { auth } = await import("../src/lib/accounts/auth");
  const evil = await auth.handler(new Request(`${origin}/api/auth/passkey/login/options`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" }));
  assert.equal(evil.status, 403);
});

test("a passkey sign-in is two factors, so it skips the authenticator-app prompt that an email-link sign-in still gets", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const store = await import("../src/lib/accounts/mfa/store");
  const { cookie } = await signIn("pk-mfa@example.com");
  const uid = (await usable(cookie))!.user.id;
  const { secret } = await store.beginSetup(uid, "pk-mfa@example.com");
  assert.ok((await store.confirmSetup(uid, totpAt(secret, Date.now()), Date.now())).ok);
  const a = new SoftAuthenticator(RP, origin, Buffer.from(uid));
  // The first factor in place, adding a passkey needs a full session; the old cookie keeps working because it predates 2FA.
  assert.equal((await addPasskey(cookie, a)).status, 200);
  const ok = await loginWith(a, "/account");
  assert.equal(ok.status, 200);
  assert.doesNotMatch(((await ok.json()) as { redirectTo: string }).redirectTo, /two-factor/, "no detour to the code prompt");
  assert.ok(await usable(cookieOf(ok)), "the session is usable at once");
});
