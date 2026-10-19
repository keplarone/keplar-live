import { Inter } from "next/font/google";

/**
 * Keplar Business's one UI face: Inter, the closest openly licensed match for Apple's SF Pro (the Apple-led look in tokens.css).
 * Keplar One keeps Google Sans. next/font self-hosts one variable file, display swap, with a metric-matched fallback so the swap
 * does not shift layout; the subsets match the root layout's so translated pages keep their glyphs. Code stays monospaced.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"],
  variable: "--font-business",
  display: "swap",
  adjustFontFallback: true,
});

/**
 * Points the whole page at Inter while a Business root is on it, including what the root layout renders outside <main> (the
 * cookie notice, the skip link), so a Business page never mixes two families. Keplar One pages are untouched.
 */
export function BusinessFont({ scope = "main[data-kb]" }: { scope?: string }) {
  const family = inter.style.fontFamily;
  return <style>{`:root:has(${scope}){--font-business:${family};--font-sans:${family}}`}</style>;
}

export const businessFontClass = inter.variable;
