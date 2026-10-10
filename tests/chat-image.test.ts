import "./setup";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installHfFake, HF_HOST, HF_TEST_KEY, PNG_1PX } from "./helpers/hf-fake";
import { call, jsonReq, signIn } from "./helpers/session";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
process.env.KEPLAR_HIGGSFIELD_BASE = HF_HOST;

import { detectImageIntent } from "@/lib/images/chat-intent";
import { AUTO_UNITS, blockedFrom, checkSources, fetchStored, followUpPrompt, ImgError, needsApproval, quote, startImage, uploadSources, waitForJob } from "@/lib/images/chat-flow";
import { imageJobs } from "@/lib/images/store";
import { IMAGE_LIMITS, estimateImage } from "@/lib/images/config";
import { usedThisPeriod } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { initialState, reducer, settleImage } from "@/components/app-ui/state/store";
import type { KeplarMessage, Thread } from "@/components/app-ui/state/types";

/* The browser's relative fetches go to the real route handlers, as the signed-in person (or nobody). */
let cookie: string | null = null;
const fake = installHfFake();
const upstream = globalThis.fetch;
const router = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("/api/")) return upstream(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const mk = () => (method === "GET" ? call(cookie, url) : jsonReq(cookie, url, method, body));
  const id = /^\/api\/images\/([^/?]+)/.exec(url)?.[1];
  const ctx = id ? { params: Promise.resolve({ id }) } : undefined;
  if (url === "/api/images/estimate") return (await import("@/app/api/images/estimate/route")).POST(mk());
  if (url === "/api/images") return method === "POST" ? (await import("@/app/api/images/route")).POST(mk()) : (await import("@/app/api/images/route")).GET(mk());
  if (id && /\/file(\?|$)/.test(url)) return (await import("@/app/api/images/[id]/file/route")).GET(mk(), ctx!);
  if (id) return (await import("@/app/api/images/[id]/route")).GET(mk(), ctx!);
  if (url === "/api/create/media/reference") return (await import("@/app/api/create/media/reference/route")).POST(mk());
  return new Response("not found", { status: 404 });
}) as typeof fetch;

before(() => { globalThis.fetch = router; });
after(() => { globalThis.fetch = upstream; fake.restore(); });
beforeEach(() => { fake.reset(); process.env.HIGGSFIELD_API = HF_TEST_KEY; delete process.env.OPENAI_API_KEY; cookie = null; });

const png = () => new File([new Uint8Array(PNG_1PX)], "me.png", { type: "image/png" });

/* ── intent ── */

test("intent: clear requests to make a picture are detected and unwrapped; talk about pictures is not", () => {
  const yes: [string, string][] = [
    ["Draw me an image of a fox in the snow", "a fox in the snow"],
    ["generate an image of a red bicycle at sunset", "a red bicycle at sunset"],
    ["Can you please draw a cat wearing a hat?", "a cat wearing a hat"],
    ["make a logo for my bakery", "a logo for my bakery"],
    ["Hey Keplar, make me a picture of a quiet harbor at dawn", "a quiet harbor at dawn"],
    ["show me a photo of a corgi on the moon", "a photo of a corgi on the moon"],
    ["I want you to paint a sunset over the sea", "a sunset over the sea"],
    ["draw a dragon", "a dragon"],
  ];
  for (const [text, prompt] of yes) assert.equal(detectImageIntent(text)?.prompt, prompt, text);
  const no = [
    "how do I generate an image in python?", "draw a conclusion from this data", "What is a good prompt for midjourney?", "make an image", "generate a picture of",
    "draw a diagram of the water cycle", "explain how to draw a face", "write a story about a fox", "create a website for my bakery", "make a chart of sales",
    "draw the line between wants and needs", "Can you describe this image?", "what is an image sensor", "write code that will generate an image of a fox",
  ];
  for (const t of no) assert.equal(detectImageIntent(t), null, t);
});

