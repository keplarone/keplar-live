import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERTS, recentSecurityEvents, securityEvent, securityEventsSettled, securityEventRetentionDays, whereOf } from "@/lib/security/events";
import { listOutbox } from "@/lib/accounts/outbox";
import { signIn, call, jsonReq } from "./helpers/session";

const req = (url: string, ip = "203.0.113.9") => new Request(url, { headers: { "x-forwarded-for": ip, "x-request-id": "req_abcdefghij1234567890" } });

test("an event is stored with hashed keys only: no IP, no account id, no email, no query string", async () => {
  securityEvent({ kind: "authz.denied", code: "unauthenticated", req: req("https://keplar.one/api/projects/prj_0123456789abcdef?token=secret-value"), accountId: "user-123", status: 401 });
  await securityEventsSettled();
  const rows = await recentSecurityEvents(10);
  const ev = rows.find((r) => r.code === "unauthenticated" && r.where.startsWith("/api/projects"));
  assert.ok(ev, "stored");
  assert.equal(ev.where, "/api/projects/:id");
  assert.equal(ev.reqId, "req_abcdefghij1234567890");
  assert.match(ev.ipKey!, /^[0-9a-f]{16}$/);
  assert.match(ev.acctKey!, /^[0-9a-f]{16}$/);
  const json = JSON.stringify(ev);
  assert.doesNotMatch(json, /203\.0\.113\.9|user-123|secret-value/);
  assert.equal(whereOf(req("https://keplar.one/api/chats/0123456789abcdef0123/messages/42")), "/api/chats/:id/messages/:id");
});

test("crossing a threshold alerts the owner once per kind per hour, with hashed keys and no raw identifiers", async () => {
  const before = (await listOutbox()).filter((m) => m.subject.includes("[Keplar alert]")).length;
  const max = ALERTS["auth.throttled"]!.perIp!;
  for (let i = 0; i <= max + 2; i++) securityEvent({ kind: "auth.throttled", code: "pw:in", where: "auth/password", ip: "198.51.100.77" });
  await securityEventsSettled();
  const alerts = (await listOutbox()).filter((m) => m.subject.includes("[Keplar alert]") && m.subject.includes("limiter tripped"));
  assert.equal(alerts.length - before, 1, "exactly one alert for the burst");
  assert.doesNotMatch(alerts[alerts.length - 1].text, /198\.51\.100\.77/);
  assert.match(alerts[alerts.length - 1].text, /security-incident\.md/);
});

test("real guards record events: an anonymous API call, a cross-site POST and a refused admin call", async () => {
  const { GET: projects } = await import("@/app/api/projects/route");
  const r1 = await projects(call(null, "/api/projects", { headers: { "x-forwarded-for": "192.0.2.10" } }));
  assert.equal(r1.status, 401);
  const { POST: del } = await import("@/app/api/account/delete/route");
  const r2 = await del(new Request("https://keplar.one/api/account/delete", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", "x-forwarded-for": "192.0.2.11" }, body: "{}" }));
  assert.equal(r2.status, 403);
  const { cookie } = await signIn("events-user@example.com");
  const { GET: overview } = await import("@/app/api/admin/overview/route");
  const r3 = await overview(jsonReq(cookie, "/api/admin/overview", "GET"));
  assert.equal(r3.status, 404);
  await securityEventsSettled();
  const codes = new Set((await recentSecurityEvents(200)).filter((e) => e.kind === "authz.denied").map((e) => e.code));
  for (const c of ["unauthenticated", "bad_origin", "admin_refused"]) assert.ok(codes.has(c), `${c} recorded`);
});

test("retention defaults to 90 days and never below 30", () => {
  assert.equal(securityEventRetentionDays({}), 90);
  assert.equal(securityEventRetentionDays({ KEPLAR_RETAIN_SECURITY_EVENTS_DAYS: "365" }), 365);
  assert.equal(securityEventRetentionDays({ KEPLAR_RETAIN_SECURITY_EVENTS_DAYS: "3" }), 90);
});
