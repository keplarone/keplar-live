import "./setup";
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installHfFake, HF_HOST, HF_TEST_KEY, MP4_BYTES, PNG_1PX } from "./helpers/hf-fake";
import { call, jsonReq, signIn } from "./helpers/session";
import { testWorkspace } from "./helpers/workspace";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
process.env.KEPLAR_HIGGSFIELD_BASE = HF_HOST;
process.env.HIGGSFIELD_API = HF_TEST_KEY;
process.env.KEPLAR_PUBLIC_URL = "https://keplar.one";
// The spend-spike detector (src/lib/ops/telemetry.ts, tested in ops.test.ts) checks at most every 10 s. Under a loaded parallel run this
// file outlives that window, the second check sees every test charge so far and auto-pauses media, failing the later tests.
process.env.KEPLAR_SPIKE_USD = "1000000";

import { blobs } from "@/lib/create/platform/blob";
import { toUnits, usedThisPeriod } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { mediaJobs } from "@/lib/create/repo";
import { createMediaJob, mediaUrl } from "@/lib/create/media";
import { meteredUsd } from "@/lib/orchestration/limits";
import { mintReference } from "@/lib/higgsfield/reference";
import { webhookToken } from "@/lib/higgsfield/client";
import { COMPARE_PER_MODEL, COMPARE_WINDOW, createVideoJobs, removeVideoJobs, finalizeJob, LARGE_JOB_UNITS, playbackSource, previewVideo, refreshJob, refreshById, videoConfig, VIDEO_LIMITS, VIDEO_TIMEOUT_MS, publicVideoJob, type VideoInput } from "@/lib/higgsfield/video";
import { setControls, resetOpsCache } from "@/lib/ops/controls";

const fake = installHfFake();
after(() => fake.restore());
const units = (usd: number) => toUnits(meteredUsd(usd));
let n = 0;
const prompt = "A red fox trots through fresh snow at sunrise, soft light";
const ws = async (plan: "pro" | "business" | "plus" = "pro") => testWorkspace(`vid${++n}`, plan);
type Err = { status?: number; code?: string; message?: string };
const rejectsWith = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: Err) => e.code === code, code);

beforeEach(async () => {
  fake.reset();
  process.env.HIGGSFIELD_API = HF_TEST_KEY;
  delete process.env.KEPLAR_HIGGSFIELD_OFF;
  delete process.env.VERCEL;
  await setControls({ pauseMedia: false, disabledProviders: [], autoPauseUntil: null }, "test");
  resetOpsCache();
});

const ref = (w: { id: string }, kind: "image" | "video" = "image", extra: Record<string, unknown> = {}) =>
  mintReference(w.id, kind === "image"
    ? { kind, url: `${HF_HOST}/ref/${++n}`, contentType: "image/png", bytes: PNG_1PX.length, name: "a.png" }
    : { kind, url: `${HF_HOST}/ref/v${++n}`, contentType: "video/mp4", bytes: 50_000, durationSec: 8, name: "a.mp4", ...extra });

/** Previews with the account quote of $0.70 and confirms exactly that. */
async function start(w: Awaited<ReturnType<typeof ws>>, input: VideoInput = {}) {
  const pv = await previewVideo(w, { prompt, ...input });
  return createVideoJobs(w, { prompt, ...input, confirmUnits: pv.totalUnits ?? -1 });
}

/* ── preview / pricing ── */

test("preview: the account quote wins; credits = quote x1.1 margin / $0.002; one item per model", async () => {
  const w = await ws();
  fake.state.estimate = { mode: "price", usd: "0.70" };
  const pv = await previewVideo(w, { prompt, durationSec: 5 });
  assert.equal(pv.items.length, 1);
  assert.equal(pv.items[0].modelId, "hf/bytedance/seedance-2.0/text-to-video");
  assert.equal(pv.items[0].source, "estimate");
  assert.equal(pv.totalUnits, units(0.7));
  assert.equal(pv.priceKnown, true);
  assert.equal(fake.submits().length, 0, "a preview never submits");
});

test("preview: without an account quote the published list price is used; unpublished tiers stay TBD", async () => {
  const w = await ws();
  fake.state.estimate = { mode: "none", usd: "0" };
  const seed = await previewVideo(w, { prompt, durationSec: 5 });
  assert.equal(seed.items[0].source, "list");
  assert.equal(seed.items[0].usd, 0.7035);
  assert.equal(seed.totalUnits, units(0.7035));
  const kling = await previewVideo(w, { prompt, durationSec: 5, model: "hf/kling-video/v3.0/std/text-to-video" });
  assert.equal(kling.items[0].source, "tbd");
  assert.equal(kling.items[0].units, null);
  assert.equal(kling.priceKnown, false);
  assert.equal(kling.totalUnits, null);
  assert.match(kling.items[0].priceNote, /TBD/);
});

test("preview: moving off the list basis (1080p, muted) without a quote makes the price TBD rather than guessing", async () => {
  const w = await ws();
  fake.state.estimate = { mode: "none", usd: "0" };
  const pv = await previewVideo(w, { prompt, durationSec: 5, resolution: "1080p" });
  assert.equal(pv.items[0].source, "tbd");
  const muted = await previewVideo(w, { prompt, durationSec: 5, sound: false });
  assert.equal(muted.items[0].source, "tbd");
  fake.state.estimate = { mode: "price", usd: "0.95" };
  const quoted = await previewVideo(w, { prompt, durationSec: 5, resolution: "1080p" });
  assert.equal(quoted.items[0].units, units(0.95));
  assert.deepEqual(quoted.items[0].applied, ["resolution"]);
});

test("the quote is requested for the exact request body (options reach the estimate)", async () => {
  const w = await ws();
  await previewVideo(w, { prompt, durationSec: 7, aspectRatio: "9:16", resolution: "1080p", sound: false });
  const est = fake.calls((s) => s.path.startsWith("/estimate/")).at(-1)!;
  assert.equal(est.path, "/estimate/bytedance/seedance-2.0/text-to-video");
  assert.deepEqual(est.body, { prompt, resolution: "1080p", generate_audio: false, duration: 7, aspect_ratio: "9:16" });
});

test("options a model does not document are reported as ignored and never sent", async () => {
  const w = await ws();
  const pv = await previewVideo(w, { prompt, durationSec: 6, model: "hf/minimax/hailuo-2.3/standard/text-to-video", resolution: "1080p", sound: true, negativePrompt: "blur" });
  assert.deepEqual(pv.items[0].ignoredOptions.sort(), ["negativePrompt", "resolution", "sound"]);
  assert.deepEqual(pv.items[0].applied, []);
  const k25 = await previewVideo(w, { prompt, durationSec: 5, model: "hf/kling-video/v2.5-turbo/pro/text-to-video", negativePrompt: "blur", sound: true });
  assert.deepEqual(k25.items[0].applied, ["negativePrompt"]);
  assert.deepEqual(k25.items[0].ignoredOptions, ["sound"]);
});

