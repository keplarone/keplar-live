import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { applyFiles, changeStats, docFiles, docFromUpdates, filesOf, fromB64, pushTerm, seedUpdate, spanDiff, termOf, toB64 } from "@/lib/collab/doc";
import { diffFor, maybeCompact, MemoryRelay, roomState, COMPACT_AT } from "@/lib/collab/relay";
import { collabCan, colorFor, fromTeamRole, PRESENCE_COLORS } from "@/lib/collab/roles";
import { signRoomToken, verifyRoomToken } from "@/lib/collab/transport";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import { addVersion, createSite, getVersion, sites } from "@/lib/site-builder/store";
import { openRoom, saveSession, splitOff, liveFiles, roomFor, branchesOf } from "@/lib/collab/session";
import { createInvite, grants, redeemInvite, resolveAccess, revokeInvite, invites } from "@/lib/collab/access";

const FILES = { "index.html": "<!doctype html><html lang=\"en\"><head><title>Tide</title></head><body><main><h1>Tide tables</h1></main></body></html>", "styles.css": "body { color: #111; }\n" };
const peer = (seed: Uint8Array) => { const d = new Y.Doc(); Y.applyUpdate(d, seed); return d; };
const sync = (a: Y.Doc, b: Y.Doc) => { const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)); const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)); Y.applyUpdate(b, ua); Y.applyUpdate(a, ub); };

test("CRDT: concurrent edits in the same file merge without conflicts and converge on every peer", () => {
  const seed = seedUpdate(FILES, 1);
  const a = peer(seed), b = peer(seed), c = peer(seed);
  const ta = filesOf(a).get("styles.css")!, tb = filesOf(b).get("styles.css")!, tc = filesOf(c).get("styles.css")!;
  ta.insert(0, "/* Ana */\n");                         // start of file
  tb.insert(tb.length, "h1 { font-size: 40px; }\n");  // end of file
  tc.delete(7, 5); tc.insert(7, "color: #0b0b0d;");   // middle, overlapping region rewrite
  // same position, same moment: both inserts survive, in a deterministic order
  filesOf(a).get("index.html")!.insert(0, "A");
  filesOf(b).get("index.html")!.insert(0, "B");
  sync(a, b); sync(b, c); sync(a, c);
  const fa = docFiles(a), fb = docFiles(b), fc = docFiles(c);
  assert.deepEqual(fa, fb);
  assert.deepEqual(fb, fc);
  assert.ok(fa["styles.css"].startsWith("/* Ana */"));
  assert.ok(fa["styles.css"].includes("h1 { font-size: 40px; }"));
  assert.ok(fa["styles.css"].includes("color: #0b0b0d;"));
  assert.ok(/^(AB|BA)<!doctype/.test(fa["index.html"]));
});

test("CRDT: updates delivered out of order, duplicated, or batched still converge (idempotent, commutative)", () => {
  const seed = seedUpdate(FILES, 1);
  const a = peer(seed);
  const ups: Uint8Array[] = [];
  a.on("update", (u: Uint8Array) => ups.push(u));
  const t = filesOf(a).get("index.html")!;
  for (let i = 0; i < 20; i++) t.insert(Math.floor(t.length / 2), `x${i}`);
  const b = peer(seed);
  for (const u of [...ups].reverse()) Y.applyUpdate(b, u);
  for (const u of ups.slice(0, 5)) Y.applyUpdate(b, u); // duplicates
  const c = peer(seed);
  Y.applyUpdate(c, Y.mergeUpdates(ups));
  assert.equal(docFiles(b)["index.html"], docFiles(a)["index.html"]);
  assert.equal(docFiles(c)["index.html"], docFiles(a)["index.html"]);
});

