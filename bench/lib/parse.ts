/** Parsing of model outputs: final answer, verbalized confidence, abstention, MC letters, lenient JSON. */
import type { Item, Parsed, Position } from "./types";

const DECLINE_RE = /^\s*(?:i\s+(?:do\s*n[o']?t|cannot|can't)\s+(?:know|say|determine|answer)|unknown|not\s+sure|unsure|no\s+answer|decline[sd]?|cannot\s+(?:be\s+)?determine[d]?|insufficient\s+information|n\/a)\b/i;

export function isDecline(answer: string | null | undefined): boolean {
  if (answer == null) return true;
  const a = answer.trim().replace(/^["'*_`]+|["'*_`.]+$/g, "");
  return a === "" || DECLINE_RE.test(a);
}

/** Pull the text after the last "Answer:" / "Exact Answer:" / "Final answer:" line. */
export function extractAnswerLine(text: string): string | null {
  const re = /^[\s*#>_-]*(?:exact\s+answer|final\s+answer|answer)\s*[:：]\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(text))) last = m[1];
  if (last == null) return null;
  return last.replace(/\*\*/g, "").trim();
}

export function extractConfidence(text: string): number | null {
  const re = /confidence\s*(?:score)?\s*[:：]\s*\**\s*(\d{1,3}(?:\.\d+)?)\s*(%)?/gi;
  let m: RegExpExecArray | null;
  let last: number | null = null;
  while ((m = re.exec(text))) {
    let v = Number(m[1]);
    if (!m[2] && v <= 1) v *= 100;
    if (Number.isFinite(v) && v >= 0 && v <= 100) last = v / 100;
  }
  return last;
}

/** Deterministic MC letter extraction (plan §4.4). */
export function extractLetter(text: string | null, maxLetter = "Z"): string | null {
  if (!text) return null;
  const t = text.trim();
  const patterns = [/^\(?([A-Z])\)?(?:[.):\s]|$)/, /\b(?:option|answer|choice)\s*\(?([A-Z])\)?\b/i, /\b([A-Z])\)/, /^\**([A-Z])\**$/];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1].toUpperCase() <= maxLetter) return m[1].toUpperCase();
  }
  return null;
}

export function parseAnswer(text: string, item: Item): Parsed {
  const line = extractAnswerLine(text);
  const confidence = extractConfidence(text);
  if (line == null) {
    // No format line: fall back to the last non-empty line, but never guess a letter from prose.
    const last = text.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
    if (item.answerType === "mc") return { answer: extractLetter(last), confidence, declined: extractLetter(last) == null };
    return { answer: last || null, confidence, declined: isDecline(last) };
  }
  if (isDecline(line)) return { answer: null, confidence, declined: true };
  if (item.answerType === "mc") {
    const l = extractLetter(line);
    return { answer: l, confidence, declined: l == null };
  }
  return { answer: line, confidence, declined: false };
}

/** Normalisation for answer equivalence (majority vote fallback and mock grading). */
export function normalizeAnswer(a: string): string {
  return a
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/\.$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Group answers by normalised string. Declines are excluded. Order: first appearance. */
export function groupByNormalized(answers: { model: string; answer: string | null }[]): Position[] {
  const map = new Map<string, Position>();
  for (const { model, answer } of answers) {
    if (answer == null || isDecline(answer)) continue;
    const k = normalizeAnswer(answer);
    const p = map.get(k) ?? { answer, models: [] };
    p.models.push(model);
    map.set(k, p);
  }
  return [...map.values()];
}

/** Lenient JSON: first {...} block; null when unreadable (never guessed). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const num01 = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace("%", "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const x = n > 1 ? n / 100 : n;
  return x >= 0 && x <= 1 ? x : null;
};
