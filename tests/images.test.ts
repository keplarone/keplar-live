import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { call, jsonReq, signIn } from "./helpers/session";
import { installFakeNeon } from "./helpers/fake-neon";

process.env.OPENAI_API_KEY = "sk-test-not-real";
process.env.KEPLAR_OPENAI_BASE = "http://mock.openai.test/v1";
process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";

import { costFromUsage, DEFAULT_QUALITY, DEFAULT_SIZE, estimateImage, IMAGE_LIMITS, IMAGE_MODEL, imageLimitsFor, MAX_IMAGE_BYTES, OUTPUT_FORMAT, PRICE_USD, SIZES } from "@/lib/images/config";
import { checkImagePromptLocal } from "@/lib/images/safety";
import { sniffImage } from "@/lib/images/provider";
import { IDEMPOTENCY_KEY, imageJobs, jobIdFor, recentFailures, usageOf, type ImageJob } from "@/lib/images/store";
import { figureHtml, insertFigure } from "@/lib/images/site-use";
import { getImage, getPublicImage, newBlobId, putImage, setPublic, deleteImage } from "@/lib/images/blob";
import { charge, usedThisPeriod } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { setControls, resetOpsCache } from "@/lib/ops/controls";
import { clearCooldown } from "@/lib/create/platform/cooldown";

/* ── mock OpenAI: images + moderation ── */
let png = Buffer.alloc(0);
let genCalls: Record<string, unknown>[] = [];
let modCalls: unknown[] = [];
let genStatus = 200;
let genErrorBody: unknown = null;
let usage: unknown = { input_tokens: 40, input_tokens_details: { text_tokens: 40, image_tokens: 0 }, output_tokens: 1056 };
let flagPrompt = false;
let flagImage = false;
let moderationDown = false;
let gate: Promise<void> | null = null;
let seenAuth: string[] = [];
const realFetch = globalThis.fetch;
before(async () => {
  png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#c33" } }).webp().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://mock.openai.test/")) return realFetch(input, init);
    seenAuth.push(String((init?.headers as Record<string, string>)?.authorization));
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/moderations")) {
      modCalls.push(body.input);
      if (moderationDown) return new Response("down", { status: 500 });
      const isImg = Array.isArray(body.input);
      return Response.json({ results: [{ flagged: isImg ? flagImage : flagPrompt, categories: { violence: isImg ? flagImage : flagPrompt } }] });
    }
    if (url.endsWith("/images/generations")) {
      genCalls.push(body);
      if (gate) await gate;
      if (genStatus !== 200) return Response.json(genErrorBody ?? { error: { message: "x" } }, { status: genStatus });
      return Response.json({ created: 1, data: [{ b64_json: png.toString("base64") }], usage });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});
const reset = () => {
  genCalls = [];
  modCalls = [];
  genStatus = 200;
  genErrorBody = null;
  usage = { input_tokens: 40, input_tokens_details: { text_tokens: 40, image_tokens: 0 }, output_tokens: 1056 };
  flagPrompt = false;
  flagImage = false;
  moderationDown = false;
  gate = null;
  seenAuth = [];
  delete process.env.KEPLAR_BREAKER_FORCE;
  delete process.env.KEPLAR_IMAGES_OFF;
};

