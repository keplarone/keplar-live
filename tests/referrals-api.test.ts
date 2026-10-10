import "./setup";
import "./helpers/session";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq, call } from "./helpers/session";
import { GET as inviteGET } from "@/app/invite/[code]/route";
import { GET as panelGET } from "@/app/api/referrals/route";
import { POST as redeemPOST } from "@/app/api/referrals/redeem/route";
import { GET as adminGET } from "@/app/api/admin/referrals/route";
import { POST as adminPOST } from "@/app/api/admin/referrals/[id]/route";
import { extensionBalance } from "@/lib/create/platform/extensions";

process.env.KEPLAR_REFERRAL_REFERRER_MIN_AGE_HOURS = "0"; // test accounts are minutes old; the young-referrer hold is covered in referrals.test.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (r: Response) => (await r.json()) as Record<string, any>;
const setCookies = (r: Response) => r.headers.getSetCookie();
const jar = (r: Response) => setCookies(r).map((c) => c.split(";")[0]!).filter((c) => !c.endsWith("=")).join("; ");
const post = (cookie: string, ip: string, path = "/api/referrals/redeem") => redeemPOST(call(cookie, path, { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: "{}" }));
const invite = (code: string, cookie?: string) => inviteGET(call(cookie ?? null, `/invite/${code}`), { params: Promise.resolve({ code }) });

test("signed out: the panel and the claim are 401; the invite link needs no account", async () => {
  assert.equal((await panelGET(call(null, "/api/referrals"))).status, 401);
  assert.equal((await redeemPOST(jsonReq(null, "/api/referrals/redeem", "POST", {}))).status, 401);
  const r = await invite("zzzzzzzz");
  assert.equal(r.status, 303);
  assert.match(r.headers.get("location")!, /\/signup$/);
  assert.equal(setCookies(r).length, 0, "an unknown code sets nothing");
});

test("end to end: referrer opens the panel, the friend follows the link, signs up and claims; both get usage credit and nothing else", async () => {
  const referrer = await signIn("api-ref-a@gmail.com");
  const panel = await j(await panelGET(call(referrer.cookie, "/api/referrals", { headers: { "x-forwarded-for": "198.51.100.50" } })));
  assert.match(panel.link, /\/\?ref=[a-hjkmnp-z2-9]{8}$/);
  assert.equal(panel.rewards.referrerCredits, 500);
  assert.equal(panel.termsUrl, "/referral-terms");
  assert.ok(!JSON.stringify(panel).match(/cash|payout|withdraw/i));

  const code = new URL(panel.link).searchParams.get("ref") as string;
  const land = await invite(code);
  assert.equal(land.status, 303);
  assert.match(land.headers.get("location")!, /\/signup\?invited=1$/);
  const cookies = setCookies(land);
  assert.ok(cookies.some((c) => c.startsWith("kp_ref=") && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)), "the code cookie is HttpOnly");
  assert.ok(cookies.some((c) => c.startsWith("kp_ref_p=1") && !/HttpOnly/i.test(c)), "the flag cookie is readable and carries no code");
  assert.ok(!cookies.find((c) => c.startsWith("kp_ref_p="))!.includes(code));

  const friend = await signIn("api-ref-f@gmail.com");
  const claim = await post(`${friend.cookie}; ${jar(land)}`, "192.0.2.60");
  const res = await j(claim);
  assert.equal(res.status, "granted");
  assert.ok(setCookies(claim).some((c) => c.startsWith("kp_ref=;") || /^kp_ref=; .*Max-Age=0/.test(c)), "the code is forgotten after the claim");
  assert.equal(await extensionBalance(friend.workspaceId), 500);
  assert.equal(await extensionBalance(referrer.workspaceId), 500);

  const again = await j(await post(`${friend.cookie}; ${jar(land)}`, "192.0.2.60"));
  assert.equal(again.status, "already");
  assert.equal(await extensionBalance(friend.workspaceId), 500);

  const after = await j(await panelGET(call(referrer.cookie, "/api/referrals", { headers: { "x-forwarded-for": "198.51.100.50" } })));
  assert.equal(after.creditsEarned, 500);
  assert.equal(after.friends[0].status, "rewarded");
  assert.equal(after.friends[0].who, "a***@gmail.com");
});

test("a claim with no invite cookie does nothing; self-referral through the API is blocked", async () => {
  const me = await signIn("api-ref-self@gmail.com");
  assert.equal((await j(await post(me.cookie, "192.0.2.61"))).status, "none");
  const panelRes = await panelGET(call(me.cookie, "/api/referrals", { headers: { "x-forwarded-for": "198.51.100.51" } }));
  const code = new URL((await j(panelRes)).link).searchParams.get("ref") as string;
  const own = await invite(code);
  const r = await j(await post(`${me.cookie}; ${jar(own)}; ${jar(panelRes)}`, "198.51.100.51"));
  assert.equal(r.status, "blocked");
  assert.equal(await extensionBalance(me.workspaceId), 0);
});

test("admin routes: 404 for everyone but an admin; an admin sees the claims without network or browser identifiers and can decide held ones", async () => {
  const user = await signIn("api-ref-user@gmail.com");
  assert.equal((await adminGET(call(user.cookie, "/api/admin/referrals"))).status, 404);
  assert.equal((await adminPOST(jsonReq(user.cookie, "/api/admin/referrals/rc_x", "POST", { decision: "approve" }), { params: Promise.resolve({ id: "rc_x" }) })).status, 404);

  process.env.KEPLAR_ADMIN_EMAILS = "referral-admin@example.com";
  try {
    const admin = await signIn("referral-admin@example.com");
    const a = await signIn("api-ref-h-a@gmail.com");
    const panelRes = await panelGET(call(a.cookie, "/api/referrals", { headers: { "x-forwarded-for": "198.51.100.70" } }));
    const code = new URL((await j(panelRes)).link).searchParams.get("ref") as string;
    const land = await invite(code);
    const f = await signIn("api-ref-h-f@gmail.com");
    assert.equal((await j(await post(`${f.cookie}; ${jar(land)}`, "198.51.100.70"))).status, "held");
    const rep = await j(await adminGET(call(admin.cookie, "/api/admin/referrals")));
    const row = rep.claims.find((c: { workspaceId: string }) => c.workspaceId === f.workspaceId);
    assert.equal(row.status, "held");
    assert.ok(!JSON.stringify(rep).match(/ipHash|deviceHash|emailHash/));
    const bad = await adminPOST(jsonReq(admin.cookie, `/api/admin/referrals/${row.id}`, "POST", { decision: "pay" }), { params: Promise.resolve({ id: row.id }) });
    assert.equal(bad.status, 400);
    const ok = await j(await adminPOST(jsonReq(admin.cookie, `/api/admin/referrals/${row.id}`, "POST", { decision: "approve" }), { params: Promise.resolve({ id: row.id }) }));
    assert.equal(ok.status, "approved");
    assert.equal(await extensionBalance(f.workspaceId), 500);
  } finally {
    delete process.env.KEPLAR_ADMIN_EMAILS;
  }
});
