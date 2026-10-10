import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { suggestDomain, suggestEmail } from "@/lib/accounts/email-typos";
import { __setResolver, checkMailDomain, mailDomainOf, type Resolver } from "@/lib/accounts/email-domain";

process.env.BETTER_AUTH_SECRET = "test-secret-for-email-domain-0123456789abcdef";
process.env.BETTER_AUTH_URL = "https://keplar.one";
const ORIGIN = "https://keplar.one";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => {
  fake?.restore();
  __setResolver(null);
});

const err = (code: string) => Object.assign(new Error(code), { code });
type Zone = Record<string, { mx?: { exchange: string; priority: number }[]; a?: string[]; a6?: string[]; fail?: string }>;
function resolverFor(zone: Zone): Resolver & { calls: string[] } {
  const calls: string[] = [];
  const get = (d: string) => zone[d];
  return {
    calls,
    resolveMx: (async (d: string) => { calls.push(`mx:${d}`); const z = get(d); if (z?.fail) throw err(z.fail); if (!z?.mx) throw err(z ? "ENODATA" : "ENOTFOUND"); return z.mx; }) as Resolver["resolveMx"],
    resolve4: (async (d: string) => { calls.push(`a:${d}`); const z = get(d); if (z?.fail) throw err(z.fail); if (!z?.a) throw err(z ? "ENODATA" : "ENOTFOUND"); return z.a; }) as Resolver["resolve4"],
    resolve6: (async (d: string) => { calls.push(`aaaa:${d}`); const z = get(d); if (z?.fail) throw err(z.fail); if (!z?.a6) throw err(z ? "ENODATA" : "ENOTFOUND"); return z.a6; }) as Resolver["resolve6"],
  };
}

test("typo hints: close common domains, glued prefixes, never for correct or unrelated domains", () => {
  assert.equal(suggestDomain("ekeplar.one"), "keplar.one");
  assert.equal(suggestDomain("fakeplar.one"), "keplar.one");
  assert.equal(suggestDomain("fafafafkeplar.one"), "keplar.one");
  assert.equal(suggestDomain("eeeekeplar.one"), "keplar.one");
  assert.equal(suggestDomain("gmial.com"), "gmail.com");
  assert.equal(suggestDomain("gmail.con"), "gmail.com");
  assert.equal(suggestDomain("hotmial.com"), "hotmail.com");
  assert.equal(suggestDomain("yaho.com"), "yahoo.com");
  assert.equal(suggestDomain("outlok.com"), "outlook.com");
  for (const fine of ["keplar.one", "gmail.com", "mail.keplar.one", "example.org", "acme-corp.io", "university.edu", "x.co", "nonsense", ""]) assert.equal(suggestDomain(fine), null, fine);
  assert.equal(suggestEmail("team@ekeplar.one"), "team@keplar.one");
  assert.equal(suggestEmail("a.b+tag@gmial.com"), "a.b+tag@gmail.com");
  assert.equal(suggestEmail("team@keplar.one"), null);
  assert.equal(suggestEmail("no-at-sign"), null);
});

test("mail domain check: MX, A/AAAA fallback, null MX, NXDOMAIN, transient failures, malformed names", async () => {
  const r = resolverFor({
    "good.test": { mx: [{ exchange: "mx.good.test", priority: 10 }] },
    "aonly.test": { a: ["192.0.2.1"] },
    "aaaaonly.test": { a6: ["2001:db8::1"] },
    "nullmx.test": { mx: [{ exchange: "", priority: 0 }] },
    "empty.test": {},
    "flaky.test": { fail: "ESERVFAIL" },
    "slow.test": { fail: "ETIMEOUT" },
  });
  __setResolver(r);
  process.env.KEPLAR_MX_CHECK = "on";
  try {
    assert.equal(await checkMailDomain("good.test"), "ok");
    assert.equal(await checkMailDomain("GOOD.test."), "ok", "case and trailing dot");
    assert.equal(await checkMailDomain("aonly.test"), "ok", "implicit MX via A");
    assert.equal(await checkMailDomain("aaaaonly.test"), "ok", "implicit MX via AAAA");
    assert.equal(await checkMailDomain("nullmx.test"), "no_mail", "null MX = no mail");
    assert.equal(await checkMailDomain("empty.test"), "no_mail", "exists but no mail records");
    assert.equal(await checkMailDomain("ekeplar.one"), "no_mail", "NXDOMAIN");
    assert.equal(await checkMailDomain("flaky.test"), "unknown", "resolver failure never blocks");
    assert.equal(await checkMailDomain("slow.test"), "unknown");
    for (const bad of ["", "nodot", "a b.com", "-x.com", "x..com", "x.com/evil", "a".repeat(64) + ".com"]) assert.equal(await checkMailDomain(bad), "no_mail", bad);
    const before = r.calls.length;
    await checkMailDomain("good.test");
    assert.equal(r.calls.length, before, "cached");
    assert.equal(mailDomainOf(" Team@EKeplar.one "), "ekeplar.one");
  } finally {
    process.env.KEPLAR_MX_CHECK = "off";
  }
});

