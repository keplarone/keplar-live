# Decisions

Consequential engineering decisions for the master production directive, newest first.

## 2026-10-18: Server citation check is lexical, and removes only clear mismatches

- **Context.** Deep Research kept every `[n]` that pointed at a page it had read (`linkCitations`), even when the page said nothing about the sentence.
- **Decision.** Compare each cited sentence with the text the search returned for that page, using words and numbers only (no model call). Remove a marker only when the page has at least 120 characters of text, shares no number with the sentence and has under 12% of its content words. Every other outcome keeps the marker and is labelled (supported, partly supported, conflicting, not verified).
- **Why.** It is deterministic, free and testable. A model judge would cost a call per sentence, could itself hallucinate, and wouldn't fit the Free pool. Removing only clear mismatches means a paraphrase is never stripped of its source.
- **Trade-off.** It can't detect a page that uses the same words to say something different. The UI says it matches words and numbers, not meaning, and the desktop's Live Research check makes the same disclosure.
- **Evidence handling.** Up to 4,000 characters of each page's returned text are kept in memory for the check and never streamed or saved. The browser still sees only the 280-character snippet.

## 2026-10-18: Milestones land as pure modules called from the existing pipeline

- **Context.** `orchestrator.ts` and `business/agents.ts` are large, and they're on the hot path.
- **Decision.** New behaviour goes in small pure modules with their own tests. The pipeline change is a few lines at a well-defined point.
- **Why.** Reviewable diffs, no regressions in existing tests, and easy to revert.
