/**
 * Fonts for the localized pages. English keeps the root layout's Google Sans (latin subset, preloaded) untouched.
 *
 * Every other locale uses this second Google Sans instance first: the same family with the subsets Google publishes for it
 * (Latin Extended for Polish, Turkish, Czech...; Vietnamese; Cyrillic; Greek; Hebrew; Devanagari; Bengali; Thai; Tamil...).
 * It is NOT preloaded, and each subset is an @font-face with its own unicode-range, so a browser downloads a slice only when
 * a page actually shows those characters: English pages never fetch any of it, a Russian page fetches Cyrillic and Latin.
 * Scripts Google Sans does not cover (Han, Kana, Hangul, Arabic, Kannada, Myanmar) fall back to system or Noto fonts named per
 * language in src/components/i18n/i18n.css: zero bytes, nothing loaded for any other locale.
 */
import { Google_Sans } from "next/font/google";

export const intlSans = Google_Sans({
  subsets: [
    "latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "hebrew", "devanagari", "bengali", "gujarati", "gurmukhi",
    "oriya", "tamil", "telugu", "malayalam", "sinhala", "thai", "lao", "khmer", "ethiopic", "georgian", "armenian",
  ],
  variable: "--font-sans-intl",
  display: "swap",
  preload: false,
  adjustFontFallback: true,
});