let k = 0;
const ip = () => `10.50.${(++k >> 8) & 255}.${k & 255}`;

async function post(path: string, body: unknown, ip: string) {
  const { auth } = await import("@/lib/accounts/auth");
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

test("endpoints refuse a domain that can't receive mail, send nothing, and hint at the typo", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  process.env.KEPLAR_DEV_TOOLS = "1";
  const { listOutbox } = await import("@/lib/accounts/outbox");
  __setResolver(resolverFor({ "keplar.one": { mx: [{ exchange: "mx.keplar.one", priority: 1 }] } }));
  process.env.KEPLAR_MX_CHECK = "on";
  try {
    const mails = async () => (await listOutbox()).length;
    const n0 = await mails();
    for (const email of ["team@ekeplar.one", "team@eeeekeplar.one", "team@fafafafkeplar.one", "team@fakeplar.one"]) {
      const link = await post("sign-in/magic-link", { email, callbackURL: "/account" }, ip());
      assert.equal(link.status, 400, `link ${email}`);
      assert.equal(link.json.code, "EMAIL_DOMAIN");
      assert.match(String(link.json.message), /can't receive mail/);
      assert.match(String(link.json.message), /Did you mean team@keplar\.one\?/);
      const up = await post("password/sign-up", { email, password: "violet harbor lantern 42", acceptTerms: true }, ip());
      assert.equal(up.json.code, "EMAIL_DOMAIN", `signup ${email}`);
      assert.equal((await post("password/forgot", { email }, ip())).json.code, "EMAIL_DOMAIN", `forgot ${email}`);
    }
    assert.equal(await mails(), n0, "nothing was sent to any of them");
    const real = await post("sign-in/magic-link", { email: "team@keplar.one", callbackURL: "/account" }, ip());
    assert.equal(real.status, 200, "a real domain still works");
    assert.equal(await mails(), n0 + 1);
  } finally {
    process.env.KEPLAR_MX_CHECK = "off";
  }
});

test("a sign-in link is only reported sent when it was: no provider → 503, provider refuses → 502, dev outbox → 200", async () => {
  const saved = { dev: process.env.KEPLAR_DEV_TOOLS, key: process.env.RESEND_API_KEY };
  const realFetch = globalThis.fetch;
  try {
    delete process.env.KEPLAR_DEV_TOOLS;
    delete process.env.RESEND_API_KEY;
    const none = await post("sign-in/magic-link", { email: "ada@example.com", callbackURL: "/account" }, "10.51.0.1");
    assert.equal(none.status, 503);
    assert.equal(none.json.code, "EMAIL_NOT_CONFIGURED");

    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://api.resend.com/")) return new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 });
      return realFetch(input, init);
    }) as typeof fetch;
    const refused = await post("sign-in/magic-link", { email: "ada@example.com", callbackURL: "/account" }, "10.51.0.2");
    assert.equal(refused.status, 502);
    assert.equal(refused.json.code, "EMAIL_FAILED");

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://api.resend.com/")) return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      return realFetch(input, init);
    }) as typeof fetch;
    assert.equal((await post("sign-in/magic-link", { email: "ada@example.com", callbackURL: "/account" }, "10.51.0.3")).status, 200, "accepted by the provider = sent");
  } finally {
    globalThis.fetch = realFetch;
    if (saved.dev !== undefined) process.env.KEPLAR_DEV_TOOLS = saved.dev;
    if (saved.key !== undefined) process.env.RESEND_API_KEY = saved.key;
    else delete process.env.RESEND_API_KEY;
  }
});
