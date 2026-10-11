import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { modelMark } from "@/components/app-ui/model-marks";

test("model marks: catalog models map to their family logo, others to a monogram", () => {
  const logo = (id: string, name: string) => { const m = modelMark(id, name); return m.kind === "logo" ? m.src : null; };
  assert.equal(logo("live:gemini-3.8-flash", "Gemini 3.8 Flash"), "/models/gemini.svg");
  assert.equal(logo("free:gemma-4-31b", "Gemma 4 31B (free)"), "/models/gemini.svg");
  assert.equal(logo("live:gpt-6-luna", "GPT-6 Luna"), "/models/chatgpt.svg");
  assert.equal(logo("live:gpt-oss-20b", "gpt-oss-20b"), "/models/chatgpt.svg");
  assert.equal(logo("live:deepseek-v4-flash", "DeepSeek V4 Flash"), "/models/deepseek.svg");
  assert.equal(logo("live:mistral-small-2603", "Mistral Small (2603)"), "/models/mistral.svg");
  assert.equal(logo("live:claude-sonnet", "Claude Sonnet"), "/models/claude.svg");
  assert.deepEqual(modelMark("live:qwen3.8-flash", "Qwen3.8 Flash"), { kind: "mono", text: "Qw", family: "Qwen" });
  assert.deepEqual(modelMark("free:nemotron-3-super", "Nemotron 3 Super (free)"), { kind: "mono", text: "Nv", family: "NVIDIA" });
  assert.deepEqual(modelMark("free:dots-3-note", "Dots3-Note Preview (free)"), { kind: "mono", text: "Do", family: "Dots3-Note Preview (free)" });
});