const listRoute = () => import("@/app/api/images/route");
const estRoute = () => import("@/app/api/images/estimate/route");
const oneRoute = () => import("@/app/api/images/[id]/route");
const fileRoute = () => import("@/app/api/images/[id]/file/route");
const useRoute = () => import("@/app/api/images/[id]/use/route");
const pubRoute = () => import("@/app/i/[token]/route");
const sitesRoute = () => import("@/app/api/sites/route");
const siteRoute = () => import("@/app/api/sites/[id]/route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let keyN = 0;
const key = () => `test-key-${Date.now()}-${++keyN}`;
type JobJson = { id: string; status: string; error: string | null; errorCode: string | null; units: number | null; url: string | null; version: number; rootId: string; estimateUnits: number };
async function post(cookie: string, body: Record<string, unknown>) {
  const { POST } = await listRoute();
  return POST(jsonReq(cookie, "/api/images", "POST", body));
}
/** Confirms with the server's own estimate, like the UI does. */
async function create(cookie: string, prompt: string, extra: Record<string, unknown> = {}) {
  const k = (extra.idempotencyKey as string) ?? key();
  const q = (extra.quality as keyof typeof PRICE_USD) ?? "medium";
  const s = (extra.size as keyof (typeof PRICE_USD)["low"]) ?? "1024x1024";
  return post(cookie, { prompt, idempotencyKey: k, size: s, quality: q, confirmUnits: estimateImage(q, s).units, ...extra });
}
async function getJob(cookie: string, id: string) {
  const { GET } = await oneRoute();
  const res = await GET(call(cookie, `/api/images/${id}`), ctx(id));
  return (await res.json()) as { job: JobJson; history: JobJson[] };
}
async function waitDone(cookie: string, id: string) {
  for (let i = 0; i < 100; i++) {
    const j = (await getJob(cookie, id)).job;
    if (j.status === "ready" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job never finished");
}
const used = async (wsId: string) => usedThisPeriod((await workspaceById(wsId))!);

/* ───────────────────────── unit: cost, limits, gating, safety ───────────────────────── */

test("estimate is the published price with the 1.1 margin, in credits; Free has no limits row", () => {
  assert.equal(IMAGE_MODEL, "gpt-image-1-mini");
  assert.equal(estimateImage("medium", "1024x1024").units, 7); // $0.011 x 1.1 / $0.002
  assert.equal(estimateImage("low", "1024x1024").units, 3);
  assert.equal(estimateImage("medium", "1536x1024").units, 9);
  assert.equal(imageLimitsFor("free"), null);
  assert.ok(IMAGE_LIMITS.plus && IMAGE_LIMITS.pro && IMAGE_LIMITS.business);
  assert.ok(IMAGE_LIMITS.plus!.perDay < IMAGE_LIMITS.pro!.perDay && IMAGE_LIMITS.pro!.perDay < IMAGE_LIMITS.business!.perDay);
  assert.ok(IMAGE_LIMITS.plus!.concurrent <= IMAGE_LIMITS.pro!.concurrent);
});

test("High quality: published prices, default is High + Wide, ~3.5x Standard, 29 credits per default image", () => {
  assert.equal(PRICE_USD.high["1024x1024"], 0.036);
  assert.equal(PRICE_USD.high["1536x1024"], 0.052);
  assert.equal(PRICE_USD.high["1024x1536"], 0.052);
  assert.equal(DEFAULT_QUALITY, "high");
  assert.equal(DEFAULT_SIZE, "1536x1024");
  assert.equal(estimateImage("high", "1024x1024").units, 20); // $0.036 x 1.1 / $0.002
  assert.equal(estimateImage("high", "1536x1024").units, 29);
  assert.ok(PRICE_USD.high["1536x1024"] / PRICE_USD.medium["1536x1024"] > 3 && PRICE_USD.high["1536x1024"] / PRICE_USD.medium["1536x1024"] < 4);
  // 1536 px is the largest size gpt-image-1-mini offers: nothing bigger is advertised.
  assert.ok(SIZES.every((s) => Math.max(s.width, s.height) <= 1536));
  assert.equal(OUTPUT_FORMAT, "png");
  // Worst-case provider spend per user per day stays far below the cooldown thresholds.
  for (const plan of ["plus", "pro", "business"] as const) {
    const L = IMAGE_LIMITS[plan]!;
    assert.ok(L.highPerDay < L.perDay);
    const worst: number = L.highPerDay * PRICE_USD.high["1536x1024"] + (L.perDay - L.highPerDay) * PRICE_USD.medium["1536x1024"];
    assert.ok(worst < { plus: 0.5, pro: 1.3, business: 2.5 }[plan], `${plan} worst day $${worst.toFixed(2)}`);
  }
  // A full library must fit: the byte quota holds at least the image quota of 3.5 MB PNGs.
  for (const plan of ["plus", "pro", "business"] as const) assert.ok(IMAGE_LIMITS[plan]!.storedBytes >= IMAGE_LIMITS[plan]!.storedImages * 3_000_000);
  assert.ok(MAX_IMAGE_BYTES < 4_500_000, "every image can be served within the 4.5 MB function response limit");
});

test("real cost comes from token usage, falls back to the table, and is capped at 3x the table", () => {
  const u = costFromUsage({ input_tokens: 40, input_tokens_details: { text_tokens: 40, image_tokens: 0 }, output_tokens: 1056 }, "medium", "1024x1024");
  assert.ok(Math.abs(u - (1056 * 8e-6 + 40 * 2e-6)) < 1e-9);
  assert.equal(costFromUsage(undefined, "medium", "1024x1024"), PRICE_USD.medium["1024x1024"]);
  assert.equal(costFromUsage({ output_tokens: 0 }, "low", "1024x1024"), PRICE_USD.low["1024x1024"]);
  assert.equal(costFromUsage({ output_tokens: 10_000_000 }, "low", "1024x1024"), PRICE_USD.low["1024x1024"] * 3);
});

test("local safety: blocks minors+sexual, deepfakes, gore, named people and public roles; allows ordinary prompts", () => {
  const blocked = [
    "a naked child on a beach",
    "deepfake of my coworker",
    "nudify this photo",
    "graphic gore scene with dismemberment",
    "portrait of Taylor Swift on stage",
    "photo of Elon Musk at a desk",
    "Barack Obama holding a sign",
    "a picture of the current president shaking hands",
    "a woman who looks exactly like Scarlett Johansson",
    "fake photo of a real person endorsing my product",
    "hardcore porn",
  ];
  for (const p of blocked) assert.equal(checkImagePromptLocal(p).ok, false, p);
  const fine = [
    "a warm sunlit bakery counter with fresh sourdough loaves",
    "photo of New York skyline at dusk",
    "portrait of a fictional elderly fisherman with a weathered face",
    "a logo that looks like a leaf, flat green",
    "a poster for Summer Sale in bold type",
    "a mountain lake at sunrise, Golden Gate style bridge in fog",
    "a child's birthday party with balloons and cake",
  ];
  for (const p of fine) assert.equal(checkImagePromptLocal(p).ok, true, p);
});

test("sniffImage trusts bytes, not labels", () => {
  assert.equal(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0])), "image/png");
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
});