test("duration snaps to what the model allows and the plan's maximum (Pro 8 s, Business 10 s)", async () => {
  const pro = await ws("pro");
  assert.equal((await previewVideo(pro, { prompt, durationSec: 15 })).items[0].durationSec, 8);
  const biz = await ws("business");
  assert.equal((await previewVideo(biz, { prompt, durationSec: 15 })).items[0].durationSec, 10);
  assert.equal((await previewVideo(pro, { prompt, durationSec: 9, model: "hf/kling-video/v2.5-turbo/pro/text-to-video" })).items[0].durationSec, 5, "5 or 10 s only; 10 exceeds the Pro limit");
});

/* ── gating ── */

test("not configured: previews and creates are refused with 503 and nothing is sent", async () => {
  const w = await ws();
  delete process.env.HIGGSFIELD_API;
  await rejectsWith(previewVideo(w, { prompt }), "not_configured");
  await rejectsWith(createVideoJobs(w, { prompt, confirmUnits: 1 }), "not_configured");
  assert.equal(fake.state.seen.length, 0);
  assert.equal(videoConfig(w).label, "Not configured");
  assert.equal(videoConfig(w).configured, false);
  process.env.KEPLAR_HIGGSFIELD_OFF = "1";
  process.env.HIGGSFIELD_API = HF_TEST_KEY;
  await rejectsWith(previewVideo(w, { prompt }), "not_configured");
});

test("Free, Lite and Plus have no video", async () => {
  for (const plan of ["plus"] as const) {
    const w = await ws(plan);
    await assert.rejects(previewVideo(w, { prompt }), /Pro and Business/);
    assert.equal(videoConfig(w).available, false);
    assert.equal(videoConfig(w).upgradeTo, "pro");
  }
  assert.equal(VIDEO_LIMITS.free, null);
  assert.equal(VIDEO_LIMITS.lite, null);
  assert.equal(fake.state.seen.length, 0);
});

test("prompt checks: too short, too long, and refused content never reach Higgsfield", async () => {
  const w = await ws();
  await assert.rejects(previewVideo(w, { prompt: "hi" }), (e: Err) => e.status === 400);
  await assert.rejects(previewVideo(w, { prompt: "x".repeat(1001) }), (e: Err) => e.status === 413);
  const est = await previewVideo(w, { prompt });
  assert.equal(est.items.length, 1);
  fake.reset();
  await rejectsWith(createVideoJobs(w, { prompt: "Barack Obama holding a sign", confirmUnits: 1 }), "refused");
  await rejectsWith(createVideoJobs(w, { prompt: "hardcore porn scene", confirmUnits: 1 }), "refused");
  assert.equal(fake.submits().length, 0);
  assert.equal((await mediaJobs().list(w.id)).length, 0, "no job rows for refused prompts");
});

test("unknown models and too many compare models are refused", async () => {
  const w = await ws();
  await rejectsWith(previewVideo(w, { prompt, model: "hf/nope" }), "bad_model");
  await rejectsWith(previewVideo(w, { prompt, model: "hf/z-image/turbo" }), "bad_model");
  await rejectsWith(previewVideo(w, { prompt, models: ["hf/bytedance/seedance-2.0/text-to-video", "hf/kling-video/v3.0/std/text-to-video", "hf/kling-video/v2.5-turbo/pro/text-to-video"] }), "too_many_models");
});

test("ops pause for media stops new video work too", async () => {
  const w = await ws();
  await setControls({ pauseMedia: true }, "test");
  resetOpsCache();
  await assert.rejects(start(w), (e: Err) => (e.status ?? 0) >= 400);
  assert.equal(fake.submits().length, 0);
});

/* ── approval ── */

test("create requires the exact previewed credits (409 confirm); a wrong number is refused; nothing is submitted until confirmed", async () => {
  const w = await ws();
  await rejectsWith(createVideoJobs(w, { prompt, durationSec: 5 }), "confirm");
  await rejectsWith(createVideoJobs(w, { prompt, durationSec: 5, confirmUnits: units(0.7) - 1 }), "confirm");
  assert.equal(fake.submits().length, 0);
  assert.equal((await mediaJobs().list(w.id)).length, 0);
  const [job] = await createVideoJobs(w, { prompt, durationSec: 5, confirmUnits: units(0.7) });
  assert.ok(job.hf?.requestId);
  assert.equal(fake.submits().length, 1);
  assert.equal(job.estimatedUnits, units(0.7));
  assert.equal(job.units, null, "nothing is charged at submit");
});

test("large jobs need a second explicit acknowledgement", async () => {
  const w = await ws("business");
  fake.state.estimate = { mode: "price", usd: "1.60" }; // 1.6 x1.1 / 0.002 = 880 credits per clip; two clips pass the line
  assert.ok(units(1.6) * 2 >= LARGE_JOB_UNITS);
  const total = units(1.6) * 2;
  await rejectsWith(createVideoJobs(w, { prompt, count: 2, confirmUnits: total }), "confirm_large");
  assert.equal(fake.submits().length, 0);
  const jobs = await createVideoJobs(w, { prompt, count: 2, confirmUnits: total, acknowledgeLarge: true });
  assert.equal(jobs.length, 2);
});

test("a submission sends the model's documented body, an Idempotency-Key equal to the job id, and a signed webhook URL", async () => {
  const w = await ws();
  const [job] = await start(w, { durationSec: 6, aspectRatio: "1:1", resolution: "1080p", sound: false });
  const s = fake.submits()[0];
  assert.equal(s.path, "/bytedance/seedance-2.0/text-to-video");
  assert.equal(s.headers["idempotency-key"], job.id);
  assert.deepEqual(s.body, { prompt, resolution: "1080p", generate_audio: false, duration: 6, aspect_ratio: "1:1" });
  const hook = new URL(s.query.get("hf_webhook")!);
  assert.equal(hook.pathname, "/api/webhooks/higgsfield");
  assert.equal(hook.searchParams.get("j"), job.id);
  assert.equal(hook.searchParams.get("t"), webhookToken(w.id, job.id));
  assert.ok(!JSON.stringify(s.body).includes("secret_test"));
});

