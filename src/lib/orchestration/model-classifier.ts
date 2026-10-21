/**
 * One cheap model call in front of the regex classifier.
 * Off unless KEPLAR_MODEL_CLASSIFIER=1 (see modelClassifierEnabled). Timeouts, errors,
 * invalid JSON, and a missing model fall back to HeuristicClassifier. Token estimates
 * stay local. The call goes through the same registry as every other model call, so
 * the free-plan guard and the daily spend guard still apply.
 */
import { HeuristicClassifier, outputTokensFor } from "./classifier";
import { isFreeModel } from "./free-guard";
import { FREE_SINGLE_PICK } from "./live-catalog";
import { hasMedia } from "./media";
import type { Capability, Classification, Classifier, Complexity, GenerationParams, KeplarRequest, ModelSpec, TaskKind } from "./types";

export const MODEL_CLASSIFIER_TIMEOUT_MS = 4_000;

const KINDS = new Set<TaskKind>(["general", "factual", "code", "analysis", "strategy", "finance", "research", "writing", "creation", "agent"]);
const COMPLEXITY = new Set<Complexity>(["simple", "moderate", "complex"]);
const CAPS = new Set<Capability>([
  "Reasoning",
  "Research",
  "Coding",
  "Finance",
  "Market Analysis",
  "Writing",
  "Data Analysis",
  "Risk",
  "Regulatory",
  "Verification",
  "Creation",
  "Planning",
  "Vision",
]);

const SYSTEM = `You classify one user question for a router. Reply with JSON only, no markdown:
{"kind":"general|factual|code|analysis|strategy|finance|research|writing|creation|agent","complexity":"simple|moderate|complex","capabilities":["Reasoning"],"errorProne":null}
errorProne is "exact" for counting or arithmetic, "fact" for a precise year, date, or quantity, or null.
Do not include token estimates. Do not name any model or provider.`;

export type ParsedClassification = {
  kind: TaskKind;
  complexity: Complexity;
  /** Absent when the model omitted the field: keep the regex capabilities. */
  capabilities?: Capability[];
  errorProne: "exact" | "fact" | null;
};

export type ClassifierAskResult = { ok: true; text: string } | { ok: false };
export type ClassifierAsk = (input: {
  model: ModelSpec;
  prompt: string;
  classification: Classification;
  params: GenerationParams;
  system?: string;
  signal?: AbortSignal;
}) => Promise<ClassifierAskResult>;

/** The model the classifier call uses. Free plans only get a $0 `:free` model. Null when the roster has none. */
export function classifierModel(roster: readonly ModelSpec[], free: boolean): ModelSpec | null {
  if (free) {
    for (const id of FREE_SINGLE_PICK) {
      const m = roster.find((x) => x.id === id);
      if (m && isFreeModel(m)) return m;
    }
    return roster.find((m) => isFreeModel(m) && m.role !== "judge") ?? null;
  }
  return roster.find((m) => m.routable && m.role === "fast-cheap" && m.verified) ?? roster.find((m) => m.routable && m.role === "fast-cheap") ?? null;
}

/** Parse a model reply. Null when the JSON is missing or not a classification. Token fields are ignored. */
export function parseModelClassification(text: string): ParsedClassification | null {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.kind !== "string" || !KINDS.has(o.kind as TaskKind)) return null;
  if (typeof o.complexity !== "string" || !COMPLEXITY.has(o.complexity as Complexity)) return null;
  let capabilities: Capability[] | undefined;
  if (o.capabilities !== undefined) {
    if (!Array.isArray(o.capabilities) || o.capabilities.length < 1 || o.capabilities.length > 5) return null;
    if (!o.capabilities.every((c) => typeof c === "string" && CAPS.has(c as Capability))) return null;
    capabilities = [...o.capabilities] as Capability[];
  }
  let errorProne: ParsedClassification["errorProne"] = null;
  if (o.errorProne !== undefined && o.errorProne !== null) {
    if (o.errorProne !== "exact" && o.errorProne !== "fact") return null;
    errorProne = o.errorProne;
  }
  return { kind: o.kind as TaskKind, complexity: o.complexity as Complexity, capabilities, errorProne };
}

/**
 * Classification with the model's kind, complexity, capabilities, and errorProne.
 * Token estimates, needsWeb, and the rationale stay on the regex result (needsWeb follows the
 * person's mode, and the rationale is fixed copy). A media question keeps Vision first.
 */
export function applyModelFields(base: Classification, parsed: ParsedClassification, req: KeplarRequest): Classification {
  const modes = req.modes ?? {};
  const next: Classification = {
    ...base,
    kind: parsed.kind,
    complexity: parsed.complexity,
    capabilities: parsed.capabilities ?? base.capabilities,
    needsWeb: Boolean(modes.web || modes.deepResearch),
    estimatedInputTokens: base.estimatedInputTokens,
    estimatedOutputTokens: outputTokensFor(parsed.complexity, Boolean(modes.deepResearch)),
    rationale: base.rationale,
  };
  if (parsed.errorProne) next.errorProne = parsed.errorProne;
  else delete next.errorProne;
  if (hasMedia(req.media)) {
    const caps: Capability[] = ["Vision", ...next.capabilities.filter((c) => c !== "Vision")];
    next.capabilities = caps.slice(0, 5);
  }
  return next;
}

export class ModelClassifier implements Classifier {
  private readonly fallback: Classifier;
  constructor(
    private readonly opts: {
      ask: ClassifierAsk;
      model: ModelSpec | null;
      fallback?: Classifier;
      timeoutMs?: number;
    },
  ) {
    this.fallback = opts.fallback ?? new HeuristicClassifier();
  }

  async classify(req: KeplarRequest): Promise<Classification> {
    const base = await this.fallback.classify(req);
    const model = this.opts.model;
    if (!model) return base;
    const timeoutMs = this.opts.timeoutMs ?? MODEL_CLASSIFIER_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await Promise.race([
        this.opts.ask({
          model,
          prompt: req.prompt.slice(0, 1_500),
          classification: base,
          params: { reasoningOff: true, maxOutputTokens: 180 },
          system: SYSTEM,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          const onAbort = () => reject(new Error("classifier-timeout"));
          if (controller.signal.aborted) onAbort();
          else controller.signal.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
      if (!result.ok) return base;
      const parsed = parseModelClassification(result.text);
      if (!parsed) return base;
      return applyModelFields(base, parsed, req);
    } catch {
      return base;
    } finally {
      clearTimeout(timer);
    }
  }
}
