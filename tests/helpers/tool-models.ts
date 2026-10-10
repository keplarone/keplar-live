/** Fake model deps for Slides/Study: scripted replies, a recorded call log, a fixed reported cost per call. */
import { createRegistry } from "@/lib/orchestration/providers";
import { freeRoster, liveRoster } from "@/lib/orchestration/live-catalog";
import { setToolDeps } from "@/lib/tools/run";
import { toolModelIds, type ToolPlan } from "@/lib/tools/models";
import type { ModelSpec, Provider } from "@/lib/orchestration/types";

export type Fake = { calls: { model: string; prompt: string; system: string }[]; restore: () => void };

export function fakeModels(plan: ToolPlan, reply: (prompt: string, system: string) => string | null, costUsd = 0.01): Fake {
  const calls: Fake["calls"] = [];
  const provider: Provider = {
    name: "openrouter",
    live: true,
    supports: () => true,
    async generate({ model, prompt, system }) {
      calls.push({ model: model.id, prompt, system: system ?? "" });
      const text = reply(prompt, system ?? "");
      if (text === null) return { ok: false, modelId: model.id, reason: "error", message: "Gateway error.", latencyMs: 1 };
      return { ok: true, modelId: model.id, stance: "unclassified", claims: [], text, latencyMs: 1, usage: { inputTokens: 100, outputTokens: 100 }, actualCostUsd: model.id.startsWith("free:") ? 0 : costUsd };
    },
  };
  const roster: ModelSpec[] = [...freeRoster, ...liveRoster];
  const byId = new Map(roster.map((m) => [m.id, m]));
  const models = toolModelIds(plan).map((id) => byId.get(id)).filter((m): m is ModelSpec => Boolean(m));
  setToolDeps({ registry: createRegistry([provider], { freeOnly: plan === "free", maxFallbacks: 0 }), models });
  return { calls, restore: () => setToolDeps(undefined) };
}

export const DECK_JSON = JSON.stringify({
  title: "Solar power basics",
  slides: [
    { layout: "title", title: "Solar power basics", bullets: ["How panels turn light into electricity"], notes: "Welcome.", imagePrompt: "Sunrise over a field of panels" },
    { layout: "content", title: "How a cell works", bullets: ["Photons free electrons", "A junction pushes them one way", "Current flows"], notes: "Keep it simple." },
    { layout: "content", title: "Costs", bullets: ["Panels got cheaper", "Install is most of the price"], notes: "" },
    { layout: "closing", title: "Next steps", bullets: ["Get a quote"], notes: "" },
  ],
});

export const GUIDE_TEXT = `Chapter 1: Cells\n${"The cell is the basic unit of life. Mitochondria produce ATP through respiration. ".repeat(12)}\n\nChapter 2: Genetics\n${"DNA carries genetic information in sequences of four bases. Genes code for proteins. ".repeat(12)}`;

export const STRUCTURE_JSON = JSON.stringify({
  title: "Biology 101",
  summary: "Cells are the unit of life and DNA stores genetic information.",
  topics: [
    { name: "Cells", pageFrom: 1, pageTo: 1, outline: ["Cell basics", "Energy"], concepts: [{ term: "Mitochondria", definition: "Produce ATP through respiration.", page: 1 }] },
    { name: "Genetics", pageFrom: 1, pageTo: 1, outline: ["DNA", "Genes"], concepts: [{ term: "Gene", definition: "Codes for a protein.", page: 1 }] },
  ],
});

export const PRACTICE_JSON = JSON.stringify({
  topics: [
    { name: "Cells", cards: [{ front: "What do mitochondria produce?", back: "ATP", page: 1 }], questions: [
      { type: "mc", q: "What do mitochondria produce?", options: ["ATP", "DNA", "Protein", "Water"], answer: 0, explanation: "They make ATP through respiration.", page: 1 },
      { type: "short", q: "What is the cell?", answer: "The basic unit of life.", explanation: "Stated in chapter 1.", page: 1 },
    ] },
    { name: "Genetics", cards: [{ front: "What does a gene code for?", back: "A protein", page: 1 }], questions: [
      { type: "mc", q: "What carries genetic information?", options: ["Lipids", "DNA", "Sugar", "Salt"], answer: 1, explanation: "DNA carries it in four bases.", page: 1 },
    ] },
  ],
});
