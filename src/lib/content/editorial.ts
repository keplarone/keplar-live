/**
 * Editorial pages (the superintelligence cluster, multi-model AI, models, about). Rules:
 *  - Facts about other organizations come from their own pages, cited with {{sourceId}} (see sources.ts) and an access date.
 *  - Timelines and risk estimates are labeled as opinion or survey results, never as fact.
 *  - Keplar is NOT superintelligence and never claims to be; no accuracy or confidence claims; no testimonials or stats of our own.
 * One page per search intent: /superintelligence (what it is), /ai-vs-agi-vs-superintelligence (how the terms differ),
 * /si-vs-ai (what "SI" means, incl. the September 2026 executive order), /multi-model-ai (combining models).
 */
import { brand } from "@/lib/site";

const K = brand.name;

export type Table = { caption: string; head: string[]; rows: string[][] };
export type Block = { id: string; h2: string; p?: string[]; bullets?: string[]; table?: Table; after?: string[] };

export type EditorialPage = {
  slug: string;
  path: string;
  /** <title> without the site suffix. */
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  label: string;
  h1: string;
  /** The direct answer, shown first. */
  answer: string;
  published: string;
  updated: string;
  readingMinutes: number;
  /** Shown under the answer when the page covers fast-moving facts. */
  freshness?: string;
  sections: Block[];
  keplar: { h2: string; p: string[] };
  examples: string[];
  faq: { q: string; a: string }[];
  related: string[];
  /** DefinedTerm markup (schema.org); not a Google rich result. */
  term?: { name: string; alternateName: string[]; description: string };
};

