/**
 * The title of any internal page by path, for link lists built from paths (cluster links, "keep reading"). Reads the same
 * registries the pages render from, so a title here is the page's own title. Unknown paths get a readable fallback from the
 * last path segment rather than nothing, and tests/seo-clusters.test.ts checks every cluster page resolves to a real title.
 */
import { allBlogAndDocsByPath } from "@/lib/kb/lookup";
import { promptCategories } from "@/lib/kb/prompts";
import { vsPages } from "@/lib/kb/vs";
import { comparePages } from "@/lib/compare";
import { landingPages } from "@/lib/content/landing";
import { guides } from "@/lib/content/guides";
import { editorialPages } from "@/lib/content/editorial";

/** Static pages whose titles live in their route files. */
const STATIC: Record<string, string> = {
  "/": "Ask Keplar",
  "/overview": "What Keplar is",
  "/models": "The AI models Keplar uses",
  "/features": "Everything in Keplar",
  "/pricing": "Plans and pricing",
  "/prompts": "Prompt library",
  "/guides": "Guides: using AI well",
  "/use-cases": "Use cases",
  "/vs": "Keplar compared with ChatGPT, Claude and Gemini",
  "/compare": "Keplar compared with other multi-model tools",
  "/how-it-works": "How Keplar works",
  "/docs": "Docs",
  "/blogs": "Blog",
  "/glossary": "AI glossary",
  "/for-developers": "Keplar for developers",
  "/download": "Download the desktop app",
  "/what-is-keplar": "What is Keplar?",
  "/about": "About Keplar One",
  "/signup": "Create a free account",
  "/simulation": "How Keplar works: a simulation",
  "/specialists": "Specialist directory",
  "/tools": "Free tools",
  "/app/study": "Study mode",
  "/app/slides": "Slides",
  "/app/create": "Create",
};

export function titleFor(path: string): string {
  const kb = allBlogAndDocsByPath(path);
  if (kb) return kb.title;
  const landing = landingPages.find((p) => p.path === path);
  if (landing) return landing.label;
  const guide = guides.find((g) => g.path === path);
  if (guide) return guide.title;
  const editorial = editorialPages.find((e) => e.path === path);
  if (editorial) return editorial.label;
  const prompt = promptCategories.find((c) => `/prompts/${c.slug}` === path);
  if (prompt) return `${prompt.name} prompts`;
  const vs = vsPages.find((v) => `/vs/${v.slug}` === path);
  if (vs) return `Keplar vs ${vs.name}`;
  const cmp = comparePages.find((c) => c.path === path);
  if (cmp) return cmp.h1;
  if (STATIC[path]) return STATIC[path];
  const last = path.split("/").filter(Boolean).at(-1) ?? "";
  return last ? last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : path;
}

/** True when the title came from a registry or the static map, not from the path. */
export function hasTitle(path: string): boolean {
  return Boolean(allBlogAndDocsByPath(path) || landingPages.some((p) => p.path === path) || guides.some((g) => g.path === path) || editorialPages.some((e) => e.path === path) || promptCategories.some((c) => `/prompts/${c.slug}` === path) || vsPages.some((v) => `/vs/${v.slug}` === path) || comparePages.some((c) => c.path === path) || STATIC[path]);
}
