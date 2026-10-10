import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReport, storeReport, listReports, setReportStatus, recordSafetyEvent, recentSafetyEvents } from "@/lib/safety/store";
import { validateTicket, storeTicket, listTickets, setTicketStatus } from "@/lib/support/tickets";
import { HELP, allHelpItems } from "@/lib/support/help";
import { POST as reportPOST } from "@/app/api/report/route";
import { POST as supportPOST } from "@/app/api/support/route";

const origin = "http://localhost:3000";
const post = (path: string, body: unknown, ip: string) => new Request(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", origin, host: "localhost:3000", "x-forwarded-for": ip }, body: JSON.stringify(body) });

test("report validation: category required, honeypot rejected, text cleaned and capped", () => {
  assert.equal(validateReport({}).ok, false);
  assert.equal(validateReport({ category: "nope" }).ok, false);
  assert.equal(validateReport({ category: "harmful", website: "http://spam" }).ok, false);
  assert.equal(validateReport({ category: "other", note: "" }).ok, false, "'other' needs words");
  const v = validateReport({ category: "wrong", note: "x\u0000".repeat(2000), excerpt: "e".repeat(900), answerId: "bad id!" });
  assert.ok(v.ok);
  if (v.ok) { assert.ok(v.value.note.length <= 1000); assert.ok((v.value.excerpt ?? "").length <= 400); assert.equal(v.value.answerId, undefined); assert.ok(!v.value.note.includes("\u0000")); }
});

test("a report is stored (status open), listed for admin, and its status can be changed; nothing is emailed", async () => {
  const row = await storeReport({ category: "harmful", note: "bad advice", excerpt: "Take 20 pills" }, { accountId: null });
  assert.equal(row.status, "open");
  assert.ok((await listReports(50)).some((r) => r.id === row.id));
  assert.equal(await setReportStatus(row.id, "reviewed", "team@keplar.one"), true);
  assert.equal((await listReports(50)).find((r) => r.id === row.id)?.status, "reviewed");
  assert.equal(await setReportStatus("rp_missing", "reviewed", "x"), false);
});

test("safety events store the category only, never the prompt", async () => {
  await recordSafetyEvent({ category: "weapons/mass-harm", action: "refuse", plan: "free", signedIn: false }); // awaited: no fixed sleep
  const ev = await recentSafetyEvents(1, 500);
  const e = ev.find((x) => x.category === "weapons/mass-harm");
  assert.ok(e);
  assert.deepEqual(Object.keys(e!).sort(), ["action", "at", "category", "id", "plan", "signedIn", "workspaceId"]);
});

test("POST /api/report works signed out, rejects junk, and is rate limited per IP", async () => {
  const ok = await reportPOST(post("/api/report", { category: "wrong", note: "this is false" }, "10.9.0.1"));
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { ok: boolean }).ok, true);
  const bad = await reportPOST(post("/api/report", { category: "zzz" }, "10.9.0.2"));
  assert.equal(bad.status, 400);
  const cross = await reportPOST(new Request(`${origin}/api/report`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", host: "localhost:3000", "x-forwarded-for": "10.9.0.3" }, body: JSON.stringify({ category: "wrong" }) }));
  assert.equal(cross.status, 403);
  let last = 200;
  for (let i = 0; i < 14; i++) last = (await reportPOST(post("/api/report", { category: "wrong" }, "10.9.0.4"))).status;
  assert.equal(last, 429);
});

test("support tickets: validation, storage, admin listing, status, API", async () => {
  assert.equal(validateTicket({ topic: "bug", subject: "x", message: "short" }).ok, false);
  assert.equal(validateTicket({ topic: "bug", subject: "Broken", message: "The page is blank when I open it", email: "not-an-email" }).ok, false);
  assert.equal(validateTicket({ topic: "bug", subject: "Broken", message: "The page is blank when I open it", email: "a@b.co", website: "x" }).ok, false);
  const v = validateTicket({ topic: "bug", subject: "Broken", message: "The page is blank when I open it", email: "a@b.co" });
  assert.ok(v.ok);
  if (!v.ok) return;
  const t = await storeTicket(v.value, { workspaceId: null });
  assert.equal(t.status, "open");
  assert.equal(t.workspaceId, "anon");
  assert.ok((await listTickets(50)).some((r) => r.id === t.id));
  assert.equal(await setTicketStatus(t.id, "answered", "team@keplar.one"), true);
  const res = await supportPOST(post("/api/support", { topic: "billing", subject: "Charged twice", message: "I see two charges on my card this month", email: "me@example.com" }, "10.9.1.1"));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { ref: string };
  assert.match(j.ref, /^tk_/);
  assert.equal((await supportPOST(post("/api/support", { topic: "billing", subject: "Hi", message: "no email given here at all", }, "10.9.1.2"))).status, 400);
});

test("help centre: every item has an id, a question and a non-empty answer; ids unique; no placeholder text", () => {
  const items = allHelpItems();
  assert.ok(HELP.length >= 4 && items.length >= 12);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const i of items) { assert.ok(i.q.endsWith("?") || i.q.endsWith(".")); assert.ok(i.a.length > 0 && i.a.every((p) => p.length > 20)); assert.doesNotMatch(i.a.join(" "), /lorem|TODO|TBD/); }
  const text = items.map((i) => i.a.join(" ")).join(" ");
  assert.match(text, /988/);
  assert.match(text, /not code-signed/);
  assert.match(text, /not been verified end-to-end/);
});
