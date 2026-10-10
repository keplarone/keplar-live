import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPrefs, prefsBlock, sanitizePrefs } from "@/lib/personalize/prefs";
import { mapXResponse, xQueryFrom } from "@/lib/providers/x-posts";
import { addSegment, recordingDraft, RECORD_LIMITS, stamp, type Segment } from "@/lib/voice/record";
import { createSpecialist, listSpecialists } from "@/lib/personalize/specialists";
import { copySpecialistShare, createSpecialistShare, liveSpecialistSharesOf, openSpecialistShare, publicView, revokeSpecialistShare, SpecialistShareLimitError, SPECIALIST_SHARE_LIMITS } from "@/lib/personalize/specialist-share";
import { isShareViewPath } from "@/lib/growth/share-guard";
import { USER_COLLECTIONS } from "@/lib/privacy/account-data";

test("location: typed only, one line, capped, used when place matters, and withheld on Free like 'About you'", () => {
  const p = sanitizePrefs({ location: "Austin,\nTexas " + "x".repeat(300) });
  assert.ok(typeof p === "object");
  assert.ok(!p.location!.includes("\n"));
  assert.equal(p.location!.length <= 120, true);
  const prefs = { ...emptyPrefs("ws"), location: "Austin, Texas" };
  assert.match(prefsBlock(prefs, { withholdPersonal: false }), /Where they are[\s\S]*Austin, Texas/);
  assert.equal(prefsBlock(prefs, { withholdPersonal: true }), "", "Free: nothing else set, so no block at all");
  assert.equal(prefsBlock({ ...prefs, enabled: false }, { withholdPersonal: false }), "");
  assert.equal(prefsBlock({ ...emptyPrefs("ws") }, { withholdPersonal: false }), "", "old rows without location still work");
});

test("posts on X: a starting search from the question, and links only from real handles and ids", () => {
  assert.equal(xQueryFrom("What are people saying about the new Pixel 11 launch today?"), "pixel launch");
  assert.equal(xQueryFrom("#OpenSource and @keplar news https://example.com/x"), "#opensource @keplar news");
  assert.equal(xQueryFrom("the and for"), "");
  const posts = mapXResponse({ data: [{ id: "12", text: "a", author_id: "u" }, { id: "../evil", text: "b" }], includes: { users: [{ id: "u", username: "bad/../name", name: "B" }] } });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://x.com/i/web/status/12");
  assert.equal(posts[0].author, null);
});

test("record notes: timestamps, merged lines, a size cap, and a draft that says how to get notes", () => {
  assert.equal(stamp(0), "00:00");
  assert.equal(stamp(65_000), "01:05");
  assert.equal(stamp(3_725_000), "1:02:05");
  let segs: Segment[] = [];
  segs = addSegment(segs, 1000, " hello  ");
  segs = addSegment(segs, 5000, "world");
  segs = addSegment(segs, 40_000, "next topic");
  segs = addSegment(segs, 41_000, "   ");
  assert.deepEqual(segs, [{ atMs: 1000, text: "hello world" }, { atMs: 40_000, text: "next topic" }]);
  const full = addSegment([{ atMs: 0, text: "x".repeat(RECORD_LIMITS.maxChars) }], 99_000, "more");
  assert.equal(full.length, 1, "stops adding at the cap");
  const d = recordingDraft(segs, new Date("2026-10-06T21:00:00-04:00"), 125_000, "en-US");
  assert.match(d.title, /^Recording, /);
  assert.match(d.markdown, /\(2 min\)/);
  assert.match(d.markdown, /\[00:01\] hello world/);
  assert.match(d.markdown, /\[00:40\] next topic/);
  assert.match(d.markdown, /action items/);
  assert.match(recordingDraft([], new Date(), 0).markdown, /Nothing was transcribed/);
});

test("specialist links: snapshot, notes only when chosen, copy into another account, revoke, limits", async () => {
  const owner = `ws_owner_${Date.now()}`;
  const other = `ws_other_${Date.now()}`;
  const sp = await createSpecialist(owner, { name: "Contract reviewer", description: "Reads NDAs", instructions: "Flag unusual clauses.", knowledge: "Our policy: no non-competes.", starters: ["Review this NDA"] }, { paid: true });
  const plain = await createSpecialistShare(sp, { includeNotes: false });
  assert.equal(plain.knowledge, "");
  assert.equal(plain.includesNotes, false);
  const withNotes = await createSpecialistShare(sp, { includeNotes: true });
  assert.equal(publicView(withNotes).knowledge, "Our policy: no non-competes.");
  assert.ok(!("workspaceId" in publicView(withNotes)), "the public view never names the owner's workspace");
  const opened = await openSpecialistShare(plain.token, { count: true });
  assert.equal(opened?.name, "Contract reviewer");
  assert.equal(await openSpecialistShare("not-a-token"), null);
  const copy = await copySpecialistShare(plain.token, other, { paid: false });
  assert.ok(copy && copy.workspaceId === other && copy.id !== sp.id);
  assert.equal(copy!.knowledge, "", "notes weren't shared, so the copy has none");
  assert.equal((await listSpecialists(other)).length, 1);
  assert.equal((await listSpecialists(owner)).length, 1, "the original is untouched");
  assert.equal(await revokeSpecialistShare(other, plain.token), false, "only the owner can revoke");
  assert.equal(await revokeSpecialistShare(owner, plain.token), true);
  assert.equal(await openSpecialistShare(plain.token), null);
  assert.equal(await copySpecialistShare(plain.token, other, { paid: false }), null);
  assert.equal((await liveSpecialistSharesOf(owner)).length, 1);
  const expired = await createSpecialistShare(sp, { includeNotes: false }, Date.now() - (SPECIALIST_SHARE_LIMITS.days + 1) * 864e5);
  assert.equal(await openSpecialistShare(expired.token), null);
  for (let i = 0; i < SPECIALIST_SHARE_LIMITS.perHour - 2; i++) await createSpecialistShare(sp, { includeNotes: false });
  await assert.rejects(createSpecialistShare(sp, { includeNotes: false }), SpecialistShareLimitError);
});

test("specialist links are rate-limited public views and are exported/deleted with the account", () => {
  assert.equal(isShareViewPath("/sp/abcdefghijklmnopqrstuvwx"), true);
  assert.equal(isShareViewPath("/sp"), false);
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("specialist_shares"));
});