export const editorialPages: EditorialPage[] = [
  /* ───────────────────────────── /superintelligence ───────────────────────────── */
  {
    slug: "superintelligence",
    path: "/superintelligence",
    metaTitle: "What is superintelligence (SI)? Definitions, paths, risks",
    metaDescription:
      "Superintelligence is a hypothetical intellect far beyond humans in virtually all domains. Sourced definitions, ASI vs AGI, paths, risks, and why timelines are contested.",
    ogTitle: "What is superintelligence?",
    label: "Superintelligence",
    h1: "What is superintelligence?",
    answer:
      "Superintelligence is a hypothetical intellect that greatly exceeds the cognitive performance of humans in virtually all domains of interest. That is philosopher Nick Bostrom's definition from his 2014 book {{bostrom2014}}, and it is the one most other writing builds on. In AI discussions it is also called artificial superintelligence (ASI), and \"SI\" is a common shorthand. The sources cited below describe it as not yet achieved {{ibmAsi}} {{deepmind2023}}. Keplar is not superintelligence.",
    published: "2026-10-03",
    updated: "2026-10-03",
    readingMinutes: 9,
    freshness:
      "This page cites sources we opened on 3 October 2026. Statements by companies and surveys are dated where they appear, and forecasts are shown as opinion. If something here is out of date, tell us at team@keplar.one.",
    term: {
      name: "Superintelligence",
      alternateName: ["artificial superintelligence", "ASI", "SI"],
      description:
        "A hypothetical intellect that greatly exceeds the cognitive performance of humans in virtually all domains of interest (Nick Bostrom, Superintelligence: Paths, Dangers, Strategies, 2014).",
    },
    sections: [
      {
        id: "definition",
        h2: "The definition, and where it comes from",
        p: [
          "Bostrom defines a superintelligence as \"any intellect that greatly exceeds the cognitive performance of humans in virtually all domains of interest\" {{bostrom2014}}. Three details in how he frames it matter.",
        ],
        bullets: [
          "It is about general ability, not one skill. Bostrom says a chess program is not a superintelligence because it is only smart within chess {{bostrom2014}}.",
          "It does not say how the intellect is built, and it does not require consciousness {{bostrom2014}}.",
          "He allows narrower uses when they are stated explicitly, such as an \"engineering superintelligence\" that vastly outperforms the best human minds in engineering {{bostrom2014}}.",
        ],
        after: [
          "In an earlier short essay he put it as \"a general intelligence that vastly outperforms the best human brains in every significant cognitive domain\" {{bostrom2009}}.",
          "Other writers use stricter or looser wording. Google DeepMind researchers, for example, define the top level of their AGI scale (\"ASI\") as a general system that outperforms 100% of humans on a wide range of tasks {{deepmind2023}}. IBM describes artificial superintelligence as a hypothetical software-based AI system with an intellectual scope beyond human intelligence {{ibmAsi}}. These are close in spirit but not identical, and there is no single standard definition.",
        ],
      },
      {
        id: "terms",
        h2: "SI, ASI, AGI and related terms",
        p: ["People use these words loosely. This table shows what each usually means and who uses it. The companion page, [AI vs AGI vs superintelligence](/ai-vs-agi-vs-superintelligence), goes deeper on the differences."],
        table: {
          caption: "Common terms and how they are used",
          head: ["Term", "What it usually means", "Source"],
          rows: [
            ["Superintelligence", "An intellect far beyond humans in virtually all domains of interest", "Bostrom {{bostrom2014}}"],
            ["ASI (artificial superintelligence)", "The same idea, stressing that it would be an artificial system", "IBM {{ibmAsi}}; DeepMind's \"Level 5\" general AI {{deepmind2023}}"],
            ["SI", "Shorthand for superintelligence in AI writing. Also the name of the International System of Units, and since September 2026 a US executive branch naming term. See below and [SI vs AI](/si-vs-ai).", "{{bipmSi}} {{eo14434}}"],
            ["AGI (artificial general intelligence)", "An AI system roughly as capable as a human across most cognitive tasks. Definitions vary widely.", "{{deepmind2023}}"],
            ["Narrow AI", "AI built or used for specific tasks, even if it beats every human at that task", "{{deepmind2023}} {{ibmAsi}}"],
            ["\"Humanist superintelligence\"", "Microsoft AI's term for very advanced, problem-oriented, tightly controlled systems that tend to be domain specific", "{{msft2025}}"],
            ["\"Personal superintelligence\"", "Meta's term for AI that knows a person's goals and helps them reach them", "{{meta2025}}"],
          ],
        },
        after: [
          "The last two rows are company usages. They show the word being stretched, not a shared technical meaning, so when you read \"superintelligence\" in a product announcement, check which sense is meant.",
        ],
      },
      {
        id: "kinds",
        h2: "Is it one thing? Speed, collective and quality",
        p: [
          "Bostrom separates three ways something could be superintelligent: it thinks much faster than a human (speed), it is a system of many smaller intellects whose combined performance far exceeds any current cognitive system (collective), or it is simply much better at thinking at the same speed (quality) {{bostrom2014}}.",
          "The collective form is the one most relevant to tools that combine several AI systems. It is a category in a philosophical taxonomy. It is not evidence that combining today's models produces superintelligence, and we do not claim that. More on this in [multi-model AI](/multi-model-ai).",
        ],
      },
      {
        id: "paths",
        h2: "Proposed paths to superintelligence",
        p: [
          "Bostrom's book surveys several routes: artificial intelligence, whole brain emulation, enhancing biological cognition, brain-computer interfaces, and networks and organizations {{bostrom2014}}. His 2009 essay highlights two ideas: human-level machine intelligence followed by a much quicker step to superintelligence, and the \"singularity hypothesis\", in which a \"seed AI\" improves itself over repeated cycles, producing what he calls an intelligence explosion {{bostrom2009}}.",
          "He also writes that biological human brains might one day cease to be the predominant nexus of intelligence, while arguing that improving individual and collective human intelligence is worth pursuing in the meantime {{bostrom2009}}.",
          "Today the public paths are company strategies. Safe Superintelligence Inc. says building safe superintelligence is its one goal and product {{ssi}}. Meta states a vision of \"personal superintelligence\" {{meta2025}}. Microsoft AI announced a team working toward \"humanist superintelligence\" {{msft2025}}. OpenAI's leaders have written about the governance of future systems \"dramatically more capable than even AGI\" {{openaiGov}}. These are statements of intent, not demonstrations.",
        ],
      },
      {
        id: "positions",
        h2: "What organizations have said, with dates",
        table: {
          caption: "Published positions on superintelligence (accessed 3 October 2026)",
          head: ["Who", "Date", "Position in their own words or a close paraphrase"],
          rows: [
            ["OpenAI (Altman, Brockman, Sutskever)", "22 May 2023", "Superintelligence will need special treatment and coordination; they suggest something like an international authority for efforts above a capability or compute threshold, and say stopping its creation would be \"unintuitively risky and difficult\" {{openaiGov}}"],
            ["Safe Superintelligence Inc.", "undated home page", "\"Superintelligence is within reach\"; building a safe one is the company's sole focus {{ssi}}"],
            ["Meta (Zuckerberg)", "30 July 2025", "Aims to bring personal superintelligence to everyone; says it will raise novel safety concerns and calls for care about what is open sourced {{meta2025}}"],
            ["Microsoft AI (Suleyman)", "6 November 2025", "Working toward \"humanist superintelligence\": problem-oriented, domain-specific tendencies, kept within limits, with humans in control {{msft2025}}"],
            ["Future of Life Institute and signatories", "22 October 2025", "Calls for a prohibition on developing superintelligence until there is broad scientific consensus that it can be done safely and controllably and strong public buy-in {{fli2025}}"],
          ],
        },
        after: [
          "These positions disagree. OpenAI's 2023 piece argues that halting development would be hard and risky, while the 2025 statement asks for a prohibition until conditions are met. News coverage reported more than 800 signatories at launch {{cnbcFli}}. Reading one side alone gives a lopsided picture.",
        ],
      },
      {
        id: "risks",
        h2: "Risks and the safety debate",
        p: [
          "Bostrom wrote that it is an open question whether the consequences would be for the better or the worse: the potential upside is enormous, but the downside includes existential risk, and outcomes might depend on the initial conditions we create {{bostrom2009}}. The core worry is control: how to make sure a system much more capable than its designers pursues goals people actually want.",
          "Survey data shows researchers are divided. In AI Impacts' 2023 survey of 2,778 researchers who had published in top AI venues, 68.3% thought good outcomes from superhuman AI are more likely than bad ones, yet between 38% and 51% (depending on how the question was asked) gave at least a 10% chance to outcomes as bad as human extinction {{aiImpacts2023}}. That is a survey of opinions about a hypothetical, from one year, not a measurement.",
          "Google DeepMind's researchers argue that risks differ by capability level and by how much autonomy a system has, and that the \"Virtuoso\" and \"ASI\" levels are where many concerns about extreme risk are most likely to emerge {{deepmind2023}}. Microsoft's Suleyman argues for putting human control first, then accelerating {{msft2025}}.",
        ],
      },
      {
        id: "timelines",
        h2: "Timelines are contested opinion, not fact",
        p: [
          "Nobody can say when, or whether, superintelligence will exist. What exists is a range of forecasts:",
        ],
        bullets: [
          "Bostrom (2009): whether human-level AI takes a couple of decades, many decades or centuries is \"probably not something that we are currently in a position to know\" {{bostrom2009}}.",
          "AI Impacts' 2023 survey: aggregate forecasts gave a 10% chance by 2027 and 50% by 2047 that unaided machines outperform humans in every possible task. That is a different and narrower claim than superintelligence, and the same survey put a 50% chance of all human occupations being fully automatable as late as 2116 {{aiImpacts2023}}.",
          "OpenAI's leaders (2023): \"conceivable\" that within ten years AI systems will exceed expert skill level in most domains {{openaiGov}}.",
          "Meta (2025): the rest of this decade seems likely to be the decisive period for the path this technology takes {{meta2025}}.",
        ],
        after: [
          "These come from different people with different incentives and definitions. The 2023 survey also moved by 13 years against the 2022 one {{aiImpacts2023}}, which is a reminder of how unstable such forecasts are. We do not offer our own forecast.",
        ],
      },
      {
        id: "si-meaning",
        h2: "\"SI\" has more than one meaning",
        p: [
          "In this page's sense, SI is shorthand for superintelligence. But the letters are also the symbol for the International System of Units, the modern metric system maintained by the BIPM {{bipmSi}}.",
          "And in September 2026 a US executive order directed the executive branch to use \"Super Intelligence\" and \"SI\" in place of \"Artificial Intelligence\" and \"AI\" in many official documents, while defining the new terms as the same technologies the existing legal definition of AI covers {{eo14434}}. That is a naming change inside government. It does not mean the systems it covers are superintelligent in Bostrom's sense. The full details are on [SI vs AI](/si-vs-ai).",
        ],
      },
    ],
    keplar: {
      h2: "Where Keplar fits, and where it does not",
      p: [
        `${K} is not superintelligence and does not claim to be. It is a practical multi-model workspace. ${brand.name} One sends your question to several existing AI models, detects where they disagree, verifies, and writes one synthesized answer. The idea behind the tagline, \"One question. Multiple intelligences. One answer.\", is that consulting several intelligences can be more informative than trusting one.`,
        `That is a modest step in the direction of combining intelligences. It is not evidence that such a combination becomes superintelligent. Models can share mistakes, and when they agree that does not prove the answer is right. ${K} shows where they agreed and where they split so you can decide what to check.`,
      ],
    },
    examples: [
      "What is the difference between AGI and superintelligence?",
      "What are the main arguments for and against pausing superintelligence research?",
      "Summarize Bostrom's paths to superintelligence",
    ],
    faq: [
      { q: "What is superintelligence in simple terms?", a: "A hypothetical intellect much smarter than the best humans across virtually every area of thinking, not just one task. It does not exist today according to the sources cited on this page." },
      { q: "What does SI mean in AI?", a: "Usually superintelligence. The letters also stand for the International System of Units, and a September 2026 US executive order told the executive branch to say \"SI\" for what it used to call AI. See the SI vs AI page for the details." },
      { q: "What is the difference between AGI and ASI?", a: "AGI usually means human-level ability across many tasks. ASI (artificial superintelligence) means far beyond humans across virtually all domains. Definitions vary, so check which one an author uses." },
      { q: "Is ChatGPT, or any current chatbot, superintelligent?", a: "No source cited here describes today's chat assistants as superintelligent. In 2023 Google DeepMind's researchers rated the frontier language models of that time as \"Emerging AGI\" overall, which is below human-level generality; that was their judgment of 2023 systems." },
      { q: "Is Keplar superintelligence?", a: "No. Keplar consults several existing AI models and writes one answer, and it can be wrong. It does not claim to be AGI or superintelligence." },
      { q: "When will superintelligence arrive?", a: "Nobody knows. Published forecasts range widely and come with different definitions; the page above lists several as opinion." },
    ],
    related: ["/ai-vs-agi-vs-superintelligence", "/si-vs-ai", "/multi-model-ai", "/how-it-works"],
  },

  /* ───────────────────────────── /ai-vs-agi-vs-superintelligence ───────────────────────────── */
  {
    slug: "ai-vs-agi-vs-superintelligence",
    path: "/ai-vs-agi-vs-superintelligence",
    metaTitle: "AI vs AGI vs superintelligence (ASI): the differences",
    metaDescription:
      "AI is the broad field, AGI means human-level generality, ASI or superintelligence means far beyond humans. A sourced comparison with Google DeepMind's levels table.",
    ogTitle: "AI vs AGI vs superintelligence",
    label: "AI vs AGI vs ASI",
    h1: "AI vs AGI vs superintelligence: what is the difference?",
    answer:
      "AI is the broad field. Nearly all AI in use today is narrow: built or tuned for particular tasks. AGI (artificial general intelligence) is a hypothetical system about as capable as a human across most cognitive tasks. ASI, or superintelligence, is a hypothetical system far beyond humans across virtually all domains. The line between narrow AI and AGI is the most disputed, because there is no agreed test {{deepmind2023}} {{ibmAsi}}.",
    published: "2026-10-03",
    updated: "2026-10-03",
    readingMinutes: 6,
    freshness: "Sources opened on 3 October 2026. Terminology is moving: if you spot something out of date, email team@keplar.one.",
    sections: [
      {
        id: "table",
        h2: "The three terms side by side",
        table: {
          caption: "AI, AGI and ASI compared",
          head: ["", "Narrow AI", "AGI", "ASI (superintelligence)"],
          rows: [
            ["Scope", "Specific tasks or domains", "Wide range of cognitive tasks, including learning new ones", "Virtually all domains of interest"],
            ["Level vs humans", "Can be below, equal or far above humans at its task", "Roughly human-level on most tasks", "Greatly exceeds the best humans"],
            ["Status per sources", "Exists", "Hypothetical or disputed; no agreed test {{ibmAsi}} {{deepmind2023}}", "Hypothetical {{ibmAsi}}; \"not yet achieved\" in DeepMind's table {{deepmind2023}}"],
            ["Example from the sources", "AlphaFold, Deep Blue, spell checkers {{deepmind2023}}", "Definitions differ; see below", "A general system that outperforms 100% of humans on a wide range of tasks {{deepmind2023}}"],
          ],
        },
        after: [
          "Notice that \"narrow\" is about breadth, not skill. Google DeepMind's researchers classify AlphaFold as superhuman narrow AI, because it predicts protein structure better than any human but does only that {{deepmind2023}}. Bostrom's chess example makes the same point {{bostrom2014}}.",
        ],
      },
      {
        id: "levels",
        h2: "A more useful picture: levels of performance and generality",
        p: [
          "Because \"AGI\" is a fuzzy bucket, a 2023 Google DeepMind paper proposes a grid: five performance levels (Emerging, Competent, Expert, Virtuoso, Superhuman) against two kinds of generality (narrow or general) {{deepmind2023}}.",
        ],
        table: {
          caption: "Levels of AGI, adapted from Google DeepMind (2023)",
          head: ["Level", "Performance", "Narrow example", "General"],
          rows: [
            ["1 Emerging", "Equal to or somewhat better than an unskilled human", "Simple rule-based systems", "Frontier chat models of 2023 (their rating)"],
            ["2 Competent", "At least 50th percentile of skilled adults", "Smart speakers, toxicity detectors", "Not achieved at the time of writing"],
            ["3 Expert", "At least 90th percentile of skilled adults", "Spelling and grammar checkers, image generators", "Not achieved"],
            ["4 Virtuoso", "At least 99th percentile", "Deep Blue, AlphaGo", "Not achieved"],
            ["5 Superhuman", "Outperforms 100% of humans", "AlphaFold, AlphaZero, Stockfish", "ASI: not achieved"],
          ],
        },
        after: [
          "The paper's judgements describe systems as of September 2023 and are the authors' estimates; it does not offer a benchmark to settle them {{deepmind2023}}. We are not aware of an equivalent official rating for 2026 systems and do not make one up.",
        ],
      },
      {
        id: "why-differ",
        h2: "Why definitions of AGI keep differing",
        p: ["The same paper reviews nine definitions and finds they disagree about what to measure {{deepmind2023}}:"],
        bullets: [
          "OpenAI's charter: highly autonomous systems that outperform humans at most economically valuable work.",
          "Shane Legg and others: a machine able to do the cognitive tasks people can typically do, which raises the questions \"which tasks?\" and \"which people?\".",
          "Mustafa Suleyman's \"artificial capable intelligence\": complex multi-step tasks in the open world, tested by turning $100,000 into $1,000,000.",
          "Agüera y Arcas and Norvig: today's frontier language models already are AGI, because they are general; DeepMind's authors reply that generality also needs reliable performance.",
        ],
        after: ["When someone says \"we have AGI\" or \"we are years from AGI\", ask which definition they use."],
      },
      {
        id: "asi-vs-agi",
        h2: "From AGI to ASI",
        p: [
          "IBM calls realizing AGI \"a big step\" toward developing an ASI and describes ASI as still theoretical {{ibmAsi}}. Bostrom argued in 2009 that the step from roughly human-level machine intelligence to superintelligence would likely be much quicker than the step to human level, possibly through self-improvement {{bostrom2009}}. That is an argument, not an observation; it has been disputed, and the gap between the two is one of the main uncertainties in the timelines debate covered on [What is superintelligence?](/superintelligence).",
        ],
      },
      {
        id: "si",
        h2: "Where does \"SI\" fit?",
        p: ["In AI writing \"SI\" often just abbreviates superintelligence, so it sits at the ASI end. In US federal usage since September 2026 it has been defined as the same technologies the law already calls AI, so it sits at the \"AI\" end. Read [SI vs AI](/si-vs-ai) before relying on the letters alone {{eo14434}}."],
      },
    ],
    keplar: {
      h2: "How Keplar relates to these terms",
      p: [
        `${K} is a practical application of narrow-to-general language models: it consults several existing models and writes one answer. It is not AGI and not superintelligence, and it makes no claim that combining models gets closer to either. What it offers is more modest and checkable: you see which models were consulted, where they agreed and where they disagreed.`,
      ],
    },
    examples: ["Explain AGI vs ASI in plain language", "Why do definitions of AGI differ?", "Is narrow AI that beats humans at one task superintelligence?"],
    faq: [
      { q: "Is AGI the same as superintelligence?", a: "No. AGI usually means roughly human-level ability across many tasks; superintelligence means far beyond the best humans across virtually all domains." },
      { q: "Does AGI exist yet?", a: "It depends on the definition, which is why people disagree. Most definitions in the sources cited treat it as not yet achieved; at least one argues today's frontier models already count." },
      { q: "What is narrow AI?", a: "AI built for or used on specific tasks. It can still be superhuman at that task, like AlphaFold at protein structure prediction." },
      { q: "Where does Keplar sit on this scale?", a: "It uses existing language models and combines their answers. It does not claim to be AGI or superintelligence." },
    ],
    related: ["/superintelligence", "/si-vs-ai", "/multi-model-ai", "/compare-ai-models"],
  },

  /* ───────────────────────────── /si-vs-ai ───────────────────────────── */
  {
    slug: "si-vs-ai",
    path: "/si-vs-ai",
    metaTitle: "SI vs AI: what “SI” means, and the 2026 executive order",
    metaDescription:
      "SI can mean superintelligence, the metric system, or, since September 2026, the US executive branch's new name for AI. What the order says, quoted from the Federal Register.",
    ogTitle: "SI vs AI: what does SI mean?",
    label: "SI vs AI",
    h1: "SI vs AI: what does “SI” mean?",
    answer:
      "It depends on who is writing. In AI research, SI is shorthand for superintelligence, a hypothetical intellect far beyond humans. In science, SI is the International System of Units. And since a US executive order signed on 29 September 2026, the executive branch is directed to say “Super Intelligence” and “SI” in place of “Artificial Intelligence” and “AI”; the order defines the new terms as the same technologies the law already calls artificial intelligence {{eo14434}}.",
    published: "2026-10-03",
    updated: "2026-10-03",
    readingMinutes: 5,
    freshness:
      "This is a fast-moving topic. Written 3 October 2026 from the text of the order published in the Federal Register; we have not tried to predict what follows. The order asks for proposed legislative language on a federal definition within 60 days of its date {{eo14434}}, so this page is likely to need an update around late November 2026.",
    term: {
      name: "SI (in AI contexts)",
      alternateName: ["Super Intelligence", "superintelligence"],
      description:
        "Shorthand for superintelligence in AI writing; also, as of September 2026, the term US executive departments are directed to use in place of artificial intelligence, defined by Executive Order 14434 as the technologies covered by the statutory definition of artificial intelligence.",
    },
    sections: [
      {
        id: "meanings",
        h2: "The three meanings",
        table: {
          caption: "What “SI” can mean",
          head: ["Meaning", "Where you see it", "What it refers to", "Source"],
          rows: [
            ["Superintelligence", "AI research, safety and policy writing", "A hypothetical intellect that greatly exceeds humans in virtually all domains. Not achieved per most sources.", "{{bostrom2014}} {{ibmAsi}}"],
            ["Super Intelligence (US executive branch term)", "US federal documents and websites after the September 2026 order", "Defined as the technologies and systems the statute already calls artificial intelligence", "{{eo14434}}"],
            ["International System of Units", "Science, engineering, school, measurement", "The metric system: meter, kilogram, second, ampere, kelvin, mole, candela", "{{bipmSi}}"],
          ],
        },
        after: ["If you came here for the units, this site cannot help. If you came for AI, read on."],
      },
      {
        id: "order",
        h2: "What the executive order says",
        p: [
          "Executive Order 14434, \"Inaugurating the Era of Super Intelligence\", was signed on 29 September 2026 and published in the Federal Register on 2 October 2026 (91 FR 63129) {{eo14434}}. The White House also lists it among its presidential actions {{eo14434wh}}. According to its text:",
        ],
        bullets: [
          "Policy (Section 1): the executive branch shall use the terms \"Super Intelligence\" and \"SI\" in place of \"Artificial Intelligence\" and \"AI\", to the maximum extent permitted by law.",
          "Implementation (Section 2): departments and agencies use the new terms in official correspondence, public communications, websites, reports and other non-statutory documents. Previously issued regulations, Presidential actions, contracts, grants and historical documents do not have to be changed.",
          "Definition (Section 3(a)): \"Super Intelligence\" and \"SI\" mean the technologies and systems encompassed by \"artificial intelligence\" as defined in 15 U.S.C. 9401(3), unless superseded by later Presidential action or an Act of Congress.",
          "Next step (Section 3(b)): within 60 days, the Assistant to the President for Science and Technology is to submit proposed legislative language for a federal definition of the new terms, including an assessment of whether the definition should modify or expand the existing statutory definition of AI.",
        ],
        after: [
          "The order's purpose section describes frontier systems as increasingly representing \"not merely artificial intelligence, but a new era of Super Intelligence\" {{eo14434}}. The operative definition, however, points to the existing legal definition of AI. So, as written, it is a naming directive for the executive branch rather than a new technical category, and it does not itself say that any system is superintelligent in the sense Bostrom used.",
        ],
      },
      {
        id: "differences",
        h2: "How this differs from superintelligence in the research sense",
        bullets: [
          "Research sense: a capability claim. Superintelligence would greatly exceed human cognitive performance across virtually all domains {{bostrom2014}}.",
          "Executive branch sense: a label. The covered systems are those the existing law already calls AI {{eo14434}}, which includes today's tools such as chatbots and image generators and much narrower software.",
          "So \"the government now says SI\" and \"superintelligence exists\" are different statements. Which one a headline means depends on its context; read the definition if it gives one.",
        ],
      },
      {
        id: "reading",
        h2: "Reading \"SI\" correctly in practice",
        bullets: [
          "Federal agency pages after 2 October 2026: expect SI where earlier pages said AI. Treat it as AI unless the page says otherwise.",
          "Safety, philosophy and lab publications: expect SI or ASI to mean superintelligence in Bostrom's sense, as on [What is superintelligence?](/superintelligence).",
          "Search engines: add context words (\"SI AI\", \"superintelligence SI\", \"SI units\") because the letters alone are ambiguous.",
        ],
      },
    ],
    keplar: {
      h2: `How ${K} uses these words`,
      p: [
        `${K} is a private product, not a government site, so it uses \"AI\" for AI and \"superintelligence\" in the research sense. ${K} is not superintelligence. It consults several existing AI models and writes one answer, with the agreement and disagreements shown. Nothing about the order changes how ${K} works.`,
      ],
    },
    examples: ["What does the 2026 executive order on Super Intelligence actually change?", "SI vs ASI: are they the same?", "What does SI stand for in AI?"],
    faq: [
      { q: "What does SI stand for in AI?", a: "Usually superintelligence. In US executive branch documents after September 2026 it is the directed replacement term for \"AI\", defined as the same technologies." },
      { q: "Is SI the same as ASI?", a: "In research writing, mostly yes: both mean a system far beyond humans. In the executive order's usage, no: SI there means what the law already calls artificial intelligence." },
      { q: "Does the executive order say superintelligence has been achieved?", a: "Not in its operative text. It describes systems as increasingly representing a new era of Super Intelligence, but defines the term as the existing statutory AI definition." },
      { q: "Does the order change existing laws or contracts?", a: "According to Section 2(b), it does not require altering previously issued regulations, Presidential actions, contracts, grants or other historical documents." },
      { q: "Does this change anything about Keplar?", a: "No. Keplar is a private multi-model AI workspace and keeps using the word AI." },
    ],
    related: ["/superintelligence", "/ai-vs-agi-vs-superintelligence", "/multi-model-ai"],
  },

  /* ───────────────────────────── /multi-model-ai ───────────────────────────── */
  {
    slug: "multi-model-ai",
    path: "/multi-model-ai",
    metaTitle: "Multi-model AI: asking several AI models at once",
    metaDescription:
      "What multi-model AI is, four ways tools combine models, what research reports, where it falls short, and how Keplar consults several models and writes one answer.",
    ogTitle: "Multi-model AI, explained",
    label: "Multi-model AI",
    h1: "Multi-model AI: what it is and what it can’t do",
    answer:
      "Multi-model AI means asking more than one AI model and comparing or combining the results instead of trusting a single model. Tools do it four main ways: show replies side by side, route each question to the best model, merge replies into one answer, or have a judge model check them. Research such as the Mixture-of-Agents paper reports gains on some benchmarks {{moa}}, but combining models does not guarantee a correct answer, because models can share mistakes.",
    published: "2026-10-03",
    updated: "2026-10-03",
    readingMinutes: 6,
    sections: [
      {
        id: "patterns",
        h2: "Four ways tools combine models",
        table: {
          caption: "Common multi-model patterns",
          head: ["Pattern", "How it works", "You get", "Trade-off"],
          rows: [
            ["Side by side", "The same prompt goes to several models and each reply is shown", "Every raw answer", "You do the reconciling"],
            ["Routing", "A router picks the model it expects to suit the question", "One model's answer, chosen for you", "No cross-check unless added"],
            ["Aggregation (synthesis)", "Several models answer; another model merges them", "One merged answer", "The merge can hide minority views unless disagreement is surfaced"],
            ["Judge or verifier", "A model reviews drafts against each response", "A checked draft", "A judge is also a model and can be wrong"],
          ],
        },
        after: [`${K} combines routing, aggregation and a verifier: the router picks a panel, the answers are compared, a draft is checked, and one answer is written with the disagreements shown.`],
      },
      {
        id: "research",
        h2: "What published research reports",
        p: [
          "The best-known open example is Mixture-of-Agents (MoA). In the paper, layers of language-model agents each read the previous layer's outputs before answering. The authors report that an MoA built only from open-source models scored 65.1% on AlpacaEval 2.0 against 57.5% for GPT-4 Omni, and state-of-the-art results on MT-Bench and FLASK as well {{moa}}.",
          "Read that carefully. It is one team's result on specific automated benchmarks from 2024, using that method; it does not mean any multi-model product, including Keplar, is more accurate on your questions. Keplar has not run or published a benchmark of its own.",
        ],
      },
      {
        id: "limits",
        h2: "Where combining models falls short",
        bullets: [
          "Shared mistakes: models trained on similar data can be wrong in the same way, so agreement is a signal and not proof.",
          "Cost and speed: more models means more time and more compute; simple questions are usually fine with one.",
          "Merging can blur: a summary that hides a minority view removes information. The minority can be right.",
          "Stale knowledge: unless a model has live search, a panel only knows what its models were trained on. Keplar does not run web lookups for answers yet.",
        ],
      },
      {
        id: "collective",
        h2: "Collective intelligence, in context",
        p: [
          "Humans have long improved their joint problem-solving with institutions such as peer review and journals; Bostrom lists improving collective intelligence among the ways to enhance intelligence {{bostrom2009}}. In his later taxonomy, a \"collective superintelligence\" is a system of many smaller intellects whose combined performance far outstrips any current cognitive system {{bostrom2014}}.",
          `Multi-model AI is a small, practical echo of that idea: several intelligences, one output. It does not show that combining today's models leads to superintelligence, and ${K} makes no such claim. See [What is superintelligence?](/superintelligence) for the wider debate.`,
        ],
      },
      {
        id: "keplar-how",
        h2: `How ${K} does it`,
        p: [
          `For a simple question ${K} uses one model. For harder ones the router picks a panel with models from different families, the answers are compared into positions and an agreement level, a draft is checked by a verifier, and one answer is streamed. Under it you can open Consensus, Models consulted, Sources the models cite, Disagreements, Verification and Reasoning summary. The Consensus section measures how strongly the models agree; it is not a vote count or an accuracy score.`,
          "The Free plan uses only free models. Paid plans add premium models. See [which models Keplar uses](/models).",
        ],
      },
      {
        id: "when",
        h2: "When multi-model is worth it",
        bullets: [
          "Decisions with trade-offs: rent or buy, which tool to pick, how to study.",
          "Facts you cannot easily check yourself, where a split is a useful warning.",
          "Research, writing and coding questions where a second or third opinion saves a mistake.",
          "Not for: quick lookups, arithmetic, or anything you can verify in seconds.",
        ],
      },
    ],
    keplar: {
      h2: "Try it",
      p: [`${K} is free to try with no signup. Ask one question and open the Disagreements section to see where the models split.`],
    },
    examples: ["Should I rent or buy a home this year?", "Python or JavaScript for a first language?", "What is the strongest argument against fast-moving AI development?"],
    faq: [
      { q: "What is a multi-model AI assistant?", a: "An assistant that uses more than one AI model for a question: by showing several replies, by choosing the best model, or by combining and checking replies." },
      { q: "Is multi-model AI more accurate?", a: "Sometimes on some benchmarks, as in the Mixture-of-Agents paper, but not guaranteed. Models can share mistakes, and Keplar does not claim higher accuracy." },
      { q: "Does Keplar let me choose the models?", a: "Not today. Keplar picks the models a question needs; you can choose how thorough it is." },
      { q: "Is multi-model AI the same as superintelligence?", a: "No. It combines existing models. Superintelligence is a hypothetical system far beyond humans in virtually all domains." },
    ],
    related: ["/superintelligence", "/compare-ai-models", "/models", "/how-it-works", "/chatgpt-alternative"],
  },
];

export const editorialBySlug = (slug: string) => editorialPages.find((p) => p.slug === slug);
