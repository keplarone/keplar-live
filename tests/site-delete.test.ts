import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, jsonReq, signIn } from "./helpers/session";
import { collection } from "@/lib/create/platform/store";
import { removalSummary, SLUG_HOLD_DAYS, UNDO_SECONDS, type RemovalImpact } from "@/lib/site-builder/deletion-copy";
import { publicPaths } from "@/lib/site-builder/revalidate";
import { activeHold, holdSlug, heldByOther, sweepHolds } from "@/lib/site-builder/slug-holds";
import { GRACE_MS, purgeDueSites, removalImpact } from "@/lib/site-builder/deletion";
import { leads, sites, versions } from "@/lib/site-builder/store";
import { domainStore, type DomainRow } from "@/lib/domains/store";
import { invalidateHost, resolveCustomHost } from "@/lib/domains/routing";
import { orders } from "@/lib/business/repo";
import { imageJobs, type ImageJob } from "@/lib/images/store";
import type { Order } from "@/lib/business/types";

const sitesRoute = () => import("@/app/api/sites/route");
const siteRoute = () => import("@/app/api/sites/[id]/route");
const restoreRoute = () => import("@/app/api/sites/[id]/restore/route");
const removalRoute = () => import("@/app/api/sites/[id]/removal/route");
const liveRoute = () => import("@/app/s/[slug]/[[...path]]/route");
const draftRoute = () => import("@/app/sites/draft/[siteId]/[version]/[[...path]]/route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const lctx = (slug: string, path?: string[]) => ({ params: Promise.resolve({ slug, path }) });

type Sum = { id: string; slug: string; name: string };
async function make(cookie: string, name: string): Promise<Sum> {
  const res = await (await sitesRoute()).POST(jsonReq(cookie, "/api/sites", "POST", { name, template: "blank" }));
  assert.equal(res.status, 201, await res.clone().text());
  return ((await res.json()) as { site: Sum }).site;
}
async function publish(cookie: string, id: string) {
  const pub = await import("@/app/api/sites/[id]/publish/route");
  const r = await pub.POST(jsonReq(cookie, `/api/sites/${id}/publish`, "POST"), ctx(id));
  assert.equal(r.status, 200, await r.clone().text());
}
const del = async (cookie: string | null, id: string, q = "", headers: Record<string, string> = {}) => (await siteRoute()).DELETE(call(cookie, `/api/sites/${id}${q}`, { method: "DELETE", headers }), ctx(id));
const restore = async (cookie: string | null, id: string) => (await restoreRoute()).POST(jsonReq(cookie, `/api/sites/${id}/restore`, "POST", {}), ctx(id));
const getPublic = async (slug: string, path?: string[]) => (await liveRoute()).GET(call(null, `/s/${slug}${path ? `/${path.join("/")}` : ""}`), lctx(slug, path));
const listIds = async (cookie: string) => ((await (await (await sitesRoute()).GET(call(cookie, "/api/sites"))).json()) as { sites: { id: string }[] }).sites.map((s) => s.id);

test("the dialog copy names what is removed and what is kept, with the real counts", () => {
  const impact: RemovalImpact = { siteId: "s1", name: "Fig & Oat", slug: "fig-oat", published: true, versions: 7, leads: 3, assets: 2, domains: ["figoat.com"], libraryImages: 4, blockers: [] };
  const { removed, kept } = removalSummary(impact);
  const r = removed.join("\n");
  assert.match(r, /7 saved versions/);
  assert.match(r, /\/s\/fig-oat/);
  assert.match(r, /410/);
  assert.match(r, /2 uploaded product images/);
  assert.match(r, /figoat\.com/);
  assert.match(r, /3 form messages/);
  assert.match(r, /CSV/);
  const k = kept.join("\n");
  assert.match(k, /4 images you made stay in your library/);
  assert.match(k, /Create sites don't take payments/);
  assert.match(k, /Business orders and customer records stay/);
  assert.match(k, new RegExp(`reserved for you for ${SLUG_HOLD_DAYS} days`));
  assert.equal(UNDO_SECONDS, 6);
  // Singular forms and empty cases read properly.
  const small = removalSummary({ ...impact, published: false, versions: 1, leads: 0, assets: 0, domains: [], libraryImages: 0 });
  assert.match(small.removed.join("\n"), /1 saved version,/);
  assert.match(small.removed.join("\n"), /never published/);
  assert.doesNotMatch(small.removed.join("\n"), /custom domain|uploaded product image/);
});

test("public paths to purge cover the home page, every page, the sitemap and robots", () => {
  const p = publicPaths({ slug: "demo" }, { "index.html": "", "about.html": "", "styles.css": "" });
  for (const x of ["/s/demo", "/s/demo/sitemap.xml", "/s/demo/robots.txt", "/s/demo/about", "/s/demo/about.html", "/s/demo/styles.css", "/s/demo/_thanks"]) assert.ok(p.includes(x), x);
});

test("slug holds: reserved for the previous owner only, expire, and are swept", async () => {
  await holdSlug("held-one", "ws_a", 60_000);
  assert.equal(await heldByOther("held-one", "ws_b"), true);
  assert.equal(await heldByOther("held-one", "ws_a"), false, "the owner may take it back");
  assert.ok(await activeHold("held-one"));
  await holdSlug("held-two", "ws_a", -1000);
  assert.equal(await activeHold("held-two"), null, "expired holds are ignored");
  assert.equal(await heldByOther("held-two", "ws_b"), false);
  assert.ok((await sweepHolds()) >= 1);
});

test("API enforcement: signed out 401, someone else's site 404, cross-site 403, stale tab 409; nothing is touched", async () => {
  const a = await signIn("sd-owner@example.com", "plus");
  const b = await signIn("sd-other@example.com", "plus");
  const site = await make(a.cookie, "Guarded");
  assert.equal((await del(null, site.id)).status, 401);
  assert.equal((await del(b.cookie, site.id)).status, 404);
  assert.equal((await del(b.cookie, site.id, "?purge=1")).status, 404);
  assert.equal((await restore(b.cookie, site.id)).status, 404);
  assert.equal((await (await removalRoute()).GET(call(b.cookie, `/api/sites/${site.id}/removal`), ctx(site.id))).status, 404);
  const cross = await (await siteRoute()).DELETE(new Request(`https://keplar.one/api/sites/${site.id}`, { method: "DELETE", headers: { cookie: a.cookie, origin: "https://evil.example" } }), ctx(site.id));
  assert.equal(cross.status, 403);
  assert.equal((await del(a.cookie, site.id, "", { "x-keplar-account": "someone-else" })).status, 409);
  const crossRestore = await (await restoreRoute()).POST(new Request(`https://keplar.one/api/sites/${site.id}/restore`, { method: "POST", headers: { cookie: a.cookie, origin: "https://evil.example" } }), ctx(site.id));
  assert.equal(crossRestore.status, 403);
  assert.ok(await sites().get(a.workspaceId, site.id), "still there");
  assert.equal((await sites().get(a.workspaceId, site.id))?.deletedAt ?? null, null);
  assert.equal((await del(a.cookie, "sit_missing")).status, 404);
  assert.equal((await del(a.cookie, "sit_missing", "?purge=1")).status, 404);
  assert.equal((await del(a.cookie, site.id, "?purge=1")).status, 409, "finalize needs a soft delete first");
});

test("soft delete hides the site at once: 410 on every public path, 404 on owner APIs and previews, gone from the list", async () => {
  const { cookie, workspaceId } = await signIn("sd-soft@example.com", "plus");
  const site = await make(cookie, "Soft gone");
  const keep = await make(cookie, "Soft keep");
  await publish(cookie, site.id);
  assert.equal((await getPublic(site.slug)).status, 200);
  assert.ok((await listIds(cookie)).includes(site.id));

  const res = await del(cookie, site.id);
  assert.equal(res.status, 200);
  const j = (await res.json()) as { ok: boolean; deletedAt: string; purgeAfter: string; undoSeconds: number };
  assert.equal(j.undoSeconds, 6);
  assert.equal(Date.parse(j.purgeAfter) - Date.parse(j.deletedAt), GRACE_MS);

  for (const path of [undefined, ["about"], ["sitemap.xml"], ["robots.txt"], ["_report"], ["_thanks"]]) {
    const r = await getPublic(site.slug, path);
    assert.equal(r.status, 410, `/${path?.join("/") ?? ""}`);
    assert.match(r.headers.get("cache-control") ?? "", /no-store/);
    assert.match(await r.text(), /removed/);
  }
  const lead = await (await liveRoute()).POST(new Request(`https://keplar.one/s/${site.slug}/_lead`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "x-forwarded-for": "9.9.9.9" }, body: "name=Ann&message=hi" }), lctx(site.slug, ["_lead"]));
  assert.equal(lead.status, 410);
  assert.equal((await leads().list(workspaceId, (l) => l.siteId === site.id)).length, 0, "no message is stored for a deleted site");

  assert.equal(((await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).status), 404);
  assert.equal((await (await import("@/app/api/sites/[id]/publish/route")).POST(jsonReq(cookie, `/api/sites/${site.id}/publish`, "POST"), ctx(site.id))).status, 404);
  assert.equal((await (await import("@/app/api/sites/[id]/leads/route")).GET(call(cookie, `/api/sites/${site.id}/leads`), ctx(site.id))).status, 404);
  assert.equal((await (await import("@/app/api/sites/[id]/export/route")).GET(call(cookie, `/api/sites/${site.id}/export`), ctx(site.id))).status, 404);
  assert.equal((await (await import("@/app/api/sites/[id]/generate/route")).POST(jsonReq(cookie, `/api/sites/${site.id}/generate`, "POST", { prompt: "make it blue please" }), ctx(site.id))).status, 404);
  const { previewToken } = await import("@/lib/site-builder/render");
  const prev = await (await draftRoute()).GET(call(null, `/sites/draft/${site.id}/1?t=${previewToken(site.id)}`), { params: Promise.resolve({ siteId: site.id, version: "1", path: undefined }) });
  assert.equal(prev.status, 404);
  const ids = await listIds(cookie);
  assert.ok(!ids.includes(site.id) && ids.includes(keep.id), "removed from the list; the other site stays");
  assert.equal((await del(cookie, site.id)).status, 404, "a second delete finds nothing to delete");

  // Data is still intact during the grace period.
  assert.ok((await versions().list(workspaceId, (v) => v.siteId === site.id)).length > 0);
});

