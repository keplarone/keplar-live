/**
 * Evergreen guides. Plain, practical, and honest: no statistics, no claims about accuracy, no invented studies.
 * Dates are the publication date of the guide as written.
 */
import { brand } from "@/lib/site";

const K = brand.name;

export type Guide = {
  slug: string;
  path: string;
  title: string;
  metaDescription: string;
  /** ISO date. */
  published: string;
  updated: string;
  readingMinutes: number;
  summary: string;
  sections: { h2: string; p: string[]; bullets?: string[] }[];
  related: string[];
};

export const guides: Guide[] = [
  {
    slug: "why-ai-models-disagree",
    path: "/guides/why-ai-models-disagree",
    title: "Why AI models disagree, and what to do when they do",
    metaDescription: "Different AI models can give different answers to the same question. Here is why it happens and how to use disagreement as a signal.",
    published: "2026-10-01",
    updated: "2026-10-01",
    readingMinutes: 4,
    summary: "Two chatbots, one question, two answers. That isn't a bug in your question. Here is what's going on and how to use it.",
    sections: [
      {
        h2: "They are different systems",
        p: [
          "AI models are trained on different data, tuned in different ways, and updated at different times. Ask the same question twice and you can get two different answers, even from the same model, because the wording of an answer is partly chance.",
        ],
      },
      {
        h2: "Questions that invite disagreement",
        p: ["Some questions have a settled answer, like the capital of a country. Others depend on judgment, recent events or incomplete information, and models vary the most there."],
        bullets: ["Advice with trade-offs (rent or buy, which tool to pick).", "Anything that changed recently.", "Questions with a hidden assumption in them.", "Niche topics with little written about them."],
      },
      {
        h2: "Disagreement is information",
        p: [
          "When models split, it tells you the answer isn't solid. That's the moment to slow down: look at the reasons each gives, ask a more specific follow-up, or check a primary source.",
          `${K} is built around this idea. It asks several models, writes one answer, and shows you where they disagreed.`,
        ],
      },
      {
        h2: "Agreement isn't proof either",
        p: ["Models trained on similar data can share the same mistake. Treat agreement as a mild reassurance and still verify anything that matters."],
      },
    ],
    related: ["/ai-fact-check", "/blogs/how-to-check-an-ai-answer", "/compare-ai-models"],
  },
  {
    slug: "study-from-a-pdf",
    path: "/guides/study-from-a-pdf",
    title: "How to study from a PDF with AI, step by step",
    metaDescription: "Turn lecture notes or a chapter PDF into flashcards, quizzes and a study plan, and the habits that make them work.",
    published: "2026-10-01",
    updated: "2026-10-01",
    readingMinutes: 5,
    summary: "AI can do the busywork of making study materials. The learning is still yours. Here's a workflow.",
    sections: [
      {
        h2: "Start with text",
        p: ["Use a PDF with selectable text, or paste your notes. Scanned pages are images and most tools can't read them."],
      },
      {
        h2: "Generate, then skim for errors",
        p: ["Create an outline, flashcards and a quiz from the material, then skim them against the source. Generated cards can be wrong or too vague, and a wrong card is worse than none."],
      },
      {
        h2: "Use spaced review",
        p: ["Review cards you got wrong sooner and cards you got right later. That's what spaced repetition does, and it's the main reason flashcards work."],
      },
      {
        h2: "Quiz yourself before you feel ready",
        p: ["Trying to recall an answer teaches you more than rereading it. Take the quiz early, see what you missed, and study those topics."],
      },
      {
        h2: "Set a date and a plan",
        p: ["Give yourself an exam date and split the material across the days. A small, regular session beats one long night."],
      },
      {
        h2: "In Keplar",
        p: [`Study mode on every plan, Free included, builds an outline, summary, flashcards with spaced review, quizzes and a day-by-day plan from a text-based PDF or your notes. `],
      },
    ],
    related: ["/ai-study-tool", "/for-students", "/ai-slideshow-maker"],
  },
  {
    slug: "slide-deck-from-notes",
    path: "/guides/slide-deck-from-notes",
    title: "How to turn rough notes into a good slide deck",
    metaDescription: "A simple structure for turning notes into a clear presentation, whether you write it yourself or start from an AI draft.",
    published: "2026-10-01",
    updated: "2026-10-01",
    readingMinutes: 4,
    summary: "A deck is an argument in order. Get the order right and the slides follow.",
    sections: [
      {
        h2: "Write the one-sentence point",
        p: ["If your audience remembers one thing, what is it? Put that on the final slide and build backwards."],
      },
      {
        h2: "Three to five sections",
        p: ["Group your notes into a handful of sections: the problem, what you found or propose, the evidence, and what happens next. Each section gets a few slides at most."],
      },
      {
        h2: "One idea per slide",
        p: ["A slide title should read like a sentence that states the point of that slide. Keep bullets short and move detail to speaker notes."],
      },
      {
        h2: "Use AI for the first draft",
        p: ["Give a deck generator your notes and a topic, then edit hard: fix facts, cut filler and make each title say something."],
      },
      {
        h2: "Rehearse once",
        p: ["Read it aloud with a timer. If a slide takes more than a minute or two, split it."],
      },
      {
        h2: "In Keplar",
        p: [`The slideshow creator (Plus and Pro) writes titles, bullets, speaker notes and an image idea per slide from a topic, outline or notes, and exports to PowerPoint or PDF. Image ideas are text placeholders.`],
      },
    ],
    related: ["/ai-slideshow-maker", "/for-founders", "/for-students"],
  },
];

export const guideBySlug = (slug: string) => guides.find((g) => g.slug === slug);
