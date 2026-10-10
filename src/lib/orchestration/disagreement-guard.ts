/**
 * Never invent disagreement. The synthesis prompt only asks for a "Where the models disagree" section when the models
 * took more than one position, but a model sometimes writes it anyway (live runs 2026-10-03). This is the code-level
 * guarantee: the section is kept only when the comparison actually found a split; otherwise it is removed from the text.
 * Other sections (for example a counterargument the user asked for, with its own label) are never touched.
 */

/** A line that opens the disagreement section: a heading or a bold-only title such as "**Where the models disagree**". */
const TITLE =
  /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:where (?:the )?(?:models?|intelligences|panel(?:ists)?) (?:disagree|differ|diverge|split|part ways)|(?:model|panel) (?:disagreement|dissent)s?)\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;
/** The same title followed by text on the same line ("**Where the models disagree:** …"): a one-paragraph section. */
const INLINE =
  /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)\s*(?:where (?:the )?(?:models?|intelligences|panel(?:ists)?) (?:disagree|differ|diverge|split|part ways)|(?:model|panel) (?:disagreement|dissent)s?)\s*:?\s*(?:\*\*|__)\s*:?\s*\S/i;
/** Another section starts here: a markdown heading, or a bold-only title line, or a rule. */
const NEXT_SECTION = /^\s{0,3}(?:#{1,6}\s+\S|(?:\*\*|__)[^*_\n]{2,80}(?:\*\*|__)\s*:?\s*$|-{3,}\s*$|\*{3,}\s*$)/;

/** Remove every "Where the models disagree" section from `markdown`. Returns the text unchanged when there is none. */
export function stripDisagreementSection(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  let removed = false;
  while (i < lines.length) {
    const line = lines[i];
    if (TITLE.test(line)) {
      removed = true;
      i++;
      while (i < lines.length && !NEXT_SECTION.test(lines[i])) i++;
      continue;
    }
    if (INLINE.test(line)) {
      removed = true;
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !NEXT_SECTION.test(lines[i])) i++;
      continue;
    }
    out.push(line);
    i++;
  }
  if (!removed) return markdown;
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Keep the section only when the models really took more than one position; strip it otherwise. */
export function guardDisagreement(markdown: string, found: { positions: number }): string {
  return found.positions > 1 ? markdown : stripDisagreementSection(markdown);
}
