/**
 * Plain sentences for Deep Research when no page was read.
 * No network and no server-only imports: the composer can show these before a request.
 */

export const OFF_NOT_ENABLED = "Live web search isn't switched on for Deep Research yet, so this report was researched by the models only. No pages were read.";
export const OFF_SENSITIVE = "Web search is skipped on the Sensitive data tier (it can't keep zero data retention), so this report was researched by the models only.";
export const OFF_BUDGET = "The web research was skipped to stay inside your allowance, so this report was researched by the models only.";
export const OFF_FAILED = "The web searches didn't return any pages, so this report was researched by the models only.";

/**
 * Note for the Deep Research chip before the question is sent.
 * `webOn` is true when server retrieval is switched on, or when the desktop app will read pages itself.
 * Null means the chip should not claim that search is off.
 */
export function deepResearchChipNote(webOn: boolean): string | null {
  return webOn ? null : OFF_NOT_ENABLED;
}
