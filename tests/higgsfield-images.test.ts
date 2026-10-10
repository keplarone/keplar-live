import "./setup";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { installHfFake, HF_HOST, HF_TEST_KEY } from "./helpers/hf-fake";
import { call, jsonReq, signIn } from "./helpers/session";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
process.env.KEPLAR_HIGGSFIELD_BASE = HF_HOST;
process.env.KEPLAR_OPENAI_BASE = "http://mock.openai.test/v1";

import { estimateImage, imageModelChoices, imageProvider, imagesConfigured } from "@/lib/images/config";
import { toUnits, usedThisPeriod } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { meteredUsd } from "@/lib/orchestration/limits";
import { mintReference } from "@/lib/higgsfield/reference";
import { clearCooldown } from "@/lib/create/platform/cooldown";

/* mock OpenAI (the fallback provider): images + moderation. Installed first so the Higgsfield fake wraps it. */
let webp = Buffer.alloc(0);
let oaiGen: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch;
let fake!: ReturnType<typeof installHfFake>;
before(async () => {
  webp = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#c33" } }).webp().toBuffer();
  const oaiFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://mock.openai.test/")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/moderations")) return Response.json({ results: [{ flagged: false, categories: {} }] });
    if (url.endsWith("/images/generations")) {
      oaiGen.push(body);
      return Response.json({ created: 1, data: [{ b64_json: webp.toString("base64") }], usage: { input_tokens: 40, input_tokens_details: { text_tokens: 40, image_tokens: 0 }, output_tokens: 1056 } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  globalThis.fetch = oaiFetch;
  fake = installHfFake(); // wraps the OpenAI mock: Higgsfield hosts are answered by the fake, everything else falls through
});
after(() => { fake.restore(); globalThis.fetch = realFetch; });
beforeEach(() => { fake.reset(); oaiGen = []; process.env.HIGGSFIELD_API = HF_TEST_KEY; delete process.env.OPENAI_API_KEY; });

const listRoute = () => import("@/app/api/images/route");
const estRoute = () => import("@/app/api/images/estimate/route");
const oneRoute = () => import("@/app/api/images/[id]/route");
const fileRoute = () => import("@/app/api/images/[id]/file/route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let k = 0;
const key = () => `hf-test-key-${Date.now()}-${++k}`;
type JobJson = { id: string; status: string; errorCode: string | null; units: number | null; error: string | null };
type Cfg = { provider: string | null; configured: boolean; models: { id: string; default: boolean; available: boolean; supports: { seed: boolean; negativePrompt: boolean }; estimates: Record<string, Record<string, number>> }[]; references: { available: boolean; estimateUnits: number; maxImages: number }; estimates: Record<string, Record<string, number>> };
const post = async (cookie: string, body: Record<string, unknown>) => (await listRoute()).POST(jsonReq(cookie, "/api/images", "POST", body));
const units = (usd: number) => toUnits(meteredUsd(usd));
async function create(cookie: string, prompt: string, extra: Record<string, unknown> = {}) {
  const model = extra.model as string | undefined;
  const refs = Array.isArray(extra.references) && extra.references.length > 0;
  const est = estimateImage("high", "1536x1024", refs, model).units;
  return post(cookie, { prompt, idempotencyKey: key(), size: "1536x1024", quality: "high", confirmUnits: est, ...extra });
}
async function waitDone(cookie: string, id: string): Promise<JobJson> {
  for (let i = 0; i < 400; i++) {
    const j = ((await (await (await oneRoute()).GET(call(cookie, `/api/images/${id}`), ctx(id))).json()) as { job: JobJson }).job;
    if (j.status === "ready" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("image job never finished");
}

test("config: with Higgsfield keys it is the provider and Z-Image Turbo the default; OpenAI is the listed fallback", async () => {
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  assert.equal(imageProvider(), "higgsfield");
  const { cookie } = await signIn("hfimg-cfg@example.com", "plus");
  const cfg = ((await (await (await listRoute()).GET(call(cookie, "/api/images"))).json()) as { config: Cfg }).config;
  assert.equal(cfg.provider, "higgsfield");
  assert.equal(cfg.configured, true);
  const def = cfg.models.filter((m) => m.default);
  assert.equal(def.length, 1);
  assert.equal(def[0].id, "hf/z-image/turbo");
  assert.equal(cfg.models[0].id, "hf/z-image/turbo", "Higgsfield models come first");
  assert.ok(cfg.models.some((m) => m.id === "openai/gpt-image-1-mini" && m.available));
  const z = cfg.models.find((m) => m.id === "hf/z-image/turbo")!;
  const q = cfg.models.find((m) => m.id === "hf/alibaba/qwen-image-3/text-to-image")!;
  assert.deepEqual([z.supports.seed, z.supports.negativePrompt], [true, false]);
  assert.deepEqual([q.supports.seed, q.supports.negativePrompt], [true, true]);
  assert.equal(z.estimates.high["1536x1024"], units(0.015), "published $0.015 per image");
  assert.equal(q.estimates.high["1536x1024"], units(0.075), "upper end of the published range");
  assert.equal(cfg.references.available, true);
  assert.equal(cfg.references.estimateUnits, units(0.075));
  assert.equal(cfg.references.maxImages, 3);
});

test("config without Higgsfield keeps the previous OpenAI behaviour and prices", async () => {
  delete process.env.HIGGSFIELD_API;
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  assert.equal(imageProvider(), "openai");
  assert.equal(estimateImage("medium", "1024x1024").units, 7);
  const { cookie } = await signIn("hfimg-cfg2@example.com", "plus");
  const cfg = ((await (await (await listRoute()).GET(call(cookie, "/api/images"))).json()) as { config: Cfg }).config;
  assert.equal(cfg.provider, "openai");
  assert.equal(cfg.estimates.medium["1024x1024"], 7);
  assert.equal(cfg.references.available, false);
  assert.equal(cfg.models.find((m) => m.id === "openai/gpt-image-1-mini")!.default, true);
  assert.equal(cfg.models.find((m) => m.id === "hf/z-image/turbo")!.available, false);
});

test("nothing configured: not connected, creating is refused with 503", async () => {
  delete process.env.HIGGSFIELD_API;
  assert.equal(imagesConfigured(), false);
  const { cookie } = await signIn("hfimg-none@example.com", "plus");
  const cfg = ((await (await (await listRoute()).GET(call(cookie, "/api/images"))).json()) as { config: Cfg }).config;
  assert.equal(cfg.configured, false);
  const res = await create(cookie, "a quiet harbor at dawn, soft haze");
  assert.equal(res.status, 503);
  assert.equal(fake.submits().length, 0);
});

test("Higgsfield is used first: High asks for 2k PNG at the chosen shape; charged the published price; OpenAI is not called", async () => {
  const { cookie, workspaceId } = await signIn("hfimg-a@example.com", "plus");
  const res = await create(cookie, "a sunlit bakery counter with sourdough loaves", { seed: 1234 });
  assert.equal(res.status, 202);
  const id = ((await res.json()) as { job: JobJson }).job.id;
  const done = await waitDone(cookie, id);
  assert.equal(done.status, "ready", done.error ?? "");
  const s = fake.submits()[0];
  assert.equal(s.path, "/z-image/turbo");
  assert.deepEqual(s.body, { prompt: "a sunlit bakery counter with sourdough loaves", resolution: "2k", seed: 1234, aspect_ratio: "3:2" });
  assert.match(s.headers.authorization, /^Key /);
  assert.equal(oaiGen.length, 0);
  assert.equal(done.units, units(0.015));
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), units(0.015));
  const f = await (await fileRoute()).GET(call(cookie, `/api/images/${id}/file?download=1`), ctx(id));
  assert.equal(f.status, 200);
  assert.equal(f.headers.get("content-type"), "image/png", "the original PNG is served untouched");
  assert.match(f.headers.get("content-disposition") ?? "", /attachment/);
});

test("Standard quality asks for 1k", async () => {
  const { cookie } = await signIn("hfimg-b@example.com", "plus");
  const est = estimateImage("medium", "1024x1024").units;
  const res = await post(cookie, { prompt: "a quiet harbor at dawn, soft haze", idempotencyKey: key(), size: "1024x1024", quality: "medium", confirmUnits: est });
  assert.equal(res.status, 202);
  await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal((fake.submits()[0].body as { resolution: string }).resolution, "1k");
  assert.equal((fake.submits()[0].body as { aspect_ratio: string }).aspect_ratio, "1:1");
});

test("a Higgsfield outage falls back to OpenAI automatically; the charge never exceeds the confirmed estimate", async () => {
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  const { cookie, workspaceId } = await signIn("hfimg-fb@example.com", "plus");
  fake.state.submitFailures = [503, 503, 503];
  const res = await create(cookie, "a sunlit bakery counter with sourdough loaves");
  assert.equal(res.status, 202);
  const done = await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal(done.status, "ready", done.error ?? "");
  assert.equal(oaiGen.length, 1, "OpenAI answered");
  assert.ok((done.units ?? 0) <= estimateImage("high", "1536x1024").units, "never more than approved");
  assert.ok((done.units ?? 0) > 0);
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), done.units);
});

test("a refused prompt (Higgsfield nsfw) is not retried on OpenAI and is not charged", async () => {
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  const { cookie, workspaceId } = await signIn("hfimg-nsfw@example.com", "plus");
  fake.state.nextTerminal = "nsfw";
  const res = await create(cookie, "a sunlit bakery counter with sourdough loaves");
  const done = await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal(done.status, "failed");
  assert.equal(done.errorCode, "refused");
  assert.equal(oaiGen.length, 0);
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), 0);
});