test("intent: shape words, several requested, and an attached picture", () => {
  assert.equal(detectImageIntent("create a poster about jazz night, vertical")?.size, "1024x1536");
  assert.equal(detectImageIntent("draw a square logo of a leaf")?.size, "1024x1024");
  assert.equal(detectImageIntent("generate 4 images of a castle")?.asked, 4);
  assert.equal(detectImageIntent("draw a castle")?.asked, undefined);
  // With a picture attached: change it / make something from it. A question about it stays a question.
  assert.deepEqual(detectImageIntent("make this photo look like a watercolor", { hasImage: true })?.edit, true);
  assert.equal(detectImageIntent("turn this picture into an oil painting", { hasImage: true })?.edit, true);
  assert.equal(detectImageIntent("remove the car from this photo", { hasImage: true })?.edit, true);
  assert.equal(detectImageIntent("what is in this picture", { hasImage: true }), null);
  assert.equal(detectImageIntent("describe this image", { hasImage: true }), null);
  assert.equal(detectImageIntent("draw a fox in the style of this image", { hasImage: true })?.edit, true);
  // Without a picture attached, "this photo" has nothing to edit.
  assert.equal(detectImageIntent("make this photo look like a watercolor"), null);
});

test("approval: a cheap picture starts at once, a costly one or any reference asks first", () => {
  assert.ok(estimateImage("high", "1536x1024", false, "hf/z-image/turbo").units <= AUTO_UNITS);
  assert.equal(needsApproval(9, false), false);
  assert.equal(needsApproval(AUTO_UNITS, false), false);
  assert.equal(needsApproval(AUTO_UNITS + 1, false), true);
  assert.equal(needsApproval(9, true), true);
  assert.ok(estimateImage("high", "1536x1024", true).units > AUTO_UNITS, "the edit model is priced above the auto limit");
});

/* ── end to end through the real routes (mocked Higgsfield) ── */

test("a cheap picture: cost quoted, created on Higgsfield, ready, original served, charged exactly the quote", async () => {
  const { cookie: c, workspaceId } = await signIn("chatimg-cheap@example.com", "plus");
  cookie = c;
  const q = await quote({ size: "1536x1024", quality: "high" });
  assert.equal(q.units, 9);
  assert.equal(q.perDay, IMAGE_LIMITS.plus!.perDay);
  assert.equal(q.left, IMAGE_LIMITS.plus!.perDay);
  assert.equal(needsApproval(q.units, false), false);
  const before = await usedThisPeriod((await workspaceById(workspaceId))!);
  const job = await startImage({ prompt: "a fox in the snow", size: "1536x1024", quality: "high", key: "chat-key-0001", confirmUnits: q.units });
  assert.ok(["understanding", "generating", "ready"].includes(job.status));
  const done = await waitForJob(job.id, { intervalMs: 20, maxMs: 20_000 });
  assert.equal(done?.status, "ready");
  assert.equal(done?.units, 9);
  assert.equal(done?.url, `/api/images/${job.id}/file`);
  assert.equal(fake.submits().length, 1, "one Higgsfield call");
  // Served at full quality, as a download too.
  const file = await fetch(`${done!.url}?download=1`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-type") ?? "", /^image\//);
  assert.match(file.headers.get("content-disposition") ?? "", /attachment; filename="keplar-a-fox-in-the-snow-v1\./);
  assert.ok((await file.arrayBuffer()).byteLength > 0);
  assert.equal((await usedThisPeriod((await workspaceById(workspaceId))!)) - before, 9);
  // The allowance on the next card is one less.
  assert.equal((await quote({ size: "1536x1024", quality: "high" })).left, IMAGE_LIMITS.plus!.perDay - 1);
});

test("the same key never makes (or charges) a second picture", async () => {
  const { cookie: c, workspaceId } = await signIn("chatimg-idem@example.com", "plus");
  cookie = c;
  const a = await startImage({ prompt: "a quiet harbor at dawn", size: "1536x1024", quality: "high", key: "chat-key-idem1", confirmUnits: 9 });
  const b = await startImage({ prompt: "a quiet harbor at dawn", size: "1536x1024", quality: "high", key: "chat-key-idem1", confirmUnits: 9 });
  assert.equal(a.id, b.id);
  await waitForJob(a.id, { intervalMs: 20, maxMs: 20_000 });
  assert.equal(fake.submits().length, 1);
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), 9);
});

