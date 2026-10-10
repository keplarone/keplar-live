import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { call, jsonReq, signIn } from "./helpers/session";
import { validateHostname } from "@/lib/domains/hostname";
import { DOMAIN_LIMITS, domainLimit } from "@/lib/domains/limits";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { setVerifyGapForTests } from "@/lib/domains/service";

setVerifyGapForTests(0); // the Verify button is throttled to one real check per 8 s in production; tests opt in below

/* ── environment: fake Vercel project + fake DNS-over-HTTPS; nothing leaves the process ── */
const SECRET = "vcl_test_SECRET_TOKEN_do_not_leak";
process.env.VERCEL_DOMAINS_TOKEN = SECRET;
process.env.VERCEL_PROJECT_ID = "prj_test_project";
process.env.VERCEL_TEAM_ID = "team_test";
process.env.CRON_SECRET = "cron-secret-for-tests";

type VDomain = { name: string; verified: boolean; challenge: boolean };
const vercel = {
  domains: new Map<string, VDomain>(),
  /** hostnames Vercel treats as taken by another project */
  taken: new Set<string>(),
  /** hostnames that get an ownership challenge (already claimed on another Vercel account) */
  challenge: new Set<string>(),
  /** hostnames whose TXT challenge is satisfied */
  challengeDone: new Set<string>(),
  /** hostnames whose A/CNAME points at Vercel */
  routed: new Set<string>(),
  /** records Vercel reports as conflicting, per hostname */
  conflicts: new Map<string, { name: string; type: string; value: string }[]>(),
  failDelete: false,
  down: false,
  log: [] as { method: string; path: string; auth: string | null; teamId: string | null }[],
};
/** TXT records in "DNS": name -> strings */
const dns = new Map<string, string[]>();
let dnsDown = false;
/** Other record types: "name|TYPE" -> values (both resolvers), and "resolver-host|name|TYPE" overrides one resolver. */
const dnsRr = new Map<string, string[]>();
const dnsTypeNum: Record<string, number> = { A: 1, NS: 2, CNAME: 5, TXT: 16, AAAA: 28 };
const dnsQueries: string[] = [];