test("idempotency: same account + key = same job id; different account or key differs; bad keys rejected", () => {
  assert.equal(jobIdFor("ws1", "abcdefgh"), jobIdFor("ws1", "abcdefgh"));
  assert.notEqual(jobIdFor("ws1", "abcdefgh"), jobIdFor("ws2", "abcdefgh"));
  assert.notEqual(jobIdFor("ws1", "abcdefgh"), jobIdFor("ws1", "abcdefgi"));
  assert.equal(IDEMPOTENCY_KEY.test("short"), false);
  assert.equal(IDEMPOTENCY_KEY.test("has space in it"), false);
  assert.equal(IDEMPOTENCY_KEY.test("0f8fad5b-d9cb-469f-a165-70867728950e"), true);
});

const row = (over: Partial<ImageJob>): ImageJob => {
  const t = new Date().toISOString();
  return { id: `img_${Math.random().toString(16).slice(2)}`, workspaceId: "w", rootId: "r", parentId: null, version: 1, prompt: "p", size: "1024x1024", quality: "medium", model: IMAGE_MODEL, status: "ready", estimateUnits: 7, units: 7, usd: 0.01, errorCode: null, error: null, blobId: "b", contentType: "image/webp", bytes: 1000, usedIn: [], createdAt: t, updatedAt: t, startedAt: t, finishedAt: t, ...over };
};

test("usage counts ready + running in the last 24 h only; failures do not count toward the daily cap", () => {
  const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
  const u = usageOf([row({}), row({ status: "generating" }), row({ status: "failed", errorCode: "busy" }), row({ createdAt: old })]);
  assert.equal(u.today, 2);
  assert.equal(u.stored, 2);
  assert.equal(u.running, 1);
});

test("retry-storm guard counts recent real failures only", () => {
  const f = (code: string, ago: number) => row({ status: "failed", errorCode: code, finishedAt: new Date(Date.now() - ago).toISOString() });
  const r = recentFailures([f("busy", 1000), f("timeout", 2000), f("paused", 1000), f("server", 11 * 60_000)], 10 * 60_000);
  assert.equal(r.count, 2);
});

test("insertFigure: under the first heading, at the end of main, or around a bare page", () => {
  const fig = figureHtml("https://keplar.one/i/abc", 'a "quoted" <b>', 1024, 1024);
  assert.ok(!fig.includes("<b>") && fig.includes("&quot;quoted&quot;"));
  const page = "<html><body><main><h1>Hi</h1><p>x</p></main></body></html>";
  assert.match(insertFigure(page, "[F]", "top"), /<\/h1>\[F\]<p>/);
  assert.match(insertFigure(page, "[F]", "bottom"), /<p>x<\/p>\[F\]<\/main>/);
  assert.equal(insertFigure("<p>bare</p>", "[F]", "bottom"), "<p>bare</p>[F]");
});

/* ───────────────────────── integration: routes + mocked provider ───────────────────────── */

test("Free: not available, clear upgrade message, no provider call, no job", async () => {
  reset();
  const { cookie } = await signIn("img-free@example.com", "free");
  const { GET } = await listRoute();
  const cfg = (await (await GET(call(cookie, "/api/images"))).json()) as { config: { available: boolean; message: string; upgradeTo: string }; images: unknown[] };
  assert.equal(cfg.config.available, false);
  assert.match(cfg.config.message, /Plus and Pro/);
  assert.equal(cfg.config.upgradeTo, "plus");
  const res = await create(cookie, "a red bicycle in a field");
  assert.equal(res.status, 402);
  const j = (await res.json()) as { code: string; upgradeTo: string; error: string };
  assert.equal(j.code, "entitlement");
  assert.equal(j.upgradeTo, "plus");
  assert.match(j.error, /Upgrade/);
  assert.equal(genCalls.length, 0);
  const est = await (await estRoute()).POST(jsonReq(cookie, "/api/images/estimate", "POST", {}));
  assert.equal(est.status, 402);
});

test("signed-out requests are refused", async () => {
  reset();
  const res = await (await listRoute()).POST(jsonReq(null, "/api/images", "POST", { prompt: "a cat on a sofa", confirmUnits: 7 }));
  assert.equal(res.status, 401);
});

