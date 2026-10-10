import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { enabledOAuthProviders, microsoftEmailVerified, MICROSOFT_CONSUMER_TENANT_ID, oauthErrorMessage, socialProvidersFromEnv } from "@/lib/accounts/oauth";
import { userIdForEmail } from "@/lib/accounts/magic-token";

const SECRET = "test-secret-for-oauth-flows-0123456789abcdefghijkl";
const ORIGIN = "https://keplar.one";
process.env.BETTER_AUTH_SECRET = SECRET;
process.env.BETTER_AUTH_URL = ORIGIN;
process.env.GOOGLE_CLIENT_ID = "google-test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
process.env.MICROSOFT_CLIENT_ID = "00000000-1111-2222-3333-444444444444";
process.env.MICROSOFT_CLIENT_SECRET = "ms-test-secret";

test("providers: enabled only when both env vars are set (missing keys never configure a provider)", () => {
  assert.deepEqual(enabledOAuthProviders({}), { google: false, microsoft: false });
  assert.deepEqual(socialProvidersFromEnv({}), {});
  assert.deepEqual(enabledOAuthProviders({ GOOGLE_CLIENT_ID: "x" }), { google: false, microsoft: false });
  assert.deepEqual(enabledOAuthProviders({ MICROSOFT_CLIENT_ID: "x", MICROSOFT_CLIENT_SECRET: "  " }), { google: false, microsoft: false });
  assert.deepEqual(enabledOAuthProviders({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }), { google: true, microsoft: false });
  assert.deepEqual(enabledOAuthProviders({ GOOGLE_SIGNIN_CLIENT_ID: "a", GOOGLE_SIGNIN_CLIENT_SECRET: "b" }).google, true, "legacy names still honored");
  const ms = socialProvidersFromEnv({ MICROSOFT_CLIENT_ID: "a", MICROSOFT_CLIENT_SECRET: "b" }).microsoft as { tenantId?: string; disableProfilePhoto?: boolean };
  assert.equal(ms.tenantId, "common", "personal + work accounts");
  assert.equal(ms.disableProfilePhoto, true);
});

test("microsoft: only Microsoft-verified emails count", () => {
  assert.equal(microsoftEmailVerified({ email: "a@outlook.com", tid: MICROSOFT_CONSUMER_TENANT_ID }), true, "personal account");
  assert.equal(microsoftEmailVerified({ email: "a@corp.test", tid: "tenant-x" }), false, "work account, no verification claim");
  assert.equal(microsoftEmailVerified({ email: "a@corp.test", tid: "tenant-x", xms_edov: true }), true);
  assert.equal(microsoftEmailVerified({ email: "A@corp.test", tid: "tenant-x", verified_primary_email: ["a@corp.test"] }), true);
  assert.equal(microsoftEmailVerified({ email: "a@corp.test", tid: "tenant-x", verified_primary_email: ["b@corp.test"] }), false);
  assert.equal(microsoftEmailVerified({ tid: MICROSOFT_CONSUMER_TENANT_ID }), false, "no email");
});

test("error copy", () => {
  assert.equal(oauthErrorMessage(undefined), null);
  assert.match(oauthErrorMessage("link") as string, /expired/);
  assert.match(oauthErrorMessage("unable_to_create_user") as string, /verified email/);
  assert.match(oauthErrorMessage("anything_else") as string, /didn't complete/);
});

/* ── end-to-end against the real Better Auth handler, provider endpoints mocked ── */

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (claims: object) => `${b64({ alg: "RS256", kid: "test", typ: "JWT" })}.${b64(claims)}.c2ln`;
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));
const realFetch = globalThis.fetch;

function mockTokenEndpoint(idTokenClaims: object) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token") || /login\.microsoftonline\.com\/.+\/token/.test(url)) {
      return new Response(JSON.stringify({ access_token: "at-test", token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: fakeJwt(idTokenClaims) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://graph.microsoft.com/")) return new Response("", { status: 404 });
    return realFetch(input, init);
  }) as typeof fetch;
}

async function signInWith(provider: "google" | "microsoft", claims: object) {
  const { auth } = await import("@/lib/accounts/auth");
  const start = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ provider, callbackURL: "/account", errorCallbackURL: "/signin" }) }));
  assert.equal(start.status, 200, `${provider} start`);
  const { url } = (await start.json()) as { url: string };
  const authorize = new URL(url);
  const stateCookies = cookiesOf(start);
  mockTokenEndpoint(claims);
  try {
    const cb = await auth.handler(new Request(`${ORIGIN}/api/auth/callback/${provider}?code=test-code&state=${encodeURIComponent(authorize.searchParams.get("state") ?? "")}`, { headers: { cookie: stateCookies.join("; ") } }));
    return { auth, authorize, cb };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("google: authorize URL uses the documented callback; sign-in yields a stateless session keyed by email", async () => {
  const { auth, authorize, cb } = await signInWith("google", { iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, sub: "g-123", email: "Ada@Example.com", email_verified: true, name: "Ada" });
  assert.equal(authorize.origin, "https://accounts.google.com");
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://keplar.one/api/auth/callback/google");
  assert.match(authorize.searchParams.get("scope") ?? "", /openid/);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "/account");
  const cookie = cookiesOf(cb).join("; ");
  assert.doesNotMatch(cookie, /account_data/, "no provider tokens stored in cookies");
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.ok(session, "session readable from the cookie");
  assert.equal(session.user.email, "ada@example.com");
  assert.equal(session.user.id, userIdForEmail(SECRET, "ada@example.com"), "same id as the magic-link flow");
});

test("microsoft: tenant 'common', personal account signs in to the same email-derived account", async () => {
  const tid = MICROSOFT_CONSUMER_TENANT_ID;
  const { auth, authorize, cb } = await signInWith("microsoft", { iss: `https://login.microsoftonline.com/${tid}/v2.0`, tid, oid: "ms-oid-1", sub: "ms-sub-1", aud: process.env.MICROSOFT_CLIENT_ID, email: "bob@outlook.com", name: "Bob" });
  assert.match(authorize.pathname, /^\/common\/oauth2\/v2\.0\/authorize/);
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://keplar.one/api/auth/callback/microsoft");
  assert.deepEqual((authorize.searchParams.get("scope") ?? "").split(" ").sort(), ["User.Read", "email", "openid", "profile"], "no offline_access");
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "/account");
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookiesOf(cb).join("; ") }) });
  assert.equal(session?.user.id, userIdForEmail(SECRET, "bob@outlook.com"));
});

test("microsoft: unverified work-account email is refused (no session), user sent back to /signin", async () => {
  const { auth, cb } = await signInWith("microsoft", { iss: "https://login.microsoftonline.com/tenant-x/v2.0", tid: "tenant-x", oid: "ms-oid-2", sub: "ms-sub-2", aud: process.env.MICROSOFT_CLIENT_ID, email: "ceo@victim.test", name: "Mallory" });
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get("location") ?? "", /^\/signin\?error=email_not_verified(&|$)/);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookiesOf(cb).join("; ") }) });
  assert.equal(session, null);
});