test("the same idempotency key creates the job once", async () => {
  const w = await ws();
  const input = { prompt, durationSec: 5, confirmUnits: units(0.7), idempotencyKey: "client-key-0001" };
  const a = await createVideoJobs(w, input);
  const b = await createVideoJobs(w, input);
  assert.equal(a[0].id, b[0].id);
  assert.equal((await mediaJobs().list(w.id)).length, 1);
  assert.equal(fake.submits().length, 1);
});

/* ── lifecycle ── */

test("queued -> running -> completed: stored in Keplar storage, charged once, playable", async () => {
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const [job] = await start(w);
  assert.equal(job.status, "queued");
  fake.setAll("in_progress");
  const running = await refreshJob(job, { force: true });
  assert.equal(running.status, "running");
  const before = await usedThisPeriod(w);
  fake.setAll("completed");
  const done = await refreshJob(running, { force: true });
  assert.equal(done.status, "completed");
  assert.equal(done.units, units(0.7));
  assert.equal(done.hf?.storedCopy, true);
  assert.equal(done.contentType, "video/mp4");
  assert.equal(await usedThisPeriod(w) - before, units(0.7));
  const stored = await blobs().get(done.outputKey!);
  assert.equal(stored!.body.length, MP4_BYTES.length);
  // Polling again (or a duplicate webhook) does nothing more.
  await refreshJob(done, { force: true });
  await refreshById(w.id, job.id);
  assert.equal(await usedThisPeriod(w) - before, units(0.7), "charged exactly once");
  const pub = publicVideoJob(done);
  assert.equal(pub.url, `/api/create/media/${job.id}/file`);
  assert.ok(!JSON.stringify(pub).includes(HF_HOST), "the provider URL is not exposed in the job JSON");
});

test("concurrent finalizers (poll + webhook at once) still charge once", async () => {
  const w = await ws();
  const [job] = await start(w);
  const before = await usedThisPeriod(w);
  const st = { status: "completed" as const, request_id: job.hf!.requestId!, video: { url: `${HF_HOST}/out/video-x.mp4` } };
  await Promise.all([finalizeJob(job, st), finalizeJob(job, st), finalizeJob(job, st)]);
  assert.equal(await usedThisPeriod(w) - before, units(0.7));
  assert.equal((await mediaJobs().get(w.id, job.id))!.status, "completed");
});

test("failed and nsfw are not charged and say so", async () => {
  for (const [terminal, status, code] of [["failed", "failed", "failed"], ["nsfw", "blocked", "nsfw"], ["canceled", "failed", "canceled"]] as const) {
    const w = await ws();
    fake.state.nextTerminal = "queued";
    const [job] = await start(w);
    const before = await usedThisPeriod(w);
    fake.setAll(terminal);
    const out = await refreshJob(job, { force: true });
    assert.equal(out.status, status, terminal);
    assert.equal(out.hf?.errorCode, code);
    assert.equal(out.units, null);
    assert.match(out.error ?? "", /Nothing was charged/);
    assert.equal(await usedThisPeriod(w), before);
  }
});

test("a result that is not a video file is failed and not charged", async () => {
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const [job] = await start(w);
  fake.state.outputBytes = Buffer.from("<html>not a video at all, just text</html>");
  fake.setAll("completed");
  const before = await usedThisPeriod(w);
  const out = await refreshJob(job, { force: true });
  assert.equal(out.status, "failed");
  assert.equal(out.hf?.errorCode, "bad_output");
  assert.equal(await usedThisPeriod(w), before);
});

test("timeout: after 25 minutes the job is canceled upstream, failed, and not charged", async () => {
  const w = await ws();
  fake.state.nextTerminal = "in_progress";
  const [job] = await start(w);
  const at = Date.parse(job.hf!.submittedAt!) + VIDEO_TIMEOUT_MS + 5_000;
  const before = await usedThisPeriod(w);
  const out = await refreshJob(job, { force: true, at });
  assert.equal(out.status, "failed");
  assert.equal(out.hf?.errorCode, "timeout");
  assert.ok(fake.calls((s) => s.path.endsWith("/cancel")).length >= 1);
  assert.equal(await usedThisPeriod(w), before);
});

test("polling is throttled, and a transient status error keeps the job running", async () => {
  const w = await ws();
  fake.state.nextTerminal = "in_progress";
  const [job] = await start(w);
  const polls = () => fake.calls((s) => s.method === "GET" && s.path.endsWith("/status")).length;
  const a = await refreshJob(job, { force: true });
  assert.equal(polls(), 1);
  await refreshJob(a);
  assert.equal(polls(), 1, "a second read within the gap does not hit Higgsfield again");
  fake.state.statusFailures = [503, 503, 503, 503];
  const b = await refreshJob(a, { force: true, sleepMs: () => 0 });
  assert.equal(b.status, "running");
});

test("a submission that Higgsfield keeps rejecting fails the job with a plain message, no charge, and does not use up the daily allowance", async () => {
  const w = await ws();
  fake.state.submitFailures = [403, 403, 403];
  const before = await usedThisPeriod(w);
  const [job] = await start(w);
  assert.equal(job.status, "failed");
  assert.equal(job.hf?.errorCode, "credits");
  assert.match(job.error ?? "", /Nothing was charged/);
  assert.ok(!/credit balance|403|Higgsfield account/i.test(job.error ?? ""), "provider details are not shown to the user");
  assert.equal(await usedThisPeriod(w), before);
  // Failed-before-submission jobs do not count against the day.
  const limit = VIDEO_LIMITS.pro!.perDay;
  for (let i = 0; i < 2; i++) {
    await mediaJobs().insert({ ...job, id: `med_fail_${i}_${n}`, status: "failed", hf: { ...job.hf!, requestId: null } });
  }
  fake.reset();
  const ok = await start(w);
  assert.equal(ok[0].status, "queued");
  assert.ok(limit > 2);
});

test("a transient 503 on submit is retried with the same Idempotency-Key and succeeds", async () => {
  const w = await ws();
  fake.state.submitFailures = [503];
  const [job] = await start(w);
  assert.ok(job.hf?.requestId);
  const subs = fake.submits();
  assert.equal(subs.length, 2);
  assert.equal(subs[0].headers["idempotency-key"], subs[1].headers["idempotency-key"]);
});

test("a job whose submission never reached Higgsfield is failed after a minute", async () => {
  const w = await ws();
  const [job] = await start(w);
  const orphan = await mediaJobs().insert({ ...job, id: `med_orphan_${n}`, status: "queued", hf: { ...job.hf!, requestId: null } });
  assert.equal((await refreshJob(orphan, { at: Date.parse(orphan.createdAt) + 10_000 })).status, "queued");
  assert.equal((await refreshJob(orphan, { at: Date.parse(orphan.createdAt) + 90_000 })).status, "failed");
});

