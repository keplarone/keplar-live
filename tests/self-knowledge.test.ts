import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAboutKeplar, sectionsFor, selfKnowledgeNote } from "@/lib/orchestration/self-knowledge";
import { FACT_SECTIONS } from "@/lib/content/product-facts";
import { identityPrompt } from "@/lib/identity";

test("questions about Keplar itself are recognized", () => {
  for (const q of [
    "What can you do?", "what features does keplar have", "Can you build me a website?", "could you make slides for my class",
    "Do you have an API?", "is there a desktop app", "How do I use you in Roblox Studio?", "Can Keplar work with Blender?",
    "what are your plans and prices", "does keplar remember my chats", "What is Solar 5.8?", "how do I get started with keplar",
    "can you read PDFs", "Do you support Deep Research?", "What's included in my plan?", "Keplar Studio on mac?",
  ]) assert.ok(isAboutKeplar(q), q);
});

test("ordinary questions are not (they would pay for the fact sheet on every model)", () => {
  for (const q of [
    "Explain photosynthesis", "can you explain how vaccines work", "what are good study plans for finals", "how do I make a website with html",
    "best 3d modeling software for beginners", "what is the capital of australia", "write a poem about autumn", "how do I use git rebase",
    "compare iphone and pixel cameras", "what's the pricing of netflix",
  ]) assert.ok(!isAboutKeplar(q), q);
});

test("the note carries the real fact sheet: every feature with its status, and the sections the question touches in full", () => {
  const note = selfKnowledgeNote("How do I use you in Roblox Studio?");
  for (const s of FACT_SECTIONS) for (const f of s.facts) assert.ok(note.includes(f.name), `index lists ${f.name}`);
  assert.match(note, /Roblox Studio co-builder\. /, "Roblox section in full");
  assert.match(note, /Solar 5\.8 modes \[beta; Desktop app\]/);
  assert.match(note, /Web lookups \(beta; Desktop app 0\.2\.0 or newer\)/, "Live Research is the desktop beta, not an unshipped browser search");
  assert.match(readFileSync("src/lib/orchestration/self-knowledge.ts", "utf8"), /soon: "coming soon, not available yet"/, "a future soon feature is still labeled unavailable");
  assert.match(note, /do not invent features, plans, prices/);
  assert.ok(note.length < 16_000, `bounded (${note.length} chars)`);
  assert.equal(selfKnowledgeNote("Explain photosynthesis"), "");
});

test("sections follow the question", () => {
  assert.deepEqual(sectionsFor("can you build a website and publish it on my domain").map((s) => s.id), ["create", "ship"]);
  assert.deepEqual(sectionsFor("does keplar work with blender").map((s) => s.id), ["blender"]);
  assert.ok(sectionsFor("keplar flashcards for my exam").some((s) => s.id === "learn"));
});

test("the answer route attaches it, and every model's identity knows the product's scope", () => {
  const route = readFileSync("src/app/api/keplar/route.ts", "utf8");
  assert.match(route, /selfKnowledgeNote\(understood\?\.followup\?\.question \?\? askedPrompt\)/);
  assert.match(identityPrompt(), /Study mode .* Create .* Roblox Studio and Blender co-builders/);
});