test("without an OpenAI key a Higgsfield failure ends as a plain failed job with no charge", async () => {
  const { cookie, workspaceId } = await signIn("hfimg-fail@example.com", "plus");
  fake.state.nextTerminal = "failed";
  const res = await create(cookie, "a sunlit bakery counter with sourdough loaves");
  const done = await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal(done.status, "failed");
  assert.equal(await usedThisPeriod((await workspaceById(workspaceId))!), 0);
  assert.ok(!/Higgsfield|credentials|403/.test(done.error ?? ""), done.error ?? "");
});

test("a prompt longer than Z-Image's 800 characters uses the OpenAI fallback", async () => {
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  const { cookie } = await signIn("hfimg-long@example.com", "pro");
  const long = `a detailed street scene ${"with many small details ".repeat(40)}`.slice(0, 900);
  assert.ok(long.length > 800);
  const res = await create(cookie, long);
  assert.equal(res.status, 202);
  const done = await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal(done.status, "ready", done.error ?? "");
  assert.equal(fake.submits().length, 0);
  assert.equal(oaiGen.length, 1);
});

/* ── options ── */

test("model, seed and negative prompt are validated against what each model documents", async () => {
  const { cookie } = await signIn("hfimg-opts@example.com", "plus");
  const prompt = "a sunlit bakery counter with sourdough loaves";
  const bad = async (extra: Record<string, unknown>) => (await post(cookie, { prompt, idempotencyKey: key(), confirmUnits: 1, ...extra })).status;
  assert.equal(await bad({ model: "hf/not-a-model" }), 400);
  assert.equal(await bad({ model: "hf/bytedance/seedance-2.0/text-to-video" }), 400, "a video model is not an image model");
  assert.equal(await bad({ negativePrompt: "blurry" }), 400, "Z-Image Turbo has no negative prompt");
  assert.equal(await bad({ seed: -5 }), 400);
  assert.equal(await bad({ seed: 2147483648 }), 400);
  assert.equal(await bad({ seed: 1.5 }), 400);
  assert.equal(await bad({ model: "openai/gpt-image-1-mini", seed: 5 }), 503, "OpenAI isn't configured here, so it is refused before anything else");
  assert.equal(fake.submits().length, 0);
});