/* ── plan limits ── */

test("concurrent limit: Pro can have 2 videos in flight", async () => {
  const w = await ws();
  fake.state.nextTerminal = "queued";
  await start(w, { count: 2 });
  await rejectsWith(start(w), "too_many_jobs");
});

test("daily limit: Pro 6 videos per rolling day; older ones free up", async () => {
  const w = await ws();
  const L = VIDEO_LIMITS.pro!;
  const [seed] = await start(w);
  for (let i = 0; i < L.perDay - 1; i++) await mediaJobs().insert({ ...seed, id: `med_day_${n}_${i}`, status: "completed", completedAt: new Date().toISOString() });
  await rejectsWith(start(w), "daily_limit");
  // 25 hours later the oldest rows no longer count.
  for (const r of await mediaJobs().list(w.id)) await mediaJobs().update(w.id, r.id, { createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
  const again = await start(w);
  assert.equal(again[0].status, "queued");
});

test("per-minute limit protects Higgsfield from bursts", async () => {
  const w = await ws("business");
  const L = VIDEO_LIMITS.business!;
  fake.state.nextTerminal = "completed";
  let hit: Err | null = null;
  for (let i = 0; i < L.perMin + 2 && !hit; i++) {
    try {
      const jobs = await start(w);
      fake.setAll("completed");
      for (const j of jobs) await refreshJob(j, { force: true });
    } catch (e) { hit = e as Err; }
  }
  assert.equal(hit?.code, "rate_limited");
});

test("Compare: one job per model with a shared compare id, priced as the sum, capped by plan", async () => {
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const jobs = await start(w, { models: ["hf/bytedance/seedance-2.0/text-to-video", "hf/kling-video/v2.5-turbo/pro/text-to-video"], durationSec: 5 });
  assert.equal(jobs.length, 2);
  assert.equal(new Set(jobs.map((j) => j.hf!.compareId)).size, 1);
  assert.ok(jobs[0].hf!.compareId);
  assert.deepEqual(fake.submits().map((s) => s.path).sort(), ["/bytedance/seedance-2.0/text-to-video", "/kling-video/v2.5-turbo/pro/text-to-video"]);
});

test("Compare is refused as a whole when any model's price is TBD (no quote, no list price)", async () => {
  const w = await ws();
  fake.state.estimate = { mode: "none", usd: "0" };
  await rejectsWith(createVideoJobs(w, { prompt, models: ["hf/bytedance/seedance-2.0/text-to-video", "hf/kling-video/v3.0/std/text-to-video"], confirmUnits: 1 }), "price_tbd");
  assert.equal(fake.submits().length, 0);
  assert.equal((await mediaJobs().list(w.id)).length, 0);
});

test("outputs: count clips of the same model are separate jobs, limited by concurrency", async () => {
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const pv = await previewVideo(w, { prompt, count: 2 });
  assert.equal(pv.items[0].count, 2);
  assert.equal(pv.totalUnits, units(0.7) * 2);
  const huge = await previewVideo(w, { prompt, count: 50 });
  assert.equal(huge.items[0].count, VIDEO_LIMITS.pro!.concurrent);
  assert.equal(videoConfig(w).limits!.maxOutputs, VIDEO_LIMITS.pro!.concurrent);
});

/* ── references ── */

test("a reference is ignored (and flagged) by text-only models, and not sent", async () => {
  const w = await ws();
  const pv = await previewVideo(w, { prompt, references: [ref(w)], rightsConfirmed: true });
  assert.equal(pv.items[0].ignoresRefs, true);
  assert.equal(pv.items[0].usesRefs.image, false);
  const [job] = await createVideoJobs(w, { prompt, references: [ref(w)], rightsConfirmed: true, confirmUnits: pv.totalUnits! });
  assert.equal(job.hf!.refs!.ignored, true);
  const body = fake.submits()[0].body as Record<string, unknown>;
  assert.equal(body.image_url, undefined);
  assert.equal(body.image_urls, undefined);
});

test("image-to-video needs an image; with one, the image URL is sent and the cost preview includes it", async () => {
  const w = await ws();
  const i2v = "hf/bytedance/seedance-2.0/image-to-video";
  const none = await previewVideo(w, { prompt, model: i2v });
  assert.equal(none.items[0].problem, "Add a reference image.");
  await assert.rejects(createVideoJobs(w, { prompt, model: i2v, confirmUnits: 1 }), (e: Err) => e.code === "model_unavailable");
  const r = ref(w);
  const pv = await previewVideo(w, { prompt, model: i2v, references: [r], rightsConfirmed: true });
  assert.equal(pv.items[0].problem, null);
  assert.equal(pv.items[0].usesRefs.image, true);
  assert.equal(pv.refs.images, 1);
  const est = fake.calls((s) => s.path.startsWith("/estimate/")).at(-1)!;
  assert.equal((est.body as { image_url: string }).image_url, r.url, "the quote is for the request with the reference");
  const [job] = await createVideoJobs(w, { prompt, model: i2v, references: [r], rightsConfirmed: true, confirmUnits: pv.totalUnits! });
  assert.equal((fake.submits()[0].body as { image_url: string }).image_url, r.url);
  assert.equal(job.hf!.refs!.images, 1);
  assert.ok(job.hf!.rightsConfirmedAt);
});

test("references need the rights confirmation, a valid signature, and the reference image is moderated", async () => {
  const w = await ws();
  const other = await ws();
  const i2v = "hf/bytedance/seedance-2.0/image-to-video";
  await rejectsWith(previewVideo(w, { prompt, model: i2v, references: [ref(w)] }), "rights_required");
  await rejectsWith(previewVideo(w, { prompt, model: i2v, references: [ref(other)], rightsConfirmed: true }), "bad_reference");
  assert.equal(fake.submits().length, 0);
});

test("motion transfer: needs a source video and an image; the output follows the source, capped by plan", async () => {
  const w = await ws();
  const m = "hf/higgsfield/genjutsu/motion-transfer/v1.0";
  assert.match((await previewVideo(w, { prompt, model: m })).items[0].problem ?? "", /source video/);
  assert.match((await previewVideo(w, { prompt, model: m, references: [ref(w, "video")], rightsConfirmed: true })).items[0].problem ?? "", /reference image/);
  const long = await previewVideo(w, { prompt, model: m, references: [ref(w), ref(w, "video", { durationSec: 12 })], rightsConfirmed: true });
  assert.match(long.items[0].problem ?? "", /up to 8 s/);
  const okRefs = [ref(w), ref(w, "video", { durationSec: 6 })];
  const ok = await previewVideo(w, { prompt, model: m, references: okRefs, rightsConfirmed: true });
  assert.equal(ok.items[0].problem, null);
  assert.equal(ok.items[0].durationSec, 6);
  const [job] = await createVideoJobs(w, { prompt, model: m, references: okRefs, rightsConfirmed: true, confirmUnits: ok.totalUnits! });
  const body = fake.submits()[0].body as Record<string, unknown>;
  assert.equal(body.video_url, okRefs[1].url);
  assert.deepEqual(body.image_urls, [okRefs[0].url]);
  assert.equal(body.duration, undefined);
  assert.equal(job.hf!.refs!.video, true);
});

test("Compare with a reference: models that use it get it, text-only models are marked as ignoring it", async () => {
  const w = await ws();
  const r = ref(w);
  const pv = await previewVideo(w, { prompt, models: ["hf/bytedance/seedance-2.0/text-to-video", "hf/bytedance/seedance-2.0/image-to-video"], references: [r], rightsConfirmed: true });
  const by = Object.fromEntries(pv.items.map((i) => [i.modelId, i]));
  assert.equal(by["hf/bytedance/seedance-2.0/text-to-video"].ignoresRefs, true);
  assert.equal(by["hf/bytedance/seedance-2.0/image-to-video"].usesRefs.image, true);
  await createVideoJobs(w, { prompt, models: pv.items.map((i) => i.modelId), references: [r], rightsConfirmed: true, confirmUnits: pv.totalUnits! });
  const withImg = fake.submits().find((s) => s.path.endsWith("image-to-video"))!;
  const without = fake.submits().find((s) => s.path.endsWith("text-to-video"))!;
  assert.equal((withImg.body as { image_url: string }).image_url, r.url);
  assert.equal((without.body as Record<string, unknown>).image_url, undefined);
});

/* ── routes ── */

const route = () => import("@/app/api/create/media/video/route");
const previewRoute = () => import("@/app/api/create/media/video/preview/route");
const refRoute = () => import("@/app/api/create/media/reference/route");
const fileRoute = () => import("@/app/api/create/media/[id]/file/route");
const hookRoute = () => import("@/app/api/webhooks/higgsfield/route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

test("GET config: signed-out is refused; Pro sees Beta, the Higgsfield default and per-model options", async () => {
  const { GET } = await route();
  assert.equal((await GET(call(null, "/api/create/media/video"))).status, 401);
  const { cookie } = await signIn("video-pro-1@example.com", "pro");
  const res = await GET(call(cookie, "/api/create/media/video"));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { config: ReturnType<typeof videoConfig>; jobs: unknown[] };
  assert.equal(j.config.label, "Beta");
  assert.equal(j.config.defaultModel, "hf/bytedance/seedance-2.0/text-to-video");
  const seed = j.config.models.find((m) => m.id === j.config.defaultModel)!;
  assert.equal(seed.default, true);
  assert.deepEqual(seed.options.resolutions, ["480p", "720p", "1080p", "4k"]);
  assert.equal(seed.options.sound, true);
  assert.equal(seed.options.negativePrompt, false);
  const hailuo = j.config.models.find((m) => m.id.includes("hailuo") && m.id.endsWith("text-to-video"))!;
  assert.equal(hailuo.options.resolutions, null);
  assert.equal(hailuo.options.sound, false);
  assert.ok(j.config.models.every((m) => !m.durations || m.durations.every((d) => d <= 8)), "Pro durations are capped at 8 s");
  assert.ok(j.config.models.find((m) => m.id.includes("kling-video/v3.0/std/text"))!.price.known === false);
  assert.ok(!JSON.stringify(j).includes("secret_test"));
  assert.deepEqual(j.jobs, []);
});

test("GET config when not configured says so, and a Plus plan is told what it needs", async () => {
  const { GET } = await route();
  const pro = await signIn("video-pro-2@example.com", "pro");
  delete process.env.HIGGSFIELD_API;
  const a = (await (await GET(call(pro.cookie, "/api/create/media/video"))).json()) as { config: { label: string; configured: boolean } };
  assert.equal(a.config.label, "Not configured");
  assert.equal(a.config.configured, false);
  process.env.HIGGSFIELD_API = HF_TEST_KEY;
  const plus = await signIn("video-plus-1@example.com", "plus");
  const b = (await (await GET(call(plus.cookie, "/api/create/media/video"))).json()) as { config: { available: boolean; message: string } };
  assert.equal(b.config.available, false);
  assert.match(b.config.message, /Pro and Business/);
});

test("POST preview and create over HTTP: 409 asks for confirmation, then 202 with the job; the job reads back with progress", async () => {
  const { cookie } = await signIn("video-pro-3@example.com", "pro");
  const { POST: preview } = await previewRoute();
  const { POST, GET } = await route();
  const pv = await preview(jsonReq(cookie, "/api/create/media/video/preview", "POST", { prompt, durationSec: 5 }));
  assert.equal(pv.status, 200);
  const pj = (await pv.json()) as { preview: { totalUnits: number } };
  assert.equal(pj.preview.totalUnits, units(0.7));
  const first = await POST(jsonReq(cookie, "/api/create/media/video", "POST", { prompt, durationSec: 5 }));
  assert.equal(first.status, 409);
  assert.equal(((await first.json()) as { code: string }).code, "confirm");
  const second = await POST(jsonReq(cookie, "/api/create/media/video", "POST", { prompt, durationSec: 5, confirmUnits: pj.preview.totalUnits }));
  assert.equal(second.status, 202);
  const jobs = ((await second.json()) as { jobs: { id: string; status: string }[] }).jobs;
  assert.equal(jobs.length, 1);
  const list = (await (await GET(call(cookie, "/api/create/media/video"))).json()) as { jobs: { id: string; status: string }[] };
  assert.equal(list.jobs[0].id, jobs[0].id);
  assert.equal(list.jobs[0].status, "completed", "the read advanced the job (fake completes immediately)");
});

test("file route: owner-only; plays Keplar's stored copy, or redirects to the provider URL on Vercel", async () => {
  const owner = await signIn("video-pro-4@example.com", "pro");
  const stranger = await signIn("video-pro-5@example.com", "pro");
  const { POST } = await route();
  const { GET: file } = await fileRoute();
  const r = await POST(jsonReq(owner.cookie, "/api/create/media/video", "POST", { prompt, durationSec: 5, confirmUnits: units(0.7) }));
  const id = ((await r.json()) as { jobs: { id: string }[] }).jobs[0].id;
  const w = (await workspaceById(owner.workspaceId, "pro"))!;
  await refreshJob((await mediaJobs().get(w.id, id))!, { force: true });
  const ok = await file(call(owner.cookie, `/api/create/media/${id}/file`), ctx(id));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "video/mp4");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await ok.arrayBuffer()).length, MP4_BYTES.length);
  assert.equal((await file(call(stranger.cookie, `/api/create/media/${id}/file`), ctx(id))).status, 404);
  assert.equal((await file(call(null, `/api/create/media/${id}/file`), ctx(id))).status, 401);
  process.env.VERCEL = "1";
  try {
    const redirect = await file(call(owner.cookie, `/api/create/media/${id}/file`), ctx(id));
    assert.equal(redirect.status, 302);
    assert.match(redirect.headers.get("location")!, /\/out\/video-/);
  } finally { delete process.env.VERCEL; }
});

