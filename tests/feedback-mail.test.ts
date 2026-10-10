import "./setup";
import { jsonReq } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/feedback/route";
import { FEEDBACK_TO, feedbackSubject, feedbackText, sendFeedbackEmail } from "../src/lib/growth/feedback-mail";
import { INQUIRY_FROM } from "../src/lib/inquire/mail";
import { brand } from "../src/lib/site";
import type { FeedbackRow } from "../src/lib/growth/feedback";

const row = (p: Partial<FeedbackRow> = {}): FeedbackRow => ({ id: "fb_1", workspaceId: "ws_secret_id", at: "2026-10-03T12:00:00.000Z", kind: "idea", message: "Please add dark mode\nto the sidebar", signedIn: true, plan: "plus", ...p });

async function withResend<T>(fn: (calls: { url: string; init: RequestInit }[]) => Promise<T>, respond: () => Response = () => Response.json({ id: "em_1" })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://api.resend.com")) { calls.push({ url: String(url), init: init ?? {} }); return respond(); }
    return realFetch(url as string, init);
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = realFetch; if (key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = key; }
}

test("feedback goes to team@keplar.one from the unchanged sender; the single address lives in brand", async () => {
  assert.equal(brand.feedbackEmail, "team@keplar.one");
  assert.equal(FEEDBACK_TO(), "team@keplar.one");
  await withResend(async (calls) => {
    const r = await sendFeedbackEmail(row({ email: "ada@example.com" }));
    assert.deepEqual(r, { ok: true, emailId: "em_1" });
    assert.equal(calls.length, 1);
    const sent = JSON.parse(String(calls[0].init.body)) as { from: string; to: string[]; reply_to?: string; subject: string; text: string };
    assert.deepEqual(sent.to, ["team@keplar.one"]);
    assert.equal(sent.from, INQUIRY_FROM()); // sender not changed
    assert.equal(sent.reply_to, "ada@example.com");
    assert.match(sent.subject, /^Keplar feedback \(.*\): Please add dark mode to the sidebar$/);
    assert.match(sent.text, /Please add dark mode/);
  });
});

test("anonymous feedback has no reply-to, and no account id ever reaches the email", async () => {
  await withResend(async (calls) => {
    await sendFeedbackEmail(row({ signedIn: false, plan: undefined }));
    const sent = JSON.parse(String(calls[0].init.body)) as { reply_to?: string; text: string };
    assert.equal(sent.reply_to, undefined);
    assert.ok(!sent.text.includes("ws_secret_id"));
    assert.match(sent.text, /anonymous/);
  });
});

test("a missing key or a Resend error is reported, never thrown", async () => {
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  assert.equal((await sendFeedbackEmail(row())).ok, false);
  if (key !== undefined) process.env.RESEND_API_KEY = key;
  await withResend(async () => assert.equal((await sendFeedbackEmail(row())).ok, false), () => Response.json({ name: "validation_error", message: "bad" }, { status: 422 }));
});

test("subject and body are plain one-line / text", () => {
  assert.ok(!feedbackSubject(row({ message: "a\r\nBcc: x@y.z" })).includes("\n"));
  assert.match(feedbackText(row({ kind: "research", message: "", answers: { q1: "I use two chatbots" } })), /I use two chatbots/);
});

test("the route saves the feedback, emails it, and still succeeds if the email fails", async () => {
  let n = 0;
  const send = (body: unknown) => { const r = jsonReq(null, "/api/feedback", "POST", body); r.headers.set("x-forwarded-for", `9.9.${(++n >> 8) & 255}.${n & 255}`); return POST(r); };
  await withResend(async (calls) => {
    const res = await send({ kind: "idea", message: "route mail check" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, emailed: true });
    assert.equal(calls.length, 1);
    assert.deepEqual((JSON.parse(String(calls[0].init.body)) as { to: string[] }).to, ["team@keplar.one"]);
  });
  await withResend(async () => {
    const res = await send({ kind: "idea", message: "route mail fails" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, emailed: false });
  }, () => new Response("boom", { status: 500 }));
});

test("no other contact address is hard-coded as a mailto target in the app", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) for (const m of readFileSync(p, "utf8").matchAll(/mailto:([^"'`?\s$]+@[^"'`?\s]+)/g)) if (m[1] !== "team@keplar.one" && !/^[a-z]@b\.co$/.test(m[1])) bad.push(`${p}: ${m[1]}`);
    }
  };
  walk(join(process.cwd(), "src"));
  assert.deepEqual(bad, []);
});
