import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectVideoIntent } from "@/lib/video/chat-intent";
import { chatVideoOffer, defaultChatOffer, outputMatches, planVideoQuestions, readVideoPrefs, writeVideoPrefs } from "@/lib/video/chat-offer";
import { blockedFrom, chatModel, startVideo, VIDEO_PLAN_MESSAGE, VidError, type VideoConfig } from "@/lib/video/chat-flow";
import { UPGRADE_MESSAGE } from "@/lib/higgsfield/video";
import { hfModel, videoBody } from "@/lib/higgsfield/catalog";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { compareGroups } from "@/lib/growth/pricing-page";
import { settleVideo } from "@/components/app-ui/state/store";
import type { KeplarMessage, Message } from "@/components/app-ui/state/types";

const read = (p: string) => readFileSync(p, "utf8");

test("video intent: a request to make a clip is detected; questions and other builds are not", () => {
  const yes: [string, string][] = [
    ["make a video of a fox in snow", "a fox in snow"],
    ["create a short video of the ocean at dusk", "the ocean at dusk"],
    ["generate a clip of rain on a window", "rain on a window"],
    ["Can you please make a video of a lighthouse?", "a lighthouse"],
    ["I want a video of the northern lights", "the northern lights"],
    ["animate a clip of paper boats", "paper boats"],
    ["make a vertical 10 second video of a dancer", "a dancer"],
    ["make a video for TikTok of a skateboarder", "a skateboarder"],
  ];
  for (const [text, prompt] of yes) assert.equal(detectVideoIntent(text)?.prompt, prompt, text);

  const no = [
    "how do I edit a video",
    "how do I make a video",
    "recommend a video about cooking",
    "what is a video codec",
    "write a script for a video of a fox",
    "make a video game about space",
    "build me a website for my bakery",
    "create an app for invoices",
    "make a video of this image",
    "animate the attached photo",
    "explain video formats",
    "make a video editor",
  ];
  for (const t of no) assert.equal(detectVideoIntent(t), null, t);
});

test("video intent: shape and length are read from the words, and a conflict is left open", () => {
  assert.equal(detectVideoIntent("make a vertical 10 second video of a fox")?.aspect, "9:16");
  assert.equal(detectVideoIntent("make a vertical 10 second video of a fox")?.durationSec, 10);
  assert.equal(detectVideoIntent("make a video of a cat for TikTok")?.aspect, "9:16");
  assert.equal(detectVideoIntent("make a video of a dance for Reels")?.aspect, "9:16");
  assert.equal(detectVideoIntent("make a portrait video of a street")?.aspect, "9:16");
  assert.equal(detectVideoIntent("make a 9:16 video of a street")?.aspect, "9:16");
  assert.equal(detectVideoIntent("make a video of a lecture for YouTube")?.aspect, "16:9");
  assert.equal(detectVideoIntent("make a landscape video of mountains")?.aspect, "16:9");
  assert.equal(detectVideoIntent("make a 16:9 video of mountains")?.aspect, "16:9");
  assert.equal(detectVideoIntent("make a widescreen video of a city")?.aspect, "16:9");
  assert.equal(detectVideoIntent("make an eight second video of a dog")?.durationSec, 8);
  assert.equal(detectVideoIntent("make a 5s video of a kite")?.durationSec, 5);
  assert.equal(detectVideoIntent("make a 10-second video of waves")?.durationSec, 10);
  assert.equal(detectVideoIntent("make a video of a fox in snow")?.aspect, null);
  assert.equal(detectVideoIntent("make a video of a fox in snow")?.durationSec, null);
  assert.equal(detectVideoIntent("make a video of a cat for TikTok and YouTube")?.aspect, null);
  assert.equal(detectVideoIntent("make a 16:9 or 9:16 video of a cat")?.aspect, null);
  assert.equal(detectVideoIntent("make a vertical YouTube video of a talk")?.aspect, null);
});

