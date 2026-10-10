/**
 * Plan limits for Slides and Study (pure). Slides need Plus or Pro; Study is on every plan (Free on free
 * models only, with smaller caps). Hosting caps request bodies at ~4.5 MB, so uploads stop at 4 MB.
 * Everything else here exists so one user (or one bug) cannot spend more than the plan pays for.
 */
import type { ToolPlan } from "./models";

const MB = 1024 * 1024;

export type SlidesLimits = {
  maxSlides: number;
  /** Pasted/attached material, characters. */
  maxMaterialChars: number;
  maxUploadBytes: number;
  maxUploadPages: number;
  /** Generations per UTC day (each regenerate counts as a tenth). */
  perDay: number;
  /** Decks stored. */
  maxDecks: number;
};

/** Plans that can use Slides. */
export const SLIDES_PLANS: readonly ToolPlan[] = ["plus", "pro", "business"];
export const canUseSlides = (plan: string): boolean => SLIDES_PLANS.includes(plan as ToolPlan);

export const SLIDES_LIMITS: Record<Exclude<ToolPlan, "free" | "lite">, SlidesLimits> = {
  plus: { maxSlides: 15, maxMaterialChars: 40_000, maxUploadBytes: 4 * MB, maxUploadPages: 60, perDay: 30, maxDecks: 50 },
  pro: { maxSlides: 30, maxMaterialChars: 120_000, maxUploadBytes: 4 * MB, maxUploadPages: 150, perDay: 80, maxDecks: 200 },
  business: { maxSlides: 30, maxMaterialChars: 120_000, maxUploadBytes: 4 * MB, maxUploadPages: 150, perDay: 120, maxDecks: 500 },
};

export type StudyLimits = {
  maxUploadBytes: number;
  maxPages: number;
  /** Characters kept from a PDF or pasted text. */
  maxChars: number;
  maxSets: number;
  /** Topics in the outline, cards and questions per topic. */
  topics: number;
  cardsPerTopic: number;
  questionsPerTopic: number;
  /** Characters of the guide sent to the model per generation call. */
  inputBudgetChars: number;
  /** Excerpts retrieved per chat question. */
  askExcerpts: number;
  askMaxOutputTokens: number;
  diagnosticQuestions: number;
  mockQuestions: number;
  /** Per UTC day. */
  buildsPerDay: number;
  asksPerDay: number;
  gradesPerDay: number;
  uploadsPerDay: number;
};

export const STUDY_LIMITS: Record<ToolPlan, StudyLimits> = {
  free: { maxUploadBytes: 3 * MB, maxPages: 30, maxChars: 60_000, maxSets: 3, topics: 6, cardsPerTopic: 3, questionsPerTopic: 3, inputBudgetChars: 20_000, askExcerpts: 4, askMaxOutputTokens: 500, diagnosticQuestions: 8, mockQuestions: 15, buildsPerDay: 15, asksPerDay: 30, gradesPerDay: 40, uploadsPerDay: 5 },
  lite: { maxUploadBytes: 4 * MB, maxPages: 60, maxChars: 100_000, maxSets: 8, topics: 8, cardsPerTopic: 3, questionsPerTopic: 3, inputBudgetChars: 40_000, askExcerpts: 5, askMaxOutputTokens: 700, diagnosticQuestions: 10, mockQuestions: 20, buildsPerDay: 30, asksPerDay: 60, gradesPerDay: 80, uploadsPerDay: 10 },
  plus: { maxUploadBytes: 4 * MB, maxPages: 120, maxChars: 200_000, maxSets: 20, topics: 12, cardsPerTopic: 4, questionsPerTopic: 4, inputBudgetChars: 70_000, askExcerpts: 6, askMaxOutputTokens: 900, diagnosticQuestions: 12, mockQuestions: 25, buildsPerDay: 80, asksPerDay: 150, gradesPerDay: 200, uploadsPerDay: 20 },
  pro: { maxUploadBytes: 4 * MB, maxPages: 300, maxChars: 400_000, maxSets: 100, topics: 20, cardsPerTopic: 5, questionsPerTopic: 5, inputBudgetChars: 140_000, askExcerpts: 8, askMaxOutputTokens: 1400, diagnosticQuestions: 15, mockQuestions: 40, buildsPerDay: 200, asksPerDay: 400, gradesPerDay: 500, uploadsPerDay: 50 },
  business: { maxUploadBytes: 4 * MB, maxPages: 300, maxChars: 400_000, maxSets: 200, topics: 20, cardsPerTopic: 5, questionsPerTopic: 5, inputBudgetChars: 140_000, askExcerpts: 8, askMaxOutputTokens: 1400, diagnosticQuestions: 15, mockQuestions: 40, buildsPerDay: 300, asksPerDay: 600, gradesPerDay: 800, uploadsPerDay: 80 },
};

export const studyLimitsFor = (plan: string): StudyLimits => STUDY_LIMITS[(plan in STUDY_LIMITS ? plan : "free") as ToolPlan];
export const slidesLimitsFor = (plan: string): SlidesLimits | null => (canUseSlides(plan) ? SLIDES_LIMITS[plan as Exclude<ToolPlan, "free" | "lite">] : null);
