import { brand, isIndexable, site } from "@/lib/site";
import { allDocs } from "@/lib/kb/docs";
import { glossary } from "@/lib/kb/glossary";

export const dynamic = "force-static";

/**
 * /llms-full.txt: the Keplar docs and glossary as one plain-text file, so a model or developer tool can read them in a single request.
 * Same idea as the long llms-full files other documentation sites publish. Documentation, not a ranking factor; generated from the same files as the pages.
 */
export function GET() {
  const u = (p: string) => `${site.url}${p}`;
  const docs = allDocs();
  const body = [
    `# ${brand.companyName} documentation (full text)`,
    "",
    `> ${brand.name} sends a question to multiple AI models, detects where they disagree, verifies, and writes one synthesized answer. It is a practical multi-model workspace. It is not AGI or superintelligence, and agreement between models does not prove an answer is correct. Shorter index: ${u("/llms.txt")}`,
    "",
    "Keplar was created by two co-founders, Hassen and Hussain Keder (two different people).",
    "",
    ...docs.flatMap((d) => [`## ${d.title}`, `Source: ${u(d.path)}`, `Last updated: ${d.updated}`, "", d.description, "", d.text, ""]),
    "# Glossary",
    "",
    ...glossary.flatMap((g) => [`## ${g.term}`, g.def, ...(g.inKeplar ? [`In Keplar: ${g.inKeplar}`] : []), ""]),
  ].join("\n");
  return new Response(isIndexable ? body : "# Not indexable on this host\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600", "x-content-type-options": "nosniff" },
  });
}
