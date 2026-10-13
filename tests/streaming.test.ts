import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { postChatStream } from "@/lib/orchestration/http";
import { earlyStream, visibleText } from "@/lib/orchestration/early-stream";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import type { KeplarEvent } from "@/lib/orchestration/types";

const sse = (chunks: string[], usage = true) =>
  chunks.map((c) => `data: ${JSON.stringify({ model: "m", provider: "p", choices: [{ delta: { content: c }, finish_reason: null }] })}\n\n`).join("") +
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n` +
  (usage ? `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, cost: 0.001 } })}\n\n` : "") +
  "data: [DONE]\n\n";

test("visibleText: reasoning blocks and half-arrived tags are never visible", () => {
  assert.equal(visibleText("Hello"), "Hello");
  assert.equal(visibleText("<think>hmm</think>Answer"), "Answer");
  assert.equal(visibleText("<think>still thinking"), "");
  assert.equal(visibleText("Answer <thi"), "Answer ");
  assert.equal(visibleText("a < b"), "a < b");
  assert.equal(visibleText("x</think>\nReal"), "Real");
});

test("earlyStream: the first seat to speak (and pass the quality check) leads, the others are ignored, <think> is held back", () => {
  const out: string[] = [];
  const e = earlyStream((t) => out.push(t), { minChars: 20 });
  e.tokens(1)("<think>plan");
  assert.equal(out.length, 0);
  e.tokens(0)("Hello there, this is ");
  assert.deepEqual(out, ["Hello there, this is "]);
  e.tokens(1)("</think>Nope, not leading at all.");
  e.tokens(0)("the leader.");
  assert.deepEqual(out, ["Hello there, this is ", "the leader."]);
  assert.equal(e.leader, 0);
  assert.equal(e.started, true);
});

test("earlyStream: junk never reaches the screen; a short reply is shown when it completes; a non-streamed seat is never shown", () => {
  const out: string[] = [];
  const e = earlyStream((t) => out.push(t), { minChars: 40 });
  e.tokens(0)("xells massiving, this sax self summar along healthcare rigor ge in fortified overt along,ells.aellsells stuck ");
  assert.deepEqual(out, [], "word salad is held and rejected");
  e.tokens(0)("and more words after it that should still not appear. ");
  assert.deepEqual(out, []);
  e.tokens(1)("Short.");
  assert.deepEqual(out, [], "a short opening is waiting for the gate");
  e.complete(1, "Short.");
  assert.deepEqual(out, ["Short."]);
  e.complete(2, "A seat that never streamed");
  assert.deepEqual(out, ["Short."]);
});

test("postChatStream: reads server-sent events, calls onToken per piece, returns the whole reply with usage", async () => {
  const srv = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const body = sse(["Hel", "lo ", "wor", "ld"]);
    // split mid-line to prove the parser buffers
    res.write(body.slice(0, 40));
    setTimeout(() => { res.write(body.slice(40)); res.end(); }, 20);
    void req;
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1/chat/completions`;
  try {
    const pieces: string[] = [];
    const r = await postChatStream(url, { model: "m", messages: [] }, {}, (d) => pieces.push(d));
    assert.deepEqual(pieces, ["Hel", "lo ", "wor", "ld"]);
    assert.equal(r.choices[0].message.content, "Hello world");
    assert.equal(r.choices[0].finish_reason, "stop");
    assert.equal(r.usage?.completion_tokens, 3);
    assert.equal(r.usage?.cost, 0.001);
  } finally {
    srv.close();
  }
});

test("postChatStream: a gateway that answers plain JSON still works (nothing streamed); 4xx throws; 429 is retried before the stream starts", async () => {
  let n = 0;
  const srv = createServer((req, res) => {
    n++;
    if (req.url?.includes("json")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ model: "m", choices: [{ message: { content: "plain" }, finish_reason: "stop" }] })); return; }
    if (req.url?.includes("bad")) { res.writeHead(400); res.end("nope"); return; }
    if (n === 1) { res.writeHead(429, { "retry-after": "0" }); res.end("slow down"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sse(["ok"]));
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const got: string[] = [];
    const j = await postChatStream(`${base}/json`, {}, {}, (d) => got.push(d));
    assert.equal(j.choices[0].message.content, "plain");
    assert.deepEqual(got, []);
    await assert.rejects(postChatStream(`${base}/bad`, {}, {}, () => undefined), /nope/);
    n = 0;
    const r = await postChatStream(`${base}/retry`, {}, {}, () => undefined, undefined, { attempts: 2, maxMs: 10 });
    assert.equal(r.choices[0].message.content, "ok");
  } finally {
    srv.close();
  }
});

