import "./setup";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installHfFake, HF_HOST, HF_TEST_KEY, MP4_BYTES, PNG_1PX } from "./helpers/hf-fake";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
process.env.KEPLAR_HIGGSFIELD_BASE = HF_HOST;

import { backoff, hfCall, hfCheckConnection, hfCancel, hfDownload, hfEstimate, hfPresign, hfSubmit, hfStatus, higgsfieldBase, higgsfieldConfigured, higgsfieldPresence, HiggsfieldError, webhookToken, webhookTokenValid, webhookUrl } from "@/lib/higgsfield/client";
import { atListBasis, defaultHfModel, hfModel, hfModels, HF_MODELS, listPriceUsd, optionFields, referenceFields, usesRefs, videoBody, imageBody } from "@/lib/higgsfield/catalog";
import { mintReference, parseReferences, REF_LIMITS, sniffRef, validateDeclared, verifyReference } from "@/lib/higgsfield/reference";
import { higgsfieldAdminStatus } from "@/lib/higgsfield/status";

const fake = installHfFake();
const ENV_KEYS = ["HIGGSFIELD_API", "HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET", "KEPLAR_HIGGSFIELD_OFF", "KEPLAR_PUBLIC_URL"];
const saved: Record<string, string | undefined> = {};
before(() => { for (const k of ENV_KEYS) saved[k] = process.env[k]; });
after(() => { fake.restore(); for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => { for (const k of ENV_KEYS) delete process.env[k]; process.env.HIGGSFIELD_API = HF_TEST_KEY; fake.reset(); });
const noSleep = () => 0;

/* ── credentials and configuration ── */

test("HIGGSFIELD_API (KEY_ID:KEY_SECRET) is the primary credential and is sent as `Key <value>`", async () => {
  assert.equal(higgsfieldConfigured(), true);
  await hfCall("/requests/00000000-0000-4000-8000-000000000000/status", { retries: 0 }).catch(() => undefined);
  assert.equal(fake.state.seen[0].headers.authorization, `Key ${HF_TEST_KEY}`);
});

test("a leading `Key ` in the env value is tolerated and a single-token value works", async () => {
  process.env.HIGGSFIELD_API = `Key ${HF_TEST_KEY}`;
  await hfCall("/x", { retries: 0 }).catch(() => undefined);
  assert.equal(fake.state.seen.at(-1)!.headers.authorization, `Key ${HF_TEST_KEY}`);
  process.env.HIGGSFIELD_API = "single_token_value";
  assert.equal(higgsfieldPresence().shape, "single");
  await hfCall("/x", { retries: 0 }).catch(() => undefined);
  assert.equal(fake.state.seen.at(-1)!.headers.authorization, "Key single_token_value");
});

test("the HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET pair is accepted as a fallback; either half alone is not", async () => {
  delete process.env.HIGGSFIELD_API;
  assert.equal(higgsfieldConfigured(), false);
  process.env.HIGGSFIELD_API_KEY = "kid";
  assert.equal(higgsfieldConfigured(), false);
  process.env.HIGGSFIELD_API_SECRET = "sec";
  assert.equal(higgsfieldConfigured(), true);
  assert.equal(higgsfieldPresence().source, "HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET");
  await hfCall("/x", { retries: 0 }).catch(() => undefined);
  assert.equal(fake.state.seen.at(-1)!.headers.authorization, "Key kid:sec");
});

test("nothing is configured without keys, and the kill switch turns it off", async () => {
  delete process.env.HIGGSFIELD_API;
  assert.equal(higgsfieldConfigured(), false);
  await assert.rejects(() => hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "k" }), (e: HiggsfieldError) => e.code === "not_configured");
  assert.equal(fake.state.seen.length, 0, "no request leaves without keys");
  process.env.HIGGSFIELD_API = HF_TEST_KEY;
  process.env.KEPLAR_HIGGSFIELD_OFF = "1";
  assert.equal(higgsfieldConfigured(), false);
  assert.equal(higgsfieldPresence().killSwitch, true);
});

test("presence/admin status expose names and booleans only, never the key", () => {
  const p = JSON.stringify(higgsfieldPresence());
  const a = JSON.stringify(higgsfieldAdminStatus());
  for (const out of [p, a]) {
    assert.ok(!out.includes("kid_test"), out);
    assert.ok(!out.includes("secret_test"), out);
  }
  const st = higgsfieldAdminStatus();
  assert.equal(st.configured, true);
  assert.equal(st.envNames.primary, "HIGGSFIELD_API");
  assert.match(st.label, /Configured/i);
  delete process.env.HIGGSFIELD_API;
  assert.match(higgsfieldAdminStatus().label, /Not configured/i);
});

