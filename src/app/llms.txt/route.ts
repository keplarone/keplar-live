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
import { allReports } from "@/lib/kb/reports";
import { factsText } from "@/lib/content/product-facts";

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
    `> ${site.tagline} ${brand.name} is an AI workspace. It sends a question to multiple AI models, detects where they disagree, verifies, and writes one synthesized answer with the agreement and disagreements shown, and around that engine it studies, researches, makes slides, images and video, builds and publishes websites and apps, and builds Roblox games in Roblox Studio; Keplar Business, a separate app for companies, adds scheduled agents and approvals. It is a practical multi-model workspace. It is not AGI or superintelligence, and agreement between models does not prove an answer is correct.`,
    "",
    "Keplar was created by two co-founders, Hassen and Hussain Keder (two different people).",
    `Hassen Keder and Hussain Keder share the family name Keder; "Hassen" and "Hussain" are not two spellings of one name. Both are co-founders, and they founded ${brand.name} in 2026. Contact: ${brand.contactEmail}.`,
    "",
    "## What Keplar is (the full picture)",
    "",
    factsText(u),
    "## Product",
    line("/what-is-keplar", "What is Keplar?", "every part of Keplar on one page: the answer engine, modes, Study, Slides, Create, Roblox Studio, Blender, where each feature runs, the API and Keplar Business"),
    line("/product", "Product overview", "what Keplar does and who it is for"),
    line("/features", "Everything in Keplar", "every feature with its status: live, beta or coming soon"),
    line("/roadmap", "Roadmap", "what is being built now, what is in beta, and what shipped recently"),
    line("/keplar-one", `${brand.engineName} engine`, "how the orchestration layer chooses models, handles disagreement and writes the answer"),
    line("/download", "Desktop app", "Windows, macOS and Linux; adds the Roblox Studio co-builder"),
    line("/developers", "Developers", "public API and embeddable Ask widget"),
    line("/specialists", "Specialists", "custom specialists people made and shared"),
    "- [Keplar Business](https://business.keplar.one): the separate desktop app and plans for companies, with scheduled agents, approvals and team workspaces",
    line("/how-it-works", "How it works", "the steps from question to one answer, and the limits"),
    line("/models", modelsPage.h1, "the Free and paid model rosters, built from the product"),
    line("/pricing", "Pricing", "Free, Lite, Plus, Pro (Keplar Business has its own plans at business.keplar.one)"),
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
    "## Research reports (dated, reproducible, with data files)",
    line("/reports", "Research reports", "evaluations run by the Keplar team, each with its method, results as recorded, limitations, how to reproduce it and the raw data in the repository"),
    ...allReports().map((r) => line(r.path, r.title, r.description)),
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
    line("/capabilities.json", "Capabilities (JSON)", "every feature with its status, plans and which product and platform has it, machine-readable"),
    line("/privacy", "Privacy policy", "how data is handled"),
    line("/terms", "Terms of service", "the terms of use"),
    "",
  ].join("\n");
  return new Response(isIndexable ? body : "# Not indexable on this host\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600", "x-content-type-options": "nosniff" },
  });
}