test("Plus end to end: estimate, confirm required, real states, stored, served with cache headers, owner-only, charged the real cost", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-plus@example.com", "plus");
  const est = (await (await (await estRoute()).POST(jsonReq(cookie, "/api/images/estimate", "POST", { size: "1024x1024", quality: "medium" }))).json()) as { estimate: { units: number }; usage: { perDay: number } };
  assert.equal(est.estimate.units, 7);
  assert.equal(est.usage.perDay, 15);

  // No confirmation -> 409 with the estimate; nothing generated, nothing charged.
  const no = await post(cookie, { prompt: "a sunlit bakery counter with sourdough loaves", idempotencyKey: key() });
  assert.equal(no.status, 409);
  const nj = (await no.json()) as { code: string; estimate: { units: number } };
  assert.equal(nj.code, "confirm");
  assert.equal(nj.estimate.units, estimateImage(DEFAULT_QUALITY, DEFAULT_SIZE).units); // the default is High, Wide
  // Wrong number also refused (the price shown must be the price confirmed).
  assert.equal((await post(cookie, { prompt: "a sunlit bakery counter with sourdough loaves", idempotencyKey: key(), confirmUnits: 1 })).status, 409);
  assert.equal(genCalls.length, 0);
  assert.equal(await used(workspaceId), 0);

  let release!: () => void;
  gate = new Promise<void>((r) => (release = r));
  const res = await create(cookie, "a sunlit bakery counter with sourdough loaves");
  assert.equal(res.status, 202);
  const started = ((await res.json()) as { job: JobJson }).job;
  assert.equal(started.status, "understanding");
  assert.equal(started.url, null);

  // While the provider call is open the backend says GENERATING (not a timer, not a percentage).
  let s = "";
  for (let i = 0; i < 100 && s !== "generating"; i++) {
    s = (await getJob(cookie, started.id)).job.status;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(s, "generating");
  release();
  const done = await waitDone(cookie, started.id);
  assert.equal(done.status, "ready");
  assert.equal(genCalls.length, 1);
  assert.equal(genCalls[0].model, "gpt-image-1-mini");
  assert.equal(genCalls[0].quality, "medium");
  assert.equal(genCalls[0].size, "1024x1024");
  assert.equal(genCalls[0].output_format, "png"); // lossless, stored and served as the model made it
  assert.equal("output_compression" in genCalls[0], false);
  assert.match(String(genCalls[0].user), /^kp_[a-f0-9]{28}$/);
  assert.ok(seenAuth.every((a) => a === "Bearer sk-test-not-real"));
  assert.equal(modCalls.length >= 2, true, "prompt and output were moderated");

  // Charged the real cost: (1056*8e-6 + 40*2e-6) * 1.1 / 0.002 -> 5 credits (<= estimate 7).
  assert.equal(done.units, 5);
  assert.equal(await used(workspaceId), 5);

  // Served: authenticated, immutable private cache, ETag/304, nosniff, download name.
  const { GET: file } = await fileRoute();
  const f = await file(call(cookie, `/api/images/${started.id}/file`), ctx(started.id));
  assert.equal(f.status, 200);
  assert.equal(f.headers.get("content-type"), "image/webp");
  assert.match(f.headers.get("cache-control") ?? "", /private.*immutable/);
  assert.equal(f.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await f.arrayBuffer()), png);
  const etag = f.headers.get("etag")!;
  const again = await file(call(cookie, `/api/images/${started.id}/file`, { headers: { "if-none-match": etag } }), ctx(started.id));
  assert.equal(again.status, 304);
  const dl = await file(call(cookie, `/api/images/${started.id}/file?download=1`), ctx(started.id));
  assert.match(dl.headers.get("content-disposition") ?? "", /attachment; filename="keplar-a-sunlit-bakery-counter.*-v1\.webp"/);
  // Not public, not for other accounts, not signed out.
  assert.equal((await file(call(null, `/api/images/${started.id}/file`), ctx(started.id))).status, 401);
  const other = await signIn("img-plus-other@example.com", "plus");
  assert.equal((await file(call(other.cookie, `/api/images/${started.id}/file`), ctx(started.id))).status, 404);
  assert.equal((await (await oneRoute()).GET(call(other.cookie, `/api/images/${started.id}`), ctx(started.id))).status, 404);
  const pub = await (await pubRoute()).GET(call(null, "/i/x"), { params: Promise.resolve({ token: "0".repeat(32) }) });
  assert.equal(pub.status, 404);

  // Listing shows it, never exposes cost in dollars or the storage id.
  const list = (await (await (await listRoute()).GET(call(cookie, "/api/images"))).json()) as { images: Record<string, unknown>[]; usage: { today: number; stored: number } };
  assert.equal(list.images.length, 1);
  assert.equal(list.usage.stored, 1);
  const text = JSON.stringify(list);
  assert.ok(!/usd|blobId|workspaceId|sk-test/.test(text), "no internal fields");
});

test("idempotency: a retried request returns the same job and never generates or charges twice", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-idem@example.com", "plus");
  const k = key();
  const a = await create(cookie, "a quiet harbor at dawn, watercolor", { idempotencyKey: k });
  const aj = ((await a.json()) as { job: JobJson }).job;
  const b = await create(cookie, "a quiet harbor at dawn, watercolor", { idempotencyKey: k });
  const bj = (await b.json()) as { job: JobJson; existing: boolean };
  assert.equal(bj.job.id, aj.id);
  assert.equal(bj.existing, true);
  await waitDone(cookie, aj.id);
  const c = await create(cookie, "a quiet harbor at dawn, watercolor", { idempotencyKey: k });
  assert.equal(c.status, 200);
  assert.equal(genCalls.length, 1);
  assert.equal(await used(workspaceId), 5);
  assert.equal((await post(cookie, { prompt: "x quick test prompt", idempotencyKey: "bad key!", confirmUnits: 7 })).status, 400);
});

