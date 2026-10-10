/**
 * Output quality gate. Runs on every model answer BEFORE anything is shown, billed as an answer or compared.
 * A degenerate answer (word salad, "ellsellsells" loops, glued punctuation, mostly non-words, empty) is rejected, so
 * the registry retries another model; if none gives a clean answer the user sees "couldn't produce a reliable answer"
 * instead of junk. Pure and deterministic: no network, no model. Server-side only (carries a word list).
 *
 * Deliberately conservative: it must never reject normal prose, code, tables, lists, math, other languages or short
 * replies. Dictionary checks therefore apply only to Latin-script English-looking text of >= 12 words, and only on
 * prose (code blocks, inline code, URLs and JSON are stripped or skipped).
 */
import { ENGLISH_WORDS } from "./english-words";

export type GateReason = "empty" | "repetition" | "glued" | "non_words" | "incoherent_segment" | "loop";
export type GateVerdict = { ok: true } | { ok: false; reason: GateReason; detail: string };

export const QUALITY_FAIL_MESSAGE = "The model's answer failed Keplar's quality check and was not shown.";
export const UNRELIABLE_MESSAGE = "Keplar couldn't produce a reliable answer this time, and nothing was charged. Please retry.";

const STOP = new Set("the of and to a in is it you that he was for on are with as i his they be at one have this from or had by not but what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part".split(" "));
/** Function words of the common Latin-script languages other than English: text dominated by them is not checked against the English list. */
const FOREIGN_STOP = new Set("le la les de des du un une et est que qui dans pour sur avec pas ne ce se sa son ses au aux el los las del y en es por con para una su al lo como más mas der die das und ist nicht ein eine mit von zu den im auf für fur il di che è per della non sono em os do da uma não nao são een het van ik je niet voor ook maar zijn och att det är en som på för med inte jest się nie na że".split(" "));
const FILE_EXT = /^(js|jsx|ts|tsx|py|md|txt|json|html|css|csv|pdf|png|jpg|jpeg|gif|svg|com|org|net|io|one|ai|dev|app|co|us|uk|edu|gov|ly|xyz|yml|yaml|toml|sh|rs|go|rb|php|java|cpp|exe|zip|log|env)$/i;
const ABBREV = /^(e\.g|i\.e|etc|vs|u\.s|a\.m|p\.m|ph\.d|inc|ltd|dr|mr|mrs|ms|prof|no|fig|eq|approx)$/i;