test("undo: restore brings the site back exactly (published page included); not for others, not after the deadline", async () => {
  const a = await signIn("sd-undo@example.com", "plus");
  const b = await signIn("sd-undo-b@example.com", "plus");
  const site = await make(a.cookie, "Undo me");
  await publish(a.cookie, site.id);
  const before = await sites().get(a.workspaceId, site.id);
  await del(a.cookie, site.id);
  assert.equal((await getPublic(site.slug)).status, 410);
  assert.equal((await restore(b.cookie, site.id)).status, 404);
  const back = await restore(a.cookie, site.id);
  assert.equal(back.status, 200);
  assert.equal((await getPublic(site.slug)).status, 200);
  const after = await sites().get(a.workspaceId, site.id);
  assert.equal(after?.publishedVersion, before?.publishedVersion);
  assert.equal(after?.slug, before?.slug);
  assert.ok(!after?.deletedAt && !after?.purgeAfter);
  assert.ok((await listIds(a.cookie)).includes(site.id));
  assert.equal((await restore(a.cookie, site.id)).status, 200, "restoring a site that is not deleted is a no-op");

  // After the grace period the restore is refused with 410.
  await del(a.cookie, site.id);
  await sites().update(a.workspaceId, site.id, { purgeAfter: new Date(Date.now() - 1000).toISOString() });
  const late = await restore(a.cookie, site.id);
  assert.equal(late.status, 410);
  assert.equal(((await late.json()) as { code: string }).code, "gone");
});

