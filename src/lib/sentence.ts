/**
 * End a summary with exactly one full stop. Engine summaries are mixed: "2 agree, 0 disagree" has none, while
 * "One model answered. There was nothing to compare." already ends in one, so appending "." in the view printed
 * "compare.." on every single-model answer. Empty stays empty.
 */
export function asSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return /[.!?…:]["'”’)\]]*$/.test(t) ? t : `${t}.`;
}