test("moderation: flagged prompt fails as refused, nothing generated or charged; moderation outage fails closed", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-mod@example.com", "plus");
  flagPrompt = true;
  const r = await create(cookie, "an ordinary looking meadow with flowers");
  const j = await waitDone(cookie, ((await r.json()) as { job: JobJson }).job.id);
  assert.equal(j.status, "failed");
  assert.equal(j.errorCode, "refused");
  assert.match(j.error ?? "", /can't create that image/);
  assert.equal(genCalls.length, 0);
  assert.equal(await used(workspaceId), 0);

  flagPrompt = false;
  moderationDown = true;
  const r2 = await create(cookie, "an ordinary looking meadow with flowers 2");
  const j2 = await waitDone(cookie, ((await r2.json()) as { job: JobJson }).job.id);
  assert.equal(j2.status, "failed");
  assert.match(j2.error ?? "", /safety check/);
  assert.equal(genCalls.length, 0);

  // Local rules refuse synchronously with 422 and never create a job or call any API.
  moderationDown = false;
  const before = modCalls.length;
  const bad = await create(cookie, "portrait of Taylor Swift on stage");
  assert.equal(bad.status, 422);
  assert.match(((await bad.json()) as { error: string }).error, /real people/);
  assert.equal(modCalls.length, before);
});

test("output moderation: a flagged image is dropped, not stored, not charged", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-out@example.com", "plus");
  flagImage = true;
  const j = await waitDone(cookie, ((await (await create(cookie, "a field of sunflowers under a blue sky")).json()) as { job: JobJson }).job.id);
  assert.equal(j.status, "failed");
  assert.equal(j.url, null);
  assert.match(j.error ?? "", /Nothing was charged/);
  assert.equal(await used(workspaceId), 0);
});

test("provider failures are friendly, uncharged, and a retry-storm pauses further attempts", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-fail@example.com", "pro");
  genStatus = 429;
  const jobs: JobJson[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await create(cookie, `a lighthouse on a cliff, attempt ${i}`);
    assert.equal(r.status, 202, `attempt ${i}`);
    jobs.push(await waitDone(cookie, ((await r.json()) as { job: JobJson }).job.id));
    await new Promise((r2) => setTimeout(r2, 25));
  }
  for (const j of jobs) {
    assert.equal(j.status, "failed");
    assert.equal(j.errorCode, "busy");
    assert.match(j.error ?? "", /busy right now.*Nothing was charged/);
    assert.ok(!/429|openai|sk-/i.test(j.error ?? ""));
  }
  assert.equal(await used(workspaceId), 0);
  const fifth = await create(cookie, "a lighthouse on a cliff, attempt 5");
  assert.equal(fifth.status, 429);
  const fj = (await fifth.json()) as { code: string; error: string };
  assert.equal(fj.code, "failing");
  assert.match(fj.error, /Nothing was charged/);
  assert.equal(genCalls.length, 4, "no further provider calls during the pause");
});

test("provider content-policy rejection becomes a refusal; bad output is a failure with no charge", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-policy@example.com", "plus");
  genStatus = 400;
  genErrorBody = { error: { code: "moderation_blocked", type: "image_generation_user_error", message: "Your request was rejected by the safety system." } };
  const a = await waitDone(cookie, ((await (await create(cookie, "a moody forest path at night")).json()) as { job: JobJson }).job.id);
  assert.equal(a.errorCode, "refused");
  assert.ok(!/safety system/.test(a.error ?? ""), "provider text is not passed through");
  genStatus = 200;
  const realPng = png;
  png = Buffer.from("<svg onload=alert(1)>");
  await new Promise((r) => setTimeout(r, 30));
  const b = await waitDone(cookie, ((await (await create(cookie, "a moody forest path at dusk")).json()) as { job: JobJson }).job.id);
  png = realPng;
  assert.equal(b.status, "failed");
  assert.equal(b.errorCode, "bad_output");
  assert.equal(await used(workspaceId), 0);
});

test("per-user concurrency: a second job while one is running is refused; the slot frees afterwards", async () => {
  reset();
  const { cookie } = await signIn("img-conc@example.com", "plus"); // Plus: 1 at a time
  let release!: () => void;
  gate = new Promise<void>((r) => (release = r));
  const first = ((await (await create(cookie, "a red kite over dunes")).json()) as { job: JobJson }).job;
  const second = await create(cookie, "a blue kite over dunes");
  assert.equal(second.status, 429);
  assert.equal(((await second.json()) as { code: string }).code, "too_many_jobs");
  release();
  await waitDone(cookie, first.id);
  await new Promise((r) => setTimeout(r, 30));
  const third = await create(cookie, "a green kite over dunes");
  assert.equal(third.status, 202);
  await waitDone(cookie, ((await third.json()) as { job: JobJson }).job.id);
});

test("High quality has its own daily sub-cap; Standard still works after it", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-high@example.com", "plus");
  for (let i = 0; i < IMAGE_LIMITS.plus!.highPerDay; i++) await imageJobs().insert(row({ workspaceId, rootId: `h${i}`, id: `img_high${i}`, quality: "high", blobId: null, bytes: 0 }));
  const res = await create(cookie, "one more high quality image", { quality: "high", size: "1536x1024" });
  assert.equal(res.status, 429);
  const j = (await res.json()) as { code: string; error: string };
  assert.equal(j.code, "daily_limit");
  assert.match(j.error, /High quality/);
  const ok = await create(cookie, "a standard quality image of a lamp", { quality: "medium", size: "1024x1024" });
  assert.equal(ok.status, 202);
  await waitDone(cookie, ((await ok.json()) as { job: JobJson }).job.id);
});

