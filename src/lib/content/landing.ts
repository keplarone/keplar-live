/**
 * Indexable landing pages and use-case pages. Copy rules: describe what Keplar does today, nothing more.
 * No accuracy claims, no "checks claims against sources", no statistics, testimonials or customer counts.
 * Sources shown in an answer are the ones the models cite; Keplar has not checked them. Web lookups are not live.
 */
import { brand } from "@/lib/site";

const K = brand.name;
const O = brand.engineName;

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
      { q: "Is Keplar free?", a: "Yes. Free is $0, runs on free open models, and allows up to 50 questions a day (fair use). Keplar Lite is $20 a month, Keplar Plus is $45 a month, and Keplar Pro is $99 a month." },
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
      { q: "Which models does Keplar use?", a: "A mix of open and premium models from providers such as OpenRouter, OpenAI and NVIDIA, depending on your plan and the question. Free uses free open models only." },
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
      { q: "Does Keplar use OpenAI models?", a: "Paid plans can include OpenAI models among others. Which models answer depends on your plan and the question." },
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
          "A day-by-day plan if you give it an exam date.",
          "Ask the guide questions about your material, with citations back to your own text.",
        ],
      },
      {
        h2: "How to start",
        p: ["Sign in (Study sets are saved to your account), choose Study, and add a text-based PDF or paste notes. Scanned PDFs without selectable text aren't supported yet."],
      },
      {
        h2: "Your files",
        p: ["The original PDF is not kept. Keplar stores the extracted text and the study set under your account, and you can delete a set at any time."],
      },
      {
        h2: "Honest about limits",
        p: [
          "Generated flashcards and quizzes can contain mistakes, so check anything important against your course material. Free uses free open models with smaller limits; Plus and Pro use stronger models and have bigger limits.",
        ],
      },
    ],
    faq: [
      { q: "Is Study mode free?", a: "Yes. It's on every plan, with free open models and smaller limits on Free." },
      { q: "Can I upload a scanned PDF?", a: "Not yet. Study mode reads text-based PDFs, or you can paste your notes." },
      { q: "Is my PDF stored?", a: "The original file isn't kept. The extracted text and the study set are stored under your account until you delete them." },
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
          "A full deck from a topic, an outline, or your own notes.",
          "Speaker notes on each slide.",
          "An editor to change any slide, plus a full-screen present mode.",
          "Export to PowerPoint (.pptx) and PDF.",
        ],
      },
      {
        h2: "Image ideas, not images",
        p: ["Each slide gets a written image idea. The exported decks show a text placeholder where a picture would go, so you can add your own or generate one separately."],
      },
      {
        h2: "Plans",
        p: ["The slideshow creator is part of Keplar Plus ($45 a month) and Pro ($99 a month). On Free you can see it, and the Upgrade button takes you to checkout."],
      },
      {
        h2: "Honest about limits",
        p: ["Decks are drafts. Check facts, names and numbers before you present, since the writing model can be wrong."],
      },
    ],
    faq: [
      { q: "Is the slide maker free?", a: "No. It's part of Keplar Plus and Pro. Study mode and everyday questions are available on Free." },
      { q: "Can I open the deck in PowerPoint or Google Slides?", a: "Export to .pptx opens in PowerPoint, and Google Slides can import .pptx files." },
      { q: "Does it add images?", a: "Not yet. Each slide includes an image idea, and the export shows a text placeholder." },
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
    related: ["/blogs/how-to-check-an-ai-answer", "/guides/why-ai-models-disagree", "/ai-answer-engine", "/compare-ai-models"],
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
    related: ["/for-students", "/for-founders", "/ai-fact-check", "/guides/why-ai-models-disagree"],
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
    metaTitle: "Roblox Studio AI: build games with Claude inside Studio",
    metaDescription: `The ${K} desktop app connects to Roblox Studio and builds with you on Claude Opus 5.5: maps, UI, flipbook effects and Luau scripts, plus overnight Roblox Cloud jobs.`,
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
        h2: "Always Claude Opus 5.5",
        p: ["Studio mode and Roblox Cloud run on Claude Opus 5.5 only. If it can't be reached, the build pauses and tells you, instead of quietly switching to another model."],
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
      { q: "Which model does it use?", a: "Claude Opus 5.5, every time. If that model is unavailable the build pauses rather than switching." },
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
];

export const landingBySlug = (slug: string) => landingPages.find((p) => p.slug === slug);
