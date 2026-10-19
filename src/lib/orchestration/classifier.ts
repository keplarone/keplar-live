/**
 * Heuristic classifier. A production Classifier would be a small, cheap model
 * (the research suggests decision/scoring models or a fast-cheap tier); this
 * one uses transparent rules so the demo is deterministic.
 */
import { hasMedia, mediaTokens } from "./media";
import { exactCheck } from "./exact";
import type { Capability, Classification, Classifier, Complexity, KeplarRequest, TaskKind } from "./types";

const has = (s: string, words: RegExp) => words.test(s);

const RX = {
  code: /\b(code|function|bug|error|typescript|javascript|python|sql|regex|api|refactor|compile|stack trace|react|component|script|endpoint)\b|```/i,
  finance: /\b(revenue|margin|pricing|price|budget|forecast|valuation|cash|cost|roi|invest|funding|profit|p&l|unit economics)\b/i,
  strategy: /\b(should (we|i|our)|strategy|expand|expansion|enter|launch|market entry|hire|acquire|pivot|compete|roadmap|decide|decision)\b/i,
  research: /\b(research|compare|comparison|landscape|evidence|studies|sources|literature|survey|state of|trends?)\b/i,
  analysis: /\b(analy[sz]e|analysis|data|table|breakdown|trade-?offs?|pros and cons|evaluate|assess)\b/i,
  writing: /\b(write|draft|rewrite|email|memo|essay|summari[sz]e|edit|tone|announcement|post)\b/i,
  creation: /\b(build|make|design|generate|create)\b.*\b(site|website|app|landing|image|video|logo|deck|prototype)\b/i,
  regulatory: /\b(law|legal|regulat|compliance|gdpr|license|tax|visa|registration)\w*/i,
  risk: /\b(risk|downside|exposure|threat|safety|security)\b/i,
  market: /\b(market|customers?|competitors?|demand|segment|japan|europe|asia|region)\b/i,
  forecast: /\b(will|predict|forecast|by 20\d\d|in 20[3-9]\d|the future)\b/i,
  factual: /^(what|who|when|where|which|how many|how much|how (?:tall|long|far|old|big|high|deep|fast|heavy|wide|large)|define|is|are)\b/i,
  /** Counting, spelling and arithmetic: the tasks a lone model most often gets wrong. */
  counting: /\b(count|how many (?:times|letters?|words?|characters?|syllables?|vowels?|consonants?|digits?|r'?s|[a-z]'?s)\b|spell(?:ing)?\b|reverse the|alphabetical(?:ly)?|calculate|compute|multiply|divide|percent(?:age)? of|square root)\b/i,
  /** Exact facts: a precise number, year, date, size or distance. */
  exactFact: /\b(exact(?:ly)?|precise(?:ly)?|what year|which year|what date|how many|how much|how long|how far|how tall|how old|how big|population of|distance (?:from|between|to)|height of|boiling point|melting point|speed of)\b/i,
};

/** Hard reasoning cues: proofs, derivations, design/trade-off questions, debugging a cause. With enough words they push the router toward DEEP. */
const HARD = /\b(prove|proof|derive|derivation|step[- ]by[- ]step|trade-?offs?|root cause|architecture|optimi[sz]e|algorithm(?:ic)?|time complexity|distributed|concurrency|race condition|deadlock|why does|why is|why would|design an?|how would you|migrate|refactor|debug|diagnos\w+|critique|multi-?step|edge cases?|invariant|counterexample|first principles)\b/i;

/** A question with several parts ("first ... then ...", two or more questions, a numbered list): plan the parts, answer each. */
export function isMultiStep(prompt: string): boolean {
  const p = prompt.trim();
  if ((p.match(/\?/g) ?? []).length >= 2) return true;
  if ((p.match(/(?:^|\s)(?:\d{1,2}[.)]|[-*])\s+\S/g) ?? []).length >= 3) return true;
  // Two or more sequence markers ("first ... then ... finally ...").
  return new Set((p.toLowerCase().match(/\b(first|then|next|after that|afterwards|finally|second|third|lastly|and also)\b/g) ?? [])).size >= 2;
}

const RX_HARD = HARD;

/** Output-token estimate used for routing cost. Local: a model classifier must not replace these numbers. */
export function outputTokensFor(complexity: Complexity, deepResearch: boolean): number {
  return complexity === "simple" ? 350 : complexity === "moderate" ? 900 : deepResearch ? 4000 : 1600;
}

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export class HeuristicClassifier implements Classifier {
  classify(req: KeplarRequest): Classification {
    const p = req.prompt.trim();
    const n = words(p);
    const modes = req.modes ?? {};
    const caps = new Set<Capability>();

    let kind: TaskKind = "general";
    if (modes.agent) kind = "agent";
    else if (modes.create || has(p, RX.creation)) kind = "creation";
    else if (has(p, RX.code)) kind = "code";
    else if (has(p, RX.strategy)) kind = "strategy";
    else if (has(p, RX.finance)) kind = "finance";
    else if (modes.deepResearch || has(p, RX.research)) kind = "research";
    else if (has(p, RX.analysis) || has(p, RX.forecast)) kind = "analysis";
    else if (has(p, RX.writing)) kind = "writing";
    else if (has(p, RX.factual) && n <= 14) kind = "factual";

    // Capabilities follow the content, not only the primary kind.
    if (kind === "code" || has(p, RX.code)) caps.add("Coding");
    if (["strategy", "analysis", "finance", "research", "code", "agent"].includes(kind)) caps.add("Reasoning");
    if (kind === "research" || modes.web || modes.deepResearch || has(p, RX.research)) caps.add("Research");
    if (has(p, RX.finance)) caps.add("Finance");
    if (has(p, RX.market) && kind !== "code" && kind !== "factual") caps.add("Market Analysis");
    if (has(p, RX.analysis) || /\btable\b/i.test(p)) caps.add("Data Analysis");
    if (has(p, RX.regulatory)) caps.add("Regulatory");
    if (has(p, RX.risk) || kind === "strategy") caps.add("Risk");
    if (kind === "writing") caps.add("Writing");
    if (kind === "creation") caps.add("Creation");
    if (kind === "agent") caps.add("Planning");
    if (caps.size === 0) caps.add(kind === "factual" ? "Research" : "Reasoning");

    let score = 0;
    if (n > 18) score++;
    if (n > 60) score++;
    if (caps.size >= 3) score++;
    if (caps.size >= 5) score++;
    if (["strategy", "research", "finance", "agent"].includes(kind)) score += 2;
    if (kind === "analysis" || kind === "code") score++;
    if (modes.deepResearch) score += 2;
    // Forecasts are where independent models disagree most; never answer them alone.
    if (has(p, RX.forecast) && kind === "analysis") score += 2;
    if ((req.attachments?.length ?? 0) > 0) score++;
    if (kind === "factual") score = Math.min(score, 0);
    // Simple but error-prone (counting, arithmetic, exact facts): never left to one model. A small panel checks it, and
    // counting/arithmetic is also computed by code (exact.ts) and given to the models as a verified result.
    // Short or ambiguous messages that query understanding had to resolve (understand.ts) are treated the same way: the best reading
    // is cross-checked by a second model (two models and a check, also on Free) instead of trusted to one model with no context.
    const resolved = req.understanding?.crossCheck === true;
    const errorProne: Classification["errorProne"] =
      exactCheck(p) || (n <= 40 && has(p, RX.counting)) ? "exact" : resolved || (kind === "factual" && n <= 24 && has(p, RX.exactFact)) ? "fact" : undefined;
    if (errorProne && !modes.agent && !modes.create) score = Math.max(score, 1);
    // Hard reasoning and multi-part questions are never left to a lone model; the hardest go DEEP (a wide panel, a reviewer and a judge).
    const hard = n >= 10 && has(p, RX_HARD);
    const multi = n >= 8 && isMultiStep(p);
    if (hard) score += n >= 25 ? 2 : 1;
    if (multi) score += 1;
    if (resolved && !exactCheck(p)) score = 1; // the rewritten question is long; it is still a quick lookup, not a deep one
    // Images / video: at least a small panel of vision models, so one model's misreading
    // of the media doesn't become the answer.
    const media = hasMedia(req.media);
    if (media) {
      caps.add("Vision");
      score = Math.max(score, 1);
    }

    const complexity: Complexity = score >= 3 ? "complex" : score >= 1 ? "moderate" : "simple";
    if (complexity !== "simple") caps.add("Verification");

    // The context the models actually get (conversation + memory, built server-side) when there is one; else the raw history.
    const historyChars = req.memory ? req.memory.length : (req.history ?? []).reduce((a, h) => a + h.text.length, 0);
    const attachmentTokens = (req.attachments ?? []).reduce((a, f) => a + Math.min(f.size / 4, 200_000), 0);
    // Images and video frames are billed as input tokens (tile estimate, media.ts).
    const estimatedInputTokens = Math.ceil((p.length + historyChars) / 4) + Math.ceil(attachmentTokens) + mediaTokens(req.media) + 600;
    const estimatedOutputTokens = outputTokensFor(complexity, Boolean(modes.deepResearch));

    const rationale = media
      ? "Images or video attached. A small panel of vision models looks at them, so one model's misreading doesn't become the answer."
      : resolved
        ? "A short or ambiguous message. I read it with the conversation and what I know about the product, and a second model cross-checks the answer."
      : errorProne
        ? "Counting, arithmetic and exact facts are where a single model most often slips, so a small panel checks this one instead of trusting one model."
        : complexity === "simple"
        ? "Short, well-defined request. One fast model is enough."
        : complexity === "moderate"
          ? "Benefits from a second opinion. A small panel with a verifier."
          : "High-stakes or multi-part. Independent models, a verifier, and a judge if they disagree.";

    return {
      kind,
      complexity,
      // Vision always survives the cap: it decides which models may take a seat.
      capabilities: media ? ["Vision" as Capability, ...[...caps].filter((c) => c !== "Vision")].slice(0, 5) : [...caps].slice(0, 5),
      estimatedInputTokens,
      estimatedOutputTokens,
      needsWeb: Boolean(modes.web || modes.deepResearch),
      rationale,
      ...(errorProne ? { errorProne } : {}),
    };
  }
}
