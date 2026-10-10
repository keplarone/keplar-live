import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { featureSite, getPage, hidden, postFeature } from "./helpers/feature-site";
import { listLeads, sites } from "@/lib/site-builder/store";
import { listCrm } from "@/lib/business/crm";
import { listOutbox } from "@/lib/accounts/outbox";
import { updateSite } from "@/lib/site-builder/store";
import { getWorkspace } from "@/lib/accounts/workspaces";

const FORM = '<div data-k-feature="form" data-k-id="contact" data-k-title="Say hi" data-k-fields="name,email,message" data-k-button="Send it"></div>';

async function setup(email: string) {
  const { cookie, workspaceId } = await signIn(email);
  const s = await featureSite(cookie, workspaceId, "Mill Lane", { "index.html": "<h1>Mill Lane</h1>", "contact.html": `<h1>Contact</h1>${FORM}` });
  const site = (await sites().get(workspaceId, s.id))!;
  return { cookie, workspaceId, ...s, site };
}
/** Draws the contact page, like a visitor, and waits past the too-fast trap by back-dating the token the way a slow human would. */
async function drawForm(slug: string) {
  const res = await getPage(slug, ["contact.html"]);
  assert.equal(res.status, 200);
  const html = await res.text();
  return html;
}

test("the form placeholder renders a real form with a token and a honeypot; unknown ids are refused", async () => {
  const t = await setup("form1@example.com");
  const html = await drawForm(t.slug);
  assert.match(html, /<form class="k-form k-feat k-feat--form" method="post" action="\/s\/[^"]+\/_f\/form"/);
  assert.match(html, /Say hi/);
  assert.match(html, /name="_hp"/);
  assert.match(html, /name="email"[^>]*required/);
  assert.doesNotMatch(html, /data-k-feature/);
  const bad = await postFeature(t.slug, "form", { _id: "nope", _t: hidden(html, "_t"), email: "a@b.co", name: "A" });
  assert.equal(bad.status, 404);
});

test("a real submission lands in Leads and the CRM; bots and bad input do not", async () => {
  const t = await setup("form2@example.com");
  const html = await drawForm(t.slug);
  const base = { _id: "contact", _page: "contact.html", _t: hidden(html, "_t") };
  // a bot that submits instantly is told "thanks" but nothing is stored
  const fast = await postFeature(t.slug, "form", { ...base, name: "Bot", email: "bot@example.com", message: "buy" });
  assert.equal(fast.status, 303);
  assert.equal((await listLeads(t.site)).length, 0);
  // wait out the too-fast window
  await new Promise((r) => setTimeout(r, 1700));
  const honey = await postFeature(t.slug, "form", { ...base, _hp: "x", name: "Bot", email: "bot@example.com", message: "x" });
  assert.equal(honey.status, 303);
  assert.equal((await listLeads(t.site)).length, 0);
  const links = await postFeature(t.slug, "form", { ...base, name: "Spam", email: "s@example.com", message: "http://a.example http://b.example http://c.example" });
  assert.equal(links.status, 303);
  assert.equal((await listLeads(t.site)).length, 0);
  assert.equal((await postFeature(t.slug, "form", { ...base, name: "Ann", email: "not-an-email", message: "hi" })).status, 400);
  assert.equal((await postFeature(t.slug, "form", { ...base, _t: "zz.invalid", name: "Ann", email: "ann@example.com", message: "hi" })).status, 400);
  // a field the form doesn't declare is ignored
  const ok = await postFeature(t.slug, "form", { ...base, name: "Ann", email: "ann@example.com", message: "Do you do wedding loaves?", admin: "true" });
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get("location") ?? "", /\/_thanks\?f=form$/);
  const leads = await listLeads(t.site);
  assert.equal(leads.length, 1);
  assert.deepEqual(leads[0].fields, { name: "Ann", email: "ann@example.com", message: "Do you do wedding loaves?" });
  assert.equal(leads[0].page, "contact.html");
  const crm = await listCrm(t.workspaceId);
  assert.ok(crm.contacts.some((c) => c.email === "ann@example.com"));
  // tenant isolation: another workspace sees nothing
  const other = await signIn("form2b@example.com");
  assert.equal((await listCrm(other.workspaceId)).contacts.length, 0);
});

test("owner email is off by default and only sent after the owner turns it on", async () => {
  const t = await setup("form3@example.com");
  const html = await drawForm(t.slug);
  await new Promise((r) => setTimeout(r, 1700));
  const base = { _id: "contact", _page: "contact.html", _t: hidden(html, "_t") };
  const before = (await listOutbox()).filter((m) => m.kind === "site-notify").length;
  await postFeature(t.slug, "form", { ...base, name: "A", email: "a@example.com", message: "one" });
  assert.equal((await listOutbox()).filter((m) => m.kind === "site-notify").length, before);
  const ws = (await getWorkspace(t.workspaceId))!;
  await updateSite(ws as never, (await sites().get(t.workspaceId, t.id))!, { featureSettings: { notifyOwner: true } });
  await postFeature(t.slug, "form", { ...base, name: "B", email: "b@example.com", message: "two" });
  const mails = (await listOutbox()).filter((m) => m.kind === "site-notify");
  assert.equal(mails.length, before + 1);
  assert.equal(mails[0].to, "form3@example.com");
});