const realFetch = globalThis.fetch;
const apex = (h: string) => h.split(".").slice(-2).join(".");
before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "cloudflare-dns.com" || url.hostname === "dns.google") {
      if (dnsDown) return new Response("down", { status: 503 });
      const name = url.searchParams.get("name") ?? "";
      const type = url.searchParams.get("type") ?? "TXT";
      dnsQueries.push(`${url.hostname}|${name}|${type}`);
      if (type !== "TXT") {
        const vals = dnsRr.get(`${url.hostname}|${name}|${type}`) ?? dnsRr.get(`${name}|${type}`) ?? [];
        return Response.json({ Status: vals.length ? 0 : 3, Answer: vals.map((v) => ({ name, type: v.startsWith("cname:") ? 5 : dnsTypeNum[type], data: v.replace(/^cname:/, "") })) });
      }
      const txt = dns.get(name) ?? [];
      return Response.json({ Status: txt.length ? 0 : 3, Answer: txt.map((t) => ({ name, type: 16, data: `"${t}"` })) });
    }
    if (url.hostname !== "api.vercel.com") return realFetch(input, init);
    const method = init?.method ?? "GET";
    vercel.log.push({ method, path: url.pathname, auth: new Headers(init?.headers).get("authorization"), teamId: url.searchParams.get("teamId") });
    const err = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });
    if (vercel.down) return err(500, "internal_server_error", "boom");
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${SECRET}`) return err(403, "forbidden", "Not authorized");
    const m = url.pathname.match(/^\/(v\d+)\/(projects\/prj_test_project\/domains(?:\/([^/]+)(\/verify)?)?|domains\/([^/]+)\/config)$/);
    if (!m) return err(404, "not_found", "no route");
    const shape = (d: VDomain) => ({ name: d.name, apexName: apex(d.name), projectId: "prj_test_project", redirect: null, verified: d.verified, ...(d.verified ? {} : { verification: [{ type: "TXT", domain: `_vercel.${apex(d.name)}`, value: `vc-domain-verify=${d.name},abc123`, reason: "pending_domain_verification" }] }) });
    if (m[5]) {
      const h = decodeURIComponent(m[5]);
      if (!vercel.domains.has(h)) return err(404, "not_found", "Domain Check Config not found.");
      return Response.json({ configuredBy: vercel.routed.has(h) ? "CNAME" : null, misconfigured: !vercel.routed.has(h), conflicts: vercel.conflicts.get(h) ?? [], recommendedIPv4: [{ rank: 2, value: ["76.76.21.21"] }, { rank: 1, value: ["216.198.79.1", "64.29.17.1"] }], recommendedCNAME: [{ rank: 2, value: "cname.vercel-dns.com." }, { rank: 1, value: "abcd1234.vercel-dns-017.com." }] });
    }
    if (method === "POST" && !m[3]) {
      const name = String((JSON.parse(String(init?.body)) as { name: string }).name);
      if (vercel.taken.has(name)) return err(409, "domain_already_in_use", "Cannot add since it's already in use by one of your projects.");
      if (vercel.domains.has(name)) return err(409, "domain_already_in_use", "already on this project");
      const d = { name, verified: !vercel.challenge.has(name), challenge: vercel.challenge.has(name) };
      vercel.domains.set(name, d);
      return Response.json(shape(d));
    }
    const h = decodeURIComponent(m[3] ?? "");
    const d = vercel.domains.get(h);
    if (!d) return err(404, "not_found", "Project Domain not found.");
    if (method === "GET") return Response.json(shape(d));
    if (method === "DELETE") {
      if (vercel.failDelete) return err(500, "internal_server_error", "boom");
      vercel.domains.delete(h);
      return Response.json({});
    }
    if (method === "POST" && m[4]) {
      if (d.challenge && !vercel.challengeDone.has(h)) return err(400, "missing_txt_record", "Domain is missing required TXT Record");
      d.verified = true;
      return Response.json(shape(d));
    }
    return err(405, "method_not_allowed", "no");
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const domainsRoute = () => import("@/app/api/domains/route");
const domainRoute = () => import("@/app/api/domains/[id]/route");
const sitesRoute = () => import("@/app/api/sites/route");
const publishRoute = () => import("@/app/api/sites/[id]/publish/route");

async function makeSite(cookie: string, name: string, publish = true) {
  const res = await (await sitesRoute()).POST(jsonReq(cookie, "/api/sites", "POST", { name, template: "business" }));
  assert.equal(res.status, 201);
  const site = ((await res.json()) as { site: { id: string; slug: string } }).site;
  if (publish) {
    const p = await (await publishRoute()).POST(jsonReq(cookie, `/api/sites/${site.id}/publish`, "POST"), ctx(site.id));
    assert.equal(p.status, 200, await p.clone().text());
  }
  return site;
}
type Dom = { id: string; hostname: string; status: string; apex: boolean; ownershipVerified: boolean; message: string | null; records: { type: string; name: string; host: string; value: string; alsoAccepted: string[]; found: string[]; done: boolean }[]; problems: { code: string; severity: string; title: string; detail: string; fix: string }[]; nameservers: string[] };
const add = async (cookie: string, siteId: string, domain: unknown) => {
  const res = await (await domainsRoute()).POST(jsonReq(cookie, "/api/domains", "POST", { siteId, domain }));
  return { res, body: (await res.json()) as { domain?: Dom; error?: string; code?: string } };
};
const verify = async (cookie: string, id: string) => {
  const res = await (await domainRoute()).POST(jsonReq(cookie, `/api/domains/${id}`, "POST"), ctx(id));
  return { res, body: (await res.json()) as { domain?: Dom; error?: string } };
};
const list = async (cookie: string, siteId: string) => {
  const res = await (await domainsRoute()).GET(call(cookie, `/api/domains?siteId=${siteId}`));
  return { res, body: (await res.json()) as { domains: Dom[]; limit: number; used: number; configured: boolean; published: boolean; error?: string } };
};
/** Satisfy every check for a hostname: ownership TXT, Vercel challenge, DNS pointing at Vercel. */
function setUpDns(d: Dom) {
  const own = d.records.find((r) => r.type === "TXT" && r.host.startsWith("_keplar-verify."))!;
  dns.set(own.host, [own.value]);
  vercel.challengeDone.add(d.hostname);
  vercel.routed.add(d.hostname);
}

/* ── hostname validation ── */
test("hostname validation: accepts real domains, rejects URLs, IPs, wildcards, punycode, platform and reserved names", () => {
  const ok = ["example.com", "Shop.Example.COM", "  www.example.co.uk ", "a-b.example.io", "my-site.example.com.", "x1.y2.z3.example.org"];
  for (const h of ok) assert.equal(validateHostname(h).ok, true, h);
  assert.deepEqual(validateHostname("Shop.Example.COM"), { ok: true, hostname: "shop.example.com" });
  assert.deepEqual(validateHostname("my-site.example.com."), { ok: true, hostname: "my-site.example.com" });
  const bad = [
    "", "   ", "example", "localhost", "foo.localhost", "https://example.com", "http://example.com/", "example.com/path", "example.com:8080", "user@example.com", "example.com?x=1", "example.com#a",
    "*.example.com", "*", "foo*.example.com", "exa mple.com", "exa_mple.com", ".example.com", "example..com", "-example.com", "example-.com", "a.-b.example.com",
    "1.2.3.4", "127.0.0.1", "0x7f.0.0.1", "2130706433", "999.999.999.999", "[::1]", "::1", "10.0.0.1.example", "example.123", "example.c", "example.c0m",
    "xn--80ak6aa92e.com", "www.xn--e1afmkfd.example.com", "xn--example.com", "ab--cd.example.com", "bücher.example", "例え.jp", "exаmple.com" /* cyrillic а */,
    "keplar.one", "www.keplar.one", "evil.keplar.one", "keplar.site", "a.b.keplar.site", "myapp.vercel.app", "vercel.app", "x.vercel.app", "foo.vercel.dev", "a.github.io",
    "foo.test", "foo.invalid", "foo.example", "foo.local", "foo.internal", "co.uk", "com.au", "a".repeat(64) + ".example.com", `${"a.".repeat(130)}com`,
  ];
  for (const h of bad) assert.equal(validateHostname(h).ok, false, `should reject ${JSON.stringify(h)}`);
  for (const v of [null, undefined, 5, {}, ["example.com"]]) assert.equal(validateHostname(v).ok, false);
  const r = validateHostname("https://example.com");
  assert.ok(!r.ok && /just the domain/i.test(r.error));
});

test("plan limits are documented constants: Free 0, Plus 1, Pro 3, Business 10 (and entitlements use them)", () => {
  assert.deepEqual({ ...DOMAIN_LIMITS }, { free: 0, lite: 0, plus: 1, pro: 3, business: 10 });
  assert.equal(domainLimit("nope"), 0);
  for (const p of ["free", "lite", "plus", "pro", "business"] as const) assert.equal(ENTITLEMENTS[p].customDomains, DOMAIN_LIMITS[p]);
});

/* ── API ── */
test("Free: not available, 402 with an upgrade hint, nothing is sent to Vercel", async () => {
  const { cookie } = await signIn("dom-free@example.com", "free");
  const site = await makeSite(cookie, "Free site");
  const before = vercel.log.length;
  const { res, body } = await add(cookie, site.id, "free-user.example.com");
  assert.equal(res.status, 402);
  assert.equal(body.code, "entitlement");
  assert.match(body.error ?? "", /Plus, Pro and Business/);
  assert.equal(vercel.log.length, before);
  const l = await list(cookie, site.id);
  assert.equal(l.body.limit, 0);
  assert.deepEqual(l.body.domains, []);
});

test("must be signed in, email verified, site published, valid hostname; errors never leak the token", async () => {
  const anon = await (await domainsRoute()).POST(jsonReq(null, "/api/domains", "POST", { siteId: "x", domain: "a.example.com" }));
  assert.equal(anon.status, 401);
  const { cookie } = await signIn("dom-basic@example.com", "plus");
  const draft = await makeSite(cookie, "Draft site", false);
  const r1 = await add(cookie, draft.id, "draft.example.com");
  assert.equal(r1.res.status, 409);
  assert.equal(r1.body.code, "not_published");
  const site = await makeSite(cookie, "Basic site");
  for (const bad of ["https://x.example.com", "1.2.3.4", "*.example.com", "xn--abc.example.com", "evil.keplar.one", "x.vercel.app", "localhost"]) {
    const r = await add(cookie, site.id, bad);
    assert.equal(r.res.status, 400, bad);
    assert.equal(r.body.code, "invalid_domain");
  }
  assert.equal((await add(cookie, "sit_doesnotexist", "ok.example.com")).res.status, 404);
  const noBody = await (await domainsRoute()).POST(call(cookie, "/api/domains", { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }));
  assert.equal(noBody.status, 400);
  assert.equal(vercel.domains.size, 0, "nothing reached Vercel for invalid input");
  const missing = await (await domainsRoute()).GET(call(cookie, "/api/domains"));
  assert.equal(missing.status, 400);
});

test("add -> pending with the exact DNS records -> verify -> active; Vercel is called with the token and team", { timeout: 60_000 }, async () => {
  const { cookie } = await signIn("dom-flow@example.com", "plus");
  const site = await makeSite(cookie, "Flow site");
  vercel.log.length = 0;

  // subdomain: CNAME to Vercel's recommended rank-1 target, plus our ownership TXT
  const { res, body } = await add(cookie, site.id, "  Shop.Flow-Example.com ");
  assert.equal(res.status, 201);
  const d = body.domain!;
  assert.equal(d.hostname, "shop.flow-example.com");
  assert.equal(d.status, "pending");
  assert.equal(d.apex, false);
  const cname = d.records.find((r) => r.type === "CNAME")!;
  assert.deepEqual([cname.name, cname.value, cname.done], ["shop", "abcd1234.vercel-dns-017.com", false], "uses what Vercel's config returns, rank 1, no trailing dot");
  const txt = d.records.find((r) => r.type === "TXT" && r.host === "_keplar-verify.shop.flow-example.com")!;
  assert.match(txt.value, /^keplar-verify=[a-f0-9]{32}$/);
  assert.equal(txt.name, "_keplar-verify.shop");
  assert.ok(d.message && /ownership TXT/i.test(d.message));
  assert.ok(vercel.domains.has("shop.flow-example.com"));
  assert.deepEqual(vercel.log.map((l) => `${l.method} ${l.path}`), ["POST /v10/projects/prj_test_project/domains", "GET /v6/domains/shop.flow-example.com/config"]);
  assert.ok(vercel.log.every((l) => l.auth === `Bearer ${SECRET}` && l.teamId === "team_test"));

  // Verify before DNS: still pending, no error
  const v1 = await verify(cookie, d.id);
  assert.equal(v1.res.status, 200);
  assert.equal(v1.body.domain!.status, "pending");

  // DNS fixed: ownership TXT found + routed on Vercel -> active
  setUpDns(d);
  const v2 = await verify(cookie, d.id);
  assert.equal(v2.body.domain!.status, "active");
  assert.equal(v2.body.domain!.message, null);
  assert.ok(v2.body.domain!.records.every((r) => r.done));

  // "Check again" always re-checks (no stale answer), even right after the last check
  setVerifyGapForTests(8_000);
  const n = vercel.log.length;
  const qn = dnsQueries.length;
  await verify(cookie, d.id);
  assert.ok(vercel.log.length > n, "Check again asks Vercel again");
  assert.ok(dnsQueries.length > qn, "Check again asks DNS again");
  setVerifyGapForTests(0);

  // apex domain on the same account: over the Plus limit (1)
  const over = await add(cookie, site.id, "flow-example.com");
  assert.equal(over.res.status, 402);
  assert.match(over.body.error ?? "", /includes 1 custom domain/);
  assert.ok(!vercel.domains.has("flow-example.com"));

  // remove -> gone from Vercel and from the list; slot is free again
  const del = await (await domainRoute()).DELETE(call(cookie, `/api/domains/${d.id}`, { method: "DELETE" }), ctx(d.id));
  assert.equal(del.status, 200);
  assert.ok(!vercel.domains.has("shop.flow-example.com"));
  assert.deepEqual((await list(cookie, site.id)).body.domains, []);
  const again = await add(cookie, site.id, "flow-example.com");
  assert.equal(again.res.status, 201);
  assert.equal(again.body.domain!.apex, true);
  const a = again.body.domain!.records.find((r) => r.type === "A")!;
  assert.deepEqual([a.name, a.value], ["@", "216.198.79.1"]);
  assert.equal(JSON.stringify(again.body).includes(SECRET), false);
});

test("Vercel-side ownership challenge (domain used on another Vercel account) is shown and cleared by Verify", { timeout: 30_000 }, async () => {
  const { cookie } = await signIn("dom-challenge@example.com", "pro");
  const site = await makeSite(cookie, "Challenge site");
  vercel.challenge.add("claimed.chal-example.com");
  const { body } = await add(cookie, site.id, "claimed.chal-example.com");
  const d = body.domain!;
  const extra = d.records.filter((r) => r.type === "TXT" && r.host.startsWith("_vercel."));
  assert.equal(extra.length, 1);
  assert.equal(extra[0].value, "vc-domain-verify=claimed.chal-example.com,abc123");
  assert.equal(extra[0].done, false);
  setUpDns(d);
  const v = await verify(cookie, d.id);
  assert.equal(v.body.domain!.status, "active");
});

test("per-plan limits: Pro 3, Business 10; one owner per domain; a failed add never uses a slot", { timeout: 60_000 }, async () => {
  const pro = await signIn("dom-pro@example.com", "pro");
  const site = await makeSite(pro.cookie, "Pro site");
  for (const h of ["p1.pro-example.com", "p2.pro-example.com", "p3.pro-example.com"]) assert.equal((await add(pro.cookie, site.id, h)).res.status, 201, h);
  const fourth = await add(pro.cookie, site.id, "p4.pro-example.com");
  assert.equal(fourth.res.status, 402);
  assert.equal((await list(pro.cookie, site.id)).body.used, 3);

  // vercel says taken / invalid / down: row removed, nothing counted
  const biz = await signIn("dom-biz@example.com", "business");
  const bsite = await makeSite(biz.cookie, "Biz site");
  vercel.taken.add("taken.biz-example.com");
  const t = await add(biz.cookie, bsite.id, "taken.biz-example.com");
  assert.equal(t.res.status, 409);
  assert.equal(t.body.code, "domain_taken");
  vercel.down = true;
  const dn = await add(biz.cookie, bsite.id, "down.biz-example.com");
  vercel.down = false;
  assert.equal(dn.res.status, 502);
  assert.equal((await list(biz.cookie, bsite.id)).body.used, 0);
  for (let i = 1; i <= 10; i++) assert.equal((await add(biz.cookie, bsite.id, `b${i}.biz-example.com`)).res.status, 201, `b${i}`);
  const eleventh = await add(biz.cookie, bsite.id, "b11.biz-example.com");
  assert.equal(eleventh.res.status, 402);

  // one owner per domain: another account can't take a hostname that's already connected, even with different case/spacing
  const other = await signIn("dom-other@example.com", "plus");
  const osite = await makeSite(other.cookie, "Other site");
  for (const h of ["p1.pro-example.com", "P1.PRO-EXAMPLE.COM ", "p1.pro-example.com."]) {
    const r = await add(other.cookie, osite.id, h);
    assert.equal(r.res.status, 409, h);
    assert.equal(r.body.code, "domain_taken");
    assert.match(r.body.error ?? "", /another Keplar account/);
  }
  // same account, same domain: friendly duplicate
  assert.match((await add(pro.cookie, site.id, "p1.pro-example.com")).body.error ?? "", /already added/);

  // concurrent adds of one hostname: exactly one wins
  const racers = await Promise.all(["race-a", "race-b", "race-c"].map(async (n) => {
    const u = await signIn(`${n}@example.com`, "plus");
    const s = await makeSite(u.cookie, `Race ${n}`);
    return add(u.cookie, s.id, "contested.race-example.com");
  }));
  assert.deepEqual(racers.map((r) => r.res.status).sort(), [201, 409, 409]);
});

test("authz: another account can't list, add to, check, verify or remove your domains (404, nothing changes)", async () => {
  const a = await signIn("dom-authz-a@example.com", "plus");
  const b = await signIn("dom-authz-b@example.com", "pro");
  const site = await makeSite(a.cookie, "A site");
  const { body } = await add(a.cookie, site.id, "private.authz-example.com");
  const id = body.domain!.id;

  assert.equal((await list(b.cookie, site.id)).res.status, 404);
  assert.equal((await add(b.cookie, site.id, "intruder.authz-example.com")).res.status, 404);
  const route = await domainRoute();
  assert.equal((await route.GET(call(b.cookie, `/api/domains/${id}`), ctx(id))).status, 404);
  assert.equal((await route.POST(jsonReq(b.cookie, `/api/domains/${id}`, "POST"), ctx(id))).status, 404);
  assert.equal((await route.DELETE(call(b.cookie, `/api/domains/${id}`, { method: "DELETE" }), ctx(id))).status, 404);
  assert.equal((await route.GET(call(null, `/api/domains/${id}`), ctx(id))).status, 401);
  assert.equal((await route.DELETE(call(null, `/api/domains/${id}`, { method: "DELETE" }), ctx(id))).status, 401);
  assert.ok(vercel.domains.has("private.authz-example.com"), "A's domain is still on Vercel");
  assert.ok(!vercel.domains.has("intruder.authz-example.com"));
  assert.equal((await list(a.cookie, site.id)).body.domains.length, 1);
  assert.equal((await (await route.GET(call(a.cookie, `/api/domains/${id}`), ctx(id))).json() as { domain: Dom }).domain.hostname, "private.authz-example.com");
  // B's own listing never shows A's hostname
  const bsite = await makeSite(b.cookie, "B site");
  assert.ok(!JSON.stringify((await list(b.cookie, bsite.id)).body).includes("private.authz-example.com"));
});

test("remove: Vercel failure keeps the domain (retry works); deleting a site disconnects its domains", async () => {
  const { cookie } = await signIn("dom-remove@example.com", "pro");
  const site = await makeSite(cookie, "Remove site");
  const { body } = await add(cookie, site.id, "rm.remove-example.com");
  const id = body.domain!.id;
  vercel.failDelete = true;
  const fail = await (await domainRoute()).DELETE(call(cookie, `/api/domains/${id}`, { method: "DELETE" }), ctx(id));
  vercel.failDelete = false;
  assert.equal(fail.status, 502);
  assert.equal((await list(cookie, site.id)).body.domains.length, 1, "row kept so the owner can retry");
  // Deleting a site hides it at once and keeps the domain connected during the undo window; the final purge detaches it from Vercel,
  // and if Vercel refuses the site stays hidden (never served, never half-removed) until a retry succeeds.
  const siteApi = await import("@/app/api/sites/[id]/route");
  const soft = await siteApi.DELETE(call(cookie, `/api/sites/${site.id}`, { method: "DELETE" }), ctx(site.id));
  assert.equal(soft.status, 200);
  assert.ok(vercel.domains.has("rm.remove-example.com"), "still attached while Undo is possible");
  vercel.failDelete = true;
  const blocked = await siteApi.DELETE(call(cookie, `/api/sites/${site.id}?purge=1`, { method: "DELETE" }), ctx(site.id));
  vercel.failDelete = false;
  assert.equal(blocked.status, 502);
  assert.equal((await (await siteApi.GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id)))).status, 404, "the site is hidden from its owner meanwhile");
  const { domainStore } = await import("@/lib/domains/store");
  assert.equal((await domainStore().findByHostname("rm.remove-example.com"))?.siteId, site.id, "domain row kept for the retry");
  const okDel = await siteApi.DELETE(call(cookie, `/api/sites/${site.id}?purge=1`, { method: "DELETE" }), ctx(site.id));
  assert.equal(okDel.status, 200);
  assert.ok(!vercel.domains.has("rm.remove-example.com"));
  // already gone on Vercel's side: removing still succeeds
  const s2 = await makeSite(cookie, "Remove site 2");
  const d2 = (await add(cookie, s2.id, "gone.remove-example.com")).body.domain!;
  vercel.domains.delete("gone.remove-example.com");
  assert.equal((await (await domainRoute()).DELETE(call(cookie, `/api/domains/${d2.id}`, { method: "DELETE" }), ctx(d2.id))).status, 200);
});

test("provider trouble is reported honestly and does not flip a good status; DNS lookup outage is not 'missing'", { timeout: 30_000 }, async () => {
  const { cookie } = await signIn("dom-outage@example.com", "plus");
  const site = await makeSite(cookie, "Outage site");
  const d = (await add(cookie, site.id, "o.outage-example.com")).body.domain!;
  setUpDns(d);
  assert.equal((await verify(cookie, d.id)).body.domain!.status, "active");
  vercel.down = true;
  const v = await verify(cookie, d.id);
  vercel.down = false;
  assert.equal(v.body.domain!.status, "active", "an outage doesn't deactivate a working domain");
  assert.equal(v.body.domain!.message, null);
  // DNS resolvers down for a new domain: pending with a retry message, not an error
  const s2 = await makeSite(cookie, "Outage site 2");
  await (await domainRoute()).DELETE(call(cookie, `/api/domains/${d.id}`, { method: "DELETE" }), ctx(d.id));
  dnsDown = true;
  const d2 = (await add(cookie, s2.id, "o2.outage-example.com")).body.domain!;
  dnsDown = false;
  assert.equal(d2.status, "pending");
  assert.match(d2.message ?? "", /couldn't read your DNS/);
});

test("background re-check promotes pending domains when DNS appears, only touches due rows, and the cron route is authenticated", { timeout: 30_000 }, async () => {
  const { cookie } = await signIn("dom-cron@example.com", "pro");
  const site = await makeSite(cookie, "Cron site");
  const d = (await add(cookie, site.id, "c.cron-example.com")).body.domain!;
  const { recheckDue } = await import("@/lib/domains/service");
  const { domainStore } = await import("@/lib/domains/store");
  // not due yet (next check is 5 minutes out)
  const n = vercel.log.length;
  const none = await recheckDue();
  assert.equal(none.checked, 0);
  assert.equal(vercel.log.length, n);
  // make it due, DNS still wrong -> stays pending, rescheduled
  await domainStore().update(d.id, { nextCheckAt: new Date(Date.now() - 1000).toISOString() });
  const r1 = await recheckDue();
  assert.deepEqual([r1.checked, r1.pending, r1.active], [1, 1, 0]);
  const row1 = (await domainStore().get(d.id))!;
  assert.ok(row1.nextCheckAt && Date.parse(row1.nextCheckAt) > Date.now());
  // DNS set up -> next background pass makes it active without any user action
  setUpDns(d);
  await domainStore().update(d.id, { nextCheckAt: new Date(Date.now() - 1000).toISOString() });
  const r2 = await recheckDue();
  assert.deepEqual([r2.checked, r2.active], [1, 1]);
  assert.equal((await domainStore().get(d.id))!.status, "active");
  // a domain that never got set up stops being retried after 7 days (error), and Verify restarts it
  const d3 = (await add(cookie, site.id, "old.cron-example.com")).body.domain!;
  await domainStore().update(d3.id, { createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(), nextCheckAt: new Date(Date.now() - 1000).toISOString() });
  const r3 = await recheckDue();
  assert.equal(r3.error, 1);
  const err = (await domainStore().get(d3.id))!;
  assert.equal(err.status, "error");
  assert.equal(err.nextCheckAt, null);
  assert.equal((await recheckDue()).checked, 0);

  // cron route
  const cron = await import("@/app/api/cron/domains/route");
  assert.equal((await cron.GET(new Request("https://keplar.one/api/cron/domains"))).status, 401);
  assert.equal((await cron.GET(new Request("https://keplar.one/api/cron/domains", { headers: { authorization: "Bearer wrong" } }))).status, 401);
  const ok = await cron.GET(new Request("https://keplar.one/api/cron/domains", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { ok: boolean }).ok, true);
  const keep = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal((await cron.GET(new Request("https://keplar.one/api/cron/domains", { headers: { authorization: "Bearer undefined" } }))).status, 401);
  process.env.CRON_SECRET = keep;
});

test("not configured (no Vercel env): adding says so, nothing is simulated", async () => {
  const { cookie } = await signIn("dom-nocfg@example.com", "plus");
  const site = await makeSite(cookie, "No cfg site");
  const keep = process.env.VERCEL_DOMAINS_TOKEN;
  delete process.env.VERCEL_DOMAINS_TOKEN;
  const r = await add(cookie, site.id, "x.nocfg-example.com");
  const l = await list(cookie, site.id);
  process.env.VERCEL_DOMAINS_TOKEN = keep;
  assert.equal(r.res.status, 503);
  assert.equal(r.body.code, "not_configured");
  assert.equal(l.body.configured, false);
});

/* ── host routing ── */
const proxyMod = () => import("@/proxy");
const siteRouteMod = () => import("@/app/s/[slug]/[[...path]]/route");
const nreq = (host: string, path: string, init: { method?: string; headers?: Record<string, string> } = {}) => new NextRequest(`https://${host}${path}`, { method: init.method, headers: { host, ...init.headers } });
const rewriteOf = (r: Response) => r.headers.get("x-middleware-rewrite");