test("the base URL override only works outside production", () => {
  assert.equal(higgsfieldBase(), HF_HOST);
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try { assert.equal(higgsfieldBase(), "https://api.higgsfield.ai"); } finally { (process.env as Record<string, string>).NODE_ENV = prev ?? "test"; }
});

/* ── HTTP behaviour ── */

test("submit posts the body with an Idempotency-Key and the webhook as a query parameter", async () => {
  const hook = "https://keplar.one/api/webhooks/higgsfield?w=ws&j=job&t=abc";
  const r = await hfSubmit("bytedance/seedance-2.0/text-to-video", { prompt: "a fox" }, { idempotencyKey: "job-1", webhookUrl: hook });
  assert.ok(r.request_id);
  const s = fake.submits()[0];
  assert.equal(s.path, "/bytedance/seedance-2.0/text-to-video");
  assert.equal(s.headers["idempotency-key"], "job-1");
  assert.equal(s.query.get("hf_webhook"), hook);
  assert.deepEqual(s.body, { prompt: "a fox" });
});

test("5xx and 429 are retried with the same Idempotency-Key; 4xx business errors are not", async () => {
  fake.state.submitFailures = [503, 500];
  const r = await hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "same-key", sleepMs: noSleep });
  assert.ok(r.request_id);
  const subs = fake.submits();
  assert.equal(subs.length, 3);
  assert.ok(subs.every((s) => s.headers["idempotency-key"] === "same-key"));

  fake.reset();
  fake.state.submitFailures = [403];
  await assert.rejects(() => hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "k2", sleepMs: noSleep }), (e: HiggsfieldError) => e.code === "credits");
  assert.equal(fake.submits().length, 1, "no retry on 403");

  fake.reset();
  fake.state.submitFailures = [422];
  await assert.rejects(() => hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "k3", sleepMs: noSleep }), (e: HiggsfieldError) => e.code === "validation");
  assert.equal(fake.submits().length, 1);
});

test("error mapping: 401 auth, 404 not found, concurrency 400 is retryable busy, 423 unavailable", async () => {
  fake.state.credsValid = false;
  await assert.rejects(() => hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "k" , sleepMs: noSleep }), (e: HiggsfieldError) => e.code === "auth");
  fake.reset();
  fake.state.submitFailures = [400, 400, 400];
  await assert.rejects(() => hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "k", sleepMs: noSleep }), (e: HiggsfieldError) => e.code === "busy" && e.retryable);
  assert.equal(fake.submits().length, 3, "concurrency errors are retried");
  fake.reset();
  fake.state.submitFailures = [423, 423, 423];
  await assert.rejects(() => hfSubmit("z-image/turbo", { prompt: "x" }, { idempotencyKey: "k", sleepMs: noSleep }), (e: HiggsfieldError) => e.code === "unavailable");
});

test("status rejects malformed ids before any request; unknown ids map to not_found", async () => {
  await assert.rejects(() => hfStatus("../../etc/passwd"), (e: HiggsfieldError) => e.code === "not_found");
  assert.equal(fake.state.seen.length, 0);
  await assert.rejects(() => hfStatus("11111111-1111-4111-8111-111111111111"), (e: HiggsfieldError) => e.code === "not_found");
});

test("estimate returns the account's own price; a failing estimate returns null (never a guess)", async () => {
  fake.state.estimate = { mode: "price", usd: "0.7035" };
  assert.deepEqual(await hfEstimate("bytedance/seedance-2.0/text-to-video", { prompt: "x" }), { usd: 0.7035, credits: 350 });
  assert.equal(fake.calls((s) => s.path.startsWith("/estimate/")).length, 1);
  fake.state.estimate = { mode: "none", usd: "0" };
  assert.equal(await hfEstimate("bytedance/seedance-2.0/text-to-video", { prompt: "x" }), null);
});

test("connection check is the free status lookup: 404 means the credentials are valid, 401 means rejected", async () => {
  assert.deepEqual(await hfCheckConnection(), { ok: true, state: "valid" });
  assert.equal(fake.state.seen.at(-1)!.method, "GET", "no POST, no generation, no cost");
  fake.state.credsValid = false;
  assert.deepEqual(await hfCheckConnection(), { ok: false, state: "rejected" });
  delete process.env.HIGGSFIELD_API;
  assert.deepEqual(await hfCheckConnection(), { ok: false, state: "not_configured" });
});

