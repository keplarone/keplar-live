import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogById } from "@/lib/orchestration/catalog";
import { applyFreeSnapshot, applySnapshot, modalitiesOf, type SyncSnapshot } from "@/lib/orchestration/catalog-sync";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { FREE_PLAN_REFUSAL, isFreeModel } from "@/lib/orchestration/free-guard";
import { freeFallbacks } from "@/lib/orchestration/catalog-sync";
import { freeRoster, liveRoster } from "@/lib/orchestration/live-catalog";
import { acceptsImages, imageTokens, MEDIA_LIMITS, NO_FREE_VISION_MESSAGE, parseMedia, type MediaInput } from "@/lib/orchestration/media";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { createRegistry, NO_IMAGE_INPUT } from "@/lib/orchestration/providers";
import { chatBody } from "@/lib/orchestration/providers/shared";
import { CostAwareRouter, NoVisionModelError } from "@/lib/orchestration/router";
import type { Classification, KeplarAnswer, KeplarRequest, Provider, ProviderResult } from "@/lib/orchestration/types";

const KEYS = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test" };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  try {
    const r = fn();
    if (r instanceof Promise) return r.finally(restore) as T;
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}

const media: MediaInput = { images: [{ dataUrl: PNG, width: 640, height: 400, name: "test.png" }], videos: [] };
const videoMedia: MediaInput = {
  images: Array.from({ length: 8 }, (_, i) => ({ dataUrl: JPG, width: 768, height: 432, name: "clip.mp4", frame: { index: i, of: 8, atSec: i + 0.5, video: "clip.mp4" } })),
  videos: [{ name: "clip.mp4", durationSec: 8, frames: 8 }],
};
const cls: Classification = { kind: "general", complexity: "moderate", capabilities: ["Vision"], estimatedInputTokens: 1000, estimatedOutputTokens: 300, needsWeb: false, rationale: "t" };

function fakeGateway(name = "openrouter", vision?: boolean) {
  const calls: { model: string; images: number }[] = [];
  const p: Provider = {
    name,
    live: true,
    ...(vision === undefined ? {} : { vision }),
    supports: () => true,
    async generate({ model, images }): Promise<ProviderResult> {
      calls.push({ model: model.id, images: images?.length ?? 0 });
      return { ok: true, modelId: model.id, stance: "unclassified", claims: [], text: `answer from ${model.id}`, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, actualCostUsd: 0 };
    },
  };
  return { p, calls };
}

/* ─────────────── untrusted upload validation ─────────────── */

