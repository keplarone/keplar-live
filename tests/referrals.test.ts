import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { canonicalEmail, isDisposableDomain, maskEmail, networkOf, assess } from "@/lib/referrals/abuse";
import { redeemReferral, ensureProfile, summaryFor, decideClaim, adminReport, type OwnerRef } from "@/lib/referrals/repo";
import { referralConfig } from "@/lib/referrals/config";
import { extensionBalance } from "@/lib/create/platform/extensions";
import { ensureWorkspaceForUser } from "@/lib/accounts/workspaces";

async function person(label: string, email = `${label}@gmail.com`, ageHours = 100) {
  const row = await ensureWorkspaceForUser({ id: `user_${label}`, email, name: label });
  const createdAt = new Date(Date.now() - ageHours * 36e5).toISOString();
  const o: OwnerRef & { createdAt: string } = { workspaceId: row.id, userId: `user_${label}`, email, createdAt };
  return o;
}
const seen = (ip = "203.0.113.5", deviceId: string | null = null) => ({ ip, deviceId });

test("canonicalEmail: dots and plus-tags cannot make a second mailbox on Gmail", () => {
  assert.equal(canonicalEmail("A.B+promo@Gmail.com"), "ab@gmail.com");
  assert.equal(canonicalEmail("ab@googlemail.com"), "ab@gmail.com");
  assert.equal(canonicalEmail("a.b+x@example.com"), "a.b@example.com");
});

test("disposable domains (and their subdomains) are recognised; masks and networks hide detail", () => {
  assert.equal(isDisposableDomain("mailinator.com"), true);
  assert.equal(isDisposableDomain("x.mailinator.com"), true);
  assert.equal(isDisposableDomain("example.com"), false);
  assert.equal(maskEmail("jane@gmail.com"), "j***@gmail.com");
  assert.equal(networkOf("203.0.113.77"), "203.0.113.0/24");
  assert.equal(networkOf("2001:db8:1:2::9"), "2001:db8:1::/48");
  assert.equal(networkOf("local"), null);
});

test("assess: blocks for self-referral, throwaways, repeats; holds for shared network/work domain/new referrer; grants otherwise", () => {
  const referrer = { workspaceId: "ws_a", emailHash: "ea", domain: "gmail.com", deviceHashes: ["dev_a"], ipHashes: ["ip_a"], createdAt: new Date(Date.now() - 9e8).toISOString() };
  const friend = { workspaceId: "ws_b", emailHash: "eb", domain: "gmail.com", ipHash: "ip_b", deviceHash: "dev_b" };
  const base = { friend, referrer, earlier: [], referrerClaims: [], referrerMinAgeHours: 24 };
  assert.equal(assess(base).action, "grant");
  assert.equal(assess({ ...base, friend: { ...friend, workspaceId: "ws_a" } }).action, "block");
  assert.equal(assess({ ...base, friend: { ...friend, emailHash: "ea" } }).action, "block");
  assert.equal(assess({ ...base, friend: { ...friend, deviceHash: "dev_a" } }).action, "block");
  assert.equal(assess({ ...base, friend: { ...friend, domain: "mailinator.com" } }).action, "block");
  assert.equal(assess({ ...base, earlier: [{ emailHash: "eb", ipHash: null, deviceHash: null, domain: "x.com", status: "granted" }] }).action, "block");
  assert.equal(assess({ ...base, earlier: [{ emailHash: "z", ipHash: null, deviceHash: "dev_b", domain: "x.com", status: "granted" }] }).action, "block");
  assert.equal(assess({ ...base, friend: { ...friend, ipHash: "ip_a" } }).action, "hold");
  assert.equal(assess({ ...base, friend: { ...friend, domain: "acme.io" }, referrer: { ...referrer, domain: "acme.io" } }).action, "hold");
  assert.equal(assess({ ...base, referrer: { ...referrer, createdAt: new Date().toISOString() } }).action, "hold");
  const peers = [1, 2].map((i) => ({ emailHash: `p${i}`, ipHash: "ip_b", deviceHash: null, domain: "x.com", status: "granted" }));
  assert.equal(assess({ ...base, earlier: peers }).action, "hold");
});