test("seeding is deterministic: two servers seeding the same room at once cannot duplicate a file", () => {
  const s1 = seedUpdate(FILES, 4), s2 = seedUpdate(FILES, 4);
  assert.deepEqual(s1, s2);
  const d = docFromUpdates([s1, s2]);
  assert.deepEqual(docFiles(d), FILES);
  assert.equal(toB64(fromB64(toB64(s1))), toB64(s1));
});

test("applyFiles: a new version lands as minimal edits, so a collaborator's concurrent edit elsewhere survives", () => {
  const seed = seedUpdate(FILES, 1);
  const a = peer(seed), b = peer(seed);
  assert.deepEqual(spanDiff("hello world", "hello brave world"), { at: 6, del: 0, ins: "brave " });
  applyFiles(a, { ...FILES, "styles.css": "body { color: #222; }\n", "app.js": "export {};\n" });
  filesOf(b).get("index.html")!.insert(FILES["index.html"].indexOf("</main>"), "<p>Live edit</p>");
  sync(a, b);
  const f = docFiles(a);
  assert.equal(f["styles.css"], "body { color: #222; }\n");
  assert.equal(f["app.js"], "export {};\n");
  assert.ok(f["index.html"].includes("<p>Live edit</p>"));
  assert.deepEqual(changeStats(FILES, f).map((x) => [x.path, x.status]), [["app.js", "added"], ["index.html", "modified"], ["styles.css", "modified"]]);
});

test("shared terminal: lines from every peer merge into one log, capped", () => {
  const seed = seedUpdate(FILES, 1);
  const a = peer(seed), b = peer(seed);
  pushTerm(a, [{ by: "Ana", color: "#f2a541", kind: "cmd", text: "check" }]);
  pushTerm(b, [{ by: "Ben", color: "#3ccf91", kind: "cmd", text: "save" }]);
  sync(a, b);
  assert.deepEqual(termOf(a).toArray().map((l) => l.text).sort(), ["check", "save"]);
  assert.deepEqual(termOf(a).toArray(), termOf(b).toArray());
});

test("relay: append/since cursor, exact catch-up by state vector, compaction keeps the state", async () => {
  const r = new MemoryRelay();
  const room = `t:${Math.random()}`;
  assert.equal(await r.claimRoom(room, 1), true);
  assert.equal(await r.claimRoom(room, 1), false, "only one claimer seeds");
  await r.append(room, "seed", seedUpdate(FILES, 1));
  const a = docFromUpdates([(await roomState(room, r)).update]);
  a.on("update", (u: Uint8Array) => { void r.append(room, "a", u); });
  for (let i = 0; i < COMPACT_AT + 5; i++) filesOf(a).get("styles.css")!.insert(0, ".");
  await new Promise((res) => setTimeout(res, 10));
  const rows = await r.since(room, 0);
  assert.ok(rows.length > COMPACT_AT);
  // a peer that already has half the edits gets exactly the rest
  const half = docFromUpdates(rows.slice(0, 50).map((x) => x.data));
  const { update } = await diffFor(room, Y.encodeStateVector(half), r);
  Y.applyUpdate(half, update);
  assert.equal(docFiles(half)["styles.css"], docFiles(a)["styles.css"]);
  assert.equal(await maybeCompact(room, r), true);
  assert.equal((await r.since(room, 0)).length, 1);
  assert.equal(docFiles(docFromUpdates([(await roomState(room, r)).update]))["styles.css"], docFiles(a)["styles.css"]);
  assert.equal(await r.casBase(room, 1, 2), true);
  assert.equal(await r.casBase(room, 1, 3), false, "compare-and-set: one re-base wins");
  await r.putAwareness(room, "a", { file: "index.html" });
  assert.equal((await r.awareness(room)).length, 1);
  await r.putAwareness(room, "a", null);
  assert.equal((await r.awareness(room)).length, 0);
});