test("the chat offers only 16:9 and 9:16, and only durations the model and the plan both allow", () => {
  const pro = defaultChatOffer(ENTITLEMENTS.pro.maxVideoSeconds);
  const business = defaultChatOffer(ENTITLEMENTS.business.maxVideoSeconds);
  assert.deepEqual(pro.aspects, ["16:9", "9:16"]);
  assert.deepEqual(pro.durations, [4, 5, 6, 7, 8]);
  assert.deepEqual(business.durations, [4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(defaultChatOffer(0).durations, []);
  const clipped = chatVideoOffer({ durations: [5, 10, 15], aspectRatios: ["16:9", "1:1", "9:16"] }, 10);
  assert.deepEqual(clipped.durations, [5, 10]);
  assert.deepEqual(clipped.aspects, ["16:9", "9:16"]);
});

test("a stated shape or length is skipped; a remembered choice is only the default; both stated starts immediately", () => {
  const offer = defaultChatOffer(10);
  const open = planVideoQuestions({ aspect: null, durationSec: null }, offer, {});
  assert.equal(open?.askAspect, true);
  assert.equal(open?.askDuration, true);
  assert.equal(open?.ready, false);

  const remembered = planVideoQuestions({ aspect: null, durationSec: null }, offer, { aspect: "9:16", duration: 8 });
  assert.equal(remembered?.ready, false);
  assert.equal(remembered?.aspect, "9:16");
  assert.equal(remembered?.duration, 8);

  const shapeOnly = planVideoQuestions({ aspect: "16:9", durationSec: null }, offer, { aspect: "9:16", duration: 8 });
  assert.equal(shapeOnly?.askAspect, false);
  assert.equal(shapeOnly?.askDuration, true);
  assert.equal(shapeOnly?.aspect, "16:9");
  assert.equal(shapeOnly?.ready, false);

  const both = planVideoQuestions({ aspect: "9:16", durationSec: 10 }, offer, {});
  assert.equal(both?.ready, true);
  assert.equal(both?.aspect, "9:16");
  assert.equal(both?.duration, 10);

  const tooLongForPro = planVideoQuestions({ aspect: "9:16", durationSec: 10 }, defaultChatOffer(8), {});
  assert.equal(tooLongForPro?.ready, false);
  assert.equal(tooLongForPro?.askAspect, false);
  assert.equal(tooLongForPro?.askDuration, true);

  const notAModelLength = planVideoQuestions({ aspect: null, durationSec: 3 }, offer, {});
  assert.equal(notAModelLength?.askDuration, true);
  assert.equal(notAModelLength?.ready, false);

  const tiktok = detectVideoIntent("make a 10 second video of a dancer for TikTok")!;
  assert.equal(planVideoQuestions(tiktok, offer)?.ready, true);
  assert.equal(planVideoQuestions(tiktok, offer)?.aspect, "9:16");
  const youtube = detectVideoIntent("make a video of a lecture for YouTube")!;
  assert.equal(planVideoQuestions(youtube, offer)?.askAspect, false);
  assert.equal(planVideoQuestions(youtube, offer)?.aspect, "16:9");
  assert.equal(planVideoQuestions(youtube, offer)?.ready, false);
});

test("the last confirmed choice is stored and read back; blocked storage does not throw", () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.deepEqual(readVideoPrefs(store), {});
  writeVideoPrefs("9:16", 8, store);
  assert.deepEqual(readVideoPrefs(store), { aspect: "9:16", duration: 8 });
  mem.set("keplar:chat-video", "{\"aspect\":\"square\",\"duration\":0}");
  assert.deepEqual(readVideoPrefs(store), {});
  const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.deepEqual(readVideoPrefs(blocked), {});
  assert.doesNotThrow(() => writeVideoPrefs("16:9", 5, blocked));
});

test("a finished file is checked against the shape and length that were asked for", () => {
  assert.deepEqual(outputMatches({ aspect: "16:9", durationSec: 8 }, { width: 1920, height: 1080, durationSec: 8.2 }), { aspect: true, duration: true, pending: false });
  assert.deepEqual(outputMatches({ aspect: "9:16", durationSec: 10 }, { width: 1080, height: 1920, durationSec: 9.5 }), { aspect: true, duration: true, pending: false });
  const wrongShape = outputMatches({ aspect: "9:16", durationSec: 8 }, { width: 1920, height: 1080, durationSec: 8 });
  assert.equal(wrongShape.aspect, false);
  assert.equal(wrongShape.duration, true);
  const wrongLength = outputMatches({ aspect: "16:9", durationSec: 8 }, { width: 1280, height: 720, durationSec: 10 });
  assert.equal(wrongLength.aspect, true);
  assert.equal(wrongLength.duration, false);
  assert.equal(outputMatches({ aspect: "16:9", durationSec: 8 }, { width: 0, height: 0, durationSec: 0 }).pending, true);
});

test("the generator body carries the chosen aspect ratio and duration", () => {
  const model = hfModel("hf/bytedance/seedance-2.0/text-to-video");
  assert.ok(model);
  const body = videoBody(model!, { prompt: "a fox in snow", durationSec: 8, aspectRatio: "9:16" });
  assert.equal(body.aspect_ratio, "9:16");
  assert.equal(body.duration, 8);
  const landscape = videoBody(model!, { prompt: "a fox in snow", durationSec: 5, aspectRatio: "16:9" });
  assert.equal(landscape.aspect_ratio, "16:9");
  assert.equal(landscape.duration, 5);
});

test("chat uses the default text-to-video model, and the plan sentence matches the server", () => {
  assert.equal(VIDEO_PLAN_MESSAGE, UPGRADE_MESSAGE);
  const config = {
    available: true, configured: true, message: null, upgradeTo: null, defaultModel: "hf/bytedance/seedance-2.0/text-to-video", maxSeconds: 8,
    models: [
      { id: "hf/bytedance/seedance-2.0/image-to-video", default: true, mode: "image-to-video", durations: [4, 5], aspectRatios: [] },
      { id: "hf/bytedance/seedance-2.0/text-to-video", default: true, mode: "text-to-video", durations: [4, 5, 6, 7, 8], aspectRatios: ["16:9", "9:16", "1:1"] },
    ],
  } satisfies VideoConfig;
  assert.equal(chatModel(config)?.id, "hf/bytedance/seedance-2.0/text-to-video");
  assert.equal(chatModel({ ...config, models: config.models.filter((m) => m.mode !== "text-to-video") }), null);
});

test("a plan that cannot make video is named honestly", () => {
  for (const id of ["free", "lite", "plus"] as const) {
    assert.equal(ENTITLEMENTS[id].video, false);
    assert.equal(ENTITLEMENTS[id].maxVideoSeconds, 0);
  }
  assert.equal(ENTITLEMENTS.pro.video, true);
  assert.equal(ENTITLEMENTS.pro.maxVideoSeconds, 8);
  assert.equal(ENTITLEMENTS.business.video, true);
  assert.equal(ENTITLEMENTS.business.maxVideoSeconds, 10);
  const signedOut = blockedFrom(new VidError("Sign in to continue.", 401, undefined, {}));
  assert.equal(signedOut?.reason, "signin");
  assert.equal(signedOut?.message, VIDEO_PLAN_MESSAGE);
  const plan = blockedFrom(new VidError(UPGRADE_MESSAGE, 402, "plan", { upgradeTo: "pro" }));
  assert.equal(plan?.reason, "plan");
  assert.equal(plan?.upgradeTo, "pro");
});

test("starting a clip sends the chosen aspect, duration and the quoted confirmUnits", async () => {
  const orig = globalThis.fetch;
  const sent: { body: Record<string, unknown> | null } = { body: null };
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ jobs: [{ id: "med_1", status: "queued", url: null, units: null, estimatedUnits: 40, params: { aspectRatio: "9:16", durationSec: 8 } }] }), { status: 202, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const job = await startVideo({ prompt: "a fox in snow", aspect: "9:16", durationSec: 8, modelId: "hf/bytedance/seedance-2.0/text-to-video", key: "key-12345678", confirmUnits: 40 });
    assert.equal(sent.body?.aspectRatio, "9:16");
    assert.equal(sent.body?.durationSec, 8);
    assert.equal(sent.body?.confirmUnits, 40);
    assert.equal(sent.body?.model, "hf/bytedance/seedance-2.0/text-to-video");
    assert.equal(job.params.aspectRatio, "9:16");
    assert.equal(job.params.durationSec, 8);
  } finally {
    globalThis.fetch = orig;
  }
});

