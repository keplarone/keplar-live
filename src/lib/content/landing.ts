/**
 * Indexable landing pages and use-case pages. Copy rules: describe what Keplar does today, nothing more.
 * No accuracy claims, no "checks claims against sources", no statistics, testimonials or customer counts.
 * Sources shown in an answer are the ones the models cite; Keplar has not checked them. Web lookups are not live.
 */
import { brand } from "@/lib/site";
import { tiers } from "@/lib/tiers";

const K = brand.name;
const O = brand.engineName;
/** A plan's monthly price from the plan data, so landing copy never types a number by hand. */
const price = (id: "lite" | "plus" | "pro") => `$${tiers.find((t) => t.id === id)?.price ?? ""}`;

export type Section = { h2: string; p?: string[]; bullets?: string[] };

export type LandingPage = {
  slug: string;
  path: string;
  /** <title> without the site suffix (the layout template adds " · Keplar"). */
  metaTitle: string;
  metaDescription: string;
  /** Short title for the social card (about 40 characters or fewer). */
  ogTitle: string;
  label: string;
  h1: string;
  lede: string;
  /** Example questions shown in the try-it box. */
  examples: string[];
  sections: Section[];
  faq: { q: string; a: string }[];
  /** Paths of related pages, for internal linking. */
  related: string[];
};

const limits: Section = {
  h2: "Honest about limits",
  p: [
    `${K} can be wrong, even when the models agree. Agreement is a signal, not proof. ${K} does not look things up on the web yet, and the sources shown under an answer are the ones the models cite; ${K} has not checked them.`,
    "The Free plan runs on free open models, which can be slower when they are busy, and their hosts may log prompts. Health, legal and money answers are general information, not professional advice.",
  ],
};

