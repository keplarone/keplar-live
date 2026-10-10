import { abs } from "./seo";

export function breadcrumbs(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: abs(t.path) })),
  };
}

export function article(a: { path: string; title: string; description: string; published: string; updated: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.published,
    dateModified: a.updated,
    mainEntityOfPage: abs(a.path),
    author: { "@id": abs("/#organization") },
    publisher: { "@id": abs("/#organization") },
    inLanguage: "en",
  };
}

export function webPage(p: { path: string; title: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: p.title,
    description: p.description,
    url: abs(p.path),
    isPartOf: { "@id": abs("/#website") },
    about: { "@id": abs("/#app") },
    publisher: { "@id": abs("/#organization") },
    inLanguage: "en",
  };
}
