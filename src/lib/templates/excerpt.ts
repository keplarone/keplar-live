/**
 * Readable excerpts of a template's pages, from its snapshot HTML, for the indexable detail page: the page title, its
 * headings and the first paragraphs, as plain text. The snapshot was scrubbed when the template was shared; this only
 * strips markup. Pure, so the gallery, the detail page and tests read the same text.
 */
export type PageExcerpt = { file: string; name: string; title: string; headings: string[]; text: string; words: number };

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z#0-9]+;/g, " ");
const strip = (h: string) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const stripNoise = (h: string) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>|<!--[\s\S]*?-->/gi, " ");

const pageName = (file: string) => (file === "index.html" ? "Home" : file.slice(0, -5).replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()));

/** Excerpt one HTML page: the <title> (or first h1), up to `maxHeadings` h1–h3 texts, and the first paragraphs up to `maxWords`. */
export function excerptPage(file: string, html: string, opts: { maxHeadings?: number; maxWords?: number } = {}): PageExcerpt {
  const body = stripNoise(html);
  const title = strip((body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] ?? "") || pageName(file);
  const headings = [...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => strip(m[1])).filter(Boolean).filter((h, i, a) => a.indexOf(h) === i).slice(0, opts.maxHeadings ?? 6);
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((p) => p.split(" ").length >= 6);
  const words: string[] = [];
  for (const p of paras) {
    if (words.length >= (opts.maxWords ?? 70)) break;
    words.push(...p.split(" "));
  }
  const text = words.slice(0, opts.maxWords ?? 70).join(" ") + (words.length > (opts.maxWords ?? 70) ? "…" : "");
  return { file, name: pageName(file), title, headings, text, words: text ? text.split(" ").length : 0 };
}

/** Excerpts for every HTML page of a snapshot, home first, 404 left out. */
export function excerptSnapshot(files: Record<string, string>, opts?: { maxHeadings?: number; maxWords?: number }): PageExcerpt[] {
  return Object.keys(files)
    .filter((f) => f.endsWith(".html") && f !== "404.html")
    .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)))
    .map((f) => excerptPage(f, files[f], opts));
}