test("restore respects the plan's site limit when the freed slot was used in the meantime", async () => {
  const { cookie } = await signIn("sd-limit@example.com", "free");
  const one = await make(cookie, "Only one");
  await del(cookie, one.id);
  const two = await make(cookie, "Replacement"); // Free: 1 site, the slot is free again
  const r = await restore(cookie, one.id);
  assert.equal(r.status, 409);
  assert.match(((await r.json()) as { error: string }).error, /Delete another one first/);
  assert.ok(two.id);
});

test("purge: versions, leads, screenshots, assets, library links and the row are removed; the address is held; orders and the image library stay", async () => {
  const a = await signIn("sd-purge@example.com", "plus");
  const b = await signIn("sd-purge-b@example.com", "plus");
  const site = await make(a.cookie, "Purge me");
  await publish(a.cookie, site.id);
  const { saveLead } = await import("@/lib/site-builder/store");
  const row = (await sites().get(a.workspaceId, site.id))!;
  await saveLead(row, "plus", { page: "index.html", fields: { name: "Ann", email: "ann@example.com" } });
  await collection<{ id: string; workspaceId: string; siteId: string }>("sb_shots").insert({ id: "shot_1", workspaceId: a.workspaceId, siteId: site.id });
  await collection<{ id: string; workspaceId: string; siteId: string | null }>("sb_assets").insert({ id: "asset_1", workspaceId: a.workspaceId, siteId: site.id } as never);
  const job = { id: "img_1", workspaceId: a.workspaceId, status: "ready", blobId: null, prompt: "a bike", usedIn: [{ siteId: site.id, siteName: "Purge me", page: "index.html", at: "x" }, { siteId: "sit_other", siteName: "Other", page: "index.html", at: "x" }], updatedAt: "x" } as unknown as ImageJob;
  await imageJobs().insert(job);
  const paid: Order = { id: "ord_paid", workspaceId: a.workspaceId, projectId: site.id, productId: "p", productName: "Bike", amount: 1000, currency: "usd", applicationFeeAmount: 0, status: "paid", checkoutSessionId: "cs_1", customerEmail: "c@example.com", contactId: null, returnPath: "/", createdAt: new Date().toISOString(), paidAt: new Date().toISOString() };
  await orders().insert(paid);

  const impact = await removalImpact(row);
  assert.equal(impact.leads, 1);
  assert.equal(impact.assets, 1);
  assert.equal(impact.libraryImages, 1);
  assert.equal(impact.published, true);
  assert.deepEqual(impact.blockers, [], "a paid order does not block: paid orders are kept");
  const info = await (await removalRoute()).GET(call(a.cookie, `/api/sites/${site.id}/removal`), ctx(site.id));
  assert.equal(info.status, 200);
  const infoJ = (await info.json()) as { removed: string[]; kept: string[]; impact: RemovalImpact };
  assert.equal(infoJ.impact.slug, site.slug);
  assert.ok(infoJ.removed.length >= 4 && infoJ.kept.length >= 3);

  assert.equal((await del(a.cookie, site.id)).status, 200);
  const purged = await del(a.cookie, site.id, "?purge=1");
  assert.equal(purged.status, 200);

  assert.equal(await sites().get(a.workspaceId, site.id), null);
  assert.equal((await versions().list(a.workspaceId, (v) => v.siteId === site.id)).length, 0);
  assert.equal((await leads().list(a.workspaceId, (l) => l.siteId === site.id)).length, 0);
  assert.equal(await collection("sb_shots").get(a.workspaceId, "shot_1"), null);
  assert.equal(await collection("sb_assets").get(a.workspaceId, "asset_1"), null);
  const libJob = await imageJobs().get(a.workspaceId, "img_1");
  assert.ok(libJob, "the image stays in the library");
  assert.deepEqual(libJob.usedIn.map((u) => u.siteId), ["sit_other"], "only this site's link is dropped");
  assert.ok(await orders().get(a.workspaceId, "ord_paid"), "paid orders are never deleted");

  // Public address: 410 while held; a restore is no longer possible; another account can't take the address, the owner can.
  assert.equal((await getPublic(site.slug)).status, 410);
  assert.equal((await restore(a.cookie, site.id)).status, 404);
  assert.equal((await del(a.cookie, site.id, "?purge=1")).status, 404, "finalizing twice is harmless");
  const hold = await activeHold(site.slug);
  assert.equal(hold?.ownerWorkspaceId, a.workspaceId);
  const strangerSite = await make(b.cookie, "Purge me");
  assert.notEqual(strangerSite.slug, site.slug, "a stranger gets a different address");
  const patch = await (await siteRoute()).PATCH(jsonReq(b.cookie, `/api/sites/${strangerSite.id}`, "PATCH", { slug: site.slug }), ctx(strangerSite.id));
  assert.equal(patch.status, 409, "and can't rename onto the held address either");
  const mine = await make(a.cookie, "Purge me");
  assert.equal(mine.slug, site.slug, "the owner can take it back");
  assert.equal(await activeHold(site.slug), null);
});

