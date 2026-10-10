/** UI copy for the Keplar app. */
import type { StageId } from "@/lib/orchestration/types";

export const stageCopy: Record<StageId, { active: string; done: string }> = {
  understand: { active: "Understanding request…", done: "Understood request" },
  select: { active: "Selecting intelligence…", done: "Selected intelligence" },
  debate: { active: "Models are debating…", done: "Debate finished" },
  compare: { active: "Comparing…", done: "Compared responses" },
  disagree: { active: "Disagreement detected", done: "Disagreement investigated" },
  verify: { active: "Weighing evidence…", done: "Weighed evidence and reasoning" },
  synthesize: { active: "Synthesizing…", done: "Synthesized one answer" },
};