test("a failed picture is not charged and says so; Try again (new key) works", async () => {
  const { cookie: c, workspaceId } = await signIn("chatimg-fail@example.com", "plus");
  cookie = c;
  fake.state.nextTerminal = "failed";
  const job = await startImage({ prompt: "a fox in the snow", size: "1536x1024", quality: "high", key: "chat-key-fail1", confirmUnits: 9 });
  const done = await waitForJob(job.id, { intervalMs: 20, maxMs: 20_000 });
  assert.equal(done?.status, "failed");
  assert.ok(done?.error && /nothing was charged/i.test(done.error), done?.error ?? "");
  assert.equal(done?.url, null);
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), 0, "no charge for a failed picture");
  fake.state.nextTerminal = "completed";
  const again = await startImage({ prompt: "a fox in the snow", size: "1536x1024", quality: "high", key: "chat-key-fail2", confirmUnits: 9 });
  assert.equal((await waitForJob(again.id, { intervalMs: 20, maxMs: 20_000 }))?.status, "ready");
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), 9);
});

test("a stale price is refused with the new one (409 confirm), so the person sees it before going on", async () => {
  const { cookie: c } = await signIn("chatimg-stale@example.com", "plus");
  cookie = c;
  await assert.rejects(startImage({ prompt: "a red bicycle", size: "1536x1024", quality: "high", key: "chat-key-stale", confirmUnits: 1 }), (e: unknown) => e instanceof ImgError && e.status === 409 && e.code === "confirm" && (e.data.estimate as { units: number }).units === 9);
});

test("a reference image: priced as an edit, needs the rights box, original uploaded, picture made with it", async () => {
  const { cookie: c } = await signIn("chatimg-ref@example.com", "pro");
  cookie = c;
  const q = await quote({ size: "1536x1024", quality: "high", references: 1 });
  assert.equal(q.units, estimateImage("high", "1536x1024", true).units);
  assert.equal(needsApproval(q.units, true), true);
  const refs = await uploadSources([png()]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].bytes, PNG_1PX.length, "the original bytes, unchanged");
  // Without the rights confirmation the server refuses.
  await assert.rejects(startImage({ prompt: "make it a watercolor", size: "1536x1024", quality: "high", key: "chat-key-ref01", confirmUnits: q.units, references: refs, rights: false }));
  const job = await startImage({ prompt: "make it a watercolor", size: "1536x1024", quality: "high", key: "chat-key-ref02", confirmUnits: q.units, references: refs, rights: true });
  const done = await waitForJob(job.id, { intervalMs: 20, maxMs: 20_000 });
  assert.equal(done?.status, "ready");
  assert.equal(done?.units, q.units);
  const body = fake.submits().at(-1)!.body as Record<string, unknown>;
  assert.ok(JSON.stringify(body).includes("/ref/"), "the Higgsfield request carries the uploaded reference");
});

test("reference checks in the browser: only JPEG, PNG, WebP up to 10 MB and 3 pictures", () => {
  const f = (name: string, type: string, size = 1000) => ({ name, type, size });
  assert.equal(checkSources([f("a.png", "image/png")]), null);
  assert.match(checkSources([f("a.gif", "image/gif")]) ?? "", /GIF/);
  assert.match(checkSources([f("a.png", "image/png", 11_000_000)]) ?? "", /10 MB/);
  assert.match(checkSources([f("a", "image/png"), f("b", "image/png"), f("c", "image/png"), f("d", "image/png")]) ?? "", /Up to 3/);
  assert.match(checkSources([]) ?? "", /no image/);
});

