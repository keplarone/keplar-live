import { csv, loadDir } from "./load";
import { wordCount, type Node } from "./md";

export type BlogPost = {
  slug: string;
  path: string;
  title: string;
  description: string;
  category: string;
  published: string;
  updated: string;
  readingMinutes: number;
  keywords: string[];
  related: string[];
  nodes: Node[];
  words: number;
  text: string;
};

let posts: BlogPost[] | null = null;
export function allPosts(): BlogPost[] {
  if (!posts) {
    posts = loadDir("blog")
      .map((l) => ({
        slug: l.rel,
        path: `/blogs/${l.rel}`,
        title: l.front.title,
        description: l.front.description,
        category: l.front.category,
        published: l.front.published,
        updated: l.front.updated ?? l.front.published,
        readingMinutes: Math.max(3, Math.round(wordCount(l.text) / 220)),
        keywords: csv(l.front.keywords),
        related: csv(l.front.related),
        nodes: l.nodes,
        words: l.words,
        text: l.text,
      }))
      .sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));
  }
  return posts;
}
export const postBySlug = (slug: string) => allPosts().find((p) => p.slug === slug);
export const blogCategories = () => [...new Set(allPosts().map((p) => p.category))].sort();
