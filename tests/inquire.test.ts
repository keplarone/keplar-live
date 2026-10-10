import "./setup";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/inquire/route";
import { parseInquiry } from "@/lib/inquire/schema";
import { inquirySubject, inquiryText } from "@/lib/inquire/mail";

const real = globalThis.fetch;
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let resend: () => Response = () => Response.json({ id: "re_test_123" });
let sql: { query: string; params: unknown[] }[] = [];
let neonFail = false;
let ipCounter = 0;
const uniqueIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;

beforeEach(() => {
  calls = [];
  sql = [];
  neonFail = false;
  resend = () => Response.json({ id: "re_test_123" });
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      calls.push({ url, init: init ?? {} });
      return resend();
    }
    if (url.endsWith("/sql")) {
      if (neonFail) return new Response("{}", { status: 400 });
      sql.push(JSON.parse(String(init?.body)));
      return Response.json({ rows: [] });
    }
    return real(input, init);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = real;
  delete process.env.DATABASE_URL;
  delete process.env.RESEND_API_KEY;
});

const base = { name: "Ada Lovelace", email: "x@example.com", company: "Analytical Co", companySize: "11–50", interests: ["Enterprise", "Press"], message: "We'd like to talk about an enterprise rollout." };
let n = 0;
/** A valid inquiry with a fresh visitor email (the per-email limiter is shared across this file). */
const mk = (o: Record<string, unknown> = {}) => ({ ...base, email: `ada${++n}@example.com`, ...o });
const send = (body: unknown, headers: Record<string, string> = {}, ip = uniqueIp()) =>
  POST(new Request("https://keplar.one/api/inquire", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": ip, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const sentBody = () => JSON.parse(String(calls[0].init.body)) as { from: string; to: string[]; reply_to: string; subject: string; text: string };

test("success: emails team@keplar.one from the verified sender with Reply-To = visitor and every field", async () => {
  const visitor = mk();
  const biz = { ...visitor, interests: ["Keplar Business"], business: { handle: "Triage support inbox", estimatedUsers: "11–50", useCase: "Customer Operations", expectedUsage: "Moderate" } };
  const res = await send(biz);
  assert.equal(res.status, 201);
  const j = (await res.json()) as { ok: boolean; id: string };
  assert.equal(j.ok, true);
  assert.equal(calls.length, 1);
  const m = sentBody();
  assert.deepEqual(m.to, ["team@keplar.one"]);
  assert.equal(m.from, "Keplar Inquiries <no-reply@keplar.one>");
  assert.equal(m.reply_to, visitor.email);
  assert.match(m.subject, /^New inquiry: Keplar Business — Ada Lovelace \(Analytical Co\)$/);
  for (const piece of ["Ada Lovelace", visitor.email, "Analytical Co", "11–50", "Keplar Business", "Triage support inbox", "Customer Operations", "Moderate", base.message, j.id]) assert.ok(m.text.includes(piece), `body has ${piece}`);
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer re_test_key");
});

test("Resend failure: visitor gets a clear error (not success) and it is logged", async () => {
  resend = () => Response.json({ name: "validation_error", message: "domain not verified" }, { status: 403 });
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    const res = await send(mk());
    assert.equal(res.status, 502);
    const j = (await res.json()) as { ok: boolean; error: string };
    assert.equal(j.ok, false);
    assert.match(j.error, /couldn't send/);
    assert.match(j.error, /team@keplar\.one/);
  } finally {
    console.error = orig;
  }
  assert.ok(logs.some((l) => l.includes("notification email FAILED") && l.includes("domain not verified")));
  assert.ok(!logs.join("\n").includes("re_test_key"));
});

test("missing RESEND_API_KEY or a network error is a failure, never a silent success", async () => {
  const orig = console.error;
  console.error = () => undefined;
  try {
    delete process.env.RESEND_API_KEY;
    assert.equal((await send(mk())).status, 502);
    process.env.RESEND_API_KEY = "re_test_key";
    resend = () => {
      throw new Error("ECONNRESET");
    };
    assert.equal((await send({ ...mk(), email: "b@example.com" })).status, 502);
    resend = () => new Response("{}", { status: 200 }); // 200 without an id is not an accepted send
    assert.equal((await send({ ...mk(), email: "c@example.com" })).status, 502);
  } finally {
    console.error = orig;
  }
});

test("Neon: the row is inserted into inquiries before the email, then marked sent with the Resend id", async () => {
  process.env.DATABASE_URL = "postgresql://u:p@ep-test-1.us-east-2.aws.neon.tech/neondb";
  const v = mk();
  const res = await send(v);
  assert.equal(res.status, 201);
  const create = sql.findIndex((s) => /CREATE TABLE IF NOT EXISTS inquiries/.test(s.query));
  const insert = sql.findIndex((s) => /INSERT INTO inquiries/.test(s.query));
  const update = sql.findIndex((s) => /UPDATE inquiries SET email_status/.test(s.query));
  assert.ok(create >= 0 && insert > create && update > insert);
  assert.ok(sql[insert].params.includes(v.email));
  assert.ok(sql[insert].params.includes(base.message));
  assert.deepEqual(sql[update].params.slice(1, 3), ["sent", "re_test_123"]);
});

test("Neon: when email fails the row is kept and marked failed with the reason", async () => {
  process.env.DATABASE_URL = "postgresql://u:p@ep-test-2.us-east-2.aws.neon.tech/neondb";
  resend = () => Response.json({ message: "boom" }, { status: 500 });
  const orig = console.error;
  console.error = () => undefined;
  try {
    const res = await send(mk());
    assert.equal(res.status, 502);
  } finally {
    console.error = orig;
  }
  const upd = sql.find((s) => /UPDATE inquiries SET email_status/.test(s.query));
  assert.ok(upd);
  assert.equal(upd.params[1], "failed");
  assert.match(String(upd.params[3]), /Resend HTTP 500/);
  assert.ok(sql.some((s) => /INSERT INTO inquiries/.test(s.query)));
});

test("Neon down but Resend ok: still delivered; both down: 500 with a clear error", async () => {
  process.env.DATABASE_URL = "postgresql://u:p@ep-test-3.us-east-2.aws.neon.tech/neondb";
  neonFail = true;
  const orig = console.error;
  console.error = () => undefined;
  try {
    assert.equal((await send(mk())).status, 201);
    resend = () => new Response("{}", { status: 500 });
    const res = await send({ ...mk(), email: "d@example.com" });
    assert.equal(res.status, 500);
    assert.equal(((await res.json()) as { ok: boolean }).ok, false);
  } finally {
    console.error = orig;
  }
});

test("header injection: CR/LF in name, email, company never reach subject or Reply-To; injected emails are rejected", async () => {
  const v = mk();
  const res = await send({ ...v, name: "Eve\r\nBcc: victim@evil.test", company: "X\nSubject: spam" });
  assert.equal(res.status, 201);
  const m = sentBody();
  assert.ok(!/[\r\n]/.test(m.subject), "subject is one line");
  assert.equal(m.reply_to, v.email);
  for (const bad of ["a@example.com\r\nBcc: v@evil.test", "a@example.com, b@example.com", "Eve <a@example.com>", "a@b@example.com", "a b@example.com"]) {
    const r = parseInquiry({ ...mk(), email: bad });
    assert.ok(!r.ok || !/[\r\n,<> ]/.test(r.data.email), `rejects or strips ${JSON.stringify(bad)}`);
  }
  assert.ok(!/[\r\n]/.test(inquirySubject({ ...mk(), name: "a\r\nb", company: "", interests: [], companySize: "11–50" })));
  assert.ok(inquiryText({ ...mk(), interests: [], companySize: "11–50" } as never, { id: "i", receivedAt: "t" }).includes("Interested in: —"));
});

test("honeypot: filled hidden field gets a fake success and nothing is stored or sent", async () => {
  process.env.DATABASE_URL = "postgresql://u:p@ep-test-4.us-east-2.aws.neon.tech/neondb";
  const res = await send({ ...mk(), website: "http://spam.test" });
  assert.equal(res.status, 202);
  assert.equal(calls.length, 0);
  assert.equal(sql.length, 0);
});

test("origin: cross-site and origin-less posts are blocked; same-origin passes", async () => {
  assert.equal((await send(mk(), { origin: "https://evil.test" })).status, 403);
  assert.equal((await send(mk(), { origin: "null" })).status, 403);
  const noOrigin = await POST(new Request("https://keplar.one/api/inquire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mk()) }));
  assert.equal(noOrigin.status, 403);
  assert.equal(calls.length, 0);
});

test("validation and limits: bad JSON, wrong type, oversize body, invalid fields, long fields truncated", async () => {
  assert.equal((await send("{nope")).status, 400);
  assert.equal((await send(mk(), { "content-type": "text/plain" })).status, 415);
  assert.equal((await send({ ...mk(), message: "x".repeat(40_000) })).status, 413);
  const bad = await send({ ...mk(), email: "nope", message: "short" });
  assert.equal(bad.status, 422);
  assert.ok(((await bad.json()) as { fields: Record<string, string> }).fields.email);
  const long = parseInquiry({ ...mk(), name: "n".repeat(500), message: "m".repeat(9000) });
  assert.ok(long.ok && long.data.name.length === 120 && long.data.message.length === 5000);
  assert.equal(calls.length, 0);
});

test("rate limit: per IP, per email, and no relay (the visitor never receives mail)", async () => {
  const ip = "198.51.100.7";
  for (let i = 0; i < 5; i++) assert.equal((await send({ ...mk(), email: `u${i}@example.com` }, {}, ip)).status, 201);
  const limited = await send({ ...mk(), email: "u9@example.com" }, {}, ip);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  const email = "same@example.com";
  for (let i = 0; i < 3; i++) assert.equal((await send({ ...mk(), email }, {}, uniqueIp())).status, 201);
  assert.equal((await send({ ...mk(), email }, {}, uniqueIp())).status, 429);
  for (const c of calls) assert.deepEqual(JSON.parse(String(c.init.body)).to, ["team@keplar.one"], "only the team is ever emailed");
});
