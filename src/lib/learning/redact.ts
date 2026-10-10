/**
 * A failed question may be kept (only with the person's consent) to test future routing changes. Before anything is stored it is
 * stripped of everything that could identify a person or carry a secret, shortened, and dropped entirely if it still looks
 * sensitive. Pure.
 */
import { looksUnsafe } from "@/lib/memory/facts";

export const CASE_MAX_CHARS = 240;

const STRIP: [RegExp, string][] = [
  [/https?:\/\/\S+|www\.\S+/gi, "[link]"],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/\b(?:sk|pk|rk|ghp|gho|xox[abprs]|AKIA|AIza)[-_A-Za-z0-9]{12,}\b/g, "[key]"],
  [/\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, "[key]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/\+?\d[\d\s().-]{8,}\d/g, "[number]"],
  [/\b\d{5,}\b/g, "[number]"],
];

/** The text that may be stored for a failed question, or "" when none may be (the category and reason are kept either way). */
export function redactCase(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || looksUnsafe(t)) return ""; // secrets, birthdates, addresses, instructions to the assistant, links: nothing stored
  for (const [rx, sub] of STRIP) t = t.replace(rx, sub);
  if (t.length > CASE_MAX_CHARS) t = t.slice(0, CASE_MAX_CHARS).replace(/\s+\S*$/, "") + "…";
  return t;
}