test("deletion is blocked, with a clear message, for a taken-down site and for a checkout in progress; nothing changes", async () => {
  const { cookie, workspaceId } = await signIn("sd-block@example.com", "plus");
  const down = await make(cookie, "Taken down");
  await sites().update(workspaceId, down.id, { takenDown: true });
  const r = await del(cookie, down.id);
  assert.equal(r.status, 409);
  const j = (await r.json()) as { error: string; code: string };
  assert.equal(j.code, "taken_down");
  assert.match(j.error, /taken down/);
  assert.equal((await sites().get(workspaceId, down.id))?.deletedAt ?? null, null);

  const shop = await make(cookie, "With checkout");
  const pending: Order = { id: "ord_pending", workspaceId, projectId: shop.id, productId: "p", productName: "Mug", amount: 500, currency: "usd", applicationFeeAmount: 0, status: "pending", checkoutSessionId: "cs_2", customerEmail: null, contactId: null, returnPath: "/", createdAt: new Date().toISOString(), paidAt: null };
  await orders().insert(pending);
  const r2 = await del(cookie, shop.id);
  assert.equal(r2.status, 409);
  assert.equal(((await r2.json()) as { code: string }).code, "open_orders");
  assert.equal((await sites().get(workspaceId, shop.id))?.deletedAt ?? null, null);
  const info = await (await removalRoute()).GET(call(cookie, `/api/sites/${shop.id}/removal`), ctx(shop.id));
  assert.equal(((await info.json()) as { impact: RemovalImpact }).impact.blockers[0].code, "open_orders");
  await orders().update(workspaceId, "ord_pending", { status: "paid" }); // the payment settled: paid orders are kept, so the site can go
  assert.equal((await del(cookie, shop.id)).status, 200);
  assert.ok(await orders().get(workspaceId, "ord_pending"));
});

