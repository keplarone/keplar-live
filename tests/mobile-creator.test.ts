import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
import { testWorkspace } from "./helpers/workspace";
import { appleJwt, credStore, googleAssertion, listCreds, readCred, saveApple, saveExpo, saveGoogle } from "../src/lib/mobile/credentials";
import { mobileProject, normalizeSpec, SpecError } from "../src/lib/mobile/scaffold";
import { STORE_FACTS } from "../src/lib/mobile/facts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
type Call = { url: string; method: string; auth: string | null; body: string };
function net(routes: Record<string, (c: Call) => { status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const c: Call = { url, method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") };
    calls.push(c);
    const k = Object.keys(routes).find((x) => url.startsWith(x));
    if (!k) return new Response("{}", { status: 404 });
    const r = routes[k](c);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const p8 = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaPem = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const apple = { issuerId: "69a6de7e-1111-2222-3333-444455556666", keyId: "ABCDE12345", privateKey: p8 };
const saJson = JSON.stringify({ type: "service_account", client_email: "pub@proj.iam.gserviceaccount.com", private_key: rsaPem });

test("mobile: store facts state the API limits and prices plainly", () => {
  assert.match(STORE_FACTS.apple.api, /can NOT create the app record/);
  assert.match(STORE_FACTS.google.api, /can NOT create a new app/);
  assert.match(STORE_FACTS.apple.price, /\$99/);
  assert.match(STORE_FACTS.google.price, /\$25/);
  assert.match(STORE_FACTS.honesty, /BETA/);
});

test("mobile: Apple JWT is a real ES256 token that verifies with the matching public key", () => {
  const [h, b, s] = appleJwt(apple, 1_800_000_000).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "ES256", kid: "ABCDE12345", typ: "JWT" });
  const body = JSON.parse(Buffer.from(b, "base64url").toString());
  assert.equal(body.aud, "appstoreconnect-v1");
  assert.equal(body.exp - body.iat, 600, "well under Apple's 20 minute limit");
  assert.ok(cryptoVerify("sha256", Buffer.from(`${h}.${b}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
});

test("mobile: Google assertion is RS256 for the fixed token endpoint", () => {
  const [h, b, s] = googleAssertion("pub@proj.iam.gserviceaccount.com", rsaPem, 1_800_000_000).split(".");
  const v = createVerify("RSA-SHA256");
  v.update(`${h}.${b}`);
  assert.ok(v.verify(rsa.publicKey, Buffer.from(s, "base64url")));
  assert.equal(JSON.parse(Buffer.from(b, "base64url").toString()).aud, "https://oauth2.googleapis.com/token");
});

test("mobile: saving an Apple key verifies it with Apple, stores it encrypted, and never returns it", async () => {
  const ws = await testWorkspace("mob-apple");
  const calls = net({ "https://api.appstoreconnect.apple.com/v1/apps": () => ({ json: { data: [], meta: { paging: { total: 2 } } } }) });
  await saveApple(ws.id, apple);
  assert.match(calls[0].auth ?? "", /^Bearer eyJ/);
  const list = await listCreds(ws.id);
  assert.equal(list[0].status, "verified");
  assert.match(list[0].detail, /2 app records visible/);
  assert.equal(JSON.stringify(list).includes("BEGIN PRIVATE KEY"), false);
  const row = (await credStore().get(ws.id, "apple"))!;
  assert.ok(!row.enc.includes("PRIVATE"), "encrypted at rest");
  assert.equal((await readCred<{ keyId: string }>(ws.id, "apple"))?.keyId, "ABCDE12345");
  // wrong key: Apple says 401 -> failed with a useful reason, still not echoed
  net({ "https://api.appstoreconnect.apple.com": () => ({ status: 401 }) });
  await saveApple(ws.id, apple);
  const again = (await listCreds(ws.id))[0];
  assert.equal(again.status, "failed");
  assert.match(again.detail, /rejected the key/);
});

test("mobile: bad Apple input is refused before any network call", async () => {
  const ws = await testWorkspace("mob-bad");
  const calls = net({});
  await assert.rejects(saveApple(ws.id, { ...apple, issuerId: "nope" }), /Issuer ID/);
  await assert.rejects(saveApple(ws.id, { ...apple, keyId: "x" }), /Key ID/);
  await assert.rejects(saveApple(ws.id, { ...apple, privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }), /readable private key/);
  assert.equal(calls.length, 0);
});

test("mobile: Google check exchanges the key, opens then deletes an edit, and explains a missing app or missing permission", async () => {
  const ws = await testWorkspace("mob-google");
  const calls = net({
    "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "ya29.T" } }),
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.acme.app/edits/": () => ({ json: {} }),
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.acme.app/edits": () => ({ json: { id: "e1" } }),
  });
  await saveGoogle(ws.id, { serviceAccountJson: saJson, packageName: "com.acme.app" });
  assert.equal((await listCreds(ws.id)).find((c) => c.kind === "google")!.status, "verified");
  assert.deepEqual(calls.map((c) => c.method), ["POST", "POST", "DELETE"], "no edit is left open");
  net({ "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "t" } }), "https://androidpublisher": () => ({ status: 404 }) });
  await saveGoogle(ws.id, { serviceAccountJson: saJson, packageName: "com.acme.app" });
  assert.match((await listCreds(ws.id)).find((c) => c.kind === "google")!.detail, /can't create apps/);
  net({ "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "t" } }), "https://androidpublisher": () => ({ status: 403 }) });
  await saveGoogle(ws.id, { serviceAccountJson: saJson, packageName: "com.acme.app" });
  assert.match((await listCreds(ws.id)).find((c) => c.kind === "google")!.detail, /hasn't been given access/);
  await assert.rejects(saveGoogle(ws.id, { serviceAccountJson: "{}" }), /service account/);
});

test("mobile: the Expo token is saved but honestly marked as not checked", async () => {
  const ws = await testWorkspace("mob-expo");
  await saveExpo(ws.id, "expo_token_0123456789abcdef");
  const c = (await listCreds(ws.id)).find((x) => x.kind === "expo")!;
  assert.equal(c.status, "saved");
  assert.match(c.detail, /can't check/);
  assert.equal(c.hint, "Token ending cdef");
  await assert.rejects(saveExpo(ws.id, "short"), /access token/);
});

test("mobile: project generator validates, escapes, and says it is untested", () => {
  assert.throws(() => normalizeSpec({ name: "x", bundleId: "com.a.b", screens: [{ title: "Home", body: "" }] }), SpecError);
  assert.throws(() => normalizeSpec({ name: "Okay", bundleId: "not a bundle", screens: [{ title: "Home", body: "" }] }), /bundle ID/);
  assert.throws(() => normalizeSpec({ name: "Okay", bundleId: "com.a.b", screens: [] }), /screen/);
  const f = mobileProject({ name: 'Joe "the" Baker', bundleId: "com.joe.baker", tagline: "Fresh\nbread", screens: [{ title: "Menu", body: "Rye `${process.exit()}` loaves" }, { title: "Visit", body: "Mill Lane" }] });
  assert.deepEqual(Object.keys(f).sort(), [".github/workflows/eas-build.yml", "App.tsx", "README.md", "app.json", "eas.json", "index.js", "package.json", "tsconfig.json"]);
  assert.equal(JSON.parse(f["app.json"]).expo.ios.bundleIdentifier, "com.joe.baker");
  assert.equal(JSON.parse(f["app.json"]).expo.android.package, "com.joe.baker");
  assert.match(f["App.tsx"], /const NAME = "Joe \\"the\\" Baker"/);
  assert.doesNotMatch(f["App.tsx"], /blue|#0a84ff|#007aff/i, "no blue");
  assert.match(f["App.tsx"], /\\u0060|`\$\{process\.exit\(\)\}`/, "model text sits inside a JSON string, never in code");
  assert.match(f["README.md"], /has not built or submitted/);
  assert.match(f["README.md"], /\$99/);
  assert.match(f[".github/workflows/eas-build.yml"], /secrets\.EXPO_TOKEN/);
  assert.match(f[".github/workflows/eas-build.yml"], /workflow_dispatch/, "never runs by itself");
});
