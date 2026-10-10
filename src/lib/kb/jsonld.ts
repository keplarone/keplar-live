import { abs } from "@/lib/seo";
import { brand } from "@/lib/site";
import { nodesToText, parseInline, plain, type Node } from "./md";
import { founderPersons } from "@/lib/structuredData";

const org = { "@id": abs("/#organization") };

export function techArticle(a: { path: string; title: string; description: string; published: string; updated: string; section?: string; keywords?: string[]; words?: number; image?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": abs(`${a.path}#article`),
    headline: a.title,
    description: a.description,
    datePublished: a.published,
    dateModified: a.updated,
    mainEntityOfPage: abs(a.path),
    url: abs(a.path),
    author: org,
    publisher: org,
    inLanguage: "en",
    isPartOf: { "@type": "CollectionPage", name: `${brand.name} docs`, url: abs("/docs") },
    ...(a.image ? { image: abs(a.image) } : {}),
    ...(a.section ? { articleSection: a.section } : {}),
    ...(a.keywords?.length ? { keywords: a.keywords.join(", ") } : {}),
    ...(a.words ? { wordCount: a.words } : {}),
  };
}

export function blogPosting(a: { path: string; title: string; description: string; published: string; updated: string; category?: string; keywords?: string[]; words?: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": abs(`${a.path}#article`),
    headline: a.title,
    description: a.description,
    datePublished: a.published,
    dateModified: a.updated,
    mainEntityOfPage: abs(a.path),
    url: abs(a.path),
    image: abs(`/og/${a.path.slice(1)}`),
    // By Hassen and Hussain Keder: the two co-founders as two Person nodes (same @ids as the Organization's founder array). No ages or birth dates.
    author: founderPersons(),
    publisher: org,
    inLanguage: "en",
    isPartOf: { "@type": "Blog", name: `${brand.name} blog`, url: abs("/blogs") },
    ...(a.category ? { articleSection: a.category } : {}),
    ...(a.keywords?.length ? { keywords: a.keywords.join(", ") } : {}),
    ...(a.words ? { wordCount: a.words } : {}),
  };
}

/** Question / answer pairs from a "## FAQ" section: each "### Question" and the paragraphs under it. Matches the visible text exactly. */
export function faqPairs(nodes: Node[]): { q: string; a: string }[] {
  const start = nodes.findIndex((n) => n.t === "h2" && n.id === "faq");
  if (start < 0) return [];
  const out: { q: string; a: string }[] = [];
  let cur: { q: string; a: string[] } | null = null;
  for (const n of nodes.slice(start + 1)) {
    if (n.t === "h2") break;
    if (n.t === "h3") { if (cur) out.push({ q: cur.q, a: cur.a.join(" ") }); cur = { q: n.text, a: [] }; }
    else if (cur) { const t = nodesToText([n]); if (t) cur.a.push(t.replace(/\n/g, " ")); }
  }
  if (cur) out.push({ q: cur.q, a: cur.a.join(" ") });
  return out.filter((x) => x.a);
}

export function faqLd(pairs: { q: string; a: string }[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: pairs.map((p) => ({ "@type": "Question", name: p.q, acceptedAnswer: { "@type": "Answer", text: p.a } })) };
}

/** HowTo from a "## Steps" section: its ordered list, one step per item. Same text as the page. */
export function howToLd(a: { path: string; title: string; description: string; nodes: Node[] }) {
  const i = a.nodes.findIndex((n) => n.t === "h2" && n.id === "steps");
  if (i < 0) return null;
  const list = a.nodes.slice(i + 1).find((n) => n.t === "ol" || n.t === "h2");
  if (!list || list.t !== "ol") return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: a.title,
    description: a.description,
    url: abs(a.path),
    inLanguage: "en",
    step: list.items.map((it, n) => {
      const text = plain(it);
      const name = text.split(/(?<=[.!?:])\s/)[0].slice(0, 110);
      return { "@type": "HowToStep", position: n + 1, name, text, url: abs(`${a.path}#steps`) };
    }),
  };
}

export const tocOf = (nodes: Node[]) => nodes.filter((n): n is Extract<Node, { t: "h2" | "h3" }> => (n.t === "h2" || n.t === "h3") && n.id !== "faq-q").map((n) => ({ id: n.id, text: plain(n.text), depth: (n.t === "h2" ? 2 : 3) as 2 | 3 }));
export { parseInline };

export function webArticle(a: { path: string; title: string; description: string; updated: string; keywords?: string[]; words?: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": abs(`${a.path}#article`),
    headline: a.title,
    description: a.description,
    datePublished: a.updated,
    dateModified: a.updated,
    mainEntityOfPage: abs(a.path),
    url: abs(a.path),
    author: org,
    publisher: org,
    inLanguage: "en",
    ...(a.keywords?.length ? { keywords: a.keywords.join(", ") } : {}),
    ...(a.words ? { wordCount: a.words } : {}),
  };
}