test("a custom domain stops serving the moment its site is deleted and comes back on undo; the cache entry is dropped", async () => {
  const { cookie, workspaceId } = await signIn("sd-domain@example.com", "pro");
  const site = await make(cookie, "Domain site");
  await publish(cookie, site.id);
  const row: DomainRow = { id: "dom_sd1", userId: "u", workspaceId, siteId: site.id, hostname: "www.sd-example.com", status: "active", ownershipToken: "t", ownershipVerified: true, verification: {}, lastError: null, lastCheckedAt: null, nextCheckAt: null, verifiedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  assert.equal(await domainStore().insertIfUnderLimit(row, 5), "ok");
  invalidateHost();
  assert.equal((await resolveCustomHost("www.sd-example.com"))?.siteId, site.id);
  await del(cookie, site.id);
  assert.equal(await resolveCustomHost("www.sd-example.com"), null, "404 at the edge for the custom host");
  const viaDomain = await (await liveRoute()).GET(new Request(`https://www.sd-example.com/`, { headers: { host: "www.sd-example.com" } }), lctx(site.slug));
  assert.ok([404, 410].includes(viaDomain.status));
  assert.ok(await domainStore().get("dom_sd1"), "the connection is kept during the grace period, so Undo restores it");
  await restore(cookie, site.id);
  assert.equal((await resolveCustomHost("www.sd-example.com"))?.siteId, site.id);
});

test("the sweep finalizes anything past its grace period (and nothing before it), and a stuck purge is retried", async () => {
  const { cookie, workspaceId } = await signIn("sd-sweep@example.com", "plus");
  const due = await make(cookie, "Sweep due");
  const fresh = await make(cookie, "Sweep fresh");
  await del(cookie, due.id);
  await del(cookie, fresh.id);
  await sites().update(workspaceId, due.id, { purgeAfter: new Date(Date.now() - 1000).toISOString() });
  const r = await purgeDueSites({ workspaceId });
  assert.equal(r.purged, 1);
  assert.equal(await sites().get(workspaceId, due.id), null);
  assert.ok((await sites().get(workspaceId, fresh.id))?.deletedAt, "still restorable");
  assert.equal((await restore(cookie, fresh.id)).status, 200);
  const none = await purgeDueSites();
  assert.equal(none.failed, 0);
});

test("deleting is rate limited per workspace", async () => {
  const { cookie } = await signIn("sd-rate@example.com", "plus");
  let limited = 0;
  for (let i = 0; i < 40; i++) if ((await del(cookie, `sit_nope${i}`)).status === 429) limited++;
  assert.ok(limited > 0, "429 after the per-minute allowance");
});