test("playback source: stored copy, remote while kept, gone afterwards", async () => {
  const w = await ws();
  const [job] = await start(w);
  const base = { ...job, status: "completed" as const, outputKey: "media/x.mp4", completedAt: new Date().toISOString(), hf: { ...job.hf!, outputUrl: "https://cdn/x.mp4", storedCopy: true } };
  assert.equal(playbackSource(base).kind, "blob");
  process.env.VERCEL = "1";
  try { assert.equal(playbackSource(base).kind, "remote"); } finally { delete process.env.VERCEL; }
  const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
  assert.equal(playbackSource({ ...base, completedAt: old, hf: { ...base.hf, storedCopy: false } }).kind, "gone");
  assert.equal(playbackSource({ ...base, outputKey: null, hf: { ...base.hf, storedCopy: false } }, Date.now()).kind, "remote");
});

test("reference route: inline upload keeps the original bytes and returns a signed reference; bad files are refused", async () => {
  const { POST } = await refRoute();
  const { cookie, workspaceId } = await signIn("video-pro-6@example.com", "pro");
  const png = (await import("sharp")).default;
  const real = await png({ create: { width: 64, height: 64, channels: 3, background: "#369" } }).png().toBuffer();
  const body = (o: Record<string, unknown>) => jsonReq(cookie, "/api/create/media/reference", "POST", o);
  const res = await POST(body({ mode: "inline", kind: "image", contentType: "image/png", name: "pic.png", data: real.toString("base64") }));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { reference: { url: string; bytes: number; token: string } };
  assert.equal(j.reference.bytes, real.length, "original bytes, not re-encoded");
  const put = fake.calls((s) => s.method === "PUT" && s.path.startsWith("/upload/")).at(-1);
  assert.ok(put, "uploaded to the presigned URL");
  assert.equal(put!.headers["authorization"], undefined, "the storage host never sees the Higgsfield key");
  assert.equal((await import("@/lib/higgsfield/reference")).verifyReference(workspaceId, j.reference).url, j.reference.url);
  // Content that is not what it claims.
  assert.equal((await POST(body({ mode: "inline", kind: "image", contentType: "image/png", data: Buffer.from("MZ not an image at all").toString("base64") }))).status, 415);
  assert.equal((await POST(body({ mode: "inline", kind: "image", contentType: "image/gif", data: real.toString("base64") }))).status, 415);
  // Too big for inline: told to upload directly.
  const big = Buffer.concat([real, Buffer.alloc(3_100_000)]);
  const tooBig = await POST(body({ mode: "inline", kind: "image", contentType: "image/png", data: big.toString("base64") }));
  assert.equal(tooBig.status, 413);
  assert.equal(((await tooBig.json()) as { code: string }).code, "use_presign");
});