test("redeem: a verified new account and its referrer each get extra usage credit, once", async () => {
  const cfg = referralConfig();
  const a = await person("ref-a");
  const profile = await ensureProfile(a, seen("198.51.100.1", "dev-a"), a.createdAt);
  assert.match(profile.code, /^[a-hjkmnp-z2-9]{8}$/);
  assert.equal((await ensureProfile(a, seen("198.51.100.1", "dev-a"), a.createdAt)).code, profile.code, "the code is stable");

  const f = await person("ref-f", "friend.f@gmail.com", 1);
  const r = await redeemReferral({ code: profile.code, account: f, ip: "192.0.2.10", deviceId: "dev-f" });
  assert.equal(r.status, "granted");
  assert.equal(await extensionBalance(f.workspaceId), cfg.friendCredits);
  assert.equal(await extensionBalance(a.workspaceId), cfg.referrerCredits);

  const again = await redeemReferral({ code: profile.code, account: f, ip: "192.0.2.10", deviceId: "dev-f" });
  assert.equal(again.status, "already");
  assert.equal(await extensionBalance(f.workspaceId), cfg.friendCredits, "no second reward for the same account");

  const sum = await summaryFor(profile);
  assert.equal(sum.friends.length, 1);
  assert.equal(sum.friends[0]!.who, "f***@gmail.com");
  assert.equal(sum.creditsEarned, cfg.referrerCredits);
  assert.equal(sum.usage.thisMonth, 1);
});

test("redeem: self-referral, same mailbox, a throwaway address, an old account, a bad code and the off switch earn nothing", async () => {
  const a = await person("ref-self", "self.one@gmail.com");
  const p = await ensureProfile(a, seen("198.51.100.2", "dev-self"), a.createdAt);
  const own = await redeemReferral({ code: p.code, account: { ...a, createdAt: new Date().toISOString() }, ip: "198.51.100.2", deviceId: "dev-self" });
  assert.equal(own.status, "blocked");
  const alias = await person("ref-alias", "s.elf.one+2@gmail.com", 1);
  assert.equal((await redeemReferral({ code: p.code, account: alias, ip: "192.0.2.20", deviceId: "dev-x" })).status, "blocked");
  const disp = await person("ref-disp", "tmp@mailinator.com", 1);
  assert.equal((await redeemReferral({ code: p.code, account: disp, ip: "192.0.2.21", deviceId: "dev-y" })).status, "blocked");
  const sameBrowser = await person("ref-sb", "sb@gmail.com", 1);
  assert.equal((await redeemReferral({ code: p.code, account: sameBrowser, ip: "192.0.2.22", deviceId: "dev-self" })).status, "blocked");
  for (const w of [own, alias, disp, sameBrowser]) assert.ok(w);
  assert.equal(await extensionBalance(alias.workspaceId), 0);
  assert.equal(await extensionBalance(a.workspaceId), 0);
  const old = await person("ref-old", "old@gmail.com", 24 * 30);
  assert.equal((await redeemReferral({ code: p.code, account: old, ip: "192.0.2.23", deviceId: null })).status, "too_old");
  assert.equal((await redeemReferral({ code: "abcdefgh", account: old, ip: "192.0.2.23", deviceId: null })).status, "invalid");
  process.env.KEPLAR_REFERRALS = "off";
  try {
    assert.equal((await redeemReferral({ code: p.code, account: sameBrowser, ip: "192.0.2.24", deviceId: null })).status, "off");
  } finally {
    delete process.env.KEPLAR_REFERRALS;
  }
});

test("redeem: a second account with the same device or mailbox as an earlier reward is blocked", async () => {
  const a = await person("ref-dup-a");
  const p = await ensureProfile(a, seen("198.51.100.3", "dev-dup-a"), a.createdAt);
  const f1 = await person("ref-dup-1", "dup.one@gmail.com", 1);
  assert.equal((await redeemReferral({ code: p.code, account: f1, ip: "192.0.2.30", deviceId: "dev-dup" })).status, "granted");
  const f2 = await person("ref-dup-2", "dup.two@gmail.com", 1);
  assert.equal((await redeemReferral({ code: p.code, account: f2, ip: "192.0.2.31", deviceId: "dev-dup" })).status, "blocked", "same browser");
  const f3 = await person("ref-dup-3", "dup.one+again@gmail.com", 1);
  assert.equal((await redeemReferral({ code: p.code, account: f3, ip: "192.0.2.32", deviceId: "dev-other" })).status, "blocked", "same mailbox");
});

test("caps: a referrer is rewarded for at most KEPLAR_REFERRAL_PER_MONTH friends; the friend is not rewarded either", async () => {
  process.env.KEPLAR_REFERRAL_PER_MONTH = "2";
  try {
    const a = await person("ref-cap-a");
    const p = await ensureProfile(a, seen("198.51.100.4", "dev-cap-a"), a.createdAt);
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      const f = await person(`ref-cap-${i}`, `cap${i}@gmail.com`, 1);
      out.push((await redeemReferral({ code: p.code, account: f, ip: `192.0.${50 + i}.1`, deviceId: `dev-cap-${i}` })).status);
      if (i === 2) assert.equal(await extensionBalance(f.workspaceId), 0);
    }
    assert.deepEqual(out, ["granted", "granted", "capped"]);
    assert.equal((await summaryFor(p)).usage.thisMonth, 2, "the failed slot was given back");
  } finally {
    delete process.env.KEPLAR_REFERRAL_PER_MONTH;
  }
});

