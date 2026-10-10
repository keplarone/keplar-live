import { guides } from "@/lib/content/guides";
import { landingPages } from "@/lib/content/landing";
import { editorialPages } from "@/lib/content/editorial";
import { aboutPage } from "@/lib/content/about-page";
import { modelsPage } from "@/lib/content/models-page";
import { developersPage } from "@/lib/growth/developers-page";
import { brand, isIndexable, site } from "@/lib/site";
import { allPosts } from "@/lib/kb/blog";
import { allDocs, docSections, docsIn } from "@/lib/kb/docs";
import { allUseCases } from "@/lib/kb/usecases";
import { promptCategories } from "@/lib/kb/prompts";
import { approvedVs } from "@/lib/kb/vs";
import { glossary } from "@/lib/kb/glossary";

export const dynamic = "force-static";

/**
 * /llms.txt: an optional plain-text guide to the site for language-model tools (proposal at llmstxt.org).
 * It is documentation, not a ranking factor, and no search engine has said it uses it. Generated from the same content files as the pages.
 */
export function GET() {
  const u = (p: string) => `${site.url}${p}`;
  const line = (path: string, title: string, note: string) => `- [${title}](${u(path)}): ${note}`;
  const body = [
    `# ${brand.companyName}`,
    "",
    `> ${site.tagline} ${brand.name} sends a question to multiple AI models, detects where they disagree, verifies, and writes one synthesized answer with the agreement and disagreements shown. It is a practical multi-model workspace. It is not AGI or superintelligence, and agreement between models does not prove an answer is correct.`,
    "",
    "Keplar was created by two co-founders, Hassen and Hussain Keder (two different people).",
    `Hassen Keder and Hussain Keder share the family name Keder; "Hassen" and "Hussain" are not two spellings of one name. Both are co-founders, and they founded ${brand.name} in 2026. Contact: ${brand.contactEmail}.`,
    "",
    "## Product",
    line("/product", "Product overview", "what Keplar does and who it is for"),
    line("/how-it-works", "How it works", "the steps from question to one answer, and the limits"),
    line("/models", modelsPage.h1, "the Free and paid model rosters, built from the product"),
    line("/pricing", "Pricing", "Free, Lite, Plus, Pro, Business"),
    line("/about", aboutPage.h1, "who made Keplar: two co-founders, Hassen and Hussain Keder"),
    "",
    "## Explainers (sourced, dated)",
    ...editorialPages.map((p) => line(p.path, p.h1, p.metaDescription)),
    "",
    "## Use cases",
    ...[...landingPages, developersPage].map((p) => line(p.path, p.label, p.metaDescription)),
    "",
    "## Guides",
    ...guides.map((g) => line(g.path, g.title, g.metaDescription)),
    "",
    "## Docs",
    line("/docs", "Keplar docs", `${allDocs().length} pages: how routing, disagreement detection, verification and synthesis work, plus guides, plans, privacy and limits`),
    ...docSections.flatMap((s) => [line(`/docs/${s.id}`, s.title, s.blurb), ...docsIn(s.id).map((d) => line(d.path, d.title, d.description))]),
    "",
    "## Blog",
    ...allPosts().map((p) => line(p.path, p.title, p.description)),
    "",
    "## How to use Keplar for a task",
    ...allUseCases().map((u) => line(u.path, u.title, u.description)),
    "",
    "## Reference",
    line("/changelog", "Release notes", "dated list of what changed in Keplar, newest first"),
    line("/glossary", "AI glossary", `${glossary.length} plain-English definitions with notes on how each applies to Keplar`),
    line("/prompts", "Prompt library", "copyable prompt templates with why each works and what to check"),
    ...promptCategories.map((c) => line(`/prompts/${c.slug}`, `${c.name} prompts`, c.blurb)),
    line("/vs", "Keplar compared with other assistants", "dated, sourced comparisons; no accuracy claims"),
    ...approvedVs().map((v) => line(`/vs/${v.slug}`, `Keplar vs ${v.name}`, v.description)),
    "",
    "## Optional",
    line("/llms-full.txt", "Docs and glossary, full text", "every docs page and glossary entry as one plain-text file"),
    line("/privacy", "Privacy policy", "how data is handled"),
    line("/terms", "Terms of service", "the terms of use"),
    "",
  ].join("\n");
  return new Response(isIndexable ? body : "# Not indexable on this host\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600", "x-content-type-options": "nosniff" },
  });
}