test("daily image cap: 429 with a clear message; admin is exempt from the count", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-daily@example.com", "plus");
  for (let i = 0; i < IMAGE_LIMITS.plus!.perDay; i++) await imageJobs().insert(row({ workspaceId, rootId: `r${i}`, id: `img_seed${i}`, blobId: null, bytes: 0 }));
  const res = await create(cookie, "one more image please");
  assert.equal(res.status, 429);
  const j = (await res.json()) as { code: string; error: string };
  assert.equal(j.code, "daily_limit");
  assert.match(j.error, /limit of 15 images/);
  assert.equal(genCalls.length, 0);
});

test("storage quota: a full library refuses new images with a clear message", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-quota@example.com", "plus");
  await imageJobs().insert(row({ workspaceId, id: "img_big", bytes: IMAGE_LIMITS.plus!.storedBytes, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }));
  const res = await create(cookie, "something small and simple");
  assert.equal(res.status, 413);
  assert.equal(((await res.json()) as { code: string }).code, "storage_full");
});

test("global breaker: paid images pause at 85% and stop at 100%, work below; ops pause and provider kill-switch also stop them", async () => {
  reset();
  const { cookie } = await signIn("img-breaker@example.com", "business");
  try {
  process.env.KEPLAR_BREAKER_FORCE = "no_media";
  const paused = await create(cookie, "a calm lake with mountains");
  assert.equal(paused.status, 402);
  assert.match(((await paused.json()) as { error: string }).error, /paused for the rest of today/);
  process.env.KEPLAR_BREAKER_FORCE = "capped";
  assert.equal((await create(cookie, "a calm lake with mountains")).status, 402);
  process.env.KEPLAR_BREAKER_FORCE = "cheap"; // 70%: media still allowed
  const ok = await create(cookie, "a calm lake with mountains");
  assert.equal(ok.status, 202);
  await waitDone(cookie, ((await ok.json()) as { job: JobJson }).job.id);
  assert.equal(genCalls.length, 1);
  delete process.env.KEPLAR_BREAKER_FORCE;
  await new Promise((r) => setTimeout(r, 30));

  await setControls({ pauseMedia: true }, "test");
  const ops = await create(cookie, "a calm lake with hills");
  assert.equal(ops.status, 503);
  assert.equal(((await ops.json()) as { code: string }).code, "media_paused");
  await setControls({ pauseMedia: false, disabledProviders: ["openai"] }, "test");
  assert.equal((await create(cookie, "a calm lake with hills")).status, 503);
  await setControls({ disabledProviders: [] }, "test");
  resetOpsCache();
  process.env.KEPLAR_IMAGES_OFF = "1";
  assert.equal((await create(cookie, "a calm lake with hills")).status, 503);
  delete process.env.KEPLAR_IMAGES_OFF;
  assert.equal(genCalls.length, 1);
  } finally {
    await setControls({ pauseMedia: false, disabledProviders: [] }, "test");
    resetOpsCache();
    delete process.env.KEPLAR_IMAGES_OFF;
    delete process.env.KEPLAR_BREAKER_FORCE;
  }
});

test("a breaker that trips after the request was accepted still stops the job before the provider call", async () => {
  reset();
  const { cookie } = await signIn("img-latebreaker@example.com", "plus");
  let release!: () => void;
  gate = new Promise<void>((r) => (release = r));
  // Hold the prompt moderation so the job sits in UNDERSTANDING while the breaker trips.
  const realMod = globalThis.fetch;
  let holdMod: (() => void) | null = null;
  const modHeld = new Promise<void>((r) => (holdMod = r));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/moderations")) await modHeld;
    return realMod(input, init);
  }) as typeof fetch;
  try {
    const r = await create(cookie, "a quiet street after rain");
    const id = ((await r.json()) as { job: JobJson }).job.id;
    process.env.KEPLAR_BREAKER_FORCE = "capped";
    holdMod!();
    const j = await waitDone(cookie, id);
    assert.equal(j.status, "failed");
    assert.equal(j.errorCode, "paused");
    assert.equal(genCalls.length, 0);
    release();
  } finally {
    globalThis.fetch = realMod;
    delete process.env.KEPLAR_BREAKER_FORCE;
  }
});

test("cooldown: a user on the Keplar usage cooldown cannot start an image (429 cooldown)", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-cool@example.com", "plus");
  const ws = (await workspaceById(workspaceId))!;
  await charge(ws, "answer" as never, { usd: 2.5 }); // over $2/hour on Plus
  const res = await create(cookie, "a bowl of fresh fruit");
  assert.equal(res.status, 429);
  const j = (await res.json()) as { code: string; until: string };
  assert.equal(j.code, "cooldown");
  assert.ok(j.until);
  assert.equal(genCalls.length, 0);
  await clearCooldown(ws.id);
});