test("reference route: large files get a presigned direct upload (no bytes through Keplar); limits are enforced up front", async () => {
  const { POST } = await refRoute();
  const { cookie, workspaceId } = await signIn("video-pro-7@example.com", "pro");
  const body = (o: Record<string, unknown>) => jsonReq(cookie, "/api/create/media/reference", "POST", o);
  const res = await POST(body({ mode: "presign", kind: "video", contentType: "video/mp4", name: "clip.mp4", bytes: 60_000_000, durationSec: 12 }));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { reference: { kind: string; bytes: number; durationSec: number; url: string; token: string }; upload: { url: string; method: string } };
  assert.equal(j.upload.method, "PUT");
  assert.match(j.upload.url, /\/upload\//);
  assert.equal(j.reference.bytes, 60_000_000);
  assert.equal((await import("@/lib/higgsfield/reference")).verifyReference(workspaceId, j.reference).durationSec, 12);
  assert.equal((await POST(body({ mode: "presign", kind: "video", contentType: "video/mp4", bytes: 200_000_000, durationSec: 12 }))).status, 413);
  assert.equal((await POST(body({ mode: "presign", kind: "video", contentType: "video/mp4", bytes: 1_000_000, durationSec: 2 }))).status, 400);
  assert.equal((await POST(body({ mode: "presign", kind: "image", contentType: "image/png", bytes: 11_000_000 }))).status, 413);
  assert.equal((await POST(body({ mode: "presign", kind: "image", contentType: "application/pdf", bytes: 1000 }))).status, 415);
});

test("reference route: not configured -> 503 and nothing is uploaded; signed-out -> 401", async () => {
  const { POST } = await refRoute();
  assert.equal((await POST(jsonReq(null, "/api/create/media/reference", "POST", { mode: "presign" }))).status, 401);
  const { cookie } = await signIn("video-pro-8@example.com", "pro");
  delete process.env.HIGGSFIELD_API;
  const res = await POST(jsonReq(cookie, "/api/create/media/reference", "POST", { mode: "presign", kind: "image", contentType: "image/png", bytes: 1000 }));
  assert.equal(res.status, 503);
  assert.equal(fake.state.seen.length, 0);
});

test("webhook: bad token 404, bad payload 400; a valid delivery finalizes once even when delivered twice", async () => {
  const { POST: hook } = await hookRoute();
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const [job] = await start(w);
  fake.setAll("completed");
  const url = (t: string) => `/api/webhooks/higgsfield?w=${w.id}&j=${job.id}&t=${t}`;
  const post = (u: string, b: unknown = { request_id: job.hf!.requestId, status: "completed" }) => hook(new Request(`https://keplar.one${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));
  assert.equal((await post(url("0".repeat(40)))).status, 404);
  assert.equal((await post(`/api/webhooks/higgsfield?w=${w.id}&j=${job.id}`)).status, 404);
  assert.equal((await mediaJobs().get(w.id, job.id))!.status, "queued", "a forged call changes nothing");
  assert.equal((await post(url(webhookToken(w.id, job.id)), { nope: true })).status, 400);
  const before = await usedThisPeriod(w);
  assert.equal((await post(url(webhookToken(w.id, job.id)))).status, 200);
  assert.equal((await post(url(webhookToken(w.id, job.id)))).status, 200);
  assert.equal((await mediaJobs().get(w.id, job.id))!.status, "completed");
  assert.equal(await usedThisPeriod(w) - before, units(0.7));
});

test("webhook payload is never trusted: a 'completed' claim for a job Higgsfield still reports queued stays queued", async () => {
  const { POST: hook } = await hookRoute();
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const [job] = await start(w);
  const before = await usedThisPeriod(w);
  const res = await hook(new Request(`https://keplar.one/api/webhooks/higgsfield?w=${w.id}&j=${job.id}&t=${webhookToken(w.id, job.id)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ request_id: job.hf!.requestId, status: "completed", payload: { video: { url: "https://evil.example/x.mp4" } } }),
  }));
  assert.equal(res.status, 200);
  assert.equal((await mediaJobs().get(w.id, job.id))!.status, "queued");
  assert.equal(await usedThisPeriod(w), before);
  assert.equal(fake.calls((s) => s.path.includes("evil")).length, 0);
});

