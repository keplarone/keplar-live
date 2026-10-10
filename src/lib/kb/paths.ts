import { allPosts } from "./blog";
import { allDocs, docSections, docsIn } from "./docs";
import { promptCategories } from "./prompts";
import { allUseCases } from "./usecases";
import { latestRelease } from "./changelog";
import { approvedVs, VS_ACCESSED } from "./vs";

export type KbPath = { path: string; lastmod: string };

const max = (xs: string[]) => xs.sort().at(-1)!;

/** Every indexable knowledge-base URL with its real content date. Pending-approval comparison pages are not included. */
let cache: KbPath[] | null = null;
export function kbPaths(): KbPath[] {
  if (!cache) cache = build();
  return cache;
}
let byPath: Map<string, string> | null = null;
export const kbLastmod = (path: string) => (byPath ??= new Map(kbPaths().map((p) => [p.path, p.lastmod]))).get(path);

function build(): KbPath[] {
  const docs = allDocs();
  const posts = allPosts();
  const cases = allUseCases();
  return [
    { path: "/docs", lastmod: max(docs.map((d) => d.updated)) },
    ...docSections.map((s) => ({ path: `/docs/${s.id}`, lastmod: max(docsIn(s.id).map((d) => d.updated)) })),
    ...docs.map((d) => ({ path: d.path, lastmod: d.updated })),
    { path: "/blogs", lastmod: max(posts.map((p) => p.updated)) },
    ...posts.map((p) => ({ path: p.path, lastmod: p.updated })),
    { path: "/changelog", lastmod: latestRelease() },
    { path: "/glossary", lastmod: "2026-10-03" },
    { path: "/prompts", lastmod: "2026-10-03" },
    ...promptCategories.map((c) => ({ path: `/prompts/${c.slug}`, lastmod: "2026-10-03" })),
    { path: "/use-cases", lastmod: max(cases.map((c) => c.updated)) },
    ...cases.map((c) => ({ path: c.path, lastmod: c.updated })),
    { path: "/vs", lastmod: VS_ACCESSED },
    ...approvedVs().map((v) => ({ path: `/vs/${v.slug}`, lastmod: VS_ACCESSED })),
  ];
}

