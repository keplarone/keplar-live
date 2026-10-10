import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, generateRecoveryCodes, generateSecret, hotp, looksLikeRecovery, normalizeRecovery, otpauthUri, stepAt, totpAt, verifyTotp } from "../src/lib/accounts/mfa/totp";

// RFC 6238 Appendix B (SHA-1, secret "12345678901234567890"), 8-digit reference values truncated to the 6 we use.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
test("HOTP/TOTP match the RFC 4226 and RFC 6238 test vectors", () => {
  const rfc4226 = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  rfc4226.forEach((want, i) => assert.equal(hotp(RFC_SECRET, i), want));
  const rfc6238: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];
  for (const [t, want] of rfc6238) assert.equal(totpAt(RFC_SECRET, t * 1000), want, `t=${t}`);
});

test("base32 round-trips and tolerates spaces, dashes and lowercase", () => {
  const s = generateSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(base32Encode(base32Decode(s)), s);
  assert.deepEqual(base32Decode(s.toLowerCase().replace(/(.{4})/g, "$1 ")), base32Decode(s));
  assert.throws(() => base32Decode("not*base32"));
});

test("verification accepts the current step and one step of drift, nothing else, and reports the step", () => {
  const t = 1_700_000_000_000;
  const step = stepAt(t);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t), t), step);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t - 30_000), t), step - 1);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t + 30_000), t), step + 1);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t - 90_000), t), null);
  assert.equal(verifyTotp(RFC_SECRET, "12345", t), null);
  assert.equal(verifyTotp(RFC_SECRET, "abcdef", t), null);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t).replace(/(...)(...)/, "$1 $2"), t), step, "a space in the middle is fine");
});

test("otpauth URI carries issuer, account, secret and parameters", () => {
  const u = otpauthUri("Keplar", "me@example.com", "ABCDEFGH");
  assert.equal(u, "otpauth://totp/Keplar:me%40example.com?secret=ABCDEFGH&issuer=Keplar&algorithm=SHA1&digits=6&period=30");
});

test("recovery codes: 10 unique, formatted, unambiguous alphabet, normalized on entry", () => {
  const codes = generateRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) {
    assert.match(c, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(normalizeRecovery(c.toLowerCase().replace("-", " ")), c.replace("-", ""));
    assert.ok(looksLikeRecovery(c));
  }
  assert.equal(looksLikeRecovery("123456"), false);
});
