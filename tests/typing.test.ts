import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { commonPrefixLen, desiredCps, frameCap, healMarkdown, initialTyping, stepTyping, TYPING, visibleText } from "@/lib/typing";

const TEXT = "Photosynthesis turns light into chemical energy. It happens in the chloroplasts, and it needs water.";

function run(text: string, ms: number, frame = 16, from = initialTyping(0)) {
  let st = from;
  for (let t = 0; t < ms; t += frame) st = stepTyping(st, frame, text);
  return st;
}

test("pace: steady when caught up, faster in proportion to the backlog, capped", () => {
  assert.equal(desiredCps(0), TYPING.baseCps);
  assert.equal(desiredCps(10), TYPING.baseCps);
  assert.ok(desiredCps(400) > desiredCps(100));
  assert.equal(desiredCps(1_000_000), TYPING.maxCps);
});

test("reveal advances smoothly and never overshoots", () => {
  let st = initialTyping(0);
  let prev = 0;
  for (let i = 0; i < 400; i++) {
    st = stepTyping(st, 16, TEXT);
    assert.ok(st.pos >= prev, "monotonic");
    assert.ok(st.pos - prev < 12, "no jumps");
    assert.ok(st.pos <= TEXT.length);
    prev = st.pos;
  }
  assert.equal(st.pos, TEXT.length);
});

test("catches up: a burst in a live stream is cleared in about a second, not at reading speed", () => {
  const long = "word ".repeat(400); // 2000 chars
  const st = run(long, 1200);
  assert.equal(st.pos, long.length, "2000 chars revealed within 1.2 s");
  assert.ok(TYPING.baseCps * 1.2 < 100, "at the base pace it would still be far from done");
});

test("a finished answer is never held back: the rest appears within a few frames", () => {
  const long = "Sentence one. Sentence two! ".repeat(110); // ~3000 chars, sentence ends everywhere
  let st = initialTyping(0);
  let ms = 0;
  for (; ms < 2000 && st.pos < long.length; ms += 16) st = stepTyping(st, 16, long, TYPING.maxFrameMs, true);
  assert.equal(st.pos, long.length);
  assert.ok(ms <= TYPING.doneSeconds * 1000 + 50, `finished in ${ms} ms`);
  assert.equal(stepTyping({ pos: 10, cps: 100, pauseMs: 100 }, 16, long, TYPING.maxFrameMs, true).pauseMs, 0, "no sentence pauses once it has all arrived");
});

test("a stalled frame (busy tab) does not teleport the reveal", () => {
  const st = stepTyping(initialTyping(0), 5000, "x".repeat(2000));
  assert.ok(st.pos < 200, "one hiccup reveals at most a tenth of a long backlog");
});

test("sentence pause applies only when close behind the stream", () => {
  const near = stepTyping({ pos: 47, cps: 200, pauseMs: 0 }, 50, TEXT); // crosses ". " at index 47-48
  assert.ok(near.pauseMs > 0, "short pause at sentence end");
  const far = stepTyping({ pos: 47, cps: 200, pauseMs: 0 }, 50, TEXT + " more".repeat(100));
  assert.equal(far.pauseMs, 0, "no pause while catching up");
  const waiting = stepTyping({ pos: 10, cps: 100, pauseMs: 100 }, 30, TEXT);
  assert.equal(waiting.pos, 10);
  assert.equal(waiting.pauseMs, 70);
});

test("visibleText cuts at word boundaries and shows everything at the end", () => {
  assert.equal(visibleText(TEXT, 0), "");
  assert.equal(visibleText(TEXT, 5), "", "first word still being typed shows nothing");
  assert.equal(visibleText(TEXT, 15), "Photosynthesis");
  assert.equal(visibleText(TEXT, 20), "Photosynthesis turns");
  assert.equal(visibleText(TEXT, TEXT.length), TEXT);
  assert.equal(visibleText(TEXT, TEXT.length + 40), TEXT);
  assert.equal(visibleText("a\n\nb", 1), "a");
});

test("commonPrefixLen: the reveal keeps its place when text is extended or only the tail changes", () => {
  assert.equal(commonPrefixLen("hello wor", "hello world"), 9);
  assert.equal(commonPrefixLen("hello", "help"), 3);
  assert.equal(commonPrefixLen("", "x"), 0);
});

test("healMarkdown: partial markers never show raw and finished text is untouched", () => {
  assert.equal(healMarkdown("Some **bold te"), "Some **bold te**");
  assert.equal(healMarkdown("Use `code"), "Use `code`");
  assert.equal(healMarkdown("See [the docs](https://exa"), "See the docs");
  assert.equal(healMarkdown("See [the do"), "See the do");
  assert.equal(healMarkdown("Intro\n\n-"), "Intro\n");
  assert.equal(healMarkdown("Intro\n\n##"), "Intro\n");
  assert.equal(healMarkdown("Intro\n\n1."), "Intro\n");
  assert.equal(healMarkdown("Intro\n\n``"), "Intro\n");
  assert.equal(healMarkdown("a *"), "a ");
  assert.equal(healMarkdown("a *ital"), "a *ital*");
  assert.equal(healMarkdown("- item with **bo"), "- item with **bo**");
  const done = "# Title\n\nSome **bold** and `code` and [link](https://example.com).\n\n- a\n- b";
  assert.equal(healMarkdown(done), done);
  // code fences: open fences are left for the renderer (it treats them as open), the body is untouched
  assert.equal(healMarkdown("```js\nconst a = **2"), "```js\nconst a = **2");
  assert.equal(healMarkdown(""), "");
});

test("healMarkdown is idempotent and every prefix of a real answer heals to something stable", () => {
  const md = "**Short answer:** yes.\n\n1. First **point** here\n2. Second `point`\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```py\nprint(1)\n```\n\nSee [docs](https://x.dev).";
  for (let i = 0; i <= md.length; i++) {
    const once = healMarkdown(md.slice(0, i));
    assert.equal(healMarkdown(once), once, `idempotent at ${i}`);
    assert.ok(!/\*\*[^*]*$/.test(once.replace(/```[\s\S]*?(```|$)/g, "")) || (once.match(/\*\*/g)?.length ?? 0) % 2 === 0, `balanced bold at ${i}`);
  }
  assert.equal(healMarkdown(md), md);
});

test("the copied/answer text is the full text: revealed prefix is only ever a prefix of it", () => {
  for (const pos of [0, 3, 14, 40, 77, 500]) {
    const shown = visibleText(TEXT, pos);
    assert.ok(TEXT.startsWith(shown));
  }
});

test("slow frames (weak GPU, loaded machine, heavy canvas) still finish in seconds, not in frames", () => {
  assert.equal(frameCap(16, 16), TYPING.maxFrameMs);
  assert.equal(frameCap(16, 5000), TYPING.maxFrameMs, "one hiccup is still clamped");
  assert.equal(frameCap(1500, 1500), TYPING.slowFrameMaxMs, "sustained slow frames use real time");
  const text = "Use Postgres. It is the safer default for most teams.";
  let st = initialTyping(0), prev = 0, frames = 0;
  while (st.pos < text.length && frames < 100) { st = stepTyping(st, 1500, text, frameCap(prev, 1500)); prev = 1500; frames++; }
  assert.ok(frames <= 8, `took ${frames} frames of 1.5 s`);
  // the old clamp: every frame moves at most 100 ms of reveal
  let old = initialTyping(0), n = 0;
  while (old.pos < text.length && n < 100) { old = stepTyping(old, 1500, text); n++; }
  assert.ok(n > frames, "the clamp alone needed more frames");
});