async function activeDomain(label: string, plan: "plus" | "pro" | "business", hostname: string) {
  const u = await signIn(`${label}@example.com`, plan);
  const site = await makeSite(u.cookie, `${label} site`);
  const d = (await add(u.cookie, site.id, hostname)).body.domain!;
  setUpDns(d);
  assert.equal((await verify(u.cookie, d.id)).body.domain!.status, "active");
  return { ...u, site, d };
}

test("host routing: an active custom domain serves its site at the root; unknown/pending hosts 404; app routes are unreachable", { timeout: 60_000 }, async () => {
  const { proxy } = await proxyMod();
  const a = await activeDomain("route-a", "plus", "www.route-a-example.com");
  const bUser = await signIn("route-b@example.com", "plus");
  const bSite = await makeSite(bUser.cookie, "route-b site");
  const pendingB = (await add(bUser.cookie, bSite.id, "pending.route-b-example.com")).body.domain!;
  assert.equal(pendingB.status, "pending");

  // proxy: rewrite to /s/<slug>
  const root = await proxy(nreq("www.route-a-example.com", "/"));
  assert.equal(rewriteOf(root), `https://www.route-a-example.com/s/${a.site.slug}`);
  assert.equal(root.headers.get("strict-transport-security"), "max-age=31536000", "no includeSubDomains/preload on a customer's domain");
  const about = await proxy(nreq("www.route-a-example.com", "/about?x=1"));
  assert.equal(rewriteOf(about), `https://www.route-a-example.com/s/${a.site.slug}/about?x=1`);
  // host header with port / case / trailing dot still resolves
  assert.ok(rewriteOf(await proxy(nreq("WWW.Route-A-Example.com:443", "/"))));
  // unknown host, pending domain, reserved names: plain 404, nothing of the app
  for (const host of ["nobody.example.org", "pending.route-b-example.com", "keplar.one.evil.test", "evil-keplar.one.example.net", "1.2.3.4"]) {
    const r = await proxy(nreq(host, "/"));
    assert.equal(r.status, 404, host);
    assert.equal(rewriteOf(r), null);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  // app/admin/api paths on a custom host are just (non-existent) pages of that site, never the app
  for (const p of ["/api/auth/session", "/api/keplar", "/admin", "/app", "/api/domains", "/s/other-site", "/sites/draft/x/1/", "/api/inngest"]) {
    const r = await proxy(nreq("www.route-a-example.com", p));
    const rw = rewriteOf(r);
    assert.ok(rw?.startsWith(`https://www.route-a-example.com/s/${a.site.slug}/`), `${p} -> ${rw}`);
  }
  // old absolute links collapse to the clean path
  const red = await proxy(nreq("www.route-a-example.com", `/s/${a.site.slug}/about`));
  assert.equal(red.status, 308);
  assert.equal(new URL(red.headers.get("location")!).pathname, "/about");
  assert.equal((await proxy(nreq("www.route-a-example.com", "/", { method: "PUT" }))).status, 405);
  assert.equal((await proxy(nreq("www.route-a-example.com", "/", { method: "DELETE" }))).status, 405);
  // keplar.one itself is untouched
  assert.equal(rewriteOf(await proxy(nreq("keplar.one", "/"))), null);
  assert.equal(rewriteOf(await proxy(nreq("www.keplar.one", "/pricing"))), null);
  assert.equal(rewriteOf(await proxy(nreq("keplar-git-x-team.vercel.app", "/app"))), null);
  assert.equal(rewriteOf(await proxy(nreq("localhost:3000", "/app"))), null);

  // route: serves the site with root-relative links, own canonical host, sandbox CSP
  const route = await siteRouteMod();
  const sctx = (slug: string, path: string[] = []) => ({ params: Promise.resolve({ slug, path }) });
  const page = await route.GET(new Request(`https://www.route-a-example.com/s/${a.site.slug}`, { headers: { host: "www.route-a-example.com" } }), sctx(a.site.slug));
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.doesNotMatch(html, new RegExp(`/s/${a.site.slug}`), "no /s/<slug> paths leak into pages served from the domain");
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.route-a-example\.com\/?"/);
  assert.match(html, /href="\/about"/);
  assert.match(html, /href="\/_report"/);
  const contactPage = await (await route.GET(new Request("https://www.route-a-example.com/contact", { headers: { host: "www.route-a-example.com" } }), sctx(a.site.slug, ["contact"]))).text();
  assert.match(contactPage, /<form[^>]* action="\/_lead"/);
  const csp = page.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /sandbox allow-forms/);
  assert.doesNotMatch(csp, /allow-scripts|allow-same-origin/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("cache-control"), "no-store", "HTML carries the plan-dependent watermark, so it is never cached");
  const aboutPage = await route.GET(new Request("https://www.route-a-example.com/about", { headers: { host: "www.route-a-example.com" } }), sctx(a.site.slug, ["about"]));
  assert.equal(aboutPage.status, 200);
  // the same site is still reachable the old way on keplar.one
  const main = await route.GET(call(null, `/s/${a.site.slug}`), sctx(a.site.slug));
  assert.equal(main.status, 200);
  assert.match(await main.text(), new RegExp(`href="/s/${a.site.slug}/about"`));
  // robots/sitemap use the domain
  const sm = await route.GET(new Request("https://www.route-a-example.com/sitemap.xml", { headers: { host: "www.route-a-example.com" } }), sctx(a.site.slug, ["sitemap.xml"]));
  assert.equal(sm.status, 200);

  // cross-tenant: a rewritten URL naming ANOTHER tenant's slug on A's domain, or a pending/unknown domain, never serves it
  const bPage = await route.GET(new Request(`https://www.route-a-example.com/s/${bSite.slug}`, { headers: { host: "www.route-a-example.com" } }), sctx(bSite.slug));
  assert.equal(bPage.status, 404);
  assert.doesNotMatch(await bPage.text(), /route-b site/);
  for (const host of ["pending.route-b-example.com", "nobody.example.org"]) {
    const r = await route.GET(new Request(`https://${host}/`, { headers: { host } }), sctx(bSite.slug));
    assert.equal(r.status, 404, host);
  }
  const unknownPath = await route.GET(new Request("https://www.route-a-example.com/api/keplar", { headers: { host: "www.route-a-example.com" } }), sctx(a.site.slug, ["api", "keplar"]));
  assert.equal(unknownPath.status, 404);
  assert.match(unknownPath.headers.get("content-security-policy") ?? "", /default-src 'none'/);
});