test("Qwen Image 3 takes a negative prompt and a seed, is priced at its own rate, and the options reach Higgsfield", async () => {
  const { cookie } = await signIn("hfimg-qwen@example.com", "plus");
  const model = "hf/alibaba/qwen-image-3/text-to-image";
  const res = await create(cookie, "a sunlit bakery counter with sourdough loaves", { model, seed: 7, negativePrompt: " blurry,  text " });
  assert.equal(res.status, 202);
  const done = await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal(done.status, "ready", done.error ?? "");
  const s = fake.submits()[0];
  assert.equal(s.path, "/alibaba/qwen-image-3/text-to-image");
  assert.equal((s.body as { seed: number }).seed, 7);
  assert.equal((s.body as { negative_prompt: string }).negative_prompt, "blurry, text");
  assert.equal(done.units, units(0.075));
});

test("the estimate endpoint follows the chosen model and reference", async () => {
  const { cookie, workspaceId } = await signIn("hfimg-est@example.com", "plus");
  const E = async (b: Record<string, unknown>) => ((await (await (await estRoute()).POST(jsonReq(cookie, "/api/images/estimate", "POST", b))).json()) as { estimate: { units: number } }).estimate.units;
  assert.equal(await E({}), units(0.015));
  assert.equal(await E({ model: "hf/alibaba/qwen-image-3/text-to-image" }), units(0.075));
  const r = mintReference(workspaceId, { kind: "image", url: `${HF_HOST}/ref/est`, contentType: "image/png", bytes: 100, name: "a.png" });
  assert.equal(await E({ references: [r] }), units(0.075));
});