test("rate limit: a flood from one address is stopped", async () => {
  const t = await setup("form4@example.com");
  const html = await drawForm(t.slug);
  const base = { _id: "contact", _page: "contact.html", _t: hidden(html, "_t") };
  const statuses: number[] = [];
  for (let i = 0; i < 16; i++) statuses.push((await postFeature(t.slug, "form", { ...base, name: "Z", email: "z@example.com", message: "m" }, { ip: "203.0.113.9" })).status);
  assert.ok(statuses.includes(429), statuses.join(","));
});

test("newsletter/waitlist: signup is stored once per address, tagged in the CRM, no email is sent to the visitor", async () => {
  const { cookie, workspaceId } = await signIn("news1@example.com");
  const s = await featureSite(cookie, workspaceId, "Waitlist Co", { "index.html": '<h1>Soon</h1><div data-k-feature="newsletter" data-k-id="wl" data-k-kind="waitlist" data-k-title="Join the waitlist" data-k-button="Join"></div>' });
  const html = await (await getPage(s.slug)).text();
  assert.match(html, /k-feat--newsletter/);
  assert.match(html, />Join<\/button>/);
  assert.doesNotMatch(html, /name="message"/);
  await new Promise((r) => setTimeout(r, 1700));
  const base = { _id: "wl", _page: "index.html", _t: hidden(html, "_t") };
  const mails0 = (await listOutbox()).length;
  assert.equal((await postFeature(s.slug, "newsletter", { ...base, email: "bad" })).status, 400);
  const a = await postFeature(s.slug, "newsletter", { ...base, email: "Zed@Example.com" });
  assert.match(a.headers.get("location") ?? "", /_thanks\?f=newsletter/);
  await postFeature(s.slug, "newsletter", { ...base, email: "zed@example.com" }); // same person again
  const { listRecords } = await import("@/lib/site-builder/features/records");
  const rows = await listRecords(workspaceId, s.id, "newsletter");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.email, "zed@example.com");
  assert.equal(rows[0].data.kind, "waitlist");
  const crm = await listCrm(workspaceId);
  assert.deepEqual(crm.contacts.find((c) => c.email === "zed@example.com")?.tags, ["waitlist"]);
  assert.equal((await listOutbox()).length, mails0); // nothing was emailed to anyone
  assert.equal((await postFeature(s.slug, "newsletter", { ...base, _id: "other", email: "q@example.com" })).status, 404);
});

const BOOK = '<div data-k-feature="booking" data-k-id="call" data-k-title="Book a call" data-k-days="mon-sun" data-k-hours="00:00-23:30" data-k-slot="30" data-k-tz="UTC"></div>';

test("booking: free slots are listed, a booking is confirmed on the page, double booking is blocked, owner sees it", async () => {
  const { cookie, workspaceId } = await signIn("book1@example.com");
  const s = await featureSite(cookie, workspaceId, "Studio", { "index.html": `<h1>Studio</h1>${BOOK}` });
  const html = await (await getPage(s.slug)).text();
  assert.match(html, /k-feat--booking/);
  assert.match(html, /Times are in UTC/);
  const slots = [...html.matchAll(/<option value="(\d{4}-[^"]+)"/g)].map((m) => m[1]);
  assert.ok(slots.length > 20, `slots: ${slots.length}`);
  assert.ok(slots.every((x) => new Date(x).getTime() > Date.now() + 119 * 60_000));
  await new Promise((r) => setTimeout(r, 1700));
  const base = { _id: "call", _page: "index.html", _t: hidden(html, "_t") };
  const slot = slots[3];
  assert.equal((await postFeature(s.slug, "booking", { ...base, slot: "2020-01-01T10:00:00.000Z", name: "Ann", email: "ann@example.com" })).status, 409); // not an open slot
  assert.equal((await postFeature(s.slug, "booking", { ...base, slot, name: "", email: "ann@example.com" })).status, 400);
  const ok = await postFeature(s.slug, "booking", { ...base, slot, name: "Ann", email: "ann@example.com", message: "Intro" });
  assert.equal(ok.status, 303);
  const loc = ok.headers.get("location") ?? "";
  assert.match(loc, /_thanks\?f=booking&b=rec_/);
  const thanks = await (await getPage(s.slug, ["_thanks"], loc.slice(loc.indexOf("?")))).text();
  assert.match(thanks, /Your booking is confirmed for [A-Z][a-z]+day, /);
  assert.match(thanks, /\(UTC\)/);
  // the same slot again is refused, and it no longer appears on the page
  const dup = await postFeature(s.slug, "booking", { ...base, slot, name: "Bob", email: "bob@example.com" });
  assert.equal(dup.status, 409);
  const again = await (await getPage(s.slug)).text();
  assert.ok(!again.includes(`value="${slot}"`));
  // two people racing for the same slot: exactly one wins
  const slot2 = slots[5];
  const race = await Promise.all([
    postFeature(s.slug, "booking", { ...base, slot: slot2, name: "C", email: "c@example.com" }),
    postFeature(s.slug, "booking", { ...base, slot: slot2, name: "D", email: "d@example.com" }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [303, 409]);
  const { listRecords } = await import("@/lib/site-builder/features/records");
  const rows = await listRecords(workspaceId, s.id, "booking");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.status === "confirmed"));
  assert.ok((await listCrm(workspaceId)).contacts.some((c) => c.email === "ann@example.com"));
  // a forged confirmation link shows only generic text
  const forged = await (await getPage(s.slug, ["_thanks"], "?f=booking&b=rec_nothing<script>")).text();
  assert.doesNotMatch(forged, /<script>/);
});

