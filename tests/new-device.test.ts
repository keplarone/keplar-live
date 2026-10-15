import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeSignIn, newDeviceEmail } from "../src/lib/accounts/new-device";
import { networkPrefix } from "../src/lib/accounts/persist";
import { createActionToken, verifyActionToken } from "../src/lib/accounts/action-token";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const CHROME_MAC_NEWER = CHROME_MAC.replace("125", "131");
const FIREFOX_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";
const SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";

test("first sign-in sends no notice; same browser+OS (any version or network) is known; a new combination is flagged", () => {
  assert.equal(judgeSignIn([], { userAgent: CHROME_MAC }), "first");
  assert.equal(judgeSignIn([{ userAgent: CHROME_MAC, ipHash: "a" }], { userAgent: CHROME_MAC_NEWER }), "known");
  assert.equal(judgeSignIn([{ userAgent: CHROME_MAC, ipHash: "a" }], { userAgent: FIREFOX_WIN }), "new_device");
  assert.equal(judgeSignIn([{ userAgent: CHROME_MAC, ipHash: "a" }], { userAgent: "" }), "new_device");
});

test("the email names the device and time, offers the sign-out-everywhere link, and carries no token other than that link", () => {
  const at = new Date("2026-10-04T05:30:00Z");
  const m = newDeviceEmail({ device: "Firefox on Windows", provider: "magic-link", at, secureUrl: "https://keplar.one/secure-account?token=T", accountUrl: "https://keplar.one/account#devices" });
  assert.match(m.subject, /New sign-in/);
  assert.match(m.text, /Firefox on Windows/);
  assert.match(m.text, /2026-10-04 05:30 UTC/);
  assert.match(m.text, /secure-account\?token=T/);
  assert.match(m.text, /an email sign-in link/);
  assert.doesNotMatch(m.text, /password:/i);
});

test("the secure link is signed, expires after 7 days, and cannot be used as a reset or verify link", () => {
  const t = createActionToken(SECRET, "secure", { email: "Me@Example.com", fp: "-" }, { now: 1_000_000_000_000 });
  const ok = verifyActionToken(SECRET, "secure", t, { now: 1_000_000_000_000 + 6 * 86400_000 });
  assert.ok(ok.ok && ok.payload.e === "me@example.com");
  const late = verifyActionToken(SECRET, "secure", t, { now: 1_000_000_000_000 + 8 * 86400_000 });
  assert.deepEqual(late.ok ? null : late.reason, "expired");
  assert.equal(verifyActionToken(SECRET, "reset", t).ok, false);
  assert.equal(verifyActionToken(SECRET, "verify", t).ok, false);
  assert.equal(verifyActionToken(SECRET, "secure", t.slice(0, -2) + "xx").ok, false);
  assert.equal(verifyActionToken("another-secret-0123456789abcdefghij", "secure", t).ok, false);
});

test("POST /api/account/secure refuses a bad or missing link and cross-site callers", async () => {
  process.env.BETTER_AUTH_SECRET = SECRET;
  process.env.BETTER_AUTH_URL = "https://keplar.one";
  const { POST } = await import("../src/app/api/account/secure/route");
  const call = (b: unknown, origin = "https://keplar.one") =>
    POST(new Request("https://keplar.one/api/account/secure", { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(b) }));
  assert.equal((await call({ token: "nope" })).status, 400);
  assert.equal((await call({})).status, 400);
  assert.ok((await call({ token: "x" }, "https://evil.example")).status >= 400);
});

// AUTH-11 (docs/rebirth/AUDIT.md): the label alone ("Chrome on Windows") is shared by most people, so an attacker on that common
// setup passed as a known device. A known label from a network the account never used is now flagged too.
test("a known browser+OS from a never-seen coarse network is new_network; a seen network, or no network data, is known", () => {
  const prior = [{ userAgent: CHROME_MAC, ipHash: "a", netHash: "home" }, { userAgent: FIREFOX_WIN, ipHash: "b", netHash: "office" }];
  assert.equal(judgeSignIn(prior, { userAgent: CHROME_MAC_NEWER, netHash: "home" }), "known");
  assert.equal(judgeSignIn(prior, { userAgent: CHROME_MAC, netHash: "office" }), "known", "any of the account's networks counts");
  assert.equal(judgeSignIn(prior, { userAgent: CHROME_MAC, netHash: "elsewhere" }), "new_network");
  assert.equal(judgeSignIn(prior, { userAgent: CHROME_MAC, netHash: "" }), "known", "unknown network: no guess");
  assert.equal(judgeSignIn([{ userAgent: CHROME_MAC, ipHash: "a" }], { userAgent: CHROME_MAC, netHash: "x" }), "known", "older sessions have no network: never a flood after the upgrade");
  assert.equal(judgeSignIn(prior, { userAgent: "", netHash: "elsewhere" }), "new_device");
});

test("the network is coarse (IPv4 /16, IPv6 /32) and local or junk input has none", () => {
  assert.equal(networkPrefix("203.0.113.9"), "203.0");
  assert.equal(networkPrefix("203.0.200.1"), "203.0", "same /16");
  assert.equal(networkPrefix("::ffff:198.51.100.7"), "198.51");
  assert.equal(networkPrefix("2001:0db8:85a3::8a2e:370:7334"), "2001:db8");
  assert.equal(networkPrefix("2001:db8:ffff::1"), "2001:db8");
  for (const bad of ["", "local", "unknown", "::1", "not-an-ip", "999.1.2.3", null, undefined]) assert.equal(networkPrefix(bad), null, String(bad));
});

test("the new-network email says so", () => {
  const m = newDeviceEmail({ device: "Chrome on macOS", provider: "password", at: new Date(), secureUrl: "https://keplar.one/secure-account?token=T", accountUrl: "https://keplar.one/account#devices", newNetwork: true });
  assert.match(m.text, /network we haven't seen/);
  assert.match(m.text, /secure-account\?token=T/);
});