test("Regenerate makes a new version of the same image; Variation and Edit start from the stored original", async () => {
  const { cookie: c } = await signIn("chatimg-follow@example.com", "pro");
  cookie = c;
  const first = await startImage({ prompt: "a lighthouse in fog", size: "1536x1024", quality: "high", key: "chat-key-fol01", confirmUnits: 9 });
  const firstDone = await waitForJob(first.id, { intervalMs: 20, maxMs: 20_000 });
  assert.equal(firstDone?.status, "ready");
  // Regenerate: priced by the parent, version 2 of the same image.
  const rq = await quote({ size: "1536x1024", quality: "high", regenerateOf: first.id });
  assert.equal(rq.units, 9);
  const regen = await startImage({ prompt: "a lighthouse in fog", size: "1536x1024", quality: "high", key: "chat-key-fol02", confirmUnits: rq.units, regenerateOf: first.id });
  assert.equal(regen.version, 2);
  assert.equal(regen.rootId, first.rootId);
  assert.equal((await waitForJob(regen.id, { intervalMs: 20, maxMs: 20_000 }))?.status, "ready");
  // Variation / Edit: the stored original becomes the reference (full quality), through the edit model.
  const stored = await fetchStored(first.id);
  assert.match(stored.type, /^image\//);
  assert.ok(stored.size > 0);
  const refs = await uploadSources([stored]);
  const vq = await quote({ size: "1536x1024", quality: "high", references: 1 });
  const edit = await startImage({ prompt: followUpPrompt("edit", "a lighthouse in fog", "make it night"), size: "1536x1024", quality: "high", key: "chat-key-fol03", confirmUnits: vq.units, references: refs, rights: true });
  assert.equal((await waitForJob(edit.id, { intervalMs: 20, maxMs: 20_000 }))?.status, "ready");
  assert.equal(followUpPrompt("edit", "x", "  make it night "), "make it night");
  assert.match(followUpPrompt("variation", "a lighthouse in fog"), /variation[\s\S]*a lighthouse in fog/);
  assert.ok(followUpPrompt("variation", "x".repeat(2000)).length <= 600);
});

test("plan gating: Free and Lite get an upgrade card, signed-out gets sign-in; nothing is quoted or charged", async () => {
  const free = await signIn("chatimg-free@example.com", "free");
  cookie = free.cookie;
  const e1 = await quote({ size: "1536x1024", quality: "high" }).catch((e) => e);
  assert.ok(e1 instanceof ImgError);
  assert.deepEqual({ reason: blockedFrom(e1)?.reason, up: blockedFrom(e1)?.upgradeTo }, { reason: "plan", up: "plus" });
  assert.match(blockedFrom(e1)?.message ?? "", /Plus and Pro/);
  const lite = await signIn("chatimg-lite@example.com", "free");
  cookie = lite.cookie;
  const { updateWorkspace } = await import("@/lib/accounts/workspaces");
  await updateWorkspace(lite.workspaceId, { plan: "lite" });
  assert.equal(blockedFrom(await quote({ size: "1536x1024", quality: "high" }).catch((e) => e))?.reason, "plan");
  cookie = null;
  const e3 = await quote({ size: "1536x1024", quality: "high" }).catch((e) => e);
  assert.equal(blockedFrom(e3)?.reason, "signin");
  assert.equal(blockedFrom(new Error("boom")), null);
  assert.equal(fake.submits().length, 0);
});

test("daily cap: the card says how many are left, and at the cap the picture is refused with the plan's message", async () => {
  const { cookie: c, workspaceId } = await signIn("chatimg-cap@example.com", "plus");
  cookie = c;
  const t = new Date().toISOString();
  const L = IMAGE_LIMITS.plus!;
  for (let i = 0; i < L.perDay - 1; i++) await imageJobs().insert({ id: `img_chatcap${i}`, workspaceId, rootId: `r${i}`, parentId: null, version: 1, prompt: "p", size: "1024x1024", quality: "medium", model: "m", status: "ready", estimateUnits: 9, units: 9, usd: 0.01, errorCode: null, error: null, blobId: null, contentType: null, bytes: 0, usedIn: [], createdAt: t, updatedAt: t, startedAt: t, finishedAt: t });
  assert.equal((await quote({ size: "1536x1024", quality: "high" })).left, 1);
  const last = await startImage({ prompt: "the last one today", size: "1536x1024", quality: "high", key: "chat-key-cap01", confirmUnits: 9 });
  await waitForJob(last.id, { intervalMs: 20, maxMs: 20_000 });
  const over = await startImage({ prompt: "one more please", size: "1536x1024", quality: "high", key: "chat-key-cap02", confirmUnits: 9 }).catch((e) => e);
  assert.ok(over instanceof ImgError);
  assert.equal(over.status, 429);
  assert.equal(blockedFrom(over)?.reason, "limit");
  assert.match(over.message, /limit of 15 images/);
});

test("Higgsfield not connected: references say so plainly; plain pictures fall back to OpenAI only when it is connected", async () => {
  const { cookie: c } = await signIn("chatimg-noconf@example.com", "pro");
  cookie = c;
  delete process.env.HIGGSFIELD_API;
  const e = await startImage({ prompt: "a fox in snow", size: "1536x1024", quality: "high", key: "chat-key-nc001", confirmUnits: 29 }).catch((x) => x);
  assert.ok(e instanceof ImgError);
  assert.equal(blockedFrom(e)?.reason, "config");
});

/* ── chat state ── */

const kmsg = (over: Partial<KeplarMessage> = {}): KeplarMessage => ({ id: "k1", role: "keplar", replyTo: "u1", status: "done", stages: [], capabilities: [], models: [], draft: "", startedAt: 1, ...over });
const baseImage = { kind: "create" as const, prompt: "a fox", size: "1536x1024" as const, quality: "high" as const, key: "k-1234567" };

test("chat state: a picture waiting for a decision is cancelled after a reload, a working one resumes by job id, a patch updates the card", () => {
  const waiting = settleImage(kmsg({ image: { ...baseImage, phase: "confirm", estimateUnits: 42 } })) as KeplarMessage;
  assert.equal(waiting.image?.phase, "canceled");
  assert.match(waiting.image?.error ?? "", /Nothing was charged/);
  const working = settleImage(kmsg({ image: { ...baseImage, phase: "working", jobId: "img_1" } })) as KeplarMessage;
  assert.equal(working.image?.phase, "working");
  assert.equal(working.image?.jobId, "img_1");
  const ready = settleImage(kmsg({ image: { ...baseImage, phase: "ready", jobId: "img_1", url: "/api/images/img_1/file" } })) as KeplarMessage;
  assert.equal(ready.image?.phase, "ready");

  const thread: Thread = { id: "t1", title: "t", projectId: null, createdAt: 1, updatedAt: 1, messages: [{ id: "u1", role: "user", text: "draw a fox", attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false, image: true }, createdAt: 1 }, kmsg({ image: { ...baseImage, phase: "checking" } })] };
  const s0 = { ...initialState(), threads: [thread], activeThreadId: "t1" };
  const s1 = reducer(s0, { type: "image", threadId: "t1", keplarId: "k1", patch: { phase: "ready", jobId: "img_9", url: "/api/images/img_9/file", units: 9 } });
  const m = s1.threads[0].messages[1] as KeplarMessage;
  assert.deepEqual({ p: m.image?.phase, id: m.image?.jobId, units: m.image?.units, prompt: m.image?.prompt }, { p: "ready", id: "img_9", units: 9, prompt: "a fox" });
  assert.equal(reducer(s0, { type: "image", threadId: "t1", keplarId: "nope", patch: { phase: "ready" } }).threads[0].messages[1], thread.messages[1], "an unknown card is left alone");
});

test("the page may read its own attached picture (blob:) to use it as a reference, and nothing wider", async () => {
  const { CSP } = await import("@/lib/security/headers");
  const connect = CSP.split("; ").find((d) => d.startsWith("connect-src "))!;
  assert.match(connect, /\bblob:/);
  assert.ok(!/\*|https:(?!\/)/.test(connect), connect);
});
