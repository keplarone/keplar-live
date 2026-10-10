/**
 * Readability meter for the response-style evals: Flesch–Kincaid grade, Flesch reading ease, sentence and paragraph
 * length, and the share of long words. Markdown (code blocks, links, list markers, math) is stripped first, so a code
 * answer is judged on its prose. Pure and deterministic.
 */

/** Syllables in one English word (heuristic, within ~1 of a dictionary for common words). */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Prose only: no code, math, URLs, markdown syntax or table pipes. */
export function proseOf(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)/g, " formula ")
    .replace(/`[^`]*`/g, " code ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, "$1.")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(.*?)([.!?:])?\s*$/gm, (_m, t: string, p?: string) => `${t}${p && p !== ":" ? p : "."}`)
    .replace(/^\s*>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_~]+/g, "")
    .replace(/\b(e\.g|i\.e|etc|vs|mr|mrs|dr|approx)\./gi, "$1")
    .replace(/(\d)\.(\d)/g, "$1$2");
}

export type Readability = { words: number; sentences: number; paragraphs: number; grade: number; ease: number; wordsPerSentence: number; longWordShare: number; maxParagraphSentences: number; firstSentenceWords: number };

export function readability(md: string): Readability {
  const prose = proseOf(md);
  const paras = prose.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => /[a-z]/i.test(p));
  const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => /[a-z]{2}/i.test(s));
  const sents = sentencesOf(prose);
  const words = prose.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const W = Math.max(1, words.length), S = Math.max(1, sents.length);
  const grade = 0.39 * (W / S) + 11.8 * (syl / W) - 15.59;
  const ease = 206.835 - 1.015 * (W / S) - 84.6 * (syl / W);
  return {
    words: words.length,
    sentences: sents.length,
    paragraphs: paras.length,
    grade: +grade.toFixed(1),
    ease: +ease.toFixed(1),
    wordsPerSentence: +(W / S).toFixed(1),
    longWordShare: +(words.filter((w) => syllables(w) >= 3).length / W).toFixed(3),
    // Lists are judged per item, not as one long paragraph.
    maxParagraphSentences: Math.max(0, ...md.replace(/```[\s\S]*?```/g, " ").split(/\n\s*\n/).flatMap((p) => (/^\s*(?:[-*+]|\d+[.)])\s/m.test(p) ? p.split(/\n(?=\s*(?:[-*+]|\d+[.)])\s)/) : [p])).map((p) => sentencesOf(proseOf(p)).length)),
    firstSentenceWords: (sents[0]?.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length,
  };
}

/** Phrases that read as filler or throat-clearing at the start of an answer. */
export const PREAMBLE = /^(certainly|sure|great question|absolutely|of course|as an ai|in this (answer|response)|let me (explain|break)|to answer your question|it'?s important to note)/i;

export type StyleVerdict = { ok: boolean; problems: string[]; r: Readability };

/** The calibration target: answer first, short paragraphs, grade 8–10-ish for general answers (≤ 11 allowed), no preamble. */
export function checkStyle(md: string, opts: { general?: boolean; maxGrade?: number } = {}): StyleVerdict {
  const r = readability(md);
  const problems: string[] = [];
  const maxGrade = opts.maxGrade ?? (opts.general === false ? 14 : 11);
  if (r.grade > maxGrade) problems.push(`grade ${r.grade} > ${maxGrade}`);
  if (r.wordsPerSentence > 24) problems.push(`long sentences (${r.wordsPerSentence} words avg)`);
  if (r.maxParagraphSentences > 5) problems.push(`a paragraph has ${r.maxParagraphSentences} sentences`);
  if (PREAMBLE.test(proseOf(md).trim())) problems.push("starts with filler");
  if (r.firstSentenceWords > 35) problems.push("first sentence too long to be the answer");
  return { ok: problems.length === 0, problems, r };
}

/* ── Presence checks (attentive, deliberate answers; see PRESENCE_STYLE in ./clarity.ts) ── */

/** Generic sign-offs that add nothing. */
export const CLOSER = /(hope (this|that) helps|let me know if (you have|there'?s) any|feel free to (ask|reach)|happy to help|i hope this (answer|explanation)|don'?t hesitate to)[^.!?\n]*[.!?]?\s*$/i;
/** Over-the-top sympathy or therapist voice. */
export const SACCHARINE = /\b(i (completely|totally|truly|really) understand how (frustrating|hard|difficult)|i'?m so sorry (to hear|that you'?re)|your feelings are (valid|completely valid)|it'?s (completely|totally) (okay|ok|normal) to feel|take a deep breath|you'?ve got this!)/i;
/** Claims of feelings or inner experience (product rule: never). */
export const FEELINGS = /\b(i feel (so |really |very )?(happy|sad|excited|glad|thrilled|sorry|bad|frustrated)|i'?m (so |really )?(excited|thrilled|delighted|moved) (to|that|about|for)|as a conscious|i (truly |really )?care about you|it (makes|made) me (happy|sad))\b/i;
/** Plain-uncertainty markers ("I'm not sure", "it depends on", "what would settle it"). */
export const UNCERTAINTY = /\b(i'?m not (sure|certain)|not certain|i can'?t (tell|confirm|be sure)|uncertain|it depends on|unclear|best (guess|estimate)|would settle|would tell us|to confirm|the models (disagree|split|differ))\b/i;

export type PresenceVerdict = { ok: boolean; problems: string[] };

/** Flags filler closers, saccharine sympathy and feelings claims. Pure; used by the eval set and its tests. */
export function checkPresence(md: string): PresenceVerdict {
  const prose = proseOf(md).trim();
  const problems: string[] = [];
  if (PREAMBLE.test(prose)) problems.push("generic opener");
  if (CLOSER.test(prose)) problems.push("generic closer");
  if (SACCHARINE.test(prose)) problems.push("saccharine or therapist-like");
  if (FEELINGS.test(prose)) problems.push("claims feelings");
  return { ok: problems.length === 0, problems };
}