/* ── references ── */

test("image-to-image: a reference needs the rights confirmation, goes to Qwen Image 3 Edit, and is priced for it", async () => {
  const { cookie, workspaceId } = await signIn("hfimg-ref@example.com", "plus");
  const prompt = "make it look like a watercolor painting";
  const r = mintReference(workspaceId, { kind: "image", url: `${HF_HOST}/ref/one`, contentType: "image/png", bytes: 100, name: "a.png" });
  const noRights = await create(cookie, prompt, { references: [r] });
  assert.equal(noRights.status, 400);
  assert.equal(((await noRights.json()) as { code: string }).code, "rights_required");
  assert.equal(fake.submits().length, 0);
  const res = await create(cookie, prompt, { references: [r], rightsConfirmed: true });
  assert.equal(res.status, 202, JSON.stringify(await res.clone().json()));
  const done = await waitDone(cookie, ((await res.json()) as { job: JobJson }).job.id);
  assert.equal(done.status, "ready", done.error ?? "");
  const s = fake.submits()[0];
  assert.equal(s.path, "/alibaba/qwen-image-3/edit");
  assert.deepEqual((s.body as { image_urls: string[] }).image_urls, [r.url]);
  assert.equal(done.units, units(0.075));
});

test("references: a forged or other-account reference, more than three, and no-Higgsfield are refused", async () => {
  const { cookie, workspaceId } = await signIn("hfimg-ref2@example.com", "plus");
  const mk = (ws: string, i: number) => mintReference(ws, { kind: "image", url: `${HF_HOST}/ref/${i}`, contentType: "image/png", bytes: 100, name: "a.png" });
  const prompt = "make it look like a watercolor painting";
  assert.equal((await create(cookie, prompt, { references: [mk("someone-else", 1)], rightsConfirmed: true })).status, 400);
  assert.equal((await create(cookie, prompt, { references: [1, 2, 3, 4].map((i) => mk(workspaceId, i)), rightsConfirmed: true })).status, 400);
  delete process.env.HIGGSFIELD_API;
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  const res = await create(cookie, prompt, { references: [mk(workspaceId, 5)], rightsConfirmed: true });
  assert.equal(res.status, 503, "no silent drop of the reference: OpenAI cannot use it");
  assert.equal(oaiGen.length, 0);
  await clearCooldown(workspaceId);
});

test("picker helper: model choices list Higgsfield first and mark exactly one default", () => {
  const c = imageModelChoices();
  assert.equal(c[0].provider, "higgsfield");
  assert.equal(c.filter((m) => m.default).length, 1);
  assert.equal(c.at(-1)!.id, "openai/gpt-image-1-mini");
  delete process.env.HIGGSFIELD_API;
  assert.ok(c.length >= 3);
});