test("admin: exempt from the daily image count and the credit windows, but the $25/day admin cap still stops images", async () => {
  reset();
  process.env.KEPLAR_ADMIN_DAILY_USD_CAP = "0.02";
  try {
    const { cookie, workspaceId } = await signIn("team@keplar.one", "free");
    for (let i = 0; i < IMAGE_LIMITS.business!.perDay + 5; i++) await imageJobs().insert(row({ workspaceId, rootId: `a${i}`, id: `img_adm${i}`, blobId: null, bytes: 0 }));
    const first = await create(cookie, "an admin test image of a teapot", { quality: "low" });
    assert.equal(first.status, 202, "no daily count for admin");
    const j = await waitDone(cookie, ((await first.json()) as { job: JobJson }).job.id);
    assert.equal(j.status, "ready");
    await new Promise((r) => setTimeout(r, 30));
    // low 1024x1024: 1056? tokens differ; push the admin total past the tiny cap with a direct charge, then expect the cap message.
    const ws = (await workspaceById(workspaceId))!;
    await charge(ws, "image.generate", { usd: 0.05 });
    const capped = await create(cookie, "an admin test image of a teapot 2", { quality: "low" });
    assert.equal(capped.status, 402);
    assert.match(((await capped.json()) as { error: string }).error, /daily safety cap/);
  } finally {
    delete process.env.KEPLAR_ADMIN_DAILY_USD_CAP;
  }
});

test("history + regenerate: new version in the same history, same params by default; delete removes bytes", async () => {
  reset();
  const { cookie } = await signIn("img-regen@example.com", "pro");
  const a = await waitDone(cookie, ((await (await create(cookie, "a cozy cabin in snowy woods", { size: "1536x1024" })).json()) as { job: JobJson }).job.id);
  assert.equal(a.status, "ready");
  await new Promise((r) => setTimeout(r, 30));
  // Regenerate with the parent's prompt and size (no prompt in the body). Estimate for 1536x1024 medium = 9.
  const r = await post(cookie, { regenerateOf: a.id, idempotencyKey: key(), confirmUnits: estimateImage("medium", "1536x1024").units });
  assert.equal(r.status, 202);
  const b = await waitDone(cookie, ((await r.json()) as { job: JobJson }).job.id);
  assert.equal(b.status, "ready");
  assert.equal(b.version, 2);
  assert.equal(b.rootId, a.rootId);
  assert.equal(genCalls[1].size, "1536x1024");
  assert.equal(genCalls[1].prompt, "a cozy cabin in snowy woods");
  const hist = await getJob(cookie, b.id);
  assert.deepEqual(hist.history.map((h) => h.version), [2, 1]);
  // Regenerating something that isn't yours is a 404.
  const other = await signIn("img-regen-other@example.com", "pro");
  assert.equal((await post(other.cookie, { regenerateOf: a.id, idempotencyKey: key(), confirmUnits: 7 })).status, 404);
  // Delete
  const { DELETE } = await oneRoute();
  const del = await DELETE(call(cookie, `/api/images/${a.id}`, { method: "DELETE" }), ctx(a.id));
  assert.equal(del.status, 200);
  assert.equal((await (await fileRoute()).GET(call(cookie, `/api/images/${a.id}/file`), ctx(a.id))).status, 404);
});

test("stale jobs (function died) are marked failed on read, uncharged", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-stale@example.com", "plus");
  const old = new Date(Date.now() - 10 * 60_000).toISOString();
  await imageJobs().insert(row({ workspaceId, id: "img_stale1", status: "generating", blobId: null, bytes: 0, units: null, createdAt: old, updatedAt: old, finishedAt: null }));
  const j = (await getJob(cookie, "img_stale1")).job;
  assert.equal(j.status, "failed");
  assert.match(j.error ?? "", /too long.*Nothing was charged/);
});

