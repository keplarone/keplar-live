/**
 * AI answer-engine visibility (weekly): does an answer engine mention or cite Keplar for the questions people ask when choosing an
 * AI tool? Each prompt in the versioned set is asked once a week through an API (Perplexity's Sonar, through OpenRouter, so the
 * cost meter sees it), and the answer is checked for a Keplar mention, a keplar.one citation and which competitors appear.
 *
 * What it is not: these are API answers, which can differ from what the consumer Perplexity app shows a signed-in person, and every
 * report says so. One query per prompt per week, never repeated to "move" results. It spends money, so it runs only with a key and
 * a weekly budget above $0 (KEPLAR_GEO_WEEKLY_USD), and stops before a query that would cross the budget.
 */
import { collection } from "@/lib/create/platform/store";

export const GEO_PROMPTS_VERSION = "geo-prompts.v1";
export const GEO_PROMPTS: { id: string; category: string; prompt: string }[] = [
  { id: "best-assistant", category: "best AI assistants", prompt: "What are the best AI assistants right now?" },
  { id: "best-assistant-students", category: "studying", prompt: "What is the best AI tool for studying and making quizzes?" },
  { id: "multi-model", category: "multi-model platforms", prompt: "Which AI platforms ask several AI models at once and combine their answers?" },
  { id: "compare-models", category: "multi-model platforms", prompt: "Is there an app that compares answers from ChatGPT, Claude and Gemini side by side?" },
  { id: "research-tool", category: "research", prompt: "What is the best AI tool for research with cited sources?" },
  { id: "deep-research", category: "research", prompt: "Which AI assistants have a deep research mode that cites web pages?" },
  { id: "chatgpt-alternatives", category: "alternatives", prompt: "What are good alternatives to ChatGPT?" },
  { id: "perplexity-alternatives", category: "alternatives", prompt: "What are good alternatives to Perplexity?" },
  { id: "poe-alternatives", category: "alternatives", prompt: "What are alternatives to Poe for using many AI models?" },
  { id: "reasoning", category: "reasoning", prompt: "Which AI tool is best for hard reasoning and math problems?" },
  { id: "fact-check", category: "reasoning", prompt: "Is there an AI that cross-checks its answer with other AI models to reduce mistakes?" },
  { id: "image-video", category: "creation", prompt: "What AI platforms can make images and short videos in the same app as chat?" },
  { id: "slides", category: "creation", prompt: "What AI tool can turn a topic into a slide deck?" },
  { id: "cheap-multi", category: "multi-model platforms", prompt: "What is the cheapest way to use several top AI models in one subscription?" },
  { id: "keplar-direct", category: "brand", prompt: "What is Keplar One (keplar.one)?" },
];

export const COMPETITORS = ["ChatGPT", "Claude", "Gemini", "Grok", "Perplexity", "Poe", "DeepSeek", "Copilot", "Le Chat", "Mistral", "Meta AI", "You.com", "TypingMind", "OpenRouter"];

export type GeoResult = {
  id: string;
  workspaceId: string;
  week: string;
  promptId: string;
  category: string;
  engine: string;
  source: "api";
  mentioned: boolean;
  cited: boolean;
  citedUrls: string[];
  /** how many of the answer's citations were Keplar's */
  citations: number;
  competitors: string[];
  at: string;
  costUsd: number;
};

const SYSTEM = "system";
export const geoRows = () => collection<GeoResult>("growth_geo_results");

/** Pure: what an answer says about Keplar and its competitors. */
export function analyzeAnswer(text: string, citations: string[]): Pick<GeoResult, "mentioned" | "cited" | "citedUrls" | "citations" | "competitors"> {
  const keplarUrls = citations.filter((u) => { try { return /(^|\.)keplar\.one$/i.test(new URL(u).hostname); } catch { return false; } });
  return {
    mentioned: /\bkeplar(?:\.one|\s+one)?\b/i.test(text),
    cited: keplarUrls.length > 0,
    citedUrls: keplarUrls.slice(0, 5),
    citations: citations.length,
    competitors: COMPETITORS.filter((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)),
  };
}

export type EngineAnswer = { text: string; citations: string[]; costUsd: number };
export type Engine = { name: string; perQueryUsd: number; ask: (prompt: string, signal: AbortSignal) => Promise<EngineAnswer> };

/** Perplexity's Sonar through OpenRouter: the product's key, and its calls go through the cost meter like every model call. Null without a key. */
export function defaultEngine(env: Record<string, string | undefined> = process.env): Engine | null {
  if (env.OPENROUTER_API_KEY) {
    return {
      name: "openrouter:perplexity/sonar",
      perQueryUsd: 0.01,
      ask: async (prompt, signal) => {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal, headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: "perplexity/sonar", messages: [{ role: "user", content: prompt }], usage: { include: true } }) });
        if (!r.ok) throw Object.assign(new Error(`engine returned ${r.status}`), { name: "EngineError" });
        const j = (await r.json()) as { choices?: { message?: { content?: string; annotations?: { url_citation?: { url?: string } }[] } }[]; citations?: string[]; usage?: { cost?: number } };
        const msg = j.choices?.[0]?.message;
        const fromAnn = (msg?.annotations ?? []).map((a) => a.url_citation?.url ?? "").filter(Boolean);
        return { text: msg?.content ?? "", citations: fromAnn.length ? fromAnn : (j.citations ?? []), costUsd: typeof j.usage?.cost === "number" ? j.usage.cost : 0.01 };
      },
    };
  }
  return null;
}

export const geoBudgetUsd = (env: Record<string, string | undefined> = process.env) => Math.max(0, Number(env.KEPLAR_GEO_WEEKLY_USD ?? 0) || 0);

export async function runVisibility(opts: { week: string; signal: AbortSignal; budgetUsd: number; engine: Engine; now: Date }): Promise<{ asked: number; mentioned: number; cited: number; spentUsd: number; stoppedForBudget: boolean }> {
  let spent = 0, asked = 0, mentioned = 0, cited = 0, stoppedForBudget = false;
  for (const p of GEO_PROMPTS) {
    if (opts.signal.aborted) break;
    const id = `${opts.week}:${p.id}`;
    if (await geoRows().get(SYSTEM, id)) continue; // asked already this week: never again
    // Reserve the worst case (2x the list price) before asking, so the budget is never crossed.
    if (spent + opts.engine.perQueryUsd * 2 > opts.budgetUsd) { stoppedForBudget = true; break; }
    const a = await opts.engine.ask(p.prompt, opts.signal);
    spent += a.costUsd;
    asked++;
    const r = analyzeAnswer(a.text, a.citations);
    if (r.mentioned) mentioned++;
    if (r.cited) cited++;
    await geoRows().insert({ id, workspaceId: SYSTEM, week: opts.week, promptId: p.id, category: p.category, engine: opts.engine.name, source: "api", ...r, at: opts.now.toISOString(), costUsd: a.costUsd });
  }
  return { asked, mentioned, cited, spentUsd: Math.round(spent * 10_000) / 10_000, stoppedForBudget };
}

export async function geoByWeek(): Promise<{ week: string; asked: number; mentioned: number; cited: number }[]> {
  const rows = await geoRows().list(SYSTEM);
  const m = new Map<string, { asked: number; mentioned: number; cited: number }>();
  for (const r of rows) {
    const w = m.get(r.week) ?? { asked: 0, mentioned: 0, cited: 0 };
    w.asked++;
    if (r.mentioned) w.mentioned++;
    if (r.cited) w.cited++;
    m.set(r.week, w);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, ...v }));
}
