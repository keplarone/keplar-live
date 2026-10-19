/**
 * Evergreen guides. Plain, practical, and honest: no statistics, no claims about accuracy, no invented studies.
 * Dates are the publication date of the guide as written.
 */


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