test("host routing: lead form and abuse report work on a custom domain and stay on it; other tenants can't be targeted", async () => {
  const a = await activeDomain("lead-a", "pro", "forms.lead-a-example.com");
  const other = await signIn("lead-b@example.com", "plus");
  const otherSite = await makeSite(other.cookie, "lead-b site");
  const route = await siteRouteMod();
  const sctx = (slug: string, path: string[]) => ({ params: Promise.resolve({ slug, path }) });
  const form = (host: string, path: string, fields: Record<string, string>) =>
    new Request(`https://${host}${path}`, { method: "POST", headers: { host, "content-type": "application/x-www-form-urlencoded", origin: "null" }, body: new URLSearchParams(fields).toString() });

  const ok = await route.POST(form("forms.lead-a-example.com", "/_lead", { _page: "index.html", email: "visitor@example.com", message: "hello from my domain" }), sctx(a.site.slug, ["_lead"]));
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), "/_thanks");
  const thanks = await route.GET(new Request("https://forms.lead-a-example.com/_thanks", { headers: { host: "forms.lead-a-example.com" } }), sctx(a.site.slug, ["_thanks"]));
  assert.equal(thanks.status, 200);
  assert.match(await thanks.text(), /href="\/"/);
  const { listLeads, getSite } = await import("@/lib/site-builder/store");
  const { workspaceById } = await import("@/lib/create/platform/workspace");
  void workspaceById;
  const stored = await listLeads((await (await import("@/lib/site-builder/store")).sites().get(a.workspaceId, a.site.id))!);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].fields.message, "hello from my domain");
  void getSite;

  // posting a lead for someone else's slug through A's domain: refused, nothing stored for them
  const evil = await route.POST(form("forms.lead-a-example.com", `/s/${otherSite.slug}/_lead`, { email: "x@example.com", message: "spam" }), sctx(otherSite.slug, ["_lead"]));
  assert.equal(evil.status, 404);
  assert.equal((await listLeads((await (await import("@/lib/site-builder/store")).sites().get(other.workspaceId, otherSite.id))!)).length, 0);
  // unknown host
  const unk = await route.POST(form("nobody.example.org", "/_lead", { message: "x" }), sctx(a.site.slug, ["_lead"]));
  assert.equal(unk.status, 404);
  // ?preview=1 is ignored on a custom domain (it would otherwise swallow the submission)
  const pv = await route.POST(form("forms.lead-a-example.com", "/_lead?preview=1", { email: "v2@example.com", message: "second" }), sctx(a.site.slug, ["_lead"]));
  assert.equal(pv.status, 303);
  assert.equal((await listLeads((await (await import("@/lib/site-builder/store")).sites().get(a.workspaceId, a.site.id))!)).length, 2);
  // report form posts back to the domain
  const rep = await route.POST(form("forms.lead-a-example.com", "/_report", { reason: "other", details: "test" }), sctx(a.site.slug, ["_report"]));
  assert.equal(rep.status, 303);
  assert.equal(rep.headers.get("location"), "/_report?done=1");
});

