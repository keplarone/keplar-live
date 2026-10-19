import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { modelMark } from "@/components/app-ui/model-marks";
import { existsSync, readFileSync } from "node:fs";

test("model marks: catalog models map to their family logo, others to a monogram", () => {
  const logo = (id: string, name: string) => { const m = modelMark(id, name); return m.kind === "logo" ? m.src : null; };
  assert.equal(logo("live:gemini-3.8-flash", "Gemini 3.8 Flash"), "/models/gemini.svg");
  assert.equal(logo("free:gemma-4-31b", "Gemma 4 31B (free)"), "/models/gemini.svg");
  assert.equal(logo("live:gpt-6-luna", "GPT-6 Luna"), "/models/chatgpt.svg");
  assert.equal(logo("live:gpt-oss-20b", "gpt-oss-20b"), "/models/chatgpt.svg");
  assert.equal(logo("live:deepseek-v4-flash", "DeepSeek V4 Flash"), "/models/deepseek.svg");
  assert.equal(logo("live:mistral-small-2603", "Mistral Small (2603)"), "/models/mistral.svg");
  assert.equal(logo("live:claude-sonnet", "Claude Sonnet"), "/models/claude.svg");
  assert.equal(logo("live:qwen3.8-flash", "Qwen3.8 Flash"), "/models/qwen.svg");
  assert.equal(logo("free:nemotron-3-super", "Nemotron 3 Super (free)"), "/models/nvidia.svg");
  assert.equal(logo("free:llama-4-maverick", "Llama 4 Maverick (free)"), "/models/meta.svg");
  assert.equal(logo("live:kimi-k3", "Kimi K3"), "/models/kimi.svg");
  assert.equal(logo("live:glm-5", "GLM-5"), "/models/zai.svg");
  assert.equal(logo("live:phi-5", "Phi-5"), "/models/microsoft.svg");
  for (const f of ["qwen", "meta", "nvidia", "kimi", "zai", "microsoft"]) assert.ok(existsSync(`public/models/${f}.svg`) && !/<script|href=|on[a-z]+=/i.test(readFileSync(`public/models/${f}.svg`, "utf8")), `${f}.svg is a plain logo`);
  assert.deepEqual(modelMark("free:dots-3-note", "Dots3-Note Preview (free)"), { kind: "mono", text: "Do", family: "Dots3-Note Preview" });
});

test("answer brands: the parent brand of each model that answered, once each, in answer order; failures left out", async () => {
  const { answerBrands, brandList } = await import("@/components/app-ui/model-marks");
  const fam = (ms: Parameters<typeof answerBrands>[0]) => answerBrands(ms).map((m) => m.family);
  assert.deepEqual(fam([{ id: "live:gpt-6-astra", name: "GPT Astra" }]), ["ChatGPT"]);
  assert.deepEqual(fam([
    { id: "live:gpt-6-luna", name: "GPT-6 Luna", status: "responded" },
    { id: "live:claude-sonnet", name: "Claude Sonnet", status: "responded" },
    { id: "live:gpt-oss-20b", name: "gpt-oss-20b", status: "responded" },
    { id: "live:gemini-3.8-flash", name: "Gemini 3.8 Flash", status: "failed" },
    { id: "free:llama-4", name: "Llama 4 Maverick (free)", status: "responded" },
    { id: "live:grok-5", name: "Grok 5", status: "not-needed" },
  ]), ["ChatGPT", "Claude", "Meta"]);
  assert.deepEqual(answerBrands([]), []);
  const marks = answerBrands([{ id: "live:gpt-6-luna", name: "GPT-6 Luna" }, { id: "x:grok-5", name: "Grok 5" }, { id: "live:claude", name: "Claude" }]);
  assert.equal(brandList(marks), "ChatGPT, Grok and Claude");
  assert.equal(brandList(marks.slice(0, 2)), "ChatGPT and Grok");
  assert.ok(marks[0].kind === "logo" && marks[0].tint, "one-colour logos are tinted so they read on the dark canvas");
});

test("answer brands: every answer header credits its models, notices keep the Keplar mark, the swap is reduced-motion safe", async () => {
  const { readFileSync } = await import("node:fs");
  const turn = readFileSync("src/components/app-ui/KeplarTurn.tsx", "utf8");
  assert.ok(!/<KeplarSymbol/.test(turn), "headers render through AnswerBrand");
  assert.match(turn, /<AnswerBrand id=\{`\$\{uid\}-title`\} models=\{a\.models\} \/>/);
  assert.equal((turn.match(/<AnswerTitle models=\{m\.answer\?\.models \?\? m\.models\} \/>/g) ?? []).length, 2, "typing answers credit the models so far");
  assert.match(turn, /function NoticeCard[\s\S]*?<AnswerTitle \/>/, "errors and stops credit no model");
  const comp = readFileSync("src/components/app-ui/AnswerBrand.tsx", "utf8");
  assert.match(comp, /prefers-reduced-motion: reduce/);
  assert.match(comp, /visually-hidden">\{`\$\{brand\.answer\} from \$\{brandList\(marks\)\}`\}/, "one stable accessible name, still 'Keplar Answer'");
  assert.match(readFileSync("src/components/app-ui/AnswerBrand.module.css", "utf8"), /prefers-reduced-motion: reduce\) \{\s*\.item\[data-swap\] \{ animation: none; \}/);
});