test("booking: a visitor gets a confirmation email only when the owner turned that on", async () => {
  const { cookie, workspaceId } = await signIn("book2@example.com");
  const s = await featureSite(cookie, workspaceId, "Studio Two", { "index.html": BOOK });
  const html = await (await getPage(s.slug)).text();
  const slots = [...html.matchAll(/<option value="(\d{4}-[^"]+)"/g)].map((m) => m[1]);
  await new Promise((r) => setTimeout(r, 1700));
  const base = { _id: "call", _page: "index.html", _t: hidden(html, "_t") };
  const count = async () => (await listOutbox()).filter((m) => m.kind === "site-booking-confirm").length;
  const c0 = await count();
  await postFeature(s.slug, "booking", { ...base, slot: slots[1], name: "Eve", email: "eve@example.com" });
  assert.equal(await count(), c0);
  const ws = (await getWorkspace(workspaceId))!;
  await updateSite(ws as never, (await sites().get(workspaceId, s.id))!, { featureSettings: { confirmVisitors: true } });
  await postFeature(s.slug, "booking", { ...base, slot: slots[2], name: "Fay", email: "fay@example.com" });
  assert.equal(await count(), c0 + 1);
});

const MENU = `<div data-k-feature="data" data-k-id="menu" data-k-title="Menu" data-k-fields="item,price,notes" data-k-view="table" data-k-seed="Sourdough loaf;$7;Baked daily|Rye &amp; seed;$8;Fridays only"></div>`;

test("data table: seeded on publish, shown on the page, public JSON read, owner-only write, isolation", async () => {
  const a = await signIn("data1@example.com");
  const s = await featureSite(a.cookie, a.workspaceId, "Bakery", { "index.html": `<h1>Bakery</h1>${MENU}` });
  const route = await import("@/app/api/sites/[id]/data/route");
  const { call, jsonReq } = await import("./helpers/session");
  const ctx = { params: Promise.resolve({ id: s.id }) };
  // owner list (also seeds once)
  const list = (await (await route.GET(call(a.cookie, `/api/sites/${s.id}/data`), ctx)).json()) as { tables: { key: string; rows: { id: string; item: string; price: string }[]; publicUrl: string }[] };
  assert.equal(list.tables.length, 1);
  assert.deepEqual(list.tables[0].rows.map((r) => [r.item, r.price]), [["Sourdough loaf", "$7"], ["Rye & seed", "$8"]]);
  await route.GET(call(a.cookie, `/api/sites/${s.id}/data`), ctx); // second look does not seed again
  assert.equal(((await (await route.GET(call(a.cookie, `/api/sites/${s.id}/data`), ctx)).json()) as typeof list).tables[0].rows.length, 2);
  // the page shows the rows, escaped
  const html = await (await getPage(s.slug)).text();
  assert.match(html, /<table class="k-feat__table"/);
  assert.match(html, /Rye &amp; seed/);
  // public JSON read: no auth, CORS open, only declared columns
  const pub = await getPage(s.slug, ["_data", "menu.json"]);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get("access-control-allow-origin"), "*");
  const data = (await pub.json()) as { rows: Record<string, string>[]; columns: string[] };
  assert.deepEqual(data.columns, ["item", "price", "notes"]);
  assert.equal(data.rows.length, 2);
  assert.ok(!("_o" in data.rows[0]) && !("id" in data.rows[0]));
  assert.equal((await getPage(s.slug, ["_data", "other.json"])).status, 404);
  // writes: anonymous and other tenants are refused; the owner can add, edit, delete
  const body = { table: "menu", row: { item: "Baguette", price: "$4", evil: "x" } };
  assert.equal((await route.POST(jsonReq(null, `/api/sites/${s.id}/data`, "POST", body), ctx)).status, 401);
  const b = await signIn("data2@example.com");
  assert.equal((await route.POST(jsonReq(b.cookie, `/api/sites/${s.id}/data`, "POST", body), ctx)).status, 404);
  const add = await route.POST(jsonReq(a.cookie, `/api/sites/${s.id}/data`, "POST", body), ctx);
  assert.equal(add.status, 201);
  const id = ((await add.json()) as { id: string }).id;
  assert.equal((await route.PATCH(jsonReq(a.cookie, `/api/sites/${s.id}/data`, "PATCH", { table: "menu", id, row: { item: "Baguette", price: "$5" } }), ctx)).status, 200);
  const after = ((await (await getPage(s.slug, ["_data", "menu.json"])).json()) as { rows: Record<string, string>[] }).rows;
  assert.deepEqual(after.map((r) => r.item), ["Sourdough loaf", "Rye & seed", "Baguette"]);
  assert.equal(after[2].price, "$5");
  assert.ok(!("evil" in after[2]));
  assert.equal((await route.POST(jsonReq(a.cookie, `/api/sites/${s.id}/data`, "POST", { table: "nope", row: { item: "x" } }), ctx)).status, 404);
  assert.equal((await route.DELETE(jsonReq(b.cookie, `/api/sites/${s.id}/data`, "DELETE", { table: "menu", id }), ctx)).status, 404);
  assert.equal((await route.DELETE(jsonReq(a.cookie, `/api/sites/${s.id}/data`, "DELETE", { table: "menu", id }), ctx)).status, 200);
  assert.equal(((await (await getPage(s.slug, ["_data", "menu.json"])).json()) as { rows: unknown[] }).rows.length, 2);
});