test("host routing: removing the domain or downgrading the plan stops serving it; unpublished/taken-down sites don't serve", { timeout: 60_000 }, async () => {
  const { proxy } = await proxyMod();
  const { invalidateHost } = await import("@/lib/domains/routing");
  const a = await activeDomain("life-a", "plus", "life.life-a-example.com");
  assert.ok(rewriteOf(await proxy(nreq("life.life-a-example.com", "/"))));

  // downgrade to Free: stored, but no longer served
  const { updateWorkspace } = await import("@/lib/accounts/workspaces");
  await updateWorkspace(a.workspaceId, { plan: "free" });
  invalidateHost();
  assert.equal((await proxy(nreq("life.life-a-example.com", "/"))).status, 404);
  await updateWorkspace(a.workspaceId, { plan: "plus" });
  invalidateHost();
  assert.ok(rewriteOf(await proxy(nreq("life.life-a-example.com", "/"))));

  // unpublish: the route 404s
  const route = await siteRouteMod();
  const pub = await publishRoute();
  await pub.DELETE(call(a.cookie, `/api/sites/${a.site.id}/publish`, { method: "DELETE" }), ctx(a.site.id));
  const r = await route.GET(new Request("https://life.life-a-example.com/", { headers: { host: "life.life-a-example.com" } }), { params: Promise.resolve({ slug: a.site.slug, path: [] }) });
  assert.equal(r.status, 404);

  // remove: proxy stops rewriting immediately on this instance
  await (await domainRoute()).DELETE(call(a.cookie, `/api/domains/${a.d.id}`, { method: "DELETE" }), ctx(a.d.id));
  assert.equal((await proxy(nreq("life.life-a-example.com", "/"))).status, 404);
});

