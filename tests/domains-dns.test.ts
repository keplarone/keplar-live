import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, isAcceptedIp, isCloudflareIp, isVercelCname, providerOf, type DnsFindings, type ResolverView } from "@/lib/domains/diagnose";

const EXP = { ipv4: ["216.198.79.1", "64.29.17.1", "76.76.21.21"], cname: ["564a2f363946e431.vercel-dns-017.com", "cname.vercel-dns.com"] };
const view = (resolver: "Google" | "Cloudflare", p: Partial<ResolverView> = {}): ResolverView => ({ resolver, ok: true, a: [], aaaa: [], cname: [], ...p });
const both = (p: Partial<ResolverView>, wrongHost: DnsFindings["wrongHost"] = []): DnsFindings => ({ at: "t", views: [view("Google", p), view("Cloudflare", p)], nameservers: ["ns1041.ui-dns.com", "ns1056.ui-dns.biz"], wrongHost });
const codes = (r: ReturnType<typeof diagnose>) => r.problems.map((p) => p.code);

test("address classification: Vercel, Cloudflare and other providers' ranges; CNAME targets", () => {
  assert.ok(isAcceptedIp("216.198.79.1", EXP) && isAcceptedIp("76.76.21.21", EXP) && isAcceptedIp("64.29.17.1", EXP));
  assert.ok(!isAcceptedIp("23.227.38.65", EXP));
  assert.ok(isCloudflareIp("104.21.5.9") && isCloudflareIp("172.67.1.2") && isCloudflareIp("2606:4700:3030::6815:1") && !isCloudflareIp("216.198.79.1"));
  assert.equal(providerOf("23.227.38.65"), "Shopify");
  assert.equal(providerOf("185.199.108.153"), "GitHub Pages");
  assert.equal(providerOf("203.0.113.9"), null);
  assert.ok(isVercelCname("cname.vercel-dns.com.", []) && isVercelCname("abcd1234.vercel-dns-017.com", []) && isVercelCname("564a2f363946e431.vercel-dns-017.com.", EXP.cname));
  assert.ok(!isVercelCname("shops.myshopify.com", EXP.cname) && !isVercelCname("evilvercel-dns.com", []));
});

test("the reported case: the right A record plus an old Shopify A record is a conflict, shown with what was found", () => {
  const r = diagnose("telebuddies.fun", "telebuddies.fun", both({ a: ["216.198.79.1", "23.227.38.65"] }), EXP);
  assert.equal(r.pointedByDns, false);
  assert.deepEqual(codes(r), ["conflicting_a"]);
  assert.deepEqual(r.found.a.sort(), ["216.198.79.1", "23.227.38.65"]);
  const p = r.problems[0];
  assert.match(p.detail, /23\.227\.38\.65 \(Shopify\)/);
  assert.match(p.detail, /216\.198\.79\.1 \(correct\)/);
  assert.match(p.fix, /delete the A record for @ with value 23\.227\.38\.65/);
  assert.match(p.fix, /ui-dns\.com/, "says where the DNS is hosted");
});

test("Vercel's own conflict list is used even when our resolvers have not seen the extra record", () => {
  const r = diagnose("example.com", "example.com", both({ a: ["216.198.79.1"] }), EXP, [{ name: "example.com", type: "A", value: "23.227.38.65" }]);
  assert.deepEqual(codes(r), ["conflicting_a"]);
});

test("clean apex: any of Vercel's accepted addresses counts, and the old 76.76.21.21 still works", () => {
  for (const ip of ["216.198.79.1", "64.29.17.1", "76.76.21.21"]) {
    const r = diagnose("example.com", "example.com", both({ a: [ip] }), EXP);
    assert.equal(r.pointedByDns, true, ip);
    assert.deepEqual(r.problems, []);
  }
  assert.equal(diagnose("example.com", "example.com", both({ a: ["216.198.79.1", "64.29.17.1"] }), EXP).pointedByDns, true, "several Vercel addresses together are fine");
});