test("owner features API: catalog is honest, lists signups and bookings, cancel frees the slot, tenants are isolated", async () => {
  const a = await signIn("own1@example.com");
  const s = await featureSite(a.cookie, a.workspaceId, "Owner Co", { "index.html": `${BOOK}<div data-k-feature="newsletter" data-k-id="wl" data-k-kind="waitlist"></div>` });
  const route = await import("@/app/api/sites/[id]/features/route");
  const { call, jsonReq } = await import("./helpers/session");
  const ctx = { params: Promise.resolve({ id: s.id }) };
  const html = await (await getPage(s.slug)).text();
  const slots = [...html.matchAll(/<option value="(\d{4}-[^"]+)"/g)].map((m) => m[1]);
  await new Promise((r) => setTimeout(r, 1700));
  const base = { _page: "index.html", _t: hidden(html, "_t") };
  await postFeature(s.slug, "booking", { ...base, _id: "call", slot: slots[0], name: "Gus", email: "gus@example.com" });
  await postFeature(s.slug, "newsletter", { ...base, _id: "wl", email: "hal@example.com" });
  type View = { catalog: { id: string; status: string; placed: number }[]; settings: { emailDelivery: boolean; notifyOwner: boolean }; subscribers: { id: string; email: string }[]; bookings: { id: string; name: string; start: string }[] };
  const view = (await (await route.GET(call(a.cookie, `/api/sites/${s.id}/features`), ctx)).json()) as View;
  assert.equal(view.catalog.find((f) => f.id === "booking")?.placed, 1);
  assert.equal(view.catalog.find((f) => f.id === "checkout")?.status, "beta");
  assert.equal(view.catalog.find((f) => f.id === "embeds")?.status, "beta");
  assert.equal(view.catalog.find((f) => f.id === "analytics")?.status, "live");
  assert.equal(view.settings.emailDelivery, false); // no RESEND key in tests: the panel must say so
  assert.deepEqual(view.subscribers.map((x) => x.email), ["hal@example.com"]);
  assert.deepEqual(view.bookings.map((x) => [x.name, x.start]), [["Gus", slots[0]]]);
  const b = await signIn("own2@example.com");
  assert.equal((await route.GET(call(b.cookie, `/api/sites/${s.id}/features`), ctx)).status, 404);
  assert.equal((await route.DELETE(jsonReq(b.cookie, `/api/sites/${s.id}/features`, "DELETE", { id: view.bookings[0].id }), ctx)).status, 404);
  assert.equal((await route.DELETE(jsonReq(null, `/api/sites/${s.id}/features`, "DELETE", { id: view.bookings[0].id }), ctx)).status, 401);
  assert.equal((await route.DELETE(jsonReq(a.cookie, `/api/sites/${s.id}/features`, "DELETE", { id: view.bookings[0].id }), ctx)).status, 200);
  assert.ok((await (await getPage(s.slug)).text()).includes(`value="${slots[0]}"`)); // the slot is open again
});
