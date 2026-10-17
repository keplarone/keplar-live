/**
 * Fonts for the localized pages. English keeps the root layout's Montserrat (latin subset, preloaded) untouched.
 *
 * Every other locale uses intlMontserrat first (the Space UI face with Latin Extended, Cyrillic and Vietnamese), then this Google
 * Sans instance for the scripts Montserrat does not draw: the same family with the subsets Google publishes for it
 * (Latin Extended for Polish, Turkish, Czech...; Vietnamese; Cyrillic; Greek; Hebrew; Devanagari; Bengali; Thai; Tamil...).
 * It is NOT preloaded, and each subset is an @font-face with its own unicode-range, so a browser downloads a slice only when
 * a page actually shows those characters: English pages never fetch any of it, a Russian page fetches Cyrillic and Latin.
 * Scripts Google Sans does not cover (Han, Kana, Hangul, Arabic, Kannada, Myanmar) fall back to system or Noto fonts named per
 * language in src/components/i18n/i18n.css: zero bytes, nothing loaded for any other locale.
 */
import { Google_Sans, Montserrat } from "next/font/google";

export const intlMontserrat = Montserrat({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "vietnamese"],
  variable: "--font-sans-intl-latin",
  display: "swap",
  preload: false,
  adjustFontFallback: true,
});

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