test("hold and admin review: same network as the referrer is held, an admin can approve (credit granted once) or deny", async () => {
  const cfg = referralConfig();
  const a = await person("ref-h-a");
  const p = await ensureProfile(a, seen("198.51.100.9", "dev-h-a"), a.createdAt);
  const f = await person("ref-h-f", "held@gmail.com", 1);
  const r = await redeemReferral({ code: p.code, account: f, ip: "198.51.100.77", deviceId: "dev-h-f" });
  assert.equal(r.status, "held");
  assert.equal(await extensionBalance(f.workspaceId), 0);
  const rep = await adminReport();
  const row = rep.claims.find((c) => c.workspaceId === f.workspaceId)!;
  assert.equal(row.status, "held");
  assert.ok(row.reasons.some((x) => /same network/.test(x)));
  assert.ok(!JSON.stringify(rep).match(/ipHash|deviceHash|emailHash/), "hashes are not shown to the admin");
  const done = await decideClaim(row.id, "approve", "admin@example.com");
  assert.equal(done!.status, "approved");
  assert.equal(await extensionBalance(f.workspaceId), cfg.friendCredits);
  await decideClaim(row.id, "approve", "admin@example.com");
  assert.equal(await extensionBalance(f.workspaceId), cfg.friendCredits, "deciding twice never double-grants");

  const g = await person("ref-h-g", "held2@gmail.com", 1);
  await redeemReferral({ code: p.code, account: g, ip: "198.51.100.78", deviceId: "dev-h-g" });
  const gid = (await adminReport()).claims.find((c) => c.workspaceId === g.workspaceId)!.id;
  assert.equal((await decideClaim(gid, "deny", "admin@example.com"))!.status, "denied");
  assert.equal(await extensionBalance(g.workspaceId), 0);
});

test("program daily cap: past the cap new claims wait for review instead of being granted", async () => {
  process.env.KEPLAR_REFERRAL_DAILY_CAP = "1";
  try {
    const a = await person("ref-d-a");
    const p = await ensureProfile(a, seen("198.51.100.20", "dev-d-a"), a.createdAt);
    const f = await person("ref-d-f", "d.f@gmail.com", 1);
    const r = await redeemReferral({ code: p.code, account: f, ip: "192.0.2.90", deviceId: "dev-d-f" });
    assert.ok(r.status === "held" || r.status === "granted");
    const g = await person("ref-d-g", "d.g@gmail.com", 1);
    const r2 = await redeemReferral({ code: p.code, account: g, ip: "192.0.2.91", deviceId: "dev-d-g" });
    assert.equal(r2.status, "held");
    assert.equal(await extensionBalance(g.workspaceId), 0);
  } finally {
    delete process.env.KEPLAR_REFERRAL_DAILY_CAP;
  }
});

test("rewards are extra usage credit only: no cash, payout, coupon or withdrawal anywhere in the referral code or its grant calls", () => {
  const dir = "src/lib/referrals";
  for (const f of readdirSync(dir)) {
    const src = readFileSync(`${dir}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/\b(payout|withdraw|paypal|stripe|coupon|cashback|transfer)\b/i.test(src), `${f} must not move money`);
  }
  const repo = readFileSync(`${dir}/repo.ts`, "utf8");
  assert.ok(repo.includes('pack: "referral"'));
});

test("the terms page is built from the live settings and says rewards are never cash", async () => {
  const { referralTerms } = await import("@/components/legal/content/referral");
  process.env.KEPLAR_REFERRAL_PER_MONTH = "7";
  process.env.KEPLAR_REFERRAL_CREDITS_FRIEND = "321";
  try {
    const text = JSON.stringify(referralTerms(referralConfig()));
    assert.match(text, /321 extra usage credits/);
    assert.match(text, /Up to 7 rewarded friends per calendar month/);
    assert.match(text, /never cash, a payout, a gift card, a coupon/);
    assert.match(text, /only on a paid plan/);
  } finally {
    delete process.env.KEPLAR_REFERRAL_PER_MONTH;
    delete process.env.KEPLAR_REFERRAL_CREDITS_FRIEND;
  }
});