/* ── the existing media entry point ── */

test("createMediaJob for video without a model routes to Higgsfield by default and asks for approval first", async () => {
  const w = await ws();
  await assert.rejects(createMediaJob(w, { kind: "video", prompt, durationSec: 5 }), (e: Err) => e.code === "confirm");
  const job = (await createMediaJob(w, { kind: "video", prompt, durationSec: 5, confirmUnits: units(0.7) })) as { id: string; model: string; hf?: unknown };
  assert.equal(job.model, "hf/bytedance/seedance-2.0/text-to-video");
  assert.ok(job.hf);
  assert.equal(fake.submits().length, 1);
  assert.equal(mediaUrl((await mediaJobs().get(w.id, job.id))!), null, "no URL until the video exists");
});

/* ── Compare: 6 outputs per model, side by side ── */

const TWO = ["hf/bytedance/seedance-2.0/text-to-video", "hf/kling-video/v2.5-turbo/pro/text-to-video"];
async function startCompare(w: Awaited<ReturnType<typeof ws>>, input: VideoInput = {}) {
  const pv = await previewVideo(w, { prompt, compare: true, durationSec: 5, ...input });
  return createVideoJobs(w, { prompt, compare: true, durationSec: 5, ...input, confirmUnits: pv.totalUnits ?? -1, acknowledgeLarge: true });
}

test("Compare defaults to 6 outputs per model and prices the whole run exactly (sum of every clip)", async () => {
  const w = await ws();
  const one = await previewVideo(w, { prompt, compare: true, durationSec: 5 });
  assert.equal(one.compare, true);
  assert.equal(one.items[0].count, COMPARE_PER_MODEL);
  assert.equal(one.totalUnits, units(0.7) * 6);
  const two = await previewVideo(w, { prompt, compare: true, models: TWO, durationSec: 5 });
  assert.equal(two.items.length, 2);
  assert.ok(two.items.every((i) => i.count === 6));
  assert.equal((await previewVideo(w, { prompt, compare: true, count: 40, durationSec: 5 })).items[0].count, 6, "never more than 6 per model");
  assert.equal((await previewVideo(w, { prompt, compare: true, count: 3, durationSec: 5 })).items[0].count, 3);
});

test("a Compare run needs the exact credits and, being large, a second acknowledgement; nothing is sent before", async () => {
  const w = await ws("business");
  const total = units(0.7) * 6;
  await rejectsWith(createVideoJobs(w, { prompt, compare: true, durationSec: 5 }), "confirm");
  await rejectsWith(createVideoJobs(w, { prompt, compare: true, durationSec: 5, confirmUnits: total }), "confirm_large");
  assert.equal(fake.submits().length, 0);
  assert.equal((await mediaJobs().list(w.id)).length, 0);
});

test("Compare sends a window of clips and holds the rest; finished clips free slots and the rest follow (Higgsfield's concurrency is never exceeded)", async () => {
  const w = await ws("business");
  fake.state.nextTerminal = "queued";
  const jobs = await startCompare(w);
  assert.equal(jobs.length, 6);
  assert.equal(new Set(jobs.map((j) => j.hf!.compareId)).size, 1);
  assert.equal(fake.submits().length, COMPARE_WINDOW);
  const waiting = jobs.filter((j) => j.hf!.pending);
  assert.equal(waiting.length, 2);
  assert.ok(waiting.every((j) => j.status === "queued" && j.hf!.requestId === null));
  // A waiting clip is not failed after a minute, and stays unsent while the window is full.
  const w0 = await refreshJob(waiting[0], { force: true, at: Date.now() + 120_000 });
  assert.equal(w0.hf!.requestId, null);
  assert.equal(fake.submits().length, COMPARE_WINDOW);
  // Two clips finish -> two slots -> the waiting ones are sent.
  fake.setAll("completed");
  for (const j of jobs.filter((x) => x.hf!.requestId).slice(0, 2)) await refreshJob(j, { force: true });
  const sent = await Promise.all(waiting.map((j) => refreshJob(j, { force: true })));
  assert.ok(sent.every((j) => j.hf!.requestId && !j.hf!.pending), "waiting clips were submitted");
  assert.equal(fake.submits().length, 6);
  // Same-key resubmission of an already sent clip does nothing more.
  await refreshJob(sent[0], { force: true });
  assert.equal(fake.submits().length, 6);
});

test("Compare charges only delivered clips: failed and blocked tiles cost nothing", async () => {
  const w = await ws();
  fake.state.nextTerminal = "queued";
  const jobs = await startCompare(w, { count: 4 });
  const ids = jobs.map((j) => j.hf!.requestId!);
  fake.set(ids[0], "completed");
  fake.set(ids[1], "completed");
  fake.set(ids[2], "failed");
  fake.set(ids[3], "nsfw");
  const before = await usedThisPeriod(w);
  const out = await Promise.all(jobs.map((j) => refreshJob(j, { force: true })));
  assert.deepEqual(out.map((j) => j.status), ["completed", "completed", "failed", "blocked"]);
  assert.equal(await usedThisPeriod(w) - before, units(0.7) * 2);
});