test("an unstarted clip is not resumed after a reload; one with a job id is", () => {
  const card = (phase: "checking" | "options" | "confirm" | "working" | "ready", jobId?: string): Message => ({
    id: "k1", role: "keplar", replyTo: "u1", status: "done", stages: [], capabilities: [], models: [], draft: "", startedAt: 1,
    video: { phase, prompt: "a fox", statedAspect: null, statedDuration: null, key: "abc12345", ...(jobId ? { jobId } : {}) },
  });
  const phaseOf = (m: Message) => (settleVideo(m) as KeplarMessage).video?.phase;
  for (const phase of ["checking", "options", "confirm"] as const) assert.equal(phaseOf(card(phase)), "canceled");
  assert.equal(phaseOf(card("working")), "canceled");
  assert.equal(phaseOf(card("working", "med_1")), "working");
  assert.equal(phaseOf(card("ready", "med_1")), "ready");
});

test("Create offers a website or an app, and a chat clip is not a Create build", () => {
  const composer = read("src/components/app-ui/Composer.tsx");
  assert.match(composer, /hint: "Build a website or app"/);
  assert.match(composer, /create: "Build a website or app"/);
  assert.doesNotMatch(composer, /Apps, images, video/);
  const app = read("src/components/app-ui/KeplarApp.tsx");
  const videoAsk = app.indexOf("const videoAsk");
  const createGate = app.indexOf("modesForSend.create && !studio && !slash.command && !found && !videoAsk");
  const noRun = app.indexOf("if (noRun && videoAsk)");
  assert.ok(videoAsk > 0 && videoAsk < createGate && createGate < noRun);
  assert.match(app, /!modes\.create && !modes\.agent && !modes\.debate && !modes\.image/);
  const studio = read("src/components/create/CreateStudio.tsx");
  assert.match(studio, /value: "app", label: "App"/);
  assert.doesNotMatch(studio, /value: "images"|value: "video"/);
  const createGroup = compareGroups.find((g) => g.title === "Create")!;
  assert.equal(createGroup.rows.some((r) => /image|video/i.test(r.label)), false);
  const media = compareGroups.find((g) => g.title === "Pictures and video")!;
  assert.ok(media.rows.some((r) => r.label === "Image generation"));
  assert.ok(media.rows.some((r) => r.label === "Video generation (Beta)"));
});
