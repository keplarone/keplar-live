import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkForSpeech, isTap, pickVoice, speakableText, SPEAK_MAX_CHARS, TAP_MS, unsupportedMessage, voiceSupport } from "../src/lib/voice-mode";

test("support detection and the honest message for each combination", () => {
  assert.deepEqual(voiceSupport(undefined), { recognition: false, synthesis: false });
  assert.deepEqual(voiceSupport({ webkitSpeechRecognition: function () {}, speechSynthesis: {}, SpeechSynthesisUtterance: function () {} }), { recognition: true, synthesis: true });
  assert.deepEqual(voiceSupport({ speechSynthesis: {} }), { recognition: false, synthesis: false }); // needs the utterance constructor too
  assert.equal(unsupportedMessage({ recognition: true, synthesis: true }), "");
  const none = unsupportedMessage({ recognition: false, synthesis: false });
  assert.match(none, /Firefox/);
  assert.match(none, /keep typing/);
  assert.match(unsupportedMessage({ recognition: false, synthesis: true }), /read answers aloud but can't turn your speech into text/);
  assert.match(unsupportedMessage({ recognition: true, synthesis: false }), /answers stay on screen/);
  for (const m of [none, unsupportedMessage({ recognition: false, synthesis: true }), unsupportedMessage({ recognition: true, synthesis: false })]) assert.doesNotMatch(m, /coming soon|will be supported/i); // no promises
});

test("speakableText: markdown symbols, code, links, tables and citations are not read out", () => {
  const md = "## Pick JSONB\n\nUse **JSONB** for *variable* shapes [1] and see [the docs](https://example.com/docs).\n\n- Index with `GIN`\n- Keep filters in columns\n\n```sql\nCREATE INDEX x ON t USING gin (data);\n```\n\n| Option | Good for |\n|---|---|\n| JSONB | flexible |\n\nMore at https://example.com/x";
  const { text, truncated } = speakableText(md);
  assert.equal(truncated, false);
  assert.ok(!/[*#`|\[\]]/.test(text), text);
  assert.ok(!/https?:|CREATE INDEX|---/.test(text));
  assert.match(text, /Pick JSONB\./);
  assert.match(text, /Use JSONB for variable shapes and see the docs\./);
  assert.match(text, /Index with GIN\./);
  assert.match(text, /Code example omitted\./);
  assert.match(text, /Option, Good for\./);
  assert.match(text, /More at a link\./);
});

test("speakableText: long answers stop at a sentence boundary and say so; empty stays empty", () => {
  const long = "This is a sentence about storage. ".repeat(400);
  const r = speakableText(long);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= SPEAK_MAX_CHARS && r.text.endsWith("."));
  assert.deepEqual(speakableText(""), { text: "", truncated: false });
  assert.deepEqual(speakableText("```\nonly code\n```"), { text: "Code example omitted.", truncated: false });
});

test("chunkForSpeech: short utterances, sentence-aligned, nothing lost, no empty chunks", () => {
  const text = "First sentence here. Second one is a bit longer, with a comma. Third!\n\nNew paragraph starts here.";
  const chunks = chunkForSpeech(text, 40);
  assert.ok(chunks.every((c) => c.length > 0 && c.length <= 40), JSON.stringify(chunks));
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  const one = "word ".repeat(200).trim();
  const split = chunkForSpeech(one, 50);
  assert.ok(split.every((c) => c.length <= 50) && split.join(" ") === one);
  assert.deepEqual(chunkForSpeech(""), []);
});

test("pickVoice prefers an on-device voice in the user's language, then any in that language, then the browser default", () => {
  const v = [
    { name: "A", lang: "en-GB", localService: false, default: false },
    { name: "B", lang: "en-US", localService: true, default: false },
    { name: "C", lang: "fr-FR", localService: true, default: true },
    { name: "D", lang: "en_US", localService: false, default: false },
  ];
  assert.equal(pickVoice(v, "en-US"), 1);
  assert.equal(pickVoice(v, "en-AU"), 1); // same language, on-device
  assert.equal(pickVoice(v, "fr-CA"), 2);
  assert.equal(pickVoice([v[0], v[3]], "en-US"), 1); // exact match beats same-language
  assert.equal(pickVoice(v, "ja-JP"), -1);
  assert.equal(pickVoice([], "en-US"), -1);
});

test("push-to-talk vs tap: a quick press latches listening, a hold sends on release", () => {
  assert.equal(isTap(TAP_MS - 1), true);
  assert.equal(isTap(TAP_MS), false);
});

test("no audio is ever captured or stored by Keplar's voice code; the privacy page says so and mentions voice mode", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/components/app-ui/useVoice.ts", "src/components/app-ui/VoiceTalk.tsx", "src/components/app-ui/speech.ts", "src/components/app-ui/ListenButton.tsx", "src/lib/voice.ts", "src/lib/voice-mode.ts"]) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /MediaRecorder|getUserMedia|AudioContext|createMediaStreamSource|new Blob|FormData|localStorage|sessionStorage|indexedDB|fetch\(/, f);
  }
  const { privacy } = await import("../src/components/legal/content/privacy");
  const voice = JSON.stringify(privacy.sections.find((x) => x.id === "voice"));
  assert.match(voice, /Voice mode \(beta\)/);
  assert.match(voice, /never receives, records or stores audio/);
  assert.match(voice, /Firefox/);
  assert.match(voice, /no voice recordings or voiceprints/);
});

test("the Talk button and Listen button are wired into the composer and the answer card, and labelled beta", async () => {
  const { readFileSync } = await import("node:fs");
  const composer = readFileSync("src/components/app-ui/Composer.tsx", "utf8");
  assert.match(composer, /<VoiceTalk /);
  assert.match(composer, /armReadback\(\)/);
  const turn = readFileSync("src/components/app-ui/KeplarTurn.tsx", "utf8");
  assert.match(turn, /<ListenButton /);
  assert.match(readFileSync("src/components/app-ui/VoiceTalk.tsx", "utf8"), /Talk \(beta\)/);
  assert.match(readFileSync("src/components/app-ui/ListenButton.tsx", "utf8"), /\(beta\)/);
});
