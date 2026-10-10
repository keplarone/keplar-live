import { csv, loadDir, type Loaded } from "./load";
import type { Node } from "./md";
import { docSections, type DocSection } from "./doc-sections";

export { docSections, type DocSection };

export type Doc = {
  slug: string; // section/page
  section: string;
  path: string;
  title: string;
  description: string;
  order: number;
  updated: string;
  keywords: string[];
  related: string[];
  howto: boolean;
  nodes: Node[];
  words: number;
  text: string;
};

const toDoc = (l: Loaded): Doc => {
  const section = l.rel.split("/")[0];
  return {
    slug: l.rel,
    section,
    path: `/docs/${l.rel}`,
    title: l.front.title,
    description: l.front.description,
    order: Number(l.front.order ?? 99),
    updated: l.front.updated,
    keywords: csv(l.front.keywords),
    related: csv(l.front.related),
    howto: l.front.howto === "true",
    nodes: l.nodes,
    words: l.words,
    text: l.text,
  };
};

let docs: Doc[] | null = null;
export function allDocs(): Doc[] {
  if (!docs) {
    const idx = new Map(docSections.map((s, i) => [s.id, i]));
    docs = loadDir("docs").map(toDoc).sort((a, b) => (idx.get(a.section) ?? 99) - (idx.get(b.section) ?? 99) || a.order - b.order || a.title.localeCompare(b.title));
  }
  return docs;
}

export const docBySlug = (slug: string) => allDocs().find((d) => d.slug === slug);
export const docsIn = (section: string) => allDocs().filter((d) => d.section === section);
export const sectionById = (id: string) => docSections.find((s) => s.id === id);

/** Reading order across the whole tree, used for previous / next. */
export function neighbors(d: Doc): { prev?: Doc; next?: Doc } {
  const list = allDocs();
  const i = list.findIndex((x) => x.slug === d.slug);
  return { prev: list[i - 1], next: list[i + 1] };
}