test("cancel is best effort; download sends no credentials and enforces size", async () => {
  assert.equal(await hfCancel("11111111-1111-4111-8111-111111111111"), true);
  const dl = await hfDownload(`${HF_HOST}/out/video-x.mp4`, 1_000_000);
  assert.equal(dl.bytes.length, MP4_BYTES.length);
  const dlReq = fake.state.seen.at(-1)!;
  assert.equal(dlReq.headers.authorization, undefined, "the CDN never sees the key");
  await assert.rejects(() => hfDownload(`${HF_HOST}/out/video-x.mp4`, 10), (e: HiggsfieldError) => e.code === "bad_output");
  await assert.rejects(() => hfDownload("ftp://example.com/x", 10), (e: HiggsfieldError) => e.code === "bad_output");
});

test("presign asks Higgsfield for a one-hour upload URL for the declared content type", async () => {
  const p = await hfPresign("image/png");
  assert.match(p.uploadUrl, /\/upload\//);
  assert.match(p.publicUrl, /\/ref\//);
  assert.equal((fake.state.seen.at(-1)!.body as { content_type: string }).content_type, "image/png");
});

test("backoff grows with the attempt", () => {
  assert.ok(backoff(0) >= 400 && backoff(3) >= 3200);
});

/* ── webhook token ── */

test("webhook token binds workspace and job; tampering and other keys fail", () => {
  const t = webhookToken("ws_1", "med_1");
  assert.equal(webhookTokenValid("ws_1", "med_1", t), true);
  assert.equal(webhookTokenValid("ws_2", "med_1", t), false);
  assert.equal(webhookTokenValid("ws_1", "med_2", t), false);
  assert.equal(webhookTokenValid("ws_1", "med_1", t.replace(/.$/, t.endsWith("0") ? "1" : "0")), false);
  assert.equal(webhookTokenValid("ws_1", "med_1", "zz"), false);
  process.env.HIGGSFIELD_API = "another:key";
  assert.equal(webhookTokenValid("ws_1", "med_1", t), false, "a token minted with another key is invalid");
  delete process.env.HIGGSFIELD_API;
  assert.equal(webhookTokenValid("ws_1", "med_1", t), false);
});

test("the webhook URL needs a public https origin", () => {
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  delete process.env.KEPLAR_PUBLIC_URL;
  assert.equal(webhookUrl("w", "j"), null);
  process.env.KEPLAR_PUBLIC_URL = "https://keplar.one";
  const u = new URL(webhookUrl("w", "j")!);
  assert.equal(u.origin + u.pathname, "https://keplar.one/api/webhooks/higgsfield");
  assert.equal(u.searchParams.get("t"), webhookToken("w", "j"));
});

/* ── catalog ── */

test("Higgsfield defaults: Seedance 2.0 for video, Z-Image Turbo for images", () => {
  assert.equal(defaultHfModel("video")!.id, "hf/bytedance/seedance-2.0/text-to-video");
  assert.equal(defaultHfModel("image")!.id, "hf/z-image/turbo");
  assert.equal(new Set(HF_MODELS.map((m) => m.id)).size, HF_MODELS.length);
  assert.ok(HF_MODELS.every((m) => m.id === `hf/${m.endpoint}`));
});

test("prices come only from published figures; unknown tiers are TBD (null), never invented", () => {
  assert.equal(listPriceUsd(hfModel("hf/bytedance/seedance-2.0/text-to-video")!, 5), 0.7035);
  assert.equal(listPriceUsd(hfModel("hf/z-image/turbo")!), 0.015);
  for (const id of ["hf/kling-video/v3.0/std/text-to-video", "hf/kling-video/v2.5-turbo/pro/text-to-video", "hf/minimax/hailuo-2.3/standard/text-to-video", "hf/higgsfield/genjutsu/motion-transfer/v1.0", "hf/bytedance/seedance-2.0/reference-to-video"]) {
    assert.equal(listPriceUsd(hfModel(id)!, 5), null, id);
    assert.match(hfModel(id)!.priceSource, /TBD/);
  }
});

test("options are applied only where the model documents them", () => {
  const seed = hfModel("hf/bytedance/seedance-2.0/text-to-video")!;
  const kling3 = hfModel("hf/kling-video/v3.0/std/text-to-video")!;
  const kling25 = hfModel("hf/kling-video/v2.5-turbo/pro/text-to-video")!;
  const hailuo = hfModel("hf/minimax/hailuo-2.3/standard/text-to-video")!;
  const all = { resolution: "1080p", sound: false, negativePrompt: "blur" };
  assert.deepEqual(optionFields(seed, all), { resolution: "1080p", generate_audio: false });
  assert.deepEqual(optionFields(kling3, all), { sound: "off" });
  assert.deepEqual(optionFields(kling25, all), { negative_prompt: "blur" });
  assert.deepEqual(optionFields(hailuo, all), {});
  assert.deepEqual(optionFields(seed, { resolution: "8k" }), { resolution: "720p" }, "an undocumented resolution falls back to the model default");
  const z = hfModel("hf/z-image/turbo")!;
  assert.deepEqual(optionFields(z, { seed: 42, negativePrompt: "x" }), { resolution: "1k", seed: 42 });
  assert.deepEqual(optionFields(z, { seed: -1 }), { resolution: "1k" });
});

test("price basis: non-default resolution or muted sound is no longer the published list basis", () => {
  const seed = hfModel("hf/bytedance/seedance-2.0/text-to-video")!;
  assert.equal(atListBasis(seed, {}), true);
  assert.equal(atListBasis(seed, { resolution: "720p" }), true);
  assert.equal(atListBasis(seed, { resolution: "1080p" }), false);
  assert.equal(atListBasis(seed, { sound: false }), false);
});

test("reference fields follow each model's documented shape; text-only models take none", () => {
  const urls = { imageUrls: ["https://a/1.png", "https://a/2.png"], videoUrls: ["https://a/v.mp4"] };
  assert.deepEqual(referenceFields(hfModel("hf/bytedance/seedance-2.0/image-to-video")!, urls), { image_url: "https://a/1.png" });
  assert.deepEqual(referenceFields(hfModel("hf/bytedance/seedance-2.0/reference-to-video")!, urls), { image_urls: urls.imageUrls, video_urls: urls.videoUrls });
  assert.deepEqual(referenceFields(hfModel("hf/higgsfield/genjutsu/motion-transfer/v1.0")!, urls), { video_url: "https://a/v.mp4", image_urls: urls.imageUrls });
  const t2v = hfModel("hf/bytedance/seedance-2.0/text-to-video")!;
  assert.deepEqual(usesRefs(t2v, { image: true, video: true }), { image: false, video: false });
  const body = videoBody(t2v, { prompt: "p", durationSec: 6, aspectRatio: "9:16", refs: urls });
  assert.equal(body.image_url, undefined);
  assert.equal(body.image_urls, undefined);
  assert.equal(body.duration, 6);
  assert.equal(body.aspect_ratio, "9:16");
  const motion = videoBody(hfModel("hf/higgsfield/genjutsu/motion-transfer/v1.0")!, { prompt: "p", durationSec: 9, refs: urls });
  assert.equal(motion.duration, undefined, "Genjutsu output follows the source video");
  assert.equal(motion.aspect_ratio, undefined);
  assert.deepEqual(usesRefs(hfModel("hf/bytedance/seedance-2.0/image-to-video")!, { image: true, video: true }), { image: true, video: false });
});

test("image bodies: aspect snaps to a supported ratio and references go to the edit model only", () => {
  const z = hfModel("hf/z-image/turbo")!;
  const edit = hfModel("hf/alibaba/qwen-image-3/edit")!;
  assert.equal(imageBody(z, { prompt: "p", aspectRatio: "5:4", resolution: "2k" }).aspect_ratio, "1:1");
  assert.equal(imageBody(z, { prompt: "p", aspectRatio: "3:2", resolution: "2k" }).resolution, "2k");
  assert.deepEqual(imageBody(edit, { prompt: "p", aspectRatio: "3:2", resolution: "1k", refs: { imageUrls: ["https://a/1.png"], videoUrls: [] } }).image_urls, ["https://a/1.png"]);
  assert.equal(imageBody(z, { prompt: "p", aspectRatio: "3:2", refs: { imageUrls: ["https://a/1.png"], videoUrls: [] } }).image_urls, undefined);
  assert.ok(hfModels("image", "text-to-image").length >= 2);
});

/* ── references ── */

test("declared references: types, sizes and video duration are validated", () => {
  const ok = validateDeclared({ kind: "image", contentType: "image/png", bytes: 5_000_000, name: "a b.png" });
  assert.equal(ok.kind, "image");
  assert.throws(() => validateDeclared({ kind: "image", contentType: "image/gif", bytes: 10 }), /JPEG, PNG or WebP/);
  assert.throws(() => validateDeclared({ kind: "image", contentType: "image/png", bytes: REF_LIMITS.image.maxBytes + 1 }), /limit/);
  assert.throws(() => validateDeclared({ kind: "video", contentType: "video/quicktime", bytes: 10, durationSec: 6 }), /MP4/);
  assert.throws(() => validateDeclared({ kind: "video", contentType: "video/mp4", bytes: 10, durationSec: 2 }), /at least 4/);
  assert.throws(() => validateDeclared({ kind: "video", contentType: "video/mp4", bytes: 10, durationSec: 31 }), /up to 30/);
  assert.throws(() => validateDeclared({ kind: "video", contentType: "video/mp4", bytes: REF_LIMITS.video.maxBytes + 1, durationSec: 8 }), /limit/);
  assert.equal(validateDeclared({ kind: "video", contentType: "video/mp4", bytes: 10_000_000, durationSec: 8.04 }).durationSec, 8);
  assert.throws(() => validateDeclared({ kind: "audio" }), /image or a video/);
  assert.equal(validateDeclared({ kind: "image", contentType: "image/png", bytes: 5, name: "../../x<script>.png" }).name.includes("<"), false);
});

test("file signatures are sniffed, so a renamed file cannot pass as an image or video", () => {
  assert.equal(sniffRef(PNG_1PX), "image/png");
  assert.equal(sniffRef(MP4_BYTES), "video/mp4");
  assert.equal(sniffRef(Buffer.from("<?php echo 1; ?> padding padding")), null);
  assert.equal(sniffRef(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])), "image/jpeg");
});

