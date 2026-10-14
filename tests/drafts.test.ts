import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRAFT_MAX, DRAFT_MAX_CHARS, DRAFT_TTL_MS, draftKeyFor, readDraft, writeDraft } from "@/components/app-ui/drafts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("a chat's draft comes back; blank text forgets it; other chats and other accounts don't see it", () => {
  const s = mem();
  const a = draftKeyFor("user:1", "t1", false)!;
  writeDraft(a, "Half-written question about the lease", s);
  assert.equal(readDraft(a, s), "Half-written question about the lease");
  assert.equal(readDraft(draftKeyFor("user:1", "t2", false)!, s), null, "another chat");
  assert.equal(readDraft(draftKeyFor("user:2", "t1", false)!, s), null, "another account on the same browser");
  writeDraft(a, "   ", s);
  assert.equal(readDraft(a, s), null, "sent or cleared: gone");
});

test("nothing is kept for private chats or before the account on screen is known", () => {
  assert.equal(draftKeyFor("user:1", "t1", true), null);
  assert.equal(draftKeyFor("pending", "t1", false), null);
  assert.equal(draftKeyFor("anon", null, false), "anon|new");
});

test("bounded: text capped, oldest drafts dropped past the cap, expired after 7 days", () => {
  const s = mem();
  writeDraft("k", "x".repeat(DRAFT_MAX_CHARS + 500), s);
  assert.equal(readDraft("k", s)?.length, DRAFT_MAX_CHARS);
  for (let i = 0; i < DRAFT_MAX + 5; i++) writeDraft(`k${i}`, `draft ${i}`, s, 1_000 + i);
  assert.equal(readDraft("k0", s, 2_000), null, "the oldest are dropped");
  assert.equal(readDraft(`k${DRAFT_MAX + 4}`, s, 2_000), `draft ${DRAFT_MAX + 4}`);
  writeDraft("old", "kept for now", s, 10_000);
  assert.equal(readDraft("old", s, 10_000 + DRAFT_TTL_MS + 1), null, "expired");
});

test("wiring: the composer's draft key is per chat (a new chat included) and private-aware", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /draftKey=\{draftKeyFor\(state\.scope, state\.activeThreadId, /);
  const composer = readFileSync("src/components/app-ui/Composer.tsx", "utf8");
  assert.match(composer, /writeDraft\(draftFor\.current, textRef\.current\)/, "switching chats keeps the last keystrokes");
});
