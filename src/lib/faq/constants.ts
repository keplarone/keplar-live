/** Client-safe constants for the "Most frequently asked" list (no imports). */

/** Always the first entry. Sending it gets the fixed answer (identity-guards.ts) in the normal answer card. */
export const PINNED_QUESTION = "Are you conscious?";

/** Generic starters, shown only until enough real questions have been counted. They carry no count. */
export const STARTERS: readonly string[] = [
  "What can you do that a single AI can't?",
  "Explain how a transformer works in two sentences.",
  "Help me plan my week.",
  "What is the capital of Australia?",
];
