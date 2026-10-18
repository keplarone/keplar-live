/**
 * Guides whose examples are produced by the code they describe.
 * The citation lines are formatCitation's output. The limits page reads TOOL_LIMITS and TOOLS.
 * Neither page invents a ranking, a volume, or a customer count.
 */
import type { Guide } from "@/lib/content/guides";
import { formatCitation, TOOL_LIMITS, TOOLS } from "@/lib/seo/tools";

const SAMPLE = {
  authors: "Ada Lovelace",
  title: "Notes on the analytical engine",
  year: "1843",
  container: "Taylor's Scientific Memoirs",
  url: "https://example.com/notes",
};

function line(style: "apa" | "mla" | "chicago"): string {
  const out = formatCitation({ ...SAMPLE, style, accessed: style === "chicago" ? "October 17, 2026" : "" });
  if (!out.ok) throw new Error(out.error);
  return out.text;
}

const APA = line("apa");
const MLA = line("mla");
const CHICAGO = line("chicago");

export const citationGuide: Guide = {
  slug: "citation-styles",
  path: "/guides/citation-styles",
  title: "How a Citation Is Built: APA, MLA and Chicago",
  metaDescription: "The APA, MLA and Chicago lines Keplar's formatter builds from fields you already have, and the blanks it refuses to guess.",
  published: "2026-10-17",
  updated: "2026-10-17",
  readingMinutes: 4,
  summary: "One author, one title, one year, one container, and one URL. Three styles arrange those fields differently. Keplar does not look the source up.",
  sections: [
    {
      h2: "The fields you already have",
      p: [
        "The citation formatter does not search the web, open the URL, or fill a blank author. You type the author, the title, the year, the container, and the address. If a field is empty, that part of the line is left out. A missing year is written as n.d. rather than a guessed date.",
        "The sample below is the same five fields in every style. The page at example.com/notes is a placeholder, not a source Keplar checked. Ada Lovelace and Taylor's Scientific Memoirs are the names you would type if you already had them from the book itself.",
      ],
    },
    {
      h2: "APA",
      p: [
        `APA puts the author, then the year in parentheses, then the title, then the container, then the URL. The formatter's line for the sample is: ${APA}`,
        "A second author would be joined with an ampersand before the year. More than two authors keep the first name and write et al. The year must be four digits. Anything else, other than a blank year, is rejected before a line is shown.",
      ],
    },
    {
      h2: "MLA",
      p: [
        `MLA puts the author, then the title in quotation marks, then the container, then the year, then the URL. The formatter's line for the sample is: ${MLA}`,
        "MLA here does not add an access date. If you need one, add it yourself after you check the style guide your class names. The formatter will not invent the date you visited the page.",
      ],
    },
    {
      h2: "Chicago author-date",
      p: [
        `Chicago author-date on this tool puts the author, the title in quotation marks, the container, the year, the URL, and an access note when you typed one. The formatter's line for the sample is: ${CHICAGO}`,
        "That access note is the text you typed. It is not a record of when Keplar fetched anything, because this tool does not fetch.",
      ],
    },
    {
      h2: "What is refused",
      p: [
        "A title is required, and so is an author. A year that is not four digits and is not n.d. is refused. A URL must start with http:// or https://, so a javascript: address is refused and is never turned into a link on the page. The result is plain text.",
        "These lines are a draft for a bibliography. They are not a statement that the page exists, that the author is right, or that your school uses this exact pattern. Open the URL yourself, and compare the line with the style sheet you were given.",
        "Sources inside a Keplar answer are a different thing. Those are labeled as cited by a model. Keplar does not open them to prove they exist. The formatter does not change that.",
      ],
    },
  ],
  related: ["/tools/citation-formatter", "/docs/how-it-works/sources-and-citations", "/guides"],
};

const local = TOOLS.filter((t) => t.kind !== "model").map((t) => t.title);
const modeled = TOOLS.filter((t) => t.kind === "model").map((t) => t.title);

export const limitsGuide: Guide = {
  slug: "free-tool-limits",
  path: "/guides/free-tool-limits",
  title: "What Keplar's Free AI Tools Will and Won't Do",
  metaDescription: "Which Keplar free tools call a model and which do not, plus the rate limit, length cap and cost check that keep a free run free.",
  published: "2026-10-17",
  updated: "2026-10-17",
  readingMinutes: 4,
  summary: "Two tools never call a model. The rest call one free model, stop at a fixed limit, and show an error when that service is not configured.",
  sections: [
    {
      h2: "Tools that do not call a model",
      p: [
        `${local.join(" and ")} run from the fields or the list you already have. They do not send your text to a model host. The citation formatter only rearranges author, title, year, container, and URL. The comparison explorer only filters pages Keplar has already published. It has no score and no ranking.`,
      ],
    },
    {
      h2: "Tools that call one free model",
      p: [
        `${modeled.join(", ")} each send your text to one model whose slug ends in :free and whose listed price is zero. The server picks that model. The page does not let you choose a paid model. If no free model is in the catalog, or the server has no key for it, the tool says it is unavailable. It does not invent a paragraph to fill the box.`,
        "Free model hosts may log what you paste. The form says so. Do not paste passwords, keys, or someone else's private notes.",
      ],
    },
    {
      h2: "The caps",
      p: [
        `Each address can run a model tool ${TOOL_LIMITS.perIp} times in ${TOOL_LIMITS.windowSec / 60} minutes. The text you submit is capped at ${TOOL_LIMITS.maxInputChars.toLocaleString("en-US")} characters. The reply is capped at ${TOOL_LIMITS.maxOutputTokens} tokens. Those numbers are the constants in the tool module, not a traffic estimate.`,
        "If the host's usage report includes a cost above zero, the reply is thrown away and you see an error. A free tool is not allowed to spend money to finish a sentence.",
      ],
    },
    {
      h2: "What these tools are not",
      p: [
        "They are not Study mode, not a PowerPoint export, and not Deep Research. Study mode, slides, and web research live in the signed-in product and follow that product's plan. A free outline is a list of headings. It is not a deck. A free summary is one model's draft. It is not a Keplar answer that compared several models and showed where they split.",
        "Use the tool page for the form. Use Ask when you want that comparison. Use the docs for the feature that matches the job, such as sources and citations, Study mode, or slides.",
      ],
    },
  ],
  related: ["/tools", "/docs/how-it-works/sources-and-citations", "/docs/using-keplar/study-mode"],
};

export const workedGuides: Guide[] = [citationGuide, limitsGuide];

/** Visible prose, in the same order the guide page renders it. */
export function guideBody(g: Guide): string {
  return [g.summary, ...g.sections.flatMap((s) => [s.h2, ...s.p, ...(s.bullets ?? [])])].join("\n");
}