export const landingPages: LandingPage[] = [
  {
    slug: "ai-answer-engine",
    path: "/ai-answer-engine",
    metaTitle: "An AI answer engine that asks several models",
    metaDescription: `${K} asks the AI models your question needs, shows where they agree and disagree, and writes one answer. Try it free, no signup.`,
    ogTitle: "One answer from several AI models",
    label: "AI answer engine",
    h1: "An answer engine that doesn't rely on one model.",
    lede: `Most AI tools give you one model's answer. ${K} sends your question to the models it needs, compares what they say, and writes one answer with the agreement and the disagreements shown.`,
    examples: ["Should I rent or buy a home this year?", "Explain how vaccines train the immune system", "What should I look for in a used car?"],
    sections: [
      {
        h2: "How it works",
        p: [
          `${O} reads your question, picks only the models it needs (weighing quality, reliability, speed and cost), and asks them. It then compares the replies and writes one synthesized answer.`,
        ],
        bullets: [
          "Consensus: how many models agreed and how many didn't.",
          "Models consulted: which ones answered.",
          "Disagreements: where they split, so you know what to double-check.",
          "Sources the models cite (not checked by Keplar).",
        ],
      },
      {
        h2: "Why not just ask one AI?",
        p: [
          "One model can sound certain and still be wrong, and you can't tell from the answer alone. When several models answer independently, a split is a useful warning: it points to the part of the answer worth checking.",
        ],
      },
      limits,
    ],
    faq: [
      { q: "Is Keplar free?", a: "Yes. Free is $0, runs on free open models, and allows up to 50 questions a day (fair use). Keplar Plus is $45 a month and Keplar Pro is $99 a month." },
      { q: "Do I need an account to try it?", a: "No. You can ask questions without signing up. An account saves your chats and unlocks Study sets, saved chats and optional memory." },
      { q: "Does agreement mean the answer is correct?", a: "Not always. Consensus can be wrong, so Keplar shows how strongly the models agreed and where they disagree, instead of treating a majority as the truth." },
    ],
    related: ["/compare-ai-models", "/ai-fact-check", "/chatgpt-alternative", "/how-it-works"],
  },
  {
    slug: "compare-ai-models",
    path: "/compare-ai-models",
    metaTitle: "Compare AI models side by side on one question",
    metaDescription: `See where several AI models agree and where they split on the same question, then get one answer. ${K} is free to try, no signup.`,
    ogTitle: "Compare AI models on one question",
    label: "Compare AI models",
    h1: "Compare what several AI models say, in one place.",
    lede: `Instead of pasting the same question into three chatbots, ask once. ${K} consults several models, shows how many agreed, and flags where they disagree.`,
    examples: ["Is intermittent fasting worth trying?", "Python or JavaScript for a first language?", "What are the trade-offs of a 15-year vs 30-year mortgage?"],
    sections: [
      {
        h2: "One question, several models",
        p: [
          `${K} doesn't ask every model every time. ${O} chooses the panel a question needs, and a harder question gets more models. You see which models were consulted and what each concluded.`,
        ],
      },
      {
        h2: "What you get back",
        bullets: [
          "A single written answer, so you aren't left to reconcile several chat windows.",
          "An agreement figure and the count of models that agreed and disagreed.",
          "A short summary of where the disagreement is and the reasoning on each side. The minority can be right.",
        ],
      },
      {
        h2: "When this helps most",
        p: ["Questions with trade-offs, advice, or facts you can't easily check yourself. For quick lookups a single model is often enough, and Keplar uses fewer models for simple questions."],
      },
      limits,
    ],
    faq: [
      { q: "Which models does Keplar use?", a: "A mix of open and premium models, depending on your plan and the question. Free uses free open models only." },
      { q: "Can I choose the models myself?", a: "Not today. Keplar picks the models a question needs. You can choose how thorough it should be: Fastest, Balanced or Most thorough." },
      { q: "How is this different from a model-comparison site?", a: "Keplar also writes one answer from the replies and summarizes the disagreement, so you don't have to read every model's response." },
    ],
    related: ["/ai-answer-engine", "/ai-fact-check", "/compare", "/pricing"],
  },
  {
    slug: "chatgpt-alternative",
    path: "/chatgpt-alternative",
    metaTitle: "A ChatGPT alternative that asks several AI models",
    metaDescription: `Looking for a ChatGPT alternative? ${K} asks several AI models, shows where they disagree, and gives one answer. Free to start.`,
    ogTitle: "A ChatGPT alternative: ask many models",
    label: "ChatGPT alternative",
    h1: "A different take on AI chat: ask several models at once.",
    lede: `${K} is not a clone of any one chatbot. It sits above several models, compares their answers, and shows you the disagreements. Start free, no card needed.`,
    examples: ["Draft a polite email asking my landlord to fix the heating", "Explain compound interest simply", "Plan a 3-day trip to Lisbon"],
    sections: [
      {
        h2: "What's different",
        bullets: [
          "More than one model per question, chosen by the question, not by you.",
          "The agreement and the disagreements are shown, not hidden behind one confident voice.",
          "Study mode on every plan, and a slide deck maker on Plus and Pro.",
          "A free plan with no card, running on free open models.",
        ],
      },
      {
        h2: "What stays the same",
        p: [
          "You type a question and read an answer. Keplar handles everyday writing, explaining, planning and brainstorming the way you'd expect from an AI chat.",
        ],
      },
      {
        h2: "Who it suits",
        p: [
          "People who want a second opinion built in, and who care more about knowing where an answer is shaky than about a single model's voice. If you only need quick drafts, any chatbot will do.",
        ],
      },
      limits,
    ],
    faq: [
      { q: "Is Keplar a replacement for ChatGPT?", a: "It's an alternative approach rather than a one-for-one replacement. Some features of other products, such as voice or custom assistants, are not part of Keplar today." },
      { q: "Can I see which models answered?", a: "Yes. Open Models consulted under an answer. Which models run depends on your plan and the question. Free uses free open models only." },
      { q: "How much does it cost?", a: "Free is $0. Lite is $20 a month, Plus is $45 a month and Pro is $99 a month. Business is custom." },
    ],
    related: ["/ai-answer-engine", "/compare-ai-models", "/compare", "/pricing"],
  },
  {
    slug: "ai-study-tool",
    path: "/ai-study-tool",
    metaTitle: "AI study tool: PDF to flashcards, quizzes and a plan",
    metaDescription: `Upload a text-based PDF or paste notes and get an outline, summary, flashcards with spaced review, quizzes and a study plan. Free on every plan.`,
    ogTitle: "Turn a PDF into a study guide",
    label: "AI study tool",
    h1: "Turn your notes or a PDF into a study set.",
    lede: `Study mode is on every plan, Free included. Add a text-based PDF or paste your notes, and ${K} builds the materials, then keeps track of what you know.`,
    examples: ["Explain the Krebs cycle like I'm new to biology", "Quiz me on the causes of World War I", "Make a study plan for a chemistry exam in two weeks"],
    sections: [
      {
        h2: "What Study mode builds",
        bullets: [
          "An outline and a plain-English summary of your material.",
          "Flashcards with spaced review, so cards you miss come back sooner.",
          "Quizzes with answers, and progress you can see by topic.",
          "A day-by-day plan when you give it an exam date.",
          "Answers to your questions about the material, with page references back to your own text.",
        ],
      },
      {
        h2: "How it works, step by step",
        bullets: [
          "Sign in and open Study. Sets are saved to your account, on every plan including Free.",
          "Upload a PDF whose text you can select, or paste your notes. Scanned PDFs cannot be read yet, so paste the text instead.",
          "Keplar reads only your material and builds the set: outline, summary, flashcards, quizzes and a plan.",
          "Set your exam date to spread the material across the days you have.",
          "Review flashcards with spaced repetition. A card you miss comes back sooner; a card you know waits longer.",
          "Take a quiz before you feel ready, then study what you missed.",
          "Ask questions in the Ask tab. If something is not in your material, Keplar says so instead of answering from general knowledge.",
        ],
      },
      {
        h2: "Why your own material, and only that",
        p: [
          `A study aid that answers from the whole internet is a different tool. Study mode is built around retrieval practice on your course: every card, question and answer is tied to a page of what you uploaded, text inside the document is treated as material to read and never as instructions, and the honest answer to a question your notes do not cover is "that is not in your material". That is what makes it safe to trust for an exam set by a teacher who wrote those notes.`,
        ],
      },
      {
        h2: "Plans and limits",
        p: [
          `Study mode is on every plan. Free runs on free open models with smaller limits on document length and builds per day, and the hosts of free models may log prompts. ${brand.plans.lite} (${price("lite")} a month), ${brand.plans.plus} (${price("plus")} a month) and ${brand.plans.pro} (${price("pro")} a month) use stronger models and allow longer documents and more sets. The exact limits are on the plans page and in the docs.`,
        ],
      },
      {
        h2: "Your files",
        p: ["The original PDF is not kept. Keplar stores the extracted text, the study set and your progress under your account, and deleting a set removes all three."],
      },
      {
        h2: "Habits that work",
        bullets: [
          "Quiz yourself early, before you feel ready. Retrieval beats rereading.",
          "Space reviews over days rather than one long session; the flashcard scheduler does this for you.",
          "Explain a topic in your own words, then ask Keplar what you missed.",
          "Skim every generated card against the source once. A wrong card is worse than none.",
          "Follow your school's rules on AI assistance.",
        ],
      },
      {
        h2: "Honest about limits",
        p: [
          "Generated flashcards and quizzes can contain mistakes, so check anything important against your course material. Scanned PDFs and images of text are not read. Study mode does not browse the web and does not grade your essays.",
        ],
      },
    ],
    faq: [
      { q: "Is the AI study tool free?", a: "Yes. Study mode is on every plan, including Free, on free open models with smaller limits. Lite, Plus and Pro use stronger models and allow longer documents." },
      { q: "Can it make flashcards from a PDF?", a: "Yes, from a PDF whose text you can select. It builds flashcards with spaced review, quizzes and a summary from that text only." },
      { q: "Does it make a study plan?", a: "Yes. Give it your exam date and it spreads the material across the days you have, with reviews built in. The free study plan generator on this site does a simpler version with no account." },
      { q: "Can I upload a scanned PDF?", a: "Not yet. Study mode reads text-based PDFs, or you can paste your notes." },
      { q: "Is my PDF stored?", a: "The original file is not kept. The extracted text, the study set and your progress are stored under your account until you delete them." },
      { q: "Can it answer questions about my notes?", a: "Yes. In the Ask tab, answers come only from your material, with page references, and Keplar says so when the answer is not in it." },
    ],
    related: ["/for-students", "/guides/study-from-a-pdf", "/ai-slideshow-maker", "/pricing"],
  },
  {
    slug: "ai-slideshow-maker",
    path: "/ai-slideshow-maker",
    metaTitle: "AI slideshow maker with PowerPoint and PDF export",
    metaDescription: `Give ${K} a topic, an outline or your notes and get a slide deck with titles, bullets and speaker notes. Edit, present and export to PowerPoint or PDF. Plus and Pro.`,
    ogTitle: "AI slideshow maker",
    label: "AI slideshow maker",
    h1: "Turn a topic or your notes into a slide deck.",
    lede: `The slideshow creator writes titles, bullet points, speaker notes and an image idea for each slide. Edit it, present it full screen, and export to PowerPoint or PDF. Included in Keplar Plus and Pro.`,
    examples: ["A 10-slide deck on how solar panels work", "Pitch deck outline for a dog-walking app", "Quarterly update from these bullet points"],
    sections: [
      {
        h2: "What you get",
        bullets: [
          "A full deck from a topic, an outline, or your own notes, with a title, bullet points and speaker notes on every slide.",
          "An image idea per slide, written as text you can act on.",
          "An editor to change any slide, and a full-screen present mode to rehearse.",
          "Export to PowerPoint (.pptx) and PDF.",
        ],
      },
      {
        h2: "How it works, step by step",
        bullets: [
          "Open Slides in the app and enter a topic, an outline, or paste your notes or source text.",
          "Choose how many slides you want and generate the deck.",
          "Edit the titles, bullets and speaker notes. Make every title say the point of the slide, not its subject.",
          "Present the deck full screen to rehearse, then export to PowerPoint or PDF.",
        ],
      },
      {
        h2: "What makes a deck good",
        bullets: [
          "Start from the one-sentence point of the whole talk, then work backwards to the slides that earn it.",
          "Group your notes into three to five sections; a deck with twelve equal sections has no shape.",
          "Cut anything a slide needs a paragraph to explain; move the detail into the speaker notes.",
          "Fix facts yourself. A deck is only as accurate as the sources you give it.",
        ],
      },
      {
        h2: "Image ideas, not images",
        p: ["Each slide gets a written image idea. The exported deck shows a text placeholder where a picture would go, so you can add your own, or ask Keplar in chat to draw one and place it yourself."],
      },
      {
        h2: "Plans",
        p: [`The slideshow creator is part of ${brand.plans.plus} (${price("plus")} a month) and ${brand.plans.pro} (${price("pro")} a month), with larger limits on Pro. It is not on Free or ${brand.plans.lite}; the free presentation outline generator on this site plans a talk slide by slide with no account.`],
      },
      {
        h2: "Your data",
        p: ["Your topic, outline and source text are sent to the model that writes the deck. The finished deck is stored in your account until you delete it. The source file is not kept."],
      },
      {
        h2: "Honest about limits",
        p: ["Decks are drafts. Check facts, names and numbers before you present, since the writing model can be wrong. Slides does not pull images, charts or data from the web."],
      },
    ],
    faq: [
      { q: "Is the AI slideshow maker free?", a: `No. It is part of ${brand.plans.plus} and ${brand.plans.pro}. The free presentation outline generator on this site writes a slide-by-slide outline with speaker notes and needs no account.` },
      { q: "Can I make a presentation from my notes?", a: "Yes. Paste your notes or an outline and Keplar writes the deck from them, with speaker notes on every slide." },
      { q: "Can I open the deck in PowerPoint or Google Slides?", a: "Export to .pptx opens in PowerPoint, and Google Slides can import .pptx files. PDF export works everywhere." },
      { q: "Does it add images?", a: "Not yet. Each slide includes an image idea, and the export shows a text placeholder where the picture would go." },
      { q: "How many slides can a deck have?", a: "You choose the count when you generate; the maximum depends on your plan and is shown in the app." },
    ],
    related: ["/for-founders", "/guides/slide-deck-from-notes", "/ai-study-tool", "/pricing"],
  },
  {
    slug: "ai-fact-check",
    path: "/ai-fact-check",
    metaTitle: "Check an AI answer against other AI models",
    metaDescription: `AI models make things up. ${K} asks several and shows where they disagree, which tells you what to double-check. It does not guarantee accuracy.`,
    ogTitle: "Second opinions for AI answers",
    label: "Fact-checking AI",
    h1: "Get a second opinion on an AI answer.",
    lede: `AI can state a wrong thing confidently. ${K} asks several models and shows where they split, so you know which parts of an answer to verify yourself.`,
    examples: ["When was the Treaty of Westphalia signed and what did it change?", "Is it safe to take ibuprofen with paracetamol?", "Summarize the main arguments for and against a universal basic income"],
    sections: [
      {
        h2: "What disagreement tells you",
        p: [
          "If several independent models give the same answer, that's some comfort. If they disagree, that part is a candidate for checking. It's a pointer for your own checking, not a verdict.",
        ],
      },
      {
        h2: "What Keplar doesn't do",
        bullets: [
          "It doesn't guarantee an answer is accurate.",
          "It doesn't check claims against the web or primary sources. Sources shown are the ones the models cite.",
          "It can't tell you the minority is wrong: sometimes it is right.",
        ],
      },
      {
        h2: "A sensible routine",
        p: [
          "Ask, read the disagreements, then verify the points that matter in a primary source such as a textbook, an official guidance page or a professional.",
        ],
      },
      limits,
    ],
    faq: [
      { q: "Does Keplar stop hallucinations?", a: "No. It can reduce the chance you miss one, by showing where models disagree, but any model can be wrong, and models can agree on a wrong answer." },
      { q: "Does it cite sources?", a: "It shows sources the models cite. Keplar hasn't checked those sources, and it doesn't browse the web yet." },
      { q: "Can I rely on it for medical or legal advice?", a: "No. Answers are general information, not professional advice." },
    ],
    related: ["/blogs/how-to-check-an-ai-answer", "/blogs/why-ai-models-disagree", "/ai-answer-engine", "/compare-ai-models"],
  },
  {
    slug: "for-students",
    path: "/for-students",
    metaTitle: "Keplar for students: homework help and study sets",
    metaDescription: `Understand a topic from several angles, then turn your notes or a PDF into flashcards, quizzes and a plan. Free to start.`,
    ogTitle: "Keplar for students",
    label: "For students",
    h1: "Understand it, then study it.",
    lede: `Ask a question and see where several models agree. Then drop in your notes or a PDF and ${K} builds flashcards, quizzes and a plan. Free plan, no card.`,
    examples: ["Explain supply and demand with an example", "What caused the French Revolution?", "Help me outline an essay on climate policy"],
    sections: [
      {
        h2: "For understanding",
        p: ["Ask for an explanation and read the disagreements. When models split, it's a good prompt for a follow-up question or a question to ask your teacher."],
      },
      {
        h2: "For studying",
        bullets: ["Flashcards with spaced review.", "Quizzes and progress by topic.", "A day-by-day plan if you set an exam date."],
      },
      {
        h2: "For presenting",
        p: ["On Plus and Pro, the slideshow creator turns an outline or notes into a deck you can edit and export."],
      },
      {
        h2: "Use it honestly",
        p: ["Follow your school's rules on AI. Keplar can be wrong, so check facts against your course material and don't submit generated text as your own work where that isn't allowed."],
      },
    ],
    faq: [
      { q: "Is there a student discount?", a: "Not currently. The Free plan includes Study mode." },
      { q: "Will it write my essay?", a: "It can help you outline and explain. Whether to use generated text is up to you and your school's rules." },
    ],
    related: ["/ai-study-tool", "/guides/study-from-a-pdf", "/ai-slideshow-maker", "/for-researchers", "/for-writers", "/for-you"],
  },
  {
    slug: "for-writers",
    path: "/for-writers",
    metaTitle: "Keplar for writers: honest feedback on your draft",
    metaDescription: `Paste a draft and get critique from several AI models: vague lines, weak arguments, a list of claims to verify. You keep your voice. Free to start.`,
    ogTitle: "Keplar for writers",
    label: "For writers",
    h1: "A patient reader for your draft, not a ghostwriter.",
    lede: `Paste a draft and ask for one kind of feedback at a time. Several models critique it, and you see where they raised the same problem and where only one did. Free plan, no card.`,
    examples: ["List every sentence in this paragraph that is vague or could mean two things", "Give the three strongest objections to this argument", "Shorten this by 20% without losing any claim"],
    sections: [
      {
        h2: "What to ask for",
        bullets: [
          "Clarity: which sentences are vague or could be read two ways.",
          "Length: a tighter version that keeps every claim.",
          "Structure: what the main point is and which paragraphs do not serve it.",
          "Argument: the strongest objections a skeptical reader would raise.",
          "Facts: a list of every factual claim in the draft, so you can verify each one yourself.",
        ],
      },
      {
        h2: "Why several models help with feedback",
        p: [
          "One model's feedback reflects that model's tastes. When several models flag the same weakness, it is probably real. When only one raises an objection, the Disagreements section shows it, so you can decide whether it matters for your reader.",
        ],
      },
      {
        h2: "Keep the voice yours",
        p: ["Write the draft yourself, ask for feedback, then fix the issues in your own words. Keplar can rewrite a passage if you ask, but the most reliable use is as a reader."],
      },
      limits,
    ],
    faq: [
      { q: "Will Keplar write my article for me?", a: "It can draft or rewrite a passage if you ask. The page is about the other use: critique that leaves the writing and the voice with you. Follow any rules your publisher, school or client sets on AI-generated text." },
      { q: "Does it check my facts?", a: "No. It can list the factual claims in your draft so you can check each one against a reliable source. It does not look things up on the web yet, and models can agree and still be wrong." },
      { q: "Is my draft private?", a: "Free-plan requests go to free open models whose hosts may log prompts, so do not paste unpublished work you must keep confidential. See the privacy page and the Free plan privacy note in the docs." },
    ],
    related: ["/for-students", "/for-founders", "/ai-fact-check", "/blogs/why-ai-models-disagree"],
  },
  {
    slug: "for-founders",
    path: "/for-founders",
    metaTitle: "Keplar for founders: decisions, decks and drafts",
    metaDescription: `Pressure-test decisions with several AI models, draft investor and customer updates, and turn notes into a slide deck. Free to start.`,
    ogTitle: "Keplar for founders",
    label: "For founders",
    h1: "A second opinion for the decisions you make alone.",
    lede: `Ask a strategy or pricing question and see where several models agree and split. Turn notes into a deck. Add business tools later if you need them.`,
    examples: ["What are the risks of pricing my SaaS at $19/month?", "Outline a pitch deck for a B2B scheduling tool", "Draft a cold email to a potential design partner"],
    sections: [
      {
        h2: "Pressure-test a decision",
        p: ["Models disagreeing about a trade-off is useful information. It shows you the assumption to examine before you commit."],
      },
      {
        h2: "Draft and present",
        bullets: ["Turn rough notes into a slide deck with speaker notes (Plus and Pro).", "Draft emails, updates and FAQs.", "Create a simple site or page from the same thread (Plus and Pro)."],
      },
      {
        h2: "When you run the business here too",
        p: [`${brand.name} for business is optional and adds tools around your work, with spend caps and approval gates on anything autonomous.`],
      },
      limits,
    ],
    faq: [
      { q: "Is it good for market research?", a: "It can help you think and structure. It doesn't browse the web yet, so check market figures and competitor facts against primary sources." },
      { q: "Can my team use it?", a: "Individual plans are per person. For teams and business tools, use the Inquire form." },
    ],
    related: ["/ai-slideshow-maker", "/for-small-business", "/for-developers", "/pricing"],
  },
  {
    slug: "for-researchers",
    path: "/for-researchers",
    metaTitle: "Keplar for researchers: compare models, find disagreement",
    metaDescription: `Use several AI models to explore a topic, see where they disagree, and decide what to verify in primary sources. Not a substitute for a literature search.`,
    ogTitle: "Keplar for researchers",
    label: "For researchers",
    h1: "Explore a topic, then go to the sources.",
    lede: `${K} is for the early, fuzzy part of research: getting oriented, spotting where accounts conflict, and deciding what to verify. It isn't a literature search.`,
    examples: ["Summarize the main schools of thought on behavioral economics", "What are common critiques of randomized trials in education?", "Help me draft interview questions for a usability study"],
    sections: [
      {
        h2: "Where it helps",
        bullets: ["Getting oriented in an unfamiliar field.", "Seeing where models disagree, which can point to a contested area.", "Drafting questions, outlines and summaries of your own material in Study mode."],
      },
      {
        h2: "Where it doesn't",
        p: ["Keplar doesn't search journals or the web. Citations in an answer are the ones the models cite, and models can invent references. Verify every reference you plan to use."],
      },
      limits,
    ],
    faq: [
      { q: "Can I trust the citations?", a: "Check them. Keplar hasn't verified the sources models cite, and models can produce references that don't exist." },
      { q: "Can I upload papers?", a: "Study mode reads text-based PDFs and lets you ask questions of the text, with citations back to the passage." },
    ],
    related: ["/ai-fact-check", "/blogs/how-to-check-an-ai-answer", "/ai-study-tool", "/compare-ai-models"],
  },
  {
    slug: "for-small-business",
    path: "/for-small-business",
    metaTitle: "Keplar for small business: AI help you can inspect",
    metaDescription: `Draft customer emails, plan pricing and promotions, and make decks and simple sites, with the disagreements between AI models shown. Free to start.`,
    ogTitle: "Keplar for small business",
    label: "For small business",
    h1: "Everyday business questions, with a second opinion built in.",
    lede: `Start with questions and drafts on the Free plan. Add Plus or Pro for stronger models, decks and sites. Business tools are optional.`,
    examples: ["Write a friendly late-payment reminder to a customer", "How should I price a new service?", "Plan a seasonal promotion for a bakery"],
    sections: [
      {
        h2: "Day-to-day help",
        bullets: ["Customer emails, listings and policies.", "Pricing and promotion ideas with trade-offs shown.", "Decks and simple sites from your notes (Plus and Pro)."],
      },
      {
        h2: "When you want more",
        p: ["Keplar for business adds commerce, a CRM and agents that can keep working, with hard spend caps, approval gates and audit logs. It's optional, and priced through our sales team."],
      },
      limits,
    ],
    faq: [
      { q: "Can Keplar send emails for me?", a: "On the individual plans it drafts text for you to send. Autonomous actions are part of the optional Business plan, with approval gates." },
      { q: "Is it right for legal or tax questions?", a: "No. Answers are general information. For legal and tax decisions, talk to a professional." },
    ],
    related: ["/for-founders", "/for-writers", "/ai-slideshow-maker", "/pricing"],
  },
  {
    slug: "roblox-studio-ai",
    path: "/roblox-studio-ai",
    metaTitle: "Roblox Studio AI: build games inside Studio",
    metaDescription: `The ${K} desktop app connects to Roblox Studio and builds with you: maps, UI, flipbook effects and Luau scripts, plus overnight Roblox Cloud jobs.`,
    ogTitle: "An AI co-builder for Roblox Studio",
    label: "Keplar Studio · Roblox Studio",
    h1: "Build Roblox games with an AI inside Studio.",
    lede: `Keplar Studio, the co-builder in the ${K} desktop app, connects to Roblox Studio through Studio's own tools. It looks at your place, writes a plan, and builds it step by step while you watch and approve.`,
    examples: ["A lobby with a spawn area, a shop stall and a leaderboard", "A round-based obby with checkpoints and a timer", "A health bar UI that matches this screenshot"],
    sections: [
      {
        h2: "What it builds",
        bullets: [
          "Maps, buildings and lighting, organized in named folders.",
          "UI and effects, matched to screenshots or a clip you attach.",
          "Working Luau scripts. It reads the output log for script errors and fixes them.",
        ],
      },
      {
        h2: "Effects that look right",
        p: ["Flipbook particles come from valid 1024 by 1024 sheets in the grid their creator states, played once for bursts or looped at a steady rate. Glows are self-lit with bright cores, smoke is lit by the scene and sits behind them, and layered effects are kept light on performance. Textures come from vetted packs first, then a filtered Creator Store search; uploading anything to your account asks first."],
      },
      {
        h2: "Roblox Cloud: work while you sleep",
        p: ["Give it a goal, a credit budget and a time limit of up to 12 hours, then close your computer. It works on your game's scripts on Keplar's servers, checks every edit with Luau's own analyzer, and leaves a list of changes you review and apply in Studio, each as one Undo step. It only touches scripts and can't play-test, so test what it made before you publish."],
      },
      {
        h2: "One studio model",
        p: ["Studio mode and Roblox Cloud run on one model only. If it can't be reached, the build pauses and tells you, instead of quietly switching to another model."],
      },
      {
        h2: "You play-test it",
        p: ["When a step is done it gives you a short \"How to test it\" list. The Play test button starts and stops play mode in Studio, so testing costs no AI usage; you tell it what to change."],
      },
      {
        h2: "You stay in control",
        p: ["Reads run on their own. Changes wait for your approval unless you turn on auto-approve for safe changes. Deleting, publishing, data stores and uploading images to your Roblox account always ask first."],
      },
      {
        h2: "Pick up where you left off",
        p: ["Each game has its own saved chat, plan and progress, synced to your Keplar account, so you can close Studio and come back later, even on another computer. A floating overlay keeps the chat next to Studio."],
      },
      {
        h2: "Honest about limits",
        p: ["It's in beta. It needs Roblox Studio and the Keplar desktop app on the same computer, and it can make mistakes, so play-test before you publish. It doesn't publish your game for you."],
      },
    ],
    faq: [
      { q: "Which plans include it?", a: "Keplar Lite, Plus and Pro, in the desktop app for Windows, macOS and Linux." },
      { q: "Does it work in the browser?", a: "No. It needs the desktop app running on the same computer as Roblox Studio." },
      { q: "Can it upload images to my Roblox account?", a: "Yes, and it always asks first." },
      { q: "Can it keep working when Studio is closed?", a: "Yes, with Roblox Cloud: it edits your game's scripts on Keplar's servers within the budget and time limit you set, and you apply the changes in Studio later. It can't play-test while you're away." },
      { q: "Which model does it use?", a: "One model, every time. If that model is unavailable the build pauses rather than switching." },
    ],
    related: ["/blender-ai", "/download", "/docs/studio/roblox-studio-mode", "/docs/studio/roblox-cloud", "/docs/studio/effects-and-textures", "/pricing"],
  },
  {
    slug: "blender-ai",
    path: "/blender-ai",
    metaTitle: "Blender AI: models and PBR textures from a description",
    metaDescription: `The ${K} desktop app connects to Blender 4.2+ and models, textures and lights with you, exports FBX, GLB or OBJ, and renders scenes in the cloud.`,
    ogTitle: "An AI co-builder for Blender",
    label: "Keplar Studio · Blender",
    h1: "Model and texture in Blender by describing what you want.",
    lede: `Keplar Studio, the co-builder in the ${K} desktop app (0.1.8 or newer), connects to Blender through a small Keplar add-on. It reads your scene, plans, and builds models with real textures while you approve each change.`,
    examples: ["A low-poly wooden crate with worn edges", "A stone well with a rope and bucket, textured", "Light this scene with an outdoor HDRI"],
    sections: [
      {
        h2: "What it makes",
        bullets: [
          "Models with clean topology and modifiers at real-world scale, every object named and grouped in a collection.",
          "Real PBR textures from Poly Haven (free, CC0): color, roughness, normal, ambient occlusion and displacement, unwrapping meshes that have no UVs.",
          "Procedural node materials for stylized looks, HDRI lighting and Poly Haven model import.",
          "Exports to FBX (imports into Roblox Studio), GLB or OBJ.",
        ],
      },
      {
        h2: "Safe by default",
        p: ["The add-on only listens on your computer behind a secret key. Keplar's Python may not touch files, the network or other apps, or save or close Blender. Deleting always asks, and every change waits for approval unless you turn on auto-approve."],
      },
      {
        h2: "Render in the cloud",
        p: ["Blender Cloud renders the open scene on a render machine of Keplar's own, so you can close Blender or turn your computer off. Keplar packs the scene with its textures, renders the frames with Blender 5.2 (Cycles, EEVEE or Workbench, on CPUs), can join them into an MP4, and keeps them three days for you to download. It is charged by machine time and stops at your budget or time limit."],
      },
      {
        h2: "Cheap to run",
        p: ["A short cached prompt, text scene summaries instead of screenshots, and small thinking budgets keep each step's AI usage low. Each .blend file's chat is saved and synced to your account."],
      },
      {
        h2: "Honest about limits",
        p: ["It's in beta. It needs Blender 4.2 or newer and the Keplar desktop app on the same computer. Results are a starting point; check proportions and topology before you ship an asset."],
      },
    ],
    faq: [
      { q: "Which plans include it?", a: "Keplar Lite, Plus and Pro, in the desktop app for Windows, macOS and Linux." },
      { q: "Do I install anything in Blender?", a: "The desktop app installs and enables the small Keplar add-on for you." },
      { q: "Are the textures free to use?", a: "They come from Poly Haven, whose assets are CC0, free for any use." },
      { q: "Can Keplar render my scene while my computer is off?", a: "Yes, with Blender Cloud rendering in desktop app 0.1.10 or newer. The scene uploads once, renders on Keplar's servers, and the frames wait there for three days until you download them." },
    ],
    related: ["/roblox-studio-ai", "/download", "/docs/studio/blender-mode", "/docs/studio/blender-cloud-rendering", "/pricing"],
  },
  /* ─────────────── Cluster hubs (src/lib/seo/clusters.ts), added 2026-10-19 ─────────────── */
  {
    slug: "ai-research-assistant",
    path: "/ai-research-assistant",
    metaTitle: "AI research assistant: several models, one answer",
    metaDescription: `Research a question with several AI models at once. ${K} compares their answers, flags disagreements, shows the sources they cite and writes one report.`,
    ogTitle: "AI research, several models at once",
    label: "AI research assistant",
    h1: "An AI research assistant that shows its disagreements.",
    lede: `Send a research question to the models it needs. ${K} compares what they say claim by claim, flags where they split, and writes one answer you can take apart section by section.`,
    examples: ["What does the evidence say about intermittent fasting and weight loss?", "Compare the main approaches to carbon capture and where each is used", "Summarize the arguments for and against a four-day work week"],
    sections: [
      {
        h2: "How Keplar researches a question",
        p: [`A research question is rarely answered well by one model. ${O} reads the question, sizes it up, and sends it to the models it needs, weighing quality, reliability, speed and cost. Each model answers on its own, so no model sees another's reply.`],
        bullets: [
          "The answers are compared claim by claim, not just read side by side.",
          "Where the models split, the split is investigated instead of being averaged away.",
          "A verification review weighs the evidence and reasoning behind each position, because the minority can be right.",
          "One written answer comes back, with six sections you can open: Consensus, Models consulted, Sources, Disagreements, Verification and a Reasoning summary.",
        ],
      },
      {
        h2: "Reasoning you can inspect",
        p: [
          "The Reasoning summary explains how the answer went the way it did. Next to the composer, a thoroughness setting changes how many models are consulted: Automatic lets Keplar decide, Fastest uses fewer models and no judge, Balanced uses the standard panel, and Most thorough adds a model even for simple questions.",
          "Panels run from one model for a simple question up to six for a hard one. The Free plan caps a panel at three models. Ask the same question on Fastest and then on Most thorough: if the answers differ, you have learned that the question is sensitive to who you ask.",
        ],
      },
      {
        h2: "Deep Research for the questions that matter",
        p: [
          "Deep Research is a mode for longer, multi-step investigation. Switch it on in the composer and the question gets a wide panel, a verifier and a judge, and the result is a long, structured report rather than a short reply. It is part of Plus, Pro and Business.",
          "A run is one of the most expensive things you can do in Keplar. A typical run is estimated at about 1,200 credits, and the composer shows how many runs your plan has left before you send. Use it for decisions that are expensive to reverse and for first-pass maps of a field you will then verify yourself. For a quick lookup, a rewrite or a short calculation, an ordinary question is better.",
        ],
      },
      {
        h2: "Sources: a place to start, not proof",
        p: [
          `The Sources section lists the references the models cite. In the browser, ${K} has not opened or checked them, so treat each one as something to open, not as evidence. The Disagreements section tells you which parts of the answer are worth that effort.`,
          `In the ${K} desktop app, Live Research (beta) searches the web and reads pages on your computer, then cites each page it used and checks the citations. For anything that depends on recent facts, that is the mode to use.`,
        ],
      },
      limits,
    ],
    faq: [
      { q: "Is Deep Research free?", a: "No. Deep Research is part of Plus, Pro and Business. On Free and Lite you can still choose Most thorough for a wider panel of models on an ordinary question." },
      { q: "Does Keplar search the web for a research question?", a: "Not in the browser: answers draw on what the models know, and the sources shown are the ones the models cite. The desktop app's Live Research (beta) does search the web, read pages and cite what it read." },
      { q: "How many models answer a research question?", a: "Between one and six, chosen by how demanding the question is and your thoroughness setting. The Free plan caps a panel at three models." },
      { q: "Can I trust the sources in an answer?", a: "Open them first. They are cited by the models and not checked by Keplar in the browser. A citation can be wrong or invented, so a source is a place to look, not proof." },
    ],
    related: ["/ai-answer-engine", "/ai-fact-check", "/docs/using-keplar/deep-research", "/docs/using-keplar/thoroughness-modes", "/blogs/how-to-check-an-ai-answer", "/for-researchers"],
  },
  {
    slug: "ai-image-generator",
    path: "/ai-image-generator",
    metaTitle: "AI image generator in chat: describe it, get it",
    metaDescription: `Generate images from a description in ${K} chat on Plus, Pro and Business. See the cost before a large job, guide the style with a reference, download the original.`,
    ogTitle: "AI image generation in chat",
    label: "AI image generator",
    h1: "Describe the picture. Keplar draws it in the chat.",
    lede: `Ask ${K} to draw something the way you would ask a person: subject, setting, style, light. The picture appears in the thread, where you can download the original, regenerate it or describe an edit.`,
    examples: ["Draw a matte ceramic mug on a pale oak table, soft window light", "Make an image of a lighthouse at dawn in a woodcut style", "Draw a minimal logo mark for a bakery called Small Hours, no text"],
    sections: [
      {
        h2: "How it works",
        bullets: [
          "In chat, write a clear request to draw a picture: \"draw a …\" or \"make an image of …\". Image generation is not a Create mode; with Create switched on, the request is answered as a normal message.",
          "Describe the image: subject, setting, style, lighting, composition. Attach a picture to use it as a reference for style or subject.",
          "A small picture starts on its own. A larger one, or one that uses a reference, shows its cost first and waits for you to confirm.",
          "The picture appears in the thread. Download the original from there, regenerate it, ask for a variation, or describe an edit.",
        ],
      },
      {
        h2: "Prompts that work",
        p: ["Say what to draw, not what to avoid. Name the subject, the setting, the material and the light, and keep lettering out of the image, because generated text is often wrong. A reference image, where the model supports one, guides the look more reliably than adjectives do. You confirm you have the rights to a reference before it is used."],
        bullets: ["A matte ceramic coffee mug on a pale oak table, soft window light from the left, shallow depth of field, calm and minimal, no text.", "A small stone well with a rope and bucket in a meadow at golden hour, photographic, 35 mm.", "A flat vector illustration of a paper plane over a city skyline, two colors, no gradients."],
      },
      {
        h2: "Which plans include it",
        p: [
          "Image generation is part of Plus, Pro and Business. On Free and Lite you can attach a picture and ask about it (a chart, a receipt, a whiteboard), but you cannot generate one.",
          "Generation is metered in credits. The cost of a large job is shown before it starts, and a failed, refused, blocked or timed-out job costs nothing. A repeated request with the same idempotency key returns the same job and never charges twice.",
        ],
      },
      {
        h2: "What is refused",
        p: ["Prompts are checked on the server, by a moderation model, and again on the finished image. Sexual content, minors, deepfakes and face swaps, graphic violence and real-person likeness (named people, celebrities, public roles, \"looks like\" someone) are refused. The first check is a heuristic and can refuse an innocent phrase that resembles a name; describe a fictional person or scene instead. If the moderation service cannot be reached, the job fails and nothing is charged."],
      },
      {
        h2: "Your files",
        p: [`The image is stored in your account and served only to you. Downloads are the original file, not a recompressed copy. Image ideas in the slideshow creator are text placeholders: ask in chat to draw a picture, then add it to the deck yourself.`],
      },
    ],
    faq: [
      { q: "Is the AI image generator free?", a: "No. Generating pictures is part of Plus, Pro and Business. Free and Lite can attach an image and ask questions about it on vision models." },
      { q: "How much does an image cost?", a: "It depends on the job. A small picture starts on its own; a larger one, or one that uses a reference, shows its credit cost first and waits for you to confirm. Failed or refused jobs cost nothing." },
      { q: "Can I use my own photo as a reference?", a: "Yes, where the model supports references. Attach it with your request to guide the style or the subject. You confirm that you have the rights to it." },
      { q: "Can Keplar draw a real person?", a: "No. Real-person likeness, face swaps and deepfakes are refused, along with sexual content, minors and graphic violence." },
    ],
    related: ["/docs/create/generate-images", "/blogs/best-ai-for-image-generation", "/docs/using-keplar/attachments-images-video", "/ai-slideshow-maker", "/pricing"],
  },
  {
    slug: "ai-video-generator",
    path: "/ai-video-generator",
    metaTitle: "AI video generator in chat (beta): short clips",
    metaDescription: `Ask ${K} for a short clip on Pro and Business. Pick 16:9 or 9:16 and a length the model allows, see the cost first, and download a clip ${K} has checked.`,
    ogTitle: "AI video generation, in beta",
    label: "AI video generator",
    h1: "Ask for a short clip. Keplar makes it in the chat.",
    lede: "Video generation is in beta on Pro and Business. Describe the clip, choose landscape or vertical and a length, confirm the cost, and the clip plays in the thread with a download.",
    examples: ["Make a 6-second video of a fox in falling snow, vertical", "Make a widescreen clip of waves at a rocky shore at sunset", "Make a short clip of a paper plane gliding through an office"],
    sections: [
      {
        h2: "How it works",
        bullets: [
          "Ask for a clip in an ordinary chat, with no mode selected: \"make a video of a fox in snow\". A question about video is answered as a normal message.",
          "If you did not say the shape or the length, a card asks for them. Shape is 16:9 (landscape) or 9:16 (vertical); length is only the durations the model and your plan both allow.",
          "Words in the message fill the card in: \"vertical\", \"portrait\", \"TikTok\" or \"Reels\" mean 9:16; \"landscape\", \"widescreen\" or \"YouTube\" mean 16:9; \"8 seconds\" is used when that length is allowed.",
          "A large job shows its credit cost and waits for a second confirmation. Credits are taken only when the clip is delivered.",
          `The clip plays in the thread with a download. ${K} checks the file's dimensions and length against what you asked for and says so if they differ.`,
        ],
      },
      {
        h2: "Shapes, lengths and plans",
        p: [
          "Pro clips go up to 8 seconds and Business clips up to 10. The card offers only the lengths the current text-to-video model documents, cut by your plan's maximum, and the usual 5-hour and weekly usage windows still apply.",
          "Free, Lite and Plus cannot start a clip; they see a short note and a link to the plans. Everyone can attach a video of their own and ask about it: keyframes are sampled in your browser, and the clip itself is never uploaded.",
        ],
      },
      {
        h2: "Honest about results",
        p: ["Video models vary a lot in quality from prompt to prompt. Keplar shows the cost and the options, checks the file it gets back, and does not promise a particular result. Because the feature is in beta, play a downloaded clip where you intend to use it before building a project around it. Failed or canceled clips cost nothing."],
      },
      {
        h2: "Safety",
        p: ["The same moderation as images applies: no real-person likeness, no deepfakes or face swaps, no sexual content, minors or graphic violence. Prompts are checked before a job starts."],
      },
    ],
    faq: [
      { q: "Is the AI video generator free?", a: "No. Video generation is in beta on Pro and Business. Free, Lite and Plus can attach a video and ask questions about it, but cannot generate one." },
      { q: "How long can a clip be?", a: "Up to 8 seconds on Pro and 10 seconds on Business, and only the lengths the current model supports. The card shows the choices your plan allows." },
      { q: "Does Keplar upload the videos I attach?", a: "No. When you attach a video to a question, keyframes are sampled in your browser and sent; the clip itself stays on your device." },
      { q: "What if the clip is not what I asked for?", a: "Keplar compares the file's shape and length with your request and tells you when they differ. Quality varies by prompt, so adjust the description and try again; a failed clip costs nothing." },
    ],
    related: ["/docs/create/generate-video", "/ai-image-generator", "/docs/using-keplar/attachments-images-video", "/docs/billing-plans/usage-windows", "/pricing"],
  },
  {
    slug: "ai-writing-assistant",
    path: "/ai-writing-assistant",
    metaTitle: "AI writing assistant: edit, tighten, summarize",
    metaDescription: `Paste a draft and ask ${K} to tighten it, change the tone or find the vague sentences. Summarize documents, keep your meaning, and see where the models differ.`,
    ogTitle: "Edit and summarize with several models",
    label: "AI writing assistant",
    h1: "Edit, tighten and summarize, without losing what you meant.",
    lede: `Give ${K} your text and one clear instruction. It asks the models the job needs, compares their edits, and gives you one result with a note on anything the models handled differently.`,
    examples: ["Shorten this paragraph by a fifth without dropping any claim: [paste]", "Rewrite this email for a client in a warm, direct tone", "Summarize this report in five bullet points, one per section"],
    sections: [
      {
        h2: "What it does well",
        bullets: [
          "Tighten a draft without removing a claim, a number or a name, and list what it was tempted to cut.",
          "Change only the tone: warmer, plainer or more formal, with the structure and every fact kept.",
          "Find the vague or unsupported sentences and say what a reader would ask, without rewriting them for you.",
          "Turn notes into an outline, or an outline into a first draft you then make your own.",
          "Summarize a long document section by section, with each point tied to the part it came from.",
        ],
      },
      {
        h2: "One change per pass",
        p: ["Writing prompts work when you supply your own material and ask for one specific change. Say who the reader is, what the text is for and how long it should be. Paste a sample of your own voice if you want the edit to sound like you. Then compare the result with your original: assistants can alter meaning while polishing, and the comparison is where you catch it."],
      },
      {
        h2: "Summaries you can check",
        p: [
          `Paste text into the chat on any plan. On Lite and above you can also attach a PDF, a Word file, plain text or a spreadsheet and ask about it; on Free, documents are not sent to the free models, so paste the lines you need instead. Ask for a summary that names the section each point came from, so you can open the source and check it.`,
        ],
      },
      {
        h2: "Where several models help a writer",
        p: [`Tone, emphasis and what counts as "too long" are judgment calls, and models judge them differently. ${K} asks more than one model when the job needs it, writes one edit, and, when the models disagreed about a cut or a claim, says so in the Disagreements section. That is the part to read before you accept a change.`],
      },
      {
        h2: "Honest about limits",
        p: [`An edit can change your meaning, drop a caveat or invent a transition. Check every fact, quotation and number against your source, and read the result aloud. ${K} does not grade writing, detect AI text or promise a particular style; it edits what you give it and shows its work.`],
      },
    ],
    faq: [
      { q: "Is the writing assistant free?", a: "Yes. Paste text and ask for an edit or a summary on the Free plan, on free open models. Attaching documents, coding help and stronger models start at Lite." },
      { q: "Will it write a whole essay for me?", a: "It can draft from your outline, but it works better as an editor of your own writing. Follow your school's or employer's rules on AI assistance, and check every fact in anything it drafts." },
      { q: "What happens to the text I paste?", a: "It is sent to the models that answer. On Free, the hosts of free models may log prompts, so keep sensitive details out. Signed in, your chats are saved to your account until you delete them." },
      { q: "Which models edit my text?", a: "Keplar picks the models each job needs, weighing quality, reliability, speed and cost. You cannot choose specific models today." },
    ],
    related: ["/blogs/best-ai-for-writing", "/for-writers", "/docs/using-keplar/write-better-questions", "/blogs/how-to-write-better-ai-prompts", "/docs/using-keplar/attachments-images-video", "/pricing"],
  },
  {
    slug: "ai-productivity",
    path: "/ai-productivity",
    metaTitle: "AI for productivity: decisions, code, documents",
    metaDescription: `Use ${K} for everyday work: compare options, get a second opinion on code, read a document, keep context across chats, and hand repeat tasks to agents.`,
    ogTitle: "Get work done with several models",
    label: "AI productivity",
    h1: "Work faster with an answer you can take apart.",
    lede: `${K} is a workspace for getting things done: one question goes to several AI models, and the answer shows where they agreed, where they split and what to check before you act.`,
    examples: ["Compare three project management tools for a team of five and recommend one", "Review this function for bugs and edge cases: [paste code]", "Turn these meeting notes into a decision list with owners and dates"],
    sections: [
      {
        h2: "Decisions with the trade-offs shown",
        p: ["Comparing options is where one model's confident tone is least useful. Ask Keplar to compare, and the answer shows how many models agreed, which ones split and what they concluded differently, so you know which part of the recommendation to check. For a decision that is expensive to reverse, switch the thoroughness setting to Most thorough for a wider panel."],
      },
      {
        h2: "A second opinion on code",
        p: ["Paste a function and ask what breaks it, or paste an error and ask what it means. Lite and above route code questions to stronger models and can read whole files and zips of code. Keplar does not run your code; it reads it and reasons about it, and the Disagreements section tells you where the models saw the problem differently."],
      },
      {
        h2: "Documents and links",
        p: ["Paste a link and Keplar reads the page through a guarded fetch. On Lite and above, attach a PDF, a Word, PowerPoint or Excel file, a CSV or source files and ask about them; the file is read for that question and not kept. On Free, documents are not sent to the free models, so paste the lines you need."],
      },
      {
        h2: "Context that carries over",
        p: ["Signed in, your chats are saved and optional memory keeps short, durable facts such as your goals and preferences, which you can view and delete. Projects keep related chats, files and notes together. Specialists are saved personas for recurring kinds of work. Nothing is remembered on Free chats without your account."],
      },
      {
        h2: "Agents and connected apps",
        p: ["On Plus and above, agents take a repeat task, such as following up with leads, and run it with a spend cap, approval for outbound actions and an audit log. Connected apps (beta) let a chat use tools from the apps you connect, each with permissions you set. Scheduled agent runs always wait for your approval before acting outside Keplar."],
      },
      {
        h2: "On your desktop and in your browser",
        p: ["The desktop app for Windows, macOS and Linux adds Live Research (beta), which searches the web and reads pages on your computer. The browser extension (beta) asks about a selection or a page from Chrome or Edge. A beta public API lets your own scripts ask Keplar with a key."],
      },
      limits,
    ],
    faq: [
      { q: "Is Keplar free for everyday work?", a: "Yes. Free runs on free open models, up to 50 questions a day. Lite adds premium models, coding help and file attachments; Plus adds Deep Research, agents, slides and image generation." },
      { q: "Will Keplar take actions for me?", a: "Only through agents on Plus and above, and only within the spend cap and permissions you set. Outbound actions wait for your approval by default, and every run is logged." },
      { q: "Does Keplar remember what I told it?", a: "Signed in, optional memory saves short facts such as your name, goals and preferences, and you can see and delete each one. Memory is not learned from Free chats." },
      { q: "Can my team use one workspace?", a: "Keplar for Teams, with shared workspaces and roles, is in beta on the Business plan at business.keplar.one." },
    ],
    related: ["/for-founders", "/for-small-business", "/docs/using-keplar/tools-in-chat", "/docs/using-keplar/memory", "/docs/connectors-agents/agents-overview", "/blogs/what-is-an-ai-agent", "/pricing"],
  },
];

export const landingBySlug = (slug: string) => landingPages.find((p) => p.slug === slug);