test("Cloudflare proxy (orange cloud) is detected from the addresses and explained", () => {
  const r = diagnose("example.com", "example.com", both({ a: ["104.21.5.9", "172.67.1.2"], aaaa: ["2606:4700:3030::6815:1"] }), EXP);
  assert.equal(r.pointedByDns, false);
  assert.deepEqual(codes(r), ["cloudflare_proxy"]);
  assert.match(r.problems[0].fix, /orange cloud/);
  assert.match(r.problems[0].fix, /DNS only/);
});

test("AAAA records that point elsewhere are reported, and block the DNS-based all-clear", () => {
  const r = diagnose("example.com", "example.com", both({ a: ["216.198.79.1"], aaaa: ["2001:db8::1"] }), EXP);
  assert.equal(r.pointedByDns, false);
  assert.deepEqual(codes(r), ["aaaa_elsewhere"]);
  assert.match(r.problems[0].detail, /2001:db8::1/);
});

test("wrong A value, no record, and a record on the wrong name", () => {
  assert.deepEqual(codes(diagnose("example.com", "example.com", both({ a: ["203.0.113.9"] }), EXP)), ["wrong_a"]);
  const none = diagnose("example.com", "example.com", both({}), EXP);
  assert.deepEqual(codes(none), ["no_record"]);
  assert.match(none.problems[0].detail, /ui-dns\.com/);
  const wrong = diagnose("example.com", "example.com", both({}, [{ host: "example.com.example.com", type: "A", values: ["216.198.79.1"] }]), EXP);
  assert.deepEqual(codes(wrong), ["wrong_host"]);
  assert.match(wrong.problems[0].detail, /example\.com\.example\.com/);
  const sub = diagnose("shop.example.com", "example.com", both({}, [{ host: "example.com", type: "A", values: ["216.198.79.1"] }]), EXP);
  assert.deepEqual(codes(sub), ["wrong_host"]);
});

test("subdomains: CNAME to any Vercel target is pointed; CNAME elsewhere is explained", () => {
  assert.equal(diagnose("shop.example.com", "example.com", both({ cname: ["cname.vercel-dns.com"], a: ["76.76.21.21"] }), EXP).pointedByDns, true);
  assert.equal(diagnose("shop.example.com", "example.com", both({ cname: ["564a2f363946e431.vercel-dns-017.com"], a: ["216.198.79.1"] }), EXP).pointedByDns, true);
  assert.equal(diagnose("shop.example.com", "example.com", both({ a: ["216.198.79.1"] }), EXP).pointedByDns, true, "an A record also works on a subdomain");
  const r = diagnose("shop.example.com", "example.com", both({ cname: ["shops.myshopify.com"], a: ["23.227.38.1"] }), EXP);
  assert.equal(r.pointedByDns, false);
  assert.ok(codes(r).includes("cname_elsewhere"));
});

test("resolvers disagreeing is propagation, not a verdict; both failing says so; one failing does not block", () => {
  const f: DnsFindings = { at: "t", views: [view("Google", { a: ["216.198.79.1"] }), view("Cloudflare", {})], nameservers: [], wrongHost: [] };
  const r = diagnose("example.com", "example.com", f, EXP);
  assert.equal(r.pointedByDns, false);
  assert.deepEqual(codes(r), ["spreading"]);
  assert.match(r.problems[0].detail, /Google already sees the new record, Cloudflare doesn't yet/);
  const down = diagnose("example.com", "example.com", { at: "t", views: [view("Google", { ok: false }), view("Cloudflare", { ok: false })], nameservers: [], wrongHost: [] }, EXP);
  assert.deepEqual(codes(down), ["dns_unavailable"]);
  const one = diagnose("example.com", "example.com", { at: "t", views: [view("Google", { ok: false }), view("Cloudflare", { a: ["216.198.79.1"] })], nameservers: [], wrongHost: [] }, EXP);
  assert.equal(one.pointedByDns, true);
});