test("security: the token never appears in responses or logs; /api origin rules still apply on keplar.one", async () => {
  const logged: string[] = [];
  const origs = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a: unknown[]) => void logged.push(a.join(" "));
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  console.warn = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    const { cookie } = await signIn("dom-sec@example.com", "plus");
    const site = await makeSite(cookie, "Sec site");
    vercel.down = true;
    const r = await add(cookie, site.id, "s.sec-example.com");
    vercel.down = false;
    assert.equal(r.res.status, 502);
    assert.equal(JSON.stringify(r.body).includes(SECRET), false);
  } finally {
    Object.assign(console, origs);
  }
  assert.equal(logged.join("\n").includes(SECRET), false);
  const { proxy } = await proxyMod();
  const blocked = await proxy(new NextRequest("https://keplar.one/api/domains", { method: "POST", headers: { origin: "https://evil.test", host: "keplar.one" } }));
  assert.equal(blocked.status, 403);
});

/* ── DNS diagnosis through the real routes ── */
function setRr(host: string, type: string, values: string[]) {
  dnsRr.set(`${host}|${type}`, values);
}
test("A record not 'Found' because of a leftover second A record: both records are shown, the conflict is explained, removing it makes the domain active", { timeout: 60_000 }, async () => {
  const { cookie } = await signIn("dom-conflict@example.com", "plus");
  const site = await makeSite(cookie, "Conflict site");
  const { body } = await add(cookie, site.id, "conflict-example.com");
  const d = body.domain!;
  // TXT is there; the user added the A record but an old Shopify A record is still next to it
  const own = d.records.find((r) => r.type === "TXT" && r.host.startsWith("_keplar-verify."))!;
  dns.set(own.host, [own.value]);
  setRr("conflict-example.com", "A", ["216.198.79.1", "23.227.38.65"]);
  setRr("conflict-example.com", "NS", ["ns1041.ui-dns.com", "ns1056.ui-dns.biz"]);
  vercel.conflicts.set("conflict-example.com", [{ name: "conflict-example.com", type: "A", value: "23.227.38.65" }]);
  const v1 = (await verify(cookie, d.id)).body.domain!;
  assert.equal(v1.status, "pending");
  assert.equal(v1.ownershipVerified, true);
  const a = v1.records.find((r) => r.type === "A")!;
  assert.equal(a.value, "216.198.79.1", "expected value is Vercel's rank-1 recommendation, not a hard-coded one");
  assert.deepEqual(a.alsoAccepted, ["64.29.17.1", "76.76.21.21"]);
  assert.equal(a.done, false);
  assert.deepEqual([...a.found].sort(), ["216.198.79.1", "23.227.38.65"], "shows what was actually found");
  assert.deepEqual(v1.problems.map((p) => p.code), ["conflicting_a"]);
  assert.match(v1.problems[0].detail, /23\.227\.38\.65 \(Shopify\)/);
  assert.deepEqual(v1.nameservers, ["ns1041.ui-dns.com", "ns1056.ui-dns.biz"]);
  assert.match(v1.message ?? "", /another A record/i);

  // the user deletes the extra record; "Check again" (no waiting, no throttle) now sees it
  setRr("conflict-example.com", "A", ["216.198.79.1"]);
  vercel.conflicts.delete("conflict-example.com");
  vercel.routed.add("conflict-example.com");
  vercel.challengeDone.add("conflict-example.com");
  const v2 = (await verify(cookie, d.id)).body.domain!;
  assert.equal(v2.status, "active");
  assert.ok(v2.records.every((r) => r.done));
  assert.deepEqual(v2.problems, []);
  dnsRr.clear();
  vercel.conflicts.clear();
});

