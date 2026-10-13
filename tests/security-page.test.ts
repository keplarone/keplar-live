import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { footerNav } from "../src/lib/site";

// The words live in SecurityContent (shared by keplar.one/security and business.keplar.one/security).
const page = readFileSync("src/components/security/SecurityContent.tsx", "utf8");
const txt = readFileSync("public/.well-known/security.txt", "utf8");

test("security.txt points at the /security policy page and /security is linked from the footer", () => {
  assert.match(txt, /^Policy: https:\/\/keplar\.one\/security$/m);
  assert.ok(footerNav.some((g) => g.links.some((l) => l.href === "/security")));
});

test("the security page gives the contact, says no bounty, and claims no certification or audit", () => {
  assert.match(page, /contactEmail/);
  assert.match(page, /do not run a bug bounty/);
  assert.match(page, /no SOC 2, ISO 27001/);
  assert.match(page, /not had an independent audit/);
  // Any positive claim of a certification would be a lie today.
  assert.doesNotMatch(page, /\b(is|are|we're|we are) (SOC ?2|ISO ?27001|PCI|HIPAA)[- ]?(certified|compliant)/i);
});

test("the security page describes 2FA and passkeys as optional, matching the code", () => {
  assert.match(page, /Optional passkeys/);
  assert.doesNotMatch(page, /Passkeys are not available/);
  assert.ok(readFileSync("src/app/api/account/passkeys/route.ts", "utf8").includes('action === "add"'));
  assert.match(page, /Optional two-factor sign-in/);
  assert.doesNotMatch(page, /Two-factor authentication and passkeys are not available/);
  assert.ok(readFileSync("src/app/api/account/mfa/route.ts", "utf8").includes('action === "enable"'));
});