test("signed references: valid, tampered, other workspace, non-https in production", () => {
  const r = mintReference("ws_a", { kind: "image", url: `${HF_HOST}/ref/1`, contentType: "image/png", bytes: 1000, name: "a.png" });
  assert.equal(verifyReference("ws_a", r).url, r.url);
  assert.throws(() => verifyReference("ws_b", r), /expired|valid/);
  assert.throws(() => verifyReference("ws_a", { ...r, url: `${HF_HOST}/ref/2` }), /expired|valid/);
  assert.throws(() => verifyReference("ws_a", { ...r, bytes: 2000 }), /expired|valid/);
  assert.throws(() => verifyReference("ws_a", { url: "x" }), /valid/);
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try { assert.throws(() => verifyReference("ws_a", r), /valid/); } finally { (process.env as Record<string, string>).NODE_ENV = prev ?? "test"; }
});

test("parseReferences requires the rights confirmation and enforces counts", () => {
  const img = (n: number) => mintReference("ws_a", { kind: "image", url: `${HF_HOST}/ref/${n}`, contentType: "image/png", bytes: 1000, name: "a.png" });
  const vid = (n: number) => mintReference("ws_a", { kind: "video", url: `${HF_HOST}/ref/v${n}`, contentType: "video/mp4", bytes: 1000, durationSec: 8, name: "a.mp4" });
  assert.deepEqual(parseReferences("ws_a", undefined, false), { images: [], videos: [] });
  assert.throws(() => parseReferences("ws_a", [img(1)], false), (e: { code?: string }) => e.code === "rights_required");
  assert.throws(() => parseReferences("ws_a", [img(1)], "true"), (e: { code?: string }) => e.code === "rights_required");
  const ok = parseReferences("ws_a", [img(1), vid(1)], true);
  assert.equal(ok.images.length, 1);
  assert.equal(ok.videos.length, 1);
  assert.throws(() => parseReferences("ws_a", [vid(1), vid(2)], true), /One reference video/);
  assert.throws(() => parseReferences("ws_a", [1, 2, 3, 4, 5].map(img), true), /Up to 4/);
  assert.throws(() => parseReferences("ws_a", [1, 2, 3, 4, 5, 6].map(img), true), /Too many/);
});

test("/api/health/higgsfield reports presence by env var name and never a value", async () => {
  const { GET } = await import("@/app/api/health/higgsfield/route");
  const on = await (await GET()).text();
  assert.deepEqual(JSON.parse(on), { provider: "higgsfield", configured: true, source: "HIGGSFIELD_API", shape: "id:secret", switchedOff: false });
  assert.ok(!on.includes("kid_test") && !on.includes("secret_test"));
  delete process.env.HIGGSFIELD_API;
  assert.equal(((await (await GET()).json()) as { configured: boolean }).configured, false);
});