test("use in my site: new site version with the image, public by unguessable id with cross-origin cache headers; delete warns", async () => {
  reset();
  const { cookie, workspaceId } = await signIn("img-site@example.com", "plus");
  const sres = await (await sitesRoute()).POST(jsonReq(cookie, "/api/sites", "POST", { name: "Bakery", template: "business" }));
  const site = ((await sres.json()) as { site: { id: string } }).site;
  const before = (await (await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json()) as { site: { headVersion: number } };
  const job = await waitDone(cookie, ((await (await create(cookie, "bread on a wooden table")).json()) as { job: JobJson }).job.id);
  const stored = (await imageJobs().get(workspaceId, job.id))!;
  const pub = await pubRoute();
  assert.equal((await pub.GET(call(null, `/i/${stored.blobId}`), { params: Promise.resolve({ token: stored.blobId! }) })).status, 404, "private until used");

  const { POST: use } = await useRoute();
  const bad = await use(jsonReq(cookie, `/api/images/${job.id}/use`, "POST", { siteId: site.id, page: "nope.html" }), ctx(job.id));
  assert.equal(bad.status, 404);
  const res = await use(jsonReq(cookie, `/api/images/${job.id}/use`, "POST", { siteId: site.id, page: "index.html", placement: "top", alt: "Fresh bread" }), ctx(job.id));
  assert.equal(res.status, 200);
  const out = (await res.json()) as { version: number; url: string };
  assert.equal(out.version, before.site.headVersion + 1);
  assert.equal(out.url, `https://keplar.one/i/${stored.blobId}`, "canonical https origin, not the request origin");
  const after = (await (await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json()) as { files: Record<string, string>; versions: { n: number; kind: string }[] };
  assert.match(after.files["index.html"], new RegExp(`<img[^>]+src="https://[^"]+/i/${stored.blobId}"[^>]+alt="Fresh bread"`));
  assert.equal(after.versions[0].kind, "edit");
  // Twice on the same page is refused.
  assert.equal((await use(jsonReq(cookie, `/api/images/${job.id}/use`, "POST", { siteId: site.id, page: "index.html" }), ctx(job.id))).status, 409);

  const p = await pub.GET(call(null, `/i/${stored.blobId}`), { params: Promise.resolve({ token: stored.blobId! }) });
  assert.equal(p.status, 200);
  assert.equal(p.headers.get("content-type"), "image/webp");
  assert.match(p.headers.get("cache-control") ?? "", /public.*immutable/);
  assert.equal(p.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.deepEqual(Buffer.from(await p.arrayBuffer()), png);
  assert.equal((await pub.GET(call(null, "/i/zzz"), { params: Promise.resolve({ token: "../../etc/passwd" }) })).status, 404);

  // The preview renders the image under the site's strict CSP (https images allowed, no scripts).
  const detail = (await (await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json()) as { previewToken: string; site: { headVersion: number } };
  const draft = await import("@/app/sites/draft/[siteId]/[version]/[[...path]]/route");
  const page = await draft.GET(call(null, `/sites/draft/${site.id}/${detail.site.headVersion}/?t=${detail.previewToken}`), { params: Promise.resolve({ siteId: site.id, version: String(detail.site.headVersion), path: [] }) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(`/i/${stored.blobId}`));
  assert.match(page.headers.get("content-security-policy") ?? "", /img-src 'self' data: https:/);

  // Deleting an image that is in use needs an explicit force.
  const { DELETE } = await oneRoute();
  const d1 = await DELETE(call(cookie, `/api/images/${job.id}`, { method: "DELETE" }), ctx(job.id));
  assert.equal(d1.status, 409);
  assert.equal(((await d1.json()) as { code: string }).code, "in_use");
  const d2 = await DELETE(call(cookie, `/api/images/${job.id}?force=1`, { method: "DELETE" }), ctx(job.id));
  assert.equal(d2.status, 200);
  assert.equal((await pub.GET(call(null, `/i/${stored.blobId}`), { params: Promise.resolve({ token: stored.blobId! }) })).status, 404);
});

test("no secrets or prompts in logs", async () => {
  reset();
  const lines: string[] = [];
  const keep = { e: console.error, l: console.log, w: console.warn };
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  console.log = console.error;
  console.warn = console.error;
  try {
    const { cookie } = await signIn("img-logs@example.com", "plus");
    genStatus = 401;
    genErrorBody = { error: { message: "Incorrect API key provided: sk-test-not-real" } };
    const j = await waitDone(cookie, ((await (await create(cookie, "a very secret launch banner idea")).json()) as { job: JobJson }).job.id);
    assert.equal(j.status, "failed");
    assert.ok(!/sk-test|secret launch/.test(j.error ?? ""));
  } finally {
    Object.assign(console, { error: keep.e, log: keep.l, warn: keep.w });
  }
  assert.ok(lines.length > 0, "the provider rejection was logged");
  assert.ok(!lines.join("\n").match(/sk-test|secret launch banner/), lines.join("\n"));
});

/* ───────────────────────── storage backends ───────────────────────── */

test("file backend: owner-only reads, public only after setPublic, delete removes", async () => {
  const id = newBlobId();
  await putImage(id, "wsA", png, "image/webp");
  assert.ok(await getImage("wsA", id));
  assert.equal(await getImage("wsB", id), null);
  assert.equal(await getPublicImage(id), null);
  assert.equal(await setPublic("wsB", id, true), false);
  assert.equal(await setPublic("wsA", id, true), true);
  assert.deepEqual((await getPublicImage(id))?.bytes, png);
  await deleteImage("wsA", id);
  assert.equal(await getImage("wsA", id), null);
  await assert.rejects(() => putImage("../evil", "wsA", png, "image/webp"));
  await assert.rejects(() => putImage(newBlobId(), "wsA", Buffer.alloc(5_000_000), "image/png"));
});

test("Neon backend (bytea) round-trips, enforces ownership and public flag", async (t) => {
  const fake = await installFakeNeon();
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const keep = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fake.url;
  try {
    const id = newBlobId();
    await putImage(id, "wsA", png, "image/webp");
    const got = await getImage("wsA", id);
    assert.deepEqual(got?.bytes, png);
    assert.equal(got?.contentType, "image/webp");
    assert.equal(await getImage("wsB", id), null);
    assert.equal(await getPublicImage(id), null);
    assert.equal(await setPublic("wsA", id, true), true);
    assert.deepEqual((await getPublicImage(id))?.bytes, png);
    await deleteImage("wsA", id);
    assert.equal(await getPublicImage(id), null);
  } finally {
    if (keep === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = keep;
    fake.restore();
  }
});