test("Compare across models: one grid id, one job per clip, each model's own endpoint; capped by plan models", async () => {
  const w = await ws("business");
  fake.state.nextTerminal = "queued";
  const jobs = await startCompare(w, { models: TWO, count: 3 });
  assert.equal(jobs.length, 6);
  assert.equal(jobs.filter((j) => j.model === TWO[0]).length, 3);
  assert.equal(jobs.filter((j) => j.model === TWO[1]).length, 3);
  assert.ok(jobs.every((j) => j.hf!.compare === true));
  const pro = await ws();
  await rejectsWith(previewVideo(pro, { prompt, compare: true, models: [...TWO, "hf/minimax/hailuo-2.3/standard/text-to-video"] }), "too_many_models");
  const three = await previewVideo(w, { prompt, compare: true, durationSec: 6, models: [...TWO, "hf/minimax/hailuo-2.3/standard/text-to-video"] });
  assert.equal(three.items.length, 3);
});

test("Compare has its own daily cap and runs one at a time; it does not use the single-video allowance", async () => {
  const w = await ws("business");
  fake.state.nextTerminal = "queued";
  const first = await startCompare(w, { count: 2 });
  await rejectsWith(startCompare(w, { count: 2 }), "too_many_jobs"); // first still running
  // Single videos still work next to a running Compare (separate allowance and window).
  const single = await start(w);
  assert.equal(single.length, 1);
  fake.setAll("completed");
  for (const j of first) await refreshJob(j, { force: true });
  const second = await startCompare(w, { count: 2 });
  fake.setAll("completed");
  for (const j of second) await refreshJob(j, { force: true });
  // Business allows 5 runs a day: 2 are used, fill the other 3, the next is refused.
  for (let i = 0; i < 3; i++) await mediaJobs().insert({ ...first[0], id: `med_cmp_${n}_${i}`, status: "completed", hf: { ...first[0].hf!, compareId: `cmp_x${i}` } });
  await rejectsWith(startCompare(w, { count: 2 }), "daily_limit");
});

test("a usage window that cannot cover a Compare run is shown before approval (Pro's 5-hour window is 2,250 credits)", async () => {
  const w = await ws();
  const pv = await previewVideo(w, { prompt, compare: true, durationSec: 8 }); // 6 x 8 s is far over the window
  assert.ok(pv.totalUnits! > 2250);
  assert.match(pv.blocked ?? "", /5-hour usage limit/);
  const small = await previewVideo(w, { prompt, compare: true, count: 2, durationSec: 5 });
  assert.equal(small.blocked, null);
});

test("Plus (no video) cannot Compare", async () => {
  const w = await ws("plus");
  await assert.rejects(previewVideo(w, { prompt, compare: true }), /Pro and Business/);
});

test("Compare with a reference: the same reference goes to every clip of the models that take it", async () => {
  const w = await ws("business");
  fake.state.nextTerminal = "queued";
  const r = ref(w);
  const jobs = await startCompare(w, { models: ["hf/bytedance/seedance-2.0/image-to-video", "hf/bytedance/seedance-2.0/text-to-video"], count: 3, references: [r], rightsConfirmed: true });
  assert.equal(jobs.length, 6);
  // Pending clips keep the reference for later submission.
  const pending = jobs.find((j) => j.hf!.pending)!;
  assert.equal(pending.model, "hf/bytedance/seedance-2.0/text-to-video");
  const i2v = jobs.filter((j) => j.model.endsWith("image-to-video"));
  assert.equal(i2v.length, 3);
  assert.ok(fake.submits().filter((s) => s.path.endsWith("image-to-video")).every((s) => (s.body as { image_url: string }).image_url === r.url));
  assert.ok(jobs.filter((j) => j.model.endsWith("text-to-video")).every((j) => j.hf!.refs!.ignored));
});

test("picking: finished clips can be removed (the ones you did not pick); running ones and other people's cannot", async () => {
  const w = await ws();
  const other = await ws();
  fake.state.nextTerminal = "queued";
  const jobs = await startCompare(w, { count: 3 });
  fake.setAll("completed");
  const done = await Promise.all(jobs.map((j) => refreshJob(j, { force: true })));
  const keep = done[0].id;
  const gone = done.slice(1).map((j) => j.id);
  const res = await removeVideoJobs(w, gone);
  assert.deepEqual(res.removed.sort(), gone.sort());
  assert.ok(await mediaJobs().get(w.id, keep));
  assert.equal(await mediaJobs().get(w.id, gone[0]), null);
  assert.equal(await blobs().get(done[1].outputKey!), null, "the stored file is deleted too");
  assert.deepEqual((await removeVideoJobs(other, [keep])).skipped, [keep]);
  await assert.rejects(removeVideoJobs(w, []), (e: Err) => e.status === 400);
  // Running clip
  fake.state.nextTerminal = "in_progress";
  const w2 = await ws();
  const run = await start(w2);
  assert.deepEqual((await removeVideoJobs(w2, [run[0].id])).skipped, [run[0].id]);
});

test("Compare over HTTP: config advertises the limits, the remove route works for the owner only", async () => {
  const { cookie, workspaceId } = await signIn("video-pro-cmp@example.com", "pro");
  const { GET, POST } = await route();
  const cfg = (await (await GET(call(cookie, "/api/create/media/video"))).json()) as { config: { compare: { maxModels: number; perModel: number; runsPerDay: number; window: number } } };
  assert.deepEqual(cfg.config.compare, { maxModels: 2, perModel: 6, runsPerDay: 2, window: COMPARE_WINDOW });
  const created = await POST(jsonReq(cookie, "/api/create/media/video", "POST", { prompt, compare: true, count: 2, durationSec: 5, confirmUnits: units(0.7) * 2 }));
  assert.equal(created.status, 202);
  const ids = ((await created.json()) as { jobs: { id: string }[] }).jobs.map((j) => j.id);
  const w = (await workspaceById(workspaceId, "pro"))!;
  for (const id of ids) await refreshJob((await mediaJobs().get(w.id, id))!, { force: true });
  const { POST: rm } = await import("@/app/api/create/media/video/remove/route");
  const stranger = await signIn("video-pro-cmp2@example.com", "pro");
  const no = (await (await rm(jsonReq(stranger.cookie, "/api/create/media/video/remove", "POST", { ids }))).json()) as { removed: string[] };
  assert.deepEqual(no.removed, []);
  const yes = (await (await rm(jsonReq(cookie, "/api/create/media/video/remove", "POST", { ids: [ids[1]] }))).json()) as { removed: string[] };
  assert.deepEqual(yes.removed, [ids[1]]);
  assert.equal((await rm(jsonReq(null, "/api/create/media/video/remove", "POST", { ids }))).status, 401);
});