test("parseMedia: accepts real PNG/JPEG data URLs; rejects wrong types, fake magic bytes, oversize and over-count", () => {
  const ok = parseMedia({ images: [{ dataUrl: PNG, width: 640, height: 400, name: "<script>x</script>.png" }] });
  assert.ok(ok && typeof ok === "object");
  assert.equal(ok.images.length, 1);
  assert.doesNotMatch(ok.images[0].name, /[<>]/, "file names are sanitised");
  assert.equal(parseMedia(undefined), null);
  assert.equal(parseMedia({ images: [] }), null);
  // SVG (script-capable) and other types are refused.
  assert.equal(typeof parseMedia({ images: [{ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=", width: 1, height: 1, name: "a.svg" }] }), "string");
  assert.equal(typeof parseMedia({ images: [{ dataUrl: "https://example.com/a.png", width: 1, height: 1, name: "a" }] }), "string");
  // Declared PNG, actually JPEG bytes → refused.
  assert.match(String(parseMedia({ images: [{ dataUrl: JPG.replace("image/jpeg", "image/png"), width: 1, height: 1, name: "a" }] })), /isn't the image type/);
  // Too big after compression.
  const big = "data:image/jpeg;base64,/9j/" + "A".repeat(Math.ceil((MEDIA_LIMITS.maxDecodedBytesPerImage * 4) / 3) + 8);
  assert.match(String(parseMedia({ images: [{ dataUrl: big, width: 10, height: 10, name: "a" }] })), /too large/);
  // More than 4 still images.
  const five = Array.from({ length: 5 }, () => ({ dataUrl: PNG, width: 1, height: 1, name: "a.png" }));
  assert.match(String(parseMedia({ images: five })), /at most 4 images/);
  // Frames need a video; at most one video; video length capped.
  assert.equal(typeof parseMedia({ images: [videoMedia.images[0]] }), "string");
  assert.equal(typeof parseMedia({ images: videoMedia.images, videos: [videoMedia.videos[0], videoMedia.videos[0]] }), "string");
  assert.match(String(parseMedia({ images: videoMedia.images, videos: [{ name: "long.mp4", durationSec: 999, frames: 8 }] })), /minutes/);
  const v = parseMedia({ images: videoMedia.images, videos: videoMedia.videos });
  assert.ok(v && typeof v === "object" && v.images.every((i) => i.frame) && v.videos[0].frames === 8);
});

test("image token estimate and classifier: media adds Vision, image tokens and at least a small panel", () => {
  assert.equal(imageTokens(512, 512), 255);
  assert.ok(imageTokens(4000, 3000) <= 85 + 170 * 12);
  const c = new HeuristicClassifier().classify({ prompt: "What is this?", media });
  assert.equal(c.capabilities[0], "Vision");
  assert.notEqual(c.complexity, "simple");
  const plain = new HeuristicClassifier().classify({ prompt: "What is this?" });
  assert.ok(c.estimatedInputTokens - plain.estimatedInputTokens >= imageTokens(640, 400));
});

/* ─────────────── capability routing ─────────────── */

test("catalog: rosters record input modalities; vision models are the ones OpenRouter lists with image input", () => {
  for (const m of [...liveRoster, ...freeRoster]) assert.ok(Array.isArray(m.inputModalities) && m.inputModalities.includes("text"), m.id);
  const vision = (ids: string[]) => ids.map((id) => acceptsImages(catalogById.get(id)!));
  assert.deepEqual(vision(["live:gemini-3.1-flash-lite", "live:qwen3.8-flash", "live:gpt-6-luna", "live:mistral-small-2603"]), [true, true, true, true]);
  assert.deepEqual(vision(["live:deepseek-v4-flash", "live:nemotron-3-super", "live:gpt-oss-20b"]), [false, false, false]);
  assert.deepEqual(vision(["free:gemma-4-31b", "free:qwen3.8-27b", "free:dots-3-note", "free:nemotron-3-nano-omni"]), [true, true, true, true]);
  assert.deepEqual(vision(["free:nemotron-3-super", "free:nemotron-3-ultra", "free:nemotron-3.5-lightning"]), [false, false, false]);
});

test("router: media questions seat only image-capable models; text questions are unchanged", () => {
  const router = new CostAwareRouter(liveRoster);
  const c = new HeuristicClassifier().classify({ prompt: "Compare the two charts in this image and say which trend is stronger.", media });
  const plan = router.route(c, { prompt: "x", media, plan: "plus" });
  assert.ok(plan.panel.length >= 2);
  for (const p of plan.panel) assert.ok(acceptsImages(p.model), `${p.model.id} must accept images`);
  assert.equal(new Set(plan.panel.map((p) => p.model.family)).size, plan.panel.length, "still distinct families");
  // The reviewer reads text answers only, so it may be any model.
  assert.ok(plan.verifier);
  // Without media a text-only model can take a seat again.
  const text = router.route({ ...cls, capabilities: ["Reasoning"], complexity: "complex" }, { prompt: "x", plan: "plus" });
  assert.ok(text.panel.some((p) => !acceptsImages(p.model)), "text panels still use DeepSeek / Nemotron / gpt-oss");
});

test("router: Free plan + media → only $0 :free vision models; none left → friendly NoVisionModelError", () => {
  const plan = new CostAwareRouter([...liveRoster, ...freeRoster]).route(cls, { prompt: "x", media, plan: "free" });
  assert.ok(plan.panel.length >= 1 && plan.panel.length <= 3);
  for (const p of plan.panel) {
    assert.ok(isFreeModel(p.model), p.model.id);
    assert.ok(acceptsImages(p.model), p.model.id);
  }
  if (plan.verifier) assert.ok(isFreeModel(plan.verifier.model));
  assert.equal(plan.judge, null);
  const textOnlyFree = freeRoster.filter((m) => !acceptsImages(m));
  assert.throws(() => new CostAwareRouter([...liveRoster, ...textOnlyFree]).route(cls, { prompt: "x", media, plan: "free" }), (e: unknown) => e instanceof NoVisionModelError && e.message === NO_FREE_VISION_MESSAGE);
});

test("registry: media never reaches a text-only model or a provider without image input", async () => {
  const { p, calls } = fakeGateway("openrouter", true);
  const { p: nv, calls: nvCalls } = fakeGateway("nvidia", false);
  const reg = createRegistry([nv, p]);
  const text = catalogById.get("live:deepseek-v4-flash")!;
  const r = await reg.generate({ model: text, prompt: "x", classification: cls, params: {}, images: media.images });
  assert.equal(!r.ok && r.message, NO_IMAGE_INPUT);
  assert.deepEqual(calls, []);
  // Gemma 4 31B has an NVIDIA route, but media calls skip NVIDIA and go through OpenRouter.
  const gemma = catalogById.get("live:gemma-4-31b")!;
  const r2 = await reg.generate({ model: gemma, prompt: "x", classification: cls, params: {}, images: media.images });
  assert.ok(r2.ok);
  assert.equal(r2.provider, "openrouter");
  assert.deepEqual(nvCalls, []);
  assert.deepEqual(calls, [{ model: gemma.id, images: 1 }]);
  // Text calls still use the NVIDIA route first.
  await reg.generate({ model: gemma, prompt: "x", classification: cls, params: {} });
  assert.equal(nvCalls.length, 1);
});

test("HARD GUARD with media: a Free-plan media call to a priced vision model is refused and never sent; fallbacks stay $0 + vision", async () => {
  const { p, calls } = fakeGateway("openrouter", true);
  const reg = createRegistry([p], { freeOnly: true, fallbacks: () => [catalogById.get("live:gemini-3.8-flash")!, ...freeRoster] });
  const paidVision = catalogById.get("live:gemini-3.1-flash-lite")!;
  assert.ok(acceptsImages(paidVision));
  const r = await reg.generate({ model: paidVision, prompt: "x", classification: cls, params: {}, images: media.images });
  assert.equal(!r.ok && r.message, FREE_PLAN_REFUSAL);
  assert.deepEqual(calls, []);
  // A busy free vision model falls back only to other $0 vision models.
  const busyFirst: Provider = { ...p, generate: async (input) => (input.model.id === "free:gemma-4-31b" ? { ok: false, modelId: input.model.id, reason: "rate_limited", message: "Rate limited after retries.", latencyMs: 1 } : p.generate(input)) };
  const reg2 = createRegistry([busyFirst], { freeOnly: true, fallbacks: freeFallbacks(freeRoster, []) });
  const r2 = await reg2.generate({ model: catalogById.get("free:gemma-4-31b")!, prompt: "x", classification: cls, params: {}, images: media.images });
  assert.ok(r2.ok);
  assert.ok(isFreeModel(r2.model) && acceptsImages(r2.model), r2.model.id);
  for (const c of calls as { model: string }[]) assert.ok(acceptsImages(catalogById.get(c.model)!) && isFreeModel(catalogById.get(c.model)!), c.model);
});

test("chat body: images become labelled image_url parts (frames in time order); text calls stay plain strings", () => {
  const plain = chatBody("m", "hi", {}) as { messages: { content: unknown }[] };
  assert.equal(plain.messages[1].content, "hi");
  const b = chatBody("m", "What happens?", {}, undefined, videoMedia.images, "PREAMBLE") as { messages: { content: { type: string; text?: string; image_url?: { url: string } }[] }[] };
  const parts = b.messages[1].content;
  assert.equal(parts[0].text, "PREAMBLE");
  assert.equal(parts.filter((x) => x.type === "image_url").length, 8);
  assert.match(parts[1].text!, /Video frame 1 of 8, at 0:01/);
  assert.equal(parts.at(-1)!.text, "Question: What happens?");
});

test("catalog sync records modalities; the synced list wins over the seed", () => {
  assert.deepEqual(modalitiesOf({ id: "x", architecture: { input_modalities: ["text", "image", 3] } }), ["text", "image"]);
  assert.equal(modalitiesOf({ id: "x" }), undefined);
  const snap: SyncSnapshot = {
    syncedAt: "2026-09-28T00:00:00Z",
    fetched: { openrouter: true, openai: false, nvidia: false },
    models: { "live:deepseek-v4-flash": { routes: { openrouter: true }, inputModalities: ["text", "image"] }, "live:mistral-small-2603": { routes: { openrouter: true }, inputModalities: ["text"] } },
    candidates: [],
    free: { "free:dots-3-note": { listed: true, zeroPriced: true, inputModalities: ["text"] } },
    freeExtras: [{ id: "vendor/omni:free", contextWindow: 1000, inputModalities: ["text", "image"] }],
    errors: [],
  };
  const live = new Map(applySnapshot(liveRoster, snap).map((m) => [m.id, m]));
  assert.equal(acceptsImages(live.get("live:deepseek-v4-flash")!), true);
  assert.equal(acceptsImages(live.get("live:mistral-small-2603")!), false);
  assert.equal(acceptsImages(live.get("live:qwen3.8-flash")!), true, "seed kept when the snapshot has no modalities");
  const { roster, extras } = applyFreeSnapshot(freeRoster, snap);
  assert.equal(acceptsImages(roster.find((m) => m.id === "free:dots-3-note")!), false);
  assert.ok(extras[0] && acceptsImages(extras[0]) && isFreeModel(extras[0]));
});

/* ─────────────── end to end (stubbed network) ─────────────── */

type Seen = { url: string; model: string; images: number; system: string };

function stubFetch(seen: Seen[], opts: { disagree?: boolean } = {}) {
  let n = 0;
  return (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: unknown }[] };
    const user = body.messages.find((m) => m.role === "user")?.content;
    const images = Array.isArray(user) ? user.filter((p: { type?: string }) => p.type === "image_url").length : 0;
    const system = String(body.messages.find((m) => m.role === "system")?.content ?? "");
    seen.push({ url: String(url), model: body.model, images, system });
    let content: string;
    if (system.startsWith("You are Keplar's response classifier")) {
      content = opts.disagree
        ? JSON.stringify({ topic: "Shape colours", positions: [{ id: "P1", label: "Blue circle, red square", summary: "Most read a blue circle and a red square." }, { id: "P2", label: "Purple circle", summary: "One read the circle as purple." }], responses: [{ id: "R1", kind: "answer", position: "P1" }, { id: "R2", kind: "answer", position: "P1" }, { id: "R3", kind: "answer", position: "P2" }], claims: [{ text: "The text reads HELLO KEPLAR 42", responses: ["R1", "R2", "R3"] }] })
        : "{}";
    } else if (system.startsWith("You are Keplar's verifier")) content = JSON.stringify({ checks: [], disputed: [] });
    else if (system.startsWith("You are Keplar's judge-tier synthesizer.")) content = "A blue circle and a red square above the text HELLO KEPLAR 42.\n\n**Where the models disagree**: one model saw purple.\nRESOLUTION: Two of three models and the shared text claim support blue.";
    else content = images ? `I see a ${n++ === 2 ? "purple" : "blue"} circle, a red square and the text HELLO KEPLAR 42.` : "Draft.";
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
}

async function run(req: KeplarRequest, keyTier: "free" | "paid", patch?: (d: NonNullable<ReturnType<typeof engineDeps>>) => void) {
  return withEnv({ ...KEYS, KEPLAR_LIVE_MODELS: "1" }, async () => {
    let answer: KeplarAnswer | null = null;
    let error: string | null = null;
    const deps = engineDeps({ keyTier })!;
    patch?.(deps);
    for await (const e of orchestrate(req, deps)) {
      if (e.type === "answer") answer = e.answer;
      if (e.type === "error") error = e.message;
    }
    return { answer, error };
  });
}

test("Free plan + image, end to end: images only go to $0 :free vision models on OpenRouter; text stages never get them", async () => {
  const real = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = stubFetch(seen);
  try {
    const { answer, error } = await run({ prompt: "What is in this image?", media, plan: "free", computeRemaining: 1e6 }, "free");
    assert.equal(error, null);
    assert.ok(answer);
    const withImages = seen.filter((s) => s.images > 0);
    assert.ok(withImages.length >= 1);
    for (const s of seen) {
      assert.ok(s.url.startsWith("https://openrouter.ai/api/v1/"), s.url);
      assert.match(s.model, /:free$/);
    }
    for (const s of withImages) {
      const m = freeRoster.find((x) => x.routes?.openrouter === s.model)!;
      assert.ok(m && acceptsImages(m), `${s.model} must accept images`);
    }
    assert.ok(seen.filter((s) => s.system.startsWith("You are Keplar's")).every((s) => s.images === 0), "classifier/reviewer/synthesizer get text only");
    assert.equal(answer!.compute.units, 1, "$0 models: only the base unit");
    assert.ok(answer!.sources.some((x) => x.kind === "attachment" && x.title === "test.png"));
  } finally {
    globalThis.fetch = real;
  }
});

test("Free plan + image with no free vision model: friendly message and nothing is sent", async () => {
  const real = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = stubFetch(seen);
  try {
    const { answer, error } = await run({ prompt: "What is in this image?", media, plan: "free", computeRemaining: 1e6 }, "free", (d) => {
      d.router = new CostAwareRouter(freeRoster.filter((m) => !acceptsImages(m)));
    });
    assert.equal(answer, null);
    assert.equal(error, NO_FREE_VISION_MESSAGE);
    assert.equal(seen.length, 0);
  } finally {
    globalThis.fetch = real;
  }
});

test("Paid plan + video frames: vision panel only, never NVIDIA with media; disagreement and synthesis work on vision answers", async () => {
  const real = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = stubFetch(seen, { disagree: true });
  try {
    const { answer, error } = await run({ prompt: "Describe the shapes, their colours and the text in this clip.", media: videoMedia, plan: "plus", computeRemaining: 1e6, routing: { maxModels: 3 } }, "paid");
    assert.equal(error, null);
    assert.ok(answer);
    const panel = seen.filter((s) => s.images > 0);
    assert.equal(panel.length, 3);
    for (const s of panel) {
      assert.equal(s.images, 8);
      assert.ok(!s.url.includes("nvidia.com"), "media never goes to the NVIDIA route");
      const m = liveRoster.find((x) => x.routes?.openrouter === s.model || x.routes?.openai === s.model)!;
      assert.ok(m && acceptsImages(m), s.model);
    }
    assert.ok(seen.filter((s) => s.images === 0).length >= 3, "extractor, reviewer and synthesis ran on text");
    assert.equal(answer!.consensus.level === "consensus" || answer!.consensus.level === "partial" || answer!.consensus.level === "none", true);
    assert.equal(answer!.disagreements.length, 1);
    assert.match(answer!.disagreements[0].resolution, /support blue/);
    assert.match(answer!.markdown, /HELLO KEPLAR 42/);
    assert.ok(answer!.sources.some((x) => x.kind === "attachment" && /8 still frames/.test(x.detail ?? "")));
  } finally {
    globalThis.fetch = real;
  }
});

test("image quality: 4096 px cap, one image may use nearly the whole request, EXIF orientation is read", async () => {
  assert.equal(MEDIA_LIMITS.imageMaxEdge, 4096);
  assert.ok(MEDIA_LIMITS.maxDecodedBytesPerImage >= 2_600_000);
  // A single image at the per-image cap still fits inside the request budget (base64 is 4/3 of the bytes).
  assert.ok(Math.ceil((MEDIA_LIMITS.maxDecodedBytesPerImage * 4) / 3) <= MEDIA_LIMITS.maxTotalDataUrlChars);
  assert.ok(MEDIA_LIMITS.maxTotalDataUrlChars + 700_000 <= MEDIA_LIMITS.maxBodyBytes, "leaves room for prompt + history");
  const { jpegOrientation } = await import("@/components/app-ui/media-client");
  // Minimal big-endian EXIF with Orientation = 6 (rotated 90 degrees).
  const exif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0xff, 0xda]);
  assert.equal(jpegOrientation(exif), 6);
  assert.equal(jpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1);
  assert.equal(jpegOrientation(Uint8Array.from([0x89, 0x50])), 1);
});
