/**
 * /models: built from the live rosters in src/lib/orchestration/live-catalog.ts so the page cannot drift from the code.
 * Names, providers, open-weight flag, context size and image input only. No prices, no routing internals.
 */
import { FREE_LIVE_SEEDS, LIVE_SEEDS, type LiveSeed } from "@/lib/orchestration/live-catalog";
import { brand } from "@/lib/site";
import type { EditorialPage } from "./editorial";

const K = brand.name;
const ROLE: Record<string, string> = { primary: "Panel", verifier: "Verifier", judge: "Synthesizer (judge)", "fast-cheap": "Fast or fallback" };
const ctx = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/\.?0+$/, "")}M` : `${Math.round(n / 1000)}k`);
const row = (m: LiveSeed) => [
  m.name.replace(/ \(free\)$/, ""),
  m.provider,
  ROLE[m.role] ?? m.role,
  m.openWeights ? "Open weights" : "Hosted only",
  ctx(m.contextWindow),
  m.input.includes("image") ? "Yes" : "No",
];
const head = ["Model", "Provider", "Used as", "Weights", "Context (tokens)", "Reads images"];

export const modelsPage: EditorialPage = {
  slug: "models",
  path: "/models",
  metaTitle: "Which AI models does Keplar use? Free and paid rosters",
  metaDescription: `The AI models ${K} consults on Free and paid plans, how it picks them for each question, and what that means for privacy and cost, from the product's own roster.`,
  ogTitle: "Which AI models does Keplar use?",
  label: "Models",
  h1: "Which AI models does Keplar use?",
  answer: `${K} uses a roster of AI models from several providers and chooses which ones to consult for each question. The Free plan uses only free open models. Paid plans add premium models. You cannot pick the models yourself today; you can choose how thorough the answer should be. The tables below list the current rosters from the product's own configuration (checked 3 October 2026). They change as models are added or retired.`,
  published: "2026-10-03",
  updated: "2026-10-03",
  readingMinutes: 4,
  freshness: "The rosters are read from Keplar's code at build time. Roster picks were last made on 28 September 2026 and Free-plan models were last re-benchmarked on 3 October 2026; availability of free models changes often.",
  sections: [
    {
      id: "free",
      h2: "Free plan: free open models only",
      p: [
        "Free uses OpenRouter models that cost nothing to call. If one is busy or rate limited, Keplar tries another free model; it never falls back to a paid one. Free answers can be slower when free models are busy, and the hosts of free models may log prompts, so do not paste anything you would not want logged. Free allows up to 50 questions a day (fair use).",
      ],
      table: { caption: "Free-plan roster", head, rows: FREE_LIVE_SEEDS.map((m) => row(m)) },
    },
    {
      id: "paid",
      h2: "Paid plans: premium models added",
      p: [
        "Lite, Plus and Pro add the roster below. Plans differ in credits and limits, not in which question gets which model; see [pricing](/pricing) for the current plans and what each includes.",
      ],
      table: { caption: "Paid-plan roster", head, rows: LIVE_SEEDS.map((m) => row(m)) },
    },
    {
      id: "choice",
      h2: "How Keplar picks models for a question",
      bullets: [
        "A simple question goes to one model. A harder one goes to a panel of models from different families, plus a verifier.",
        "The router weighs quality, reliability, speed and cost, and tries to include models from different providers so the panel does not share one set of habits.",
        "Questions with images or video only go to models that can read them.",
        "A model that times out or refuses is not counted as disagreeing; the answer shows how many responded.",
      ],
      after: ["How the comparison and synthesis work is on [How Keplar works](/how-it-works)."],
    },
    {
      id: "limits",
      h2: "What this page does not tell you",
      bullets: [
        "It does not rank the models or claim one is better. Keplar has not published its own benchmark of them.",
        "It lists the roster, not what each question used. Open Models consulted under any answer to see that.",
        "Premium providers such as Anthropic's Claude models are not listed because they are not in the current live roster.",
      ],
    },
  ],
  keplar: {
    h2: "See it on a real question",
    p: [`Ask one question and open Models consulted under the answer. It lists which models ran, whether they responded, and where they differed. ${K} is free to try with no signup.`],
  },
  examples: ["Compare renting and buying a home", "Explain the CAP theorem with an example", "What is a good study plan for a statistics exam?"],
  faq: [
    { q: "Can I choose which model answers?", a: "Not today. Keplar picks the models a question needs. You can choose how thorough it should be: Fastest, Balanced or Most thorough." },
    { q: "Does the Free plan ever use a paid model?", a: "No. Free uses only free models, and falls back to other free models if one is busy." },
    { q: "Does Keplar train models on my questions?", a: "Keplar does not use your prompts, files, memory or chats to train AI models. Questions are sent to model providers to be answered. On Free, the hosts of free models may log prompts, and some may use them to improve their models, so Keplar does not send your saved memory or attached documents to them. Paid-plan requests go only to endpoints that state they do not train on prompts. The privacy page has the details." },
    { q: "Why isn't a particular model listed?", a: "The roster is limited to models available through Keplar's providers at the time and within its cost limits. It is updated as models change." },
  ],
  related: ["/multi-model-ai", "/how-it-works", "/pricing", "/privacy"],
};
