import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyVoiceError, joinDictation, splitResults, voiceLang, VOICE_ERRORS } from "@/lib/voice";

const read = (p: string) => readFileSync(p, "utf8");
const R = (t: string, isFinal: boolean) => Object.assign([{ transcript: t }], { isFinal }) as unknown as { isFinal: boolean; 0: { transcript: string } };

test("voice: joins dictation onto typed text with one space, never duplicating whitespace", () => {
  assert.equal(joinDictation("", " hello  world "), "hello world");
  assert.equal(joinDictation("Write a note", "about cats"), "Write a note about cats");
  assert.equal(joinDictation("line one\n", "line two"), "line one\nline two");
  assert.equal(joinDictation("keep", "   "), "keep");
});

test("voice: splits final and interim results, from an index", () => {
  const res = [R("hello ", true), R("brave ", true), R("new wor", false)];
  assert.deepEqual(splitResults(res), { final: "hello brave ", interim: "new wor" });
  assert.deepEqual(splitResults(res, 1), { final: "brave ", interim: "new wor" });
});

test("voice: error codes map to clear, actionable messages (denied / no mic / no speech / network)", () => {
  assert.equal(classifyVoiceError("not-allowed"), "denied");
  assert.equal(classifyVoiceError("service-not-allowed"), "denied");
  assert.equal(classifyVoiceError("audio-capture"), "no-mic");
  assert.equal(classifyVoiceError("no-speech"), "no-speech");
  assert.equal(classifyVoiceError("network"), "network");
  assert.equal(classifyVoiceError("aborted"), null);
  assert.equal(classifyVoiceError("weird"), "other");
  for (const m of Object.values(VOICE_ERRORS)) assert.match(m, /typing|try again/i);
});

test("voice: language follows the user's locale; garbage falls back to en-US", () => {
  assert.equal(voiceLang({ languages: ["fr-CA", "en"], language: "fr-CA" }), "fr-CA");
  assert.equal(voiceLang({ language: "de" }), "de");
  assert.equal(voiceLang({ language: "<script>" }), "en-US");
  assert.equal(voiceLang(undefined), "en-US");
});

test("voice: composer wiring: mic only when supported, permission only on click, no audio sent, state exposed", () => {
  const c = read("src/components/app-ui/Composer.tsx");
  assert.match(c, /voice\.supported \? \(/);
  assert.match(c, /onClick=\{voice\.toggle\}/);
  assert.match(c, /voice\.abort\(\)/);
  assert.match(c, /keplar:voice/);
  assert.match(c, /role="alert">\{voice\.error\.message\}/);
  const h = read("src/components/app-ui/useVoice.ts");
  // start() (the only place that asks for the mic) runs from toggle(), never from an effect.
  assert.equal((h.match(/r\.start\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(h, /getUserMedia|MediaRecorder|fetch\(/);
  assert.match(read("src/components/legal/content/privacy.ts"), /never receives, records or stores audio/);
});