test("roles: team roles map to collab roles; viewers watch, editors edit, admins invite and deploy", () => {
  assert.equal(fromTeamRole("member"), "editor");
  assert.ok(collabCan("viewer", "view") && !collabCan("viewer", "edit"));
  assert.ok(collabCan("editor", "edit") && collabCan("editor", "split") && !collabCan("editor", "invite") && !collabCan("editor", "deploy"));
  assert.ok(collabCan("admin", "invite") && collabCan("admin", "deploy") && collabCan("owner", "deploy"));
  assert.equal(colorFor("user_1"), colorFor("user_1"));
  assert.ok(PRESENCE_COLORS.includes(colorFor("someone") as (typeof PRESENCE_COLORS)[number]));
});

test("websocket room token: HS256 JWT verifiable by any JWT library, expires, tamper-proof", () => {
  const { token } = signRoomToken("s3cret", { room: "site:x", sub: "u1", role: "viewer" }, 60, Date.UTC(2026, 9, 6));
  const c = verifyRoomToken("s3cret", token, Date.UTC(2026, 9, 6) + 1000);
  assert.equal(c?.role, "viewer");
  assert.equal(verifyRoomToken("wrong", token, Date.UTC(2026, 9, 6)), null);
  assert.equal(verifyRoomToken("s3cret", token, Date.UTC(2026, 9, 6) + 61_000), null);
  const [h, p, s] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "owner" })).toString("base64url");
  assert.equal(verifyRoomToken("s3cret", `${h}.${forged}.${s}`, Date.UTC(2026, 9, 6)), null);
});

const wsFor = (id: string, plan: "free" | "pro" = "pro"): Workspace => ({ id, name: id, plan, verified: true, entitlements: ENTITLEMENTS[plan], anonymous: false, admin: false, userId: `u_${id}`, email: `${id}@example.com`, period: { start: "", end: "" } });

test("session: seed from head, live edits, save as a version, auto re-base when clean, 'behind' when dirty, pull, split off", async () => {
  const relay = new MemoryRelay();
  const owner = wsFor("ws_owner_a");
  let site = await createSite(owner, { name: "Tide" });
  site = (await addVersion(owner, site, FILES, { kind: "edit", summary: "v1", prompt: "", model: null, units: 0 })).site;
  const o1 = await openRoom(site, {}, relay);
  assert.equal(o1.base, 1);
  assert.deepEqual(await liveFiles(site.id, relay), FILES);
  // a collaborator edits through the relay
  const st = await roomState(roomFor(site.id), relay);
  const doc = docFromUpdates([st.update]);
  const sv = Y.encodeStateVector(doc);
  filesOf(doc).get("styles.css")!.insert(0, "h1 { margin: 0; }\n");
  await relay.append(roomFor(site.id), "peer", Y.encodeStateAsUpdate(doc, sv));
  await new Promise((r) => setTimeout(r, 1100)); // liveFiles cache
  const saved = await saveSession(site, "pro", { message: "Tighter header", by: "Ana", contributors: ["Ben"] }, relay);
  assert.equal(saved.version, 2);
  const v2 = await getVersion(saved.site, 2);
  assert.ok(v2!.files["styles.css"].startsWith("h1 { margin: 0; }"));
  // the saved (normalized) version is written back, so the room is clean again
  const clean = await openRoom(saved.site, {}, relay);
  assert.equal(clean.base, 2);
  assert.equal(clean.dirty, false);
  assert.match(v2!.summary, /Tighter header — Ana, Ben/);
  await assert.rejects(saveSession(saved.site, "pro", { by: "Ana" }, relay), /Nothing changed/);
  // a new version made outside (AI refine) while nobody has unsaved edits → the room moves onto it
  site = (await sites().get(owner.id, site.id))!;
  site = (await addVersion(owner, site, { ...v2!.files, "styles.css": "body { color: #000; }\n" }, { kind: "ai", summary: "refine", prompt: "", model: null, units: 0 })).site;
  const o2 = await openRoom(site, {}, relay);
  assert.equal(o2.base, 3);
  assert.equal(o2.behind, false);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await liveFiles(site.id, relay))!["styles.css"], "body { color: #000; }\n");
  // now someone has unsaved edits and another version lands → behind, until pull
  const st2 = await roomState(roomFor(site.id), relay);
  const d2 = docFromUpdates([st2.update]);
  const sv2 = Y.encodeStateVector(d2);
  filesOf(d2).get("index.html")!.insert(0, "<!-- wip -->");
  await relay.append(roomFor(site.id), "peer", Y.encodeStateAsUpdate(d2, sv2));
  site = (await addVersion(owner, site, { ...FILES }, { kind: "ai", summary: "again", prompt: "", model: null, units: 0 })).site;
  const o3 = await openRoom(site, {}, relay);
  assert.equal(o3.behind, true);
  assert.equal(o3.dirty, true);
  const o4 = await openRoom(site, { pull: true }, relay);
  assert.equal(o4.base, 4);
  assert.equal(o4.behind, false);
  // split off into someone else's workspace: own creation, own history, branch record on both sides
  const guest = wsFor("ws_guest_b");
  const { site: child, branch } = await splitOff(site, guest, { by: "u_guest", byName: "Ben Ito" }, relay);
  assert.equal(child.workspaceId, guest.id);
  assert.equal(child.duplicatedFrom, site.id);
  assert.equal(branch.baseVersion, 4);
  assert.equal((await branchesOf(site)).length, 1);
  assert.equal((await branchesOf(child)).length, 1);
});