/** The full live pipeline with a streaming stub network: the first panel model's words reach the screen long before the panel, review and synthesis finish. */
test("orchestrate: the leading model's words arrive first (real streaming); the checked answer replaces them", async () => {
  const realFetch = globalThis.fetch;
  const t0 = Date.now();
  const calls: { kind: string; start: number }[] = [];
  const LEAD = "Everest is about 8,849 meters tall according to the joint 2020 China and Nepal survey, which is the official figure used today.";
  const enc = new TextEncoder();
  let firstWordShown = () => {};
  const leaderChosen = new Promise<void>((r) => { firstWordShown = r; });
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; stream?: boolean; messages: { role: string; content: string }[] };
    const sys = body.messages[0]?.content ?? "";
    const kind = sys.startsWith("You are Keplar's combined reviewer") ? "merged" : sys.startsWith("You are Keplar's response classifier") ? "extract" : sys.startsWith("You are Keplar's verifier") ? "verify" : sys.startsWith("You are Keplar's judge-tier synthesizer") ? "synth" : sys.startsWith("You are Keplar's final editor") ? "critique" : "panel";
    calls.push({ kind, start: Date.now() - t0 });
    if (kind === "panel" && body.stream) {
      // The first seat starts talking at once; the other seats answer a lot later.
      const slow = calls.filter((c) => c.kind === "panel").length > 1;
      const parts = slow ? ["Slow ", "answer ", "here."] : LEAD.match(/\S+\s*/g)!;
      const stream = new ReadableStream({
        async start(ctl) {
          // The slow seats start 400 ms after the first seat's words are on screen (it leads from then on), not 400 ms after they were asked:
          // on a loaded machine the ~15 short timers before those words can outlast a fixed 400 ms, and a slow seat then finished first and
          // led, or answered right after the first words. Both were flaky failures, not product bugs. The 5 s cap keeps a real regression (no
          // early words at all) a failed assertion instead of a hang.
          if (slow) await Promise.race([leaderChosen, new Promise((r) => setTimeout(r, 5000).unref())]);
          await new Promise((r) => setTimeout(r, slow ? 400 : 20));
          for (const p of parts) { ctl.enqueue(enc.encode(`data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: p } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 15)); }
          ctl.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8, cost: 0 } })}\n\ndata: [DONE]\n\n`));
          ctl.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    await new Promise((r) => setTimeout(r, 120));
    let content: string;
    if (kind === "extract" || kind === "merged") {
      const n = (body.messages[1].content.match(/### R\d+/g) ?? []).length;
      content = JSON.stringify({ topic: "t", positions: [{ id: "P1", label: "8,849 m", summary: "About 8,849 m." }], responses: Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: "answer", position: "P1" })), claims: [{ text: "Everest is about 8,849 m", responses: ["R1", "R2"] }] });
      if (kind === "merged") content += "\n=====ANSWER=====\nFINAL: Mount Everest is about 8,849 meters tall.\nRESOLUTION: No disagreement.";
    } else if (kind === "verify") content = JSON.stringify({ checks: [], disputed: [] });
    else if (kind === "synth") content = "FINAL: Mount Everest is about 8,849 meters (29,032 feet) tall.\nRESOLUTION: No disagreement.";
    else if (kind === "critique") content = "OK";
    else content = LEAD;
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 30, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const prev = { k: process.env.KEPLAR_LIVE_MODELS, o: process.env.OPENROUTER_API_KEY };
  process.env.KEPLAR_LIVE_MODELS = "1";
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  try {
    const events: { e: KeplarEvent; at: number }[] = [];
    const deps = engineDeps({ keyTier: "free" })!;
    for await (const e of orchestrate({ prompt: "Write a Python function that returns the n most common words in a text file.", plan: "free", computeRemaining: 1e6 }, deps)) {
      events.push({ e, at: Date.now() - t0 });
      if (e.type === "delta") firstWordShown();
    }
    const deltas = events.filter((x) => x.e.type === "delta");
    const answer = events.find((x) => x.e.type === "answer")!;
    assert.ok(deltas.length > 1, "words streamed in several pieces");
    const text = deltas.map((x) => (x.e as { text: string }).text).join("");
    assert.equal(text, LEAD, "only the leader's words, no second copy from the synthesis");
    const firstWord = deltas[0].at;
    const firstExtract = calls.find((c) => c.kind === "merged")?.start ?? Infinity;
    assert.ok(firstWord < firstExtract, `first word at ${firstWord}ms, before the comparison step started at ${firstExtract}ms`);
    assert.ok(firstWord < answer.at - 300, `first word ${firstWord}ms vs final answer ${answer.at}ms`);
    assert.ok(deltas[deltas.length - 1].at <= answer.at);
    const final = (answer.e as { answer: { markdown: string } }).answer.markdown;
    assert.ok(calls.some((c) => c.kind === "merged"), "multi-model path ran: " + calls.map((c) => c.kind).join(","));
    // Every model took the same position on Free: no separate write-up call, the reply the person already read is the answer.
    assert.ok(!calls.some((c) => c.kind === "synth"), "no synthesis call when all models agree on Free");
    assert.equal(final.trim(), LEAD.trim());
  } finally {
    globalThis.fetch = realFetch;
    if (prev.k === undefined) delete process.env.KEPLAR_LIVE_MODELS; else process.env.KEPLAR_LIVE_MODELS = prev.k;
    if (prev.o === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prev.o;
  }
});
