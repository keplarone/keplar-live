/** /about: who made Keplar and what it is. Facts about the two co-founders are limited to what the product's own FAQ publishes: their names and the founding year. No birth dates or ages. */
import { brand } from "@/lib/site";
import type { EditorialPage } from "./editorial";

const K = brand.name;

export const aboutPage: EditorialPage = {
  slug: "about",
  path: "/about",
  metaTitle: "About Keplar One: Founders and Mission",
  metaDescription: "Keplar was founded in 2026 by Hassen and Hussain Keder. It asks several AI models a question, finds where they disagree, verifies and writes one answer.",
  ogTitle: "About Keplar One",
  label: "About",
  h1: "About Keplar One",
  answer: `${brand.companyName} is an AI answer engine created by two co-founders, Hassen and Hussain Keder. They founded ${K} in 2026. It sends your question to several AI models, detects where they disagree, verifies, and writes one answer with the agreement and disagreements shown.`,
  published: "2026-10-03",
  updated: "2026-10-07",
  readingMinutes: 3,
  sections: [
    {
      id: "what",
      h2: "What Keplar is",
      p: [
        `${K} is a product that sits above AI models, not a model of its own. When you ask a question, ${brand.engineName} reads it, picks the models it needs, compares their replies, checks a draft, and writes one answer. Under the answer you can open the models consulted, where they agreed, where they disagreed and the sources the models cited.`,
        "The tagline is \"One question. Multiple intelligences. One answer.\" It describes the workflow. It is not a claim that Keplar is intelligent in a human sense, and Keplar is not AGI or superintelligence. [What is superintelligence?](/superintelligence) explains the term and why we do not use it for ourselves.",
      ],
    },
    {
      id: "who",
      h2: "Who made Keplar",
      p: [
        "Keplar was created by two co-founders, Hassen and Hussain Keder.",
        "Hassen Keder and Hussain Keder are two different people who share the family name Keder. \"Hassen\" and \"Hussain\" are not two spellings of one name, and Keplar was not made by one person: both are co-founders. They founded Keplar in 2026.",
        "We do not publish personal details about them beyond their names.",
      ],
    },
    {
      id: "today",
      h2: "What you can do today",
      bullets: [
        "Ask: multi-model answers with consensus, disagreements and cited sources. Free to try with no signup.",
        "Study: upload a text-based PDF or paste notes for an outline, summary, flashcards, quizzes and a plan.",
        "Create: personal sites, and on higher plans images, slideshows and more. Plan limits apply; see [pricing](/pricing).",
        "Memory: optional; you control it and can delete it.",
      ],
      after: ["Anything still in beta or not yet available is labeled as such in the product. We would rather say so than imply otherwise."],
    },
    {
      id: "honest",
      h2: "How we describe our own answers",
      bullets: [
        `${K} can be wrong, even when the models agree. Agreement is a signal, not proof.`,
        "The Consensus section measures how strongly the consulted models agree. It is not a vote count or an accuracy score.",
        "Keplar does not look things up on the web for answers yet. Sources shown are the ones the models cite; Keplar has not checked them.",
        "Health, legal and money answers are general information, not professional advice.",
        "We do not publish customer counts, ratings or accuracy figures, because we do not have verified ones to share.",
      ],
    },
    {
      id: "contact",
      h2: "Contact",
      p: [
        `Questions, corrections or business inquiries: ${brand.contactEmail}, or the [Inquire form](/inquire). Read the [privacy policy](/privacy) and [terms](/terms) for how data is handled.`,
      ],
    },
  ],
  keplar: { h2: "Try it", p: [`Ask ${K} one question and see which models it consulted. No signup needed.`] },
  examples: ["What is the difference between AI, AGI and superintelligence?", "Explain how vaccines train the immune system", "What should I look for in a used car?"],
  faq: [
    { q: "Who created Keplar?", a: "Keplar was created by two co-founders, Hassen and Hussain Keder. They founded Keplar in 2026." },
    { q: "Are Hassen and Hussain the same person?", a: "No. Hassen Keder and Hussain Keder are two different people who share the family name Keder. Both are co-founders of Keplar." },
    { q: "Is Keplar its own AI model?", a: "No. Keplar consults several existing AI models and writes one answer from their replies." },
    { q: "How do I contact Keplar?", a: "Email team@keplar.one or use the Inquire form." },
  ],
  related: ["/how-it-works", "/models", "/pricing", "/privacy"],
};
