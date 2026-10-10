/**
 * Answers follow the language of the question (the rule lives in VOICE_PROMPT, src/lib/persona.ts). When a question's
 * language is ambiguous, the model falls back to the interface language: the person's saved choice (keplar-locale cookie),
 * passed in as an unseen note ahead of the question. English, or no saved choice, adds nothing.
 */
import { LOCALE_COOKIE } from "./detect";
import { DEFAULT_LOCALE, isLocale, localeInfo } from "./locales";

export function uiLocaleFromCookie(cookie: string | null | undefined): string {
  const m = cookie?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  let v = "";
  try { v = m ? decodeURIComponent(m[1]).trim() : ""; } catch { v = ""; }
  return v && isLocale(v) ? v : DEFAULT_LOCALE;
}

/** One line for the model, or "" for English. Names the language in English and natively so any model recognizes it. */
export function answerLanguageNote(cookie: string | null | undefined): string {
  const code = uiLocaleFromCookie(cookie);
  if (code === DEFAULT_LOCALE) return "";
  const l = localeInfo(code);
  return `Interface language: ${l.english} (${l.native}). Reply in the language of the question; if its language is unclear (a single word, a name, a number, code or emoji), reply in ${l.english}.`;
}
