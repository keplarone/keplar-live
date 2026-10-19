# Decisions

Consequential engineering decisions for the master production directive, newest first.

## 2026-10-19: One citation checker; label statements, never remove citations

- **Context.** Two server citation checkers were written in parallel: #81's (merged first) and the first version of #84. #84's also removed an `[n]` whose page was clearly about something else.
- **Decision.** Keep #81's checker and its UI as the only one, and its rule that nothing is removed, so a paraphrase never loses its source. Port into it only what it lacked: "conflicting" when a cited page gives a different figure for the same unit (quoting the page), and comparing the fuller page text (up to 4,000 characters, server side only) instead of only the 280-character snippet.
- **Trade-off.** A clearly mismatched citation still shows as a chip; it is listed as "not verified" in the Citation check, with the closest line read. Removing it would hide the model's mistake from the person, and on short or paraphrased pages it would wrongly drop real sources.

## 2026-10-18: The citation check is lexical

- **Decision.** Compare words and numbers (no model call). It is deterministic, free and testable. A model judge would cost a call per sentence, could itself hallucinate, and wouldn't fit the Free pool.
- **Trade-off.** It can't detect a page that uses the same words to say something different. The UI says it matches words and numbers, not meaning, as the desktop's Live Research check does.

## 2026-10-18: Milestones land as pure modules called from the existing pipeline

- **Context.** `orchestrator.ts` and `business/agents.ts` are large, and they're on the hot path.
- **Decision.** New behaviour goes in small pure modules with their own tests. The pipeline change is a few lines at a well-defined point.
- **Why.** Reviewable diffs, no regressions in existing tests, and easy to revert.
