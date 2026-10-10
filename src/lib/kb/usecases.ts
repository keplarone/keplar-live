import { csv, loadDir } from "./load";
import type { Node } from "./md";

export type UseCase = { slug: string; path: string; title: string; description: string; updated: string; keywords: string[]; related: string[]; nodes: Node[]; words: number };

let cached: UseCase[] | null = null;
export function allUseCases(): UseCase[] {
  if (!cached) {
    cached = loadDir("use-cases")
      .map((l) => ({ slug: l.rel, path: `/use-cases/${l.rel}`, title: l.front.title, description: l.front.description, updated: l.front.updated, keywords: csv(l.front.keywords), related: csv(l.front.related), nodes: l.nodes, words: l.words }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  return cached;
}
export const getUseCase = (slug: string) => allUseCases().find((u) => u.slug === slug);