test("access + invites: owner, link invite with role, viewer is read-only, revoke removes access, expiry and caps", async () => {
  const owner = wsFor("ws_owner_c");
  const site = await createSite(owner, { name: "Shared" });
  const ana = { id: "u_ana", email: "ana@example.com", name: "Ana", verified: true };
  const ben = { id: "u_ben", email: "ben@example.com", name: "Ben", verified: true };
  const cy = { id: "u_cy", email: "cy@example.com", name: "Cy", verified: false };
  const a = await resolveAccess(ana, site.id, [{ id: owner.id }]);
  assert.equal(a.role, "owner");
  await assert.rejects(resolveAccess(ben, site.id, [{ id: "ws_ben" }]), /Not found/);
  const team = await resolveAccess(ben, site.id, [{ id: owner.id, team: { role: "viewer" } }]);
  assert.equal(team.role, "viewer");
  const { token, invite } = await createInvite(a, { role: "editor", days: 7, maxUses: 1 });
  await assert.rejects(createInvite(team, { role: "editor" }), /can't invite/);
  await assert.rejects(redeemInvite(cy, site.id, token, []), /Verify your email/);
  await assert.rejects(redeemInvite(ben, site.id, "x".repeat(43), []), /isn't valid/);
  const joined = await redeemInvite(ben, site.id, token, [{ id: "ws_ben" }]);
  assert.equal(joined.role, "editor");
  assert.equal(joined.via, "invite");
  const zed = { id: "u_zed", email: "z@example.com", name: "Zed", verified: true };
  await assert.rejects(redeemInvite(zed, site.id, token, []), /used up/);
  const v = await createInvite(a, { role: "viewer" });
  const viewer = await redeemInvite(zed, site.id, v.token, []);
  assert.equal(viewer.role, "viewer");
  assert.ok(!collabCan(viewer.role, "edit"));
  await revokeInvite(a, invite.id);
  await assert.rejects(resolveAccess(ben, site.id, [{ id: "ws_ben" }]), /Not found/);
  assert.equal(await grants().get(owner.id, `${site.id}:${ben.id}`), null);
  const exp = await createInvite(a, { role: "viewer" });
  await invites().update(owner.id, exp.invite.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  const late = { id: "u_late", email: "l@example.com", name: "Late", verified: true };
  await assert.rejects(redeemInvite(late, site.id, exp.token, []), /expired/);
});
