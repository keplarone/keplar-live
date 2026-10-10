import katex from "katex";

/**
 * KaTeX → HTML string, safely: trust is off (no \href, \url, \includegraphics, \html*), the output is KaTeX's own
 * escaped markup (HTML + MathML for screen readers, with the LaTeX kept in an <annotation> for copy), input and macro
 * expansion are bounded, and a parse error returns null so the caller shows the source instead of throwing or going red.
 */
const cache = new Map<string, string | null>();
const MAX_TEX = 4000;

export function renderTex(tex: string, display: boolean): string | null {
  if (tex.length > MAX_TEX) return null;
  const key = (display ? "D" : "I") + tex;
  if (cache.has(key)) return cache.get(key) ?? null;
  let html: string | null = null;
  let refused = false;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      // never trusted: links, URLs, images and raw HTML classes are refused (KaTeX would draw them as red text), so we show the source instead
      trust: () => { refused = true; return false; },
      strict: "ignore",
      output: "htmlAndMathml",
      maxSize: 30,
      maxExpand: 500,
    });
  } catch {
    html = null;
  }
  if (refused) html = null;
  if (cache.size > 600) cache.clear();
  cache.set(key, html);
  return html;
}