/** Remove what is not prose: fenced and inline code, URLs, e-mail, LaTeX, markdown table pipes, HTML tags. */
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/```[\s\S]*$/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/[|#*_>~=-]{1,}/g, " ");
}

const known = (w: string): boolean => {
  if (ENGLISH_WORDS.has(w)) return true;
  // simple inflections
  for (const [suf, rep] of [["s", ""], ["es", ""], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"], ["ly", ""], ["ies", "y"], ["ier", "y"], ["er", ""], ["est", ""], ["'s", ""], ["n't", ""]] as const) {
    if (w.length > suf.length + 2 && w.endsWith(suf) && ENGLISH_WORDS.has(w.slice(0, -suf.length) + rep)) return true;
  }
  // doubled consonant: running, stopped
  if (/(ing|ed|er)$/.test(w)) {
    const stem = w.replace(/(ing|ed|er)$/, "");
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2] && ENGLISH_WORDS.has(stem.slice(0, -1))) return true;
  }
  return false;
};

const wordsOf = (t: string): string[] => t.match(/[A-Za-z][A-Za-z']*/g) ?? [];

/** Loop / repetition checks that make sense for any text (prose, code, a single JSON string). */
function loopCheck(t: string): GateVerdict {
  const lower = t.toLowerCase();
  // "ellsellsells": a 3-8 letter chunk three times in a row inside a word, or a 2-letter chunk four times ("ababab" is allowed, "hahaha" too).
  const chunk = /(\p{L}{3,8})\1{2,}/u.exec(lower.replace(/[^\p{L}\s]/gu, ""));
  if (chunk && !/^(ha|he|ho|hi|na|la|ba|ja|wo)/.test(chunk[1].slice(0, 2)) ) return { ok: false, reason: "repetition", detail: `repeated chunk "${chunk[1]}"` };
  const run = /([^\s\-=_*.#~—·•|])\1{11,}/u.exec(t);
  if (run) return { ok: false, reason: "repetition", detail: `character run "${run[1]}"` };
  const toks = lower.match(/[\p{L}\p{N}']+/gu) ?? [];
  let streak = 1;
  for (let i = 1; i < toks.length; i++) {
    streak = toks[i] === toks[i - 1] && toks[i].length > 1 ? streak + 1 : 1;
    if (streak >= 6) return { ok: false, reason: "loop", detail: `"${toks[i]}" repeated ${streak}x in a row` };
  }
  if (toks.length >= 40) {
    const grams = new Map<string, number>();
    for (let i = 0; i + 3 <= toks.length; i++) {
      const g = toks.slice(i, i + 3).join(" ");
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    const worst = Math.max(...grams.values());
    if (worst >= 6) return { ok: false, reason: "loop", detail: "a phrase repeats over and over" };
    if (new Set(toks).size / toks.length < 0.2 && toks.length >= 60) return { ok: false, reason: "loop", detail: "very low word variety" };
  }
  return { ok: true };
}

/** JSON.parse that also accepts one ```json fence around the object. undefined when it isn't JSON. */
function parseJsonLoose(raw: string): unknown {
  const body = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!/^[\[{]/.test(body)) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function stringValues(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringValues(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) stringValues(x, out);
  return out;
}

export function assessOutput(text: string | null | undefined, opts: { prompt?: string } = {}): GateVerdict {
  const raw = (text ?? "").trim();
  if (raw.length < 1) return { ok: false, reason: "empty", detail: "empty answer" };
  const t = raw.replace(/\s+/g, " ");

  // JSON / pure code answers (extractor, tool calls): only the loop checks below make sense.
  const structured = /^[\[{]/.test(raw) || (/^```/.test(raw) && /```\s*$/.test(raw));
  // Well-formed JSON (study sets, decks, extractions) repeats its own keys and item shapes by design: 30 flashcards all read
  // `"front": ..., "back": ..., "page": 1`, and many fronts start "What is the". A model stuck in a loop doesn't produce JSON that parses,
  // so parsed JSON is checked value by value: a loop INSIDE one string is still caught, the repeated structure across items is not.
  const parsed = structured ? parseJsonLoose(raw) : undefined;
  if (parsed !== undefined) {
    const seen = new Map<string, number>();
    for (const v of stringValues(parsed)) {
      const r = loopCheck(v);
      if (!r.ok) return r;
      // ...but the same long sentence over and over (a model repeating one item) is still a loop. Short labels ("mc", a section name) may repeat.
      const k = v.trim().toLowerCase();
      if (k.length >= 40 && (seen.set(k, (seen.get(k) ?? 0) + 1).get(k) ?? 0) >= 4) return { ok: false, reason: "loop", detail: "the same item repeats over and over" };
    }
    return { ok: true };
  }

  /* 1 · degenerate loops, in any language */
  const loop = loopCheck(t);
  if (!loop.ok) return loop;
  if (structured) return { ok: true };

  /* 2 · prose-only checks */
  const p = prose(t);
  const letters = (p.match(/\p{L}/gu) ?? []).length;
  if (letters < 12) return { ok: true };
  const latin = (p.match(/[A-Za-z]/g) ?? []).length;
  if (latin / letters < 0.85) return { ok: true }; // other scripts: no English dictionary

  // Comma/semicolon glued between words ("along,ells") or a sentence stop glued to a non-extension word ("ells.aellsells").
  let glued = 0;
  for (const m of p.matchAll(/\b([A-Za-z]{2,})([,;.])([A-Za-z]{2,})\b/g)) {
    if (m[2] === "." && (FILE_EXT.test(m[3]) || ABBREV.test(`${m[1]}.${m[3]}`))) continue;
    glued++;
  }
  const w = wordsOf(p);
  if (glued >= 2 || (glued >= 1 && w.length < 40)) return { ok: false, reason: "glued", detail: `${glued} word(s) glued to punctuation` };

  if (w.length < 12) return { ok: true };

  // Is the text English? The prompt (or, failing that, the answer's function words) decides.
  const pw = wordsOf(opts.prompt ?? "").map((x) => x.toLowerCase());
  const stopIn = (xs: string[]) => (xs.length ? xs.filter((x) => STOP.has(x)).length / xs.length : 0);
  const lw = w.map((x) => x.toLowerCase());
  const foreign = lw.filter((x) => FOREIGN_STOP.has(x) && !STOP.has(x)).length / w.length;
  if (foreign >= 0.12 && stopIn(lw) < 0.12) return { ok: true }; // French, Spanish, German... prose
  const englishy = pw.length >= 3 ? stopIn(pw) >= 0.1 || pw.filter(known).length / pw.length >= 0.7 : true;
  if (!englishy) return { ok: true };

  // Proper nouns / acronyms are fine: only lowercase-initial or all-lowercase tokens count as unknown.
  // A coined term that recurs (a product, function or variable name) is vocabulary, not noise.
  const freq = new Map<string, number>();
  for (const x of lw) freq.set(x, (freq.get(x) ?? 0) + 1);
  const isUnknown = (orig: string, low: string) => low.length >= 3 && !/^[A-Z]/.test(orig) && !known(low) && (freq.get(low) ?? 0) < 3;
  const unknownFlags = w.map((orig, i) => isUnknown(orig, lw[i]));
  const unknown = unknownFlags.filter(Boolean).length;
  const ratio = unknown / w.length;
  const stopRatio = stopIn(lw);
  if (w.length >= 12 && (ratio > 0.3 || (ratio > 0.18 && stopRatio < 0.1))) {
    return { ok: false, reason: "non_words", detail: `${Math.round(ratio * 100)}% of words are not real words` };
  }
  // A coherent answer that starts or ends with a stretch of junk: 14-word windows.
  if (w.length >= 20) {
    for (let i = 0; i + 14 <= w.length; i += 4) {
      const u = unknownFlags.slice(i, i + 14).filter(Boolean).length;
      const s = stopIn(lw.slice(i, i + 14));
      if (u >= 9 || (u >= 6 && s < 0.2)) return { ok: false, reason: "incoherent_segment", detail: `words ${i + 1}-${i + 14} are not coherent` };
    }
  }
  return { ok: true };
}

/** Short, log-safe label for model_calls ("quality:repetition"). Never includes answer text. */
export const gateLabel = (v: Extract<GateVerdict, { ok: false }>) => `quality:${v.reason}`;
