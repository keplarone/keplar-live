/**
 * Plain sentences for a finished Deep Research report when no page was read.
 * No network and no server-only imports.
 *
 * OFF_* is past tense on purpose: it describes a report that already ran.
 * The composer, before anything is sent, uses deepResearchChipNote instead.
 */

export const OFF_NOT_ENABLED = "Live web search isn't switched on for Deep Research yet, so this report was researched by the models only. No pages were read.";
export const OFF_SENSITIVE = "Web search is skipped on the Sensitive data tier (it can't keep zero data retention), so this report was researched by the models only.";
export const OFF_BUDGET = "The web research was skipped to stay inside your allowance, so this report was researched by the models only.";
export const OFF_FAILED = "The web searches didn't return any pages, so this report was researched by the models only.";

/** Forward-looking composer hint. Not a report, so it does not say pages were read. */
export const DEEP_RESEARCH_PRE_SEND = "Deep Research uses the models only for now; live web search is coming.";

/**
 * Hint for the composer before the question is sent.
 * `webOn` is true when server retrieval is switched on, or when the desktop app will read pages itself.
 * Null means the composer should not say that search is off.
 * Render this in one place. A tooltip or a second hidden copy makes screen readers announce it twice.
 */
export function deepResearchChipNote(webOn: boolean): string | null {
  return webOn ? null : DEEP_RESEARCH_PRE_SEND;
}