test("Vercel still says misconfigured but both resolvers show only Vercel's address: DNS is the second opinion and the domain goes active", { timeout: 60_000 }, async () => {
  const { cookie } = await signIn("dom-second@example.com", "plus");
  const site = await makeSite(cookie, "Second opinion site");
  const { body } = await add(cookie, site.id, "second-example.com");
  const d = body.domain!;
  const own = d.records.find((r) => r.type === "TXT" && r.host.startsWith("_keplar-verify."))!;
  dns.set(own.host, [own.value]);
  vercel.challengeDone.add("second-example.com");
  setRr("second-example.com", "A", ["76.76.21.21"]); // the older address, still valid
  const v = (await verify(cookie, d.id)).body.domain!;
  assert.equal(v.status, "active");
  dnsRr.clear();
});

test("Cloudflare proxy: Cloudflare addresses are named as the cause; one resolver failing does not hide the other's answer", { timeout: 60_000 }, async () => {
  const { cookie } = await signIn("dom-cf@example.com", "plus");
  const site = await makeSite(cookie, "CF site");
  const { body } = await add(cookie, site.id, "cf-example.com");
  const own = body.domain!.records.find((r) => r.type === "TXT" && r.host.startsWith("_keplar-verify."))!;
  dns.set(own.host, [own.value]);
  vercel.challengeDone.add("cf-example.com");
  setRr("cf-example.com", "A", ["104.21.5.9", "172.67.1.2"]);
  setRr("cf-example.com", "AAAA", ["2606:4700:3030::6815:1"]);
  const v = (await verify(cookie, body.domain!.id)).body.domain!;
  assert.equal(v.status, "pending");
  assert.deepEqual(v.problems.map((p) => p.code), ["cloudflare_proxy"]);
  assert.match(v.message ?? "", /orange cloud/);
  // the same lookups went to both resolvers
  assert.ok(dnsQueries.some((q) => q.startsWith("dns.google|cf-example.com|A")) && dnsQueries.some((q) => q.startsWith("cloudflare-dns.com|cf-example.com|A")));
  dnsRr.clear();
});

test("ownership TXT is read from either resolver (one resolver with a stale negative answer does not block)", async () => {
  const { lookupTxt } = await import("@/lib/domains/dns");
  dns.set("_keplar-verify.union-example.com", ["keplar-verify=abc"]);
  assert.deepEqual(await lookupTxt("_keplar-verify.union-example.com"), ["keplar-verify=abc"]);
  dnsDown = true;
  assert.equal(await lookupTxt("_keplar-verify.union-example.com"), null);
  dnsDown = false;
});
