/**
 * Prompt library data. Every prompt is a template with [placeholders] the reader fills in, plus why it works and what to
 * check afterward. Written to be used in any assistant, not only in Keplar.
 */
export type Prompt = { id: string; title: string; text: string; why: string; check: string };
export type PromptCategory = {
  slug: string;
  name: string;
  blurb: string;
  intro: string[];
  tips: string[];
  prompts: Prompt[];
  related: { label: string; href: string }[];
};

export const promptCategories: PromptCategory[] = [
  {
    slug: "learning",
    name: "Learning and studying",
    blurb: "Understand a topic, quiz yourself and find gaps without handing your thinking over.",
    intro: [
      "The best study prompts make you do the retrieval: you answer first, then the assistant helps you find what you missed. Prompts that simply ask for a summary tend to feel productive without producing memory.",
      "Use these with your own notes or textbook pages pasted in, so the assistant works from your course material instead of from its general memory. Check anything you will be examined on against the course source.",
    ],
    tips: ["Paste the actual material and say \"use only this text\".", "Answer practice questions before asking for the solution.", "Space repetition over days beats one long session.", "Follow your school's rules on AI assistance."],
    related: [{ label: "Study mode", href: "/docs/using-keplar/study-mode" }, { label: "AI for studying", href: "/blogs/best-ai-for-essays-and-studying" }],
    prompts: [
      { id: "explain-levels", title: "Explain at three levels", text: "Explain [topic] three ways: to a curious 10-year-old, to a first-year college student, and to someone who already works in the field. Keep each under 120 words and note what each level leaves out.", why: "Seeing the same idea at different depths shows which layer you are missing.", check: "Confirm definitions and formulas against your textbook." },
      { id: "quiz-me", title: "Quiz me, then grade me", text: "Here are my notes on [topic]:\n\n[paste notes]\n\nAsk me one question at a time, mixing recall and application. Wait for my answer before revealing whether I was right. After 10 questions, list the topics I should review.", why: "Retrieval practice works better than rereading, and one question at a time keeps you answering.", check: "Verify any answer you were told was wrong before you change your notes." },
      { id: "find-gaps", title: "Find the gaps in my explanation", text: "I will explain [topic] in my own words. Tell me what is missing, vague or wrong, but do not rewrite it for me.\n\n[your explanation]", why: "Explaining from memory exposes gaps; asking for critique without a rewrite keeps the work yours.", check: "Compare the gaps it names with the course syllabus." },
      { id: "flashcards", title: "Make flashcards from my notes", text: "From the notes below, make 15 flashcards as Question | Answer pairs. Use only facts stated in the notes. Mark any card where the notes seem incomplete.\n\n[paste notes]", why: "Restricting to the notes avoids invented facts and highlights thin notes.", check: "Skim every card against the notes before studying them." },
      { id: "study-plan", title: "Build a study plan", text: "My exam on [subject] is on [date]. I have [hours] hours per week. Topics: [list]. Make a week-by-week plan with review sessions spaced out, and tell me which topics deserve the most time given that I find [weak topics] hardest.", why: "Gives structure and spaced review based on your real constraints.", check: "Adjust to your real calendar and your instructor's emphasis." },
      { id: "socratic", title: "Socratic tutor", text: "Act as a tutor for [topic]. Do not give me the answer. Ask me a guiding question, wait for my reply, and keep going until I reach it. If I am stuck twice, give a hint.", why: "Guided questions build understanding better than being handed a solution.", check: "At the end, state the final answer yourself and compare it with the textbook." },
      { id: "analogy", title: "Give me a good analogy", text: "Give me two analogies for [concept] from everyday life, then say where each analogy breaks down.", why: "Asking where an analogy fails prevents misconceptions from sticking.", check: "Make sure the breakdown notes match how the concept is defined in your course." },
    ],
  },
  {
    slug: "writing",
    name: "Writing and editing",
    blurb: "Draft, tighten and critique your own writing while keeping your meaning and voice.",
    intro: [
      "Writing prompts work best when you supply your own material and ask for a specific change. Open-ended \"write me an article\" requests produce generic text because the assistant has nothing particular to say.",
      "Use these to edit and critique, not to replace your thinking. Read the result aloud, and check every fact and quotation, because assistants can alter meaning while polishing.",
    ],
    tips: ["Give audience, purpose and length first.", "Ask for one kind of change per pass.", "Paste a sample of your voice.", "Compare the edit with your original for meaning drift."],
    related: [{ label: "Best AI for writing", href: "/blogs/best-ai-for-writing" }, { label: "Write better questions", href: "/docs/using-keplar/write-better-questions" }],
    prompts: [
      { id: "tighten", title: "Tighten without losing claims", text: "Shorten the text below by about 20% without removing any claim, number or name. List anything you were tempted to cut but kept.\n\n[paste text]", why: "A \"no lost claims\" constraint stops the edit from quietly deleting substance.", check: "Diff the result against your original for dropped caveats." },
      { id: "tone", title: "Change the tone only", text: "Rewrite this for [audience] in a [warm / direct / formal] tone. Keep the structure and every fact the same. Show the changes as a list of what you altered.\n\n[paste text]", why: "Separating tone from content makes the edit predictable.", check: "Confirm no facts changed." },
      { id: "vague", title: "Find vague sentences", text: "Read the draft below and list every sentence that is vague, unsupported or could mean two things. For each, say what question a reader would ask. Do not rewrite them.\n\n[paste draft]", why: "You fix what a reader would trip on, in your own words.", check: "Decide which flags are real." },
      { id: "openings", title: "Three opening paragraphs", text: "Write three different opening paragraphs for a piece about [topic] aimed at [audience]: one that starts with a concrete scene, one with a surprising fact I will supply, and one with a direct question. I will choose and write the rest.", why: "Options in different registers help you find your own approach.", check: "Replace any invented detail with something true." },
      { id: "claims-list", title: "List every factual claim", text: "List every factual claim in the draft below as a numbered list, one per line, so I can verify each. Do not judge whether they are true.\n\n[paste draft]", why: "Turns a draft into a verification checklist.", check: "Verify each claim against a source." },
      { id: "counterargument", title: "Strongest counterargument", text: "Here is my argument: [paste]. Give the three strongest objections a thoughtful skeptic would raise and what evidence would answer each.", why: "Finds weak points before readers do.", check: "Research the evidence it suggests; do not rely on its examples." },
      { id: "email-reply", title: "Reply to a difficult email", text: "Here is an email I received:\n\n[paste]\n\nMy goal is [goal]. Draft a reply that is polite and brief and does not concede [point]. Give two versions, one firmer and one softer.", why: "Two versions show a range so you can pick the right tone.", check: "Read it as the recipient would; confirm dates and commitments." },
      { id: "summary-faithful", title: "Faithful summary", text: "Summarize the text below in 5 bullets. Keep numbers and conditions exact, and add a final line: \"Left out:\" listing anything important you omitted.\n\n[paste text]", why: "The \"left out\" line exposes what compression removed.", check: "Compare numbers and negations with the source." },
    ],
  },
  {
    slug: "work",
    name: "Work and business",
    blurb: "Meetings, plans, customer messages and reports, with checks that keep invented details out.",
    intro: [
      "Work prompts should say who the audience is, what decision the document supports and what facts the assistant may use. Without that, the output reads like every other business document.",
      "Do not paste confidential or customer data into tools that your employer has not approved, and remember that free tiers can have different data terms than business plans.",
    ],
    tips: ["Name the decision the document supports.", "Provide the numbers; do not ask the assistant to recall them.", "Check data terms before pasting confidential material.", "Keep a human approval step before anything is sent."],
    related: [{ label: "Business tools", href: "/docs/connectors-agents/business-tools" }, { label: "Privacy basics", href: "/blogs/ai-privacy-what-happens-to-your-prompts" }],
    prompts: [
      { id: "meeting-notes", title: "Turn notes into actions", text: "From these meeting notes, list decisions made, action items with owner and due date (write \"unassigned\" if missing), and open questions. Do not invent owners or dates.\n\n[paste notes]", why: "Forbidding invention keeps actions honest.", check: "Confirm owners and dates with the team." },
      { id: "one-pager", title: "One-page plan skeleton", text: "Draft a one-page plan for [project]. Sections: goal, why now, scope, out of scope, milestones with rough dates, risks, and what I need from others. Ask me up to five questions first if information is missing.", why: "Questions first avoids a generic plan.", check: "Replace placeholder dates and owners with real ones." },
      { id: "customer-reply", title: "Customer reply draft", text: "A customer wrote:\n\n[paste]\n\nOur policy is: [policy]. Draft a short, friendly reply that answers their question, makes no promises beyond the policy, and offers one next step.", why: "Grounding in your policy prevents promises you cannot keep.", check: "Read for accuracy before sending; a person should send it." },
      { id: "risk-list", title: "Pre-mortem", text: "Assume this project failed in six months: [project description]. List the ten most likely reasons, ranked, and one early warning sign and one mitigation for each.", why: "Imagining failure surfaces risks that optimism hides.", check: "Discard generic risks; keep the ones that fit your context." },
      { id: "job-description", title: "Job post that screens in", text: "Write a job post for [role] at a [type of company]. Separate must-haves from nice-to-haves, state the real salary range [range], and avoid unnecessary jargon or biased phrasing. List anything that might discourage qualified applicants unnecessarily.", why: "Separating requirements widens the pool; stating pay builds trust.", check: "Have HR or legal check it." },
      { id: "faq-from-docs", title: "FAQ from our own policy", text: "From the policy text below, write 8 customer FAQs with short answers. Use only what the text says; if the text doesn't answer a likely question, list it under \"Needs an answer\".\n\n[paste policy]", why: "The \"needs an answer\" list shows gaps in your policy.", check: "Have the policy owner approve each answer." },
      { id: "weekly-update", title: "Weekly update", text: "Turn these bullets into a weekly update for [audience]: what shipped, what is next, blockers, and one thing I need help with. Keep it under 150 words.\n\n[paste bullets]", why: "A fixed structure makes updates fast to write and read.", check: "Confirm nothing is overstated." },
    ],
  },
  {
    slug: "coding",
    name: "Coding",
    blurb: "Explain, review, debug and test code, with constraints that avoid invented APIs.",
    intro: [
      "Coding prompts need versions, the failing behavior and the smallest example that shows it. Models guess when context is missing, and a guess that compiles can still be wrong.",
      "Run the code and the tests yourself. A second model reviewing the first model's change is a useful extra check, not a replacement for running it.",
    ],
    tips: ["State language, framework and versions.", "Paste the error and the minimal failing case.", "Ask for tests with the fix.", "Never paste secrets or customer data."],
    related: [{ label: "Best AI for coding", href: "/blogs/best-ai-for-coding" }, { label: "Use connected apps in chat", href: "/docs/using-keplar/tools-in-chat" }],
    prompts: [
      { id: "debug", title: "Debug with a failing example", text: "Language/version: [..]. This function should [expected behavior] but [actual behavior]. Code:\n\n[code]\n\nFailing input: [input]. Explain the cause in two sentences, then give the fix and two tests, one for the failing case and one for an edge case. If you are unsure an API exists in this version, say so.", why: "The \"say so\" line discourages invented functions.", check: "Run the tests; confirm the API in the official docs." },
      { id: "explain-code", title: "Explain unfamiliar code", text: "Explain what this code does, line by line at a high level, then list its inputs, outputs, side effects and anything that looks risky.\n\n[code]", why: "Structured explanation exposes side effects.", check: "Read the code yourself for the risky parts." },
      { id: "review", title: "Security and edge-case review", text: "Review the code below as a skeptical senior engineer. List bugs, security issues (injection, auth, secrets, unsafe input), missing edge cases, and performance traps, ordered by severity. Do not rewrite it.\n\n[code]", why: "A review role finds issues the author model missed.", check: "Triage each finding; many will be false alarms." },
      { id: "refactor-plan", title: "Refactor plan before code", text: "I want to refactor [module] to [goal]. Give a step-by-step plan where each step leaves the tests passing, and note the riskiest step. Do not write code yet.", why: "Small safe steps beat a big rewrite.", check: "Adjust to your real test coverage." },
      { id: "tests", title: "Tests first", text: "Write unit tests for the function below covering normal cases, boundaries, invalid input and one property that should always hold. Use [test framework].\n\n[code]", why: "Tests encode the behavior you expect.", check: "Make sure tests fail when the code is wrong." },
      { id: "sql", title: "SQL with explanation", text: "Schema:\n[schema]\n\nWrite a query for [goal]. Explain each clause, say how it would behave with NULLs and duplicates, and suggest an index if it is slow. Dialect: [dialect].", why: "NULLs and duplicates are common silent errors.", check: "Run it on a copy of the data." },
      { id: "regex", title: "Regex you can trust", text: "Write a regular expression for [pattern] in [language]. Give 5 strings that should match and 5 that should not, and explain each part.", why: "Examples reveal mistakes faster than reading the pattern.", check: "Test the examples in a regex tool." },
    ],
  },
  {
    slug: "research",
    name: "Research and decisions",
    blurb: "Compare options, find what you do not know and prepare to verify before you decide.",
    intro: [
      "Research prompts should ask for structure, uncertainty and what to verify, not for conclusions. An assistant that gives a confident verdict on a contested question is hiding the part you most need to see.",
      "Treat the output as a reading list and a set of questions. Open the primary sources before relying on a claim, and write the date you checked.",
    ],
    tips: ["Ask what would change the answer.", "Request the strongest case on each side.", "Ask for what to verify, with the type of source that would settle it.", "Record dates for anything time-sensitive."],
    related: [{ label: "How to check an AI answer", href: "/blogs/how-to-check-an-ai-answer" }, { label: "Deep Research", href: "/docs/using-keplar/deep-research" }],
    prompts: [
      { id: "compare-options", title: "Compare options fairly", text: "Compare [option A] and [option B] for someone who [situation]. Use a table with criteria, what each does better, what each does worse, and one thing that would change the recommendation. Say where the evidence is thin.", why: "Criteria and \"what would change it\" force a conditional answer.", check: "Verify prices and specifications on official pages and note the date." },
      { id: "map-debate", title: "Map a debate", text: "Describe the main positions on [question], the strongest argument for each, the evidence each side relies on, and where they disagree about facts versus values. Do not pick a side.", why: "Separating facts from values clarifies the real disagreement.", check: "Look for primary sources for the key evidence." },
      { id: "what-i-dont-know", title: "What am I missing?", text: "I'm trying to decide [decision]. Here is what I know: [facts]. List the five questions I should answer before deciding, and who or what would answer each.", why: "Good questions are worth more than a quick answer.", check: "Add questions from your own context." },
      { id: "source-types", title: "Where to look", text: "For the claim \"[claim]\", what kinds of primary sources would settle it, which would be weak evidence, and what search terms would find them?", why: "Directs you to evidence instead of more AI text.", check: "Actually open the sources." },
      { id: "devils-advocate", title: "Devil's advocate", text: "I plan to [plan]. Argue against it as strongly as you honestly can, then say which of your arguments is weakest.", why: "Counters the tendency to agree with you.", check: "Judge which objections hold." },
      { id: "timeline", title: "Timeline with uncertainty", text: "Build a timeline of [topic]. Mark each entry as well-documented, disputed or uncertain, and say how recent the information is likely to be.", why: "Labels prevent false precision.", check: "Verify dates against reliable references." },
      { id: "estimate", title: "Back-of-envelope estimate", text: "Estimate [quantity] step by step. State each assumption and a plausible range, show the arithmetic, and say which assumption matters most.", why: "Visible assumptions make an estimate criticizable.", check: "Recompute the arithmetic with a calculator." },
    ],
  },
  {
    slug: "checking-ai",
    name: "Checking AI answers",
    blurb: "Prompts that expose weak claims, test for flattery and prepare a verification list.",
    intro: [
      "These prompts help you decide what to verify. They do not verify anything themselves: the same assistant can be confidently wrong about its own weak spots.",
      "Combine them with an independent second model and, for anything that matters, a source you open yourself.",
    ],
    tips: ["Use a different model for the second opinion.", "Ask for claims, not verdicts.", "Check the load-bearing claims first.", "Record what you verified."],
    related: [{ label: "Why AI models disagree", href: "/blogs/why-ai-models-disagree" }, { label: "Hallucinations", href: "/blogs/what-are-ai-hallucinations" }],
    prompts: [
      { id: "weakest-claims", title: "Weakest claims", text: "Here is an answer you gave earlier:\n\n[paste]\n\nList the three claims most likely to be wrong or out of date, and for each say what source would settle it.", why: "Focuses your checking time.", check: "Check those three first." },
      { id: "false-premise", title: "Check the premise", text: "Before answering, tell me whether my question contains any assumption that might be false: \"[question]\". Then answer it.", why: "Catches false premises models would otherwise accept.", check: "Verify the premise independently." },
      { id: "flip-framing", title: "Flip the framing", text: "Answer the opposite question: \"[reverse of your question]\". Then tell me whether your two answers are consistent.", why: "Inconsistency across framings suggests flattery.", check: "Compare for contradictions." },
      { id: "separate-known", title: "Known, inferred, guessed", text: "Rewrite your answer in three labeled groups: things you are confident are well established, things you inferred, and things you are guessing. If you are unsure which a statement is, put it under guessing.", why: "Forces a distinction models usually blur.", check: "Treat the labels as a hint, not proof." },
      { id: "cite-or-say", title: "Cite or say you can't", text: "For each factual claim in your answer, name a type of source that would contain it. Do not invent titles, authors, links or numbers; if you can't point to a kind of source, say so.", why: "Discourages fabricated references.", check: "Open real sources yourself." },
      { id: "second-opinion", title: "Second opinion on another answer", text: "Another assistant answered this question: \"[question]\" with:\n\n[paste]\n\nWhere do you agree, where do you disagree, and what does the answer assume that it didn't state?", why: "A different model's critique is a cheap cross-check.", check: "Resolve differences with a source." },
    ],
  },
  {
    slug: "keplar",
    name: "Keplar features",
    blurb: "Questions and briefs that work well with Keplar's panels, Create, Study mode and agents.",
    intro: [
      "Keplar chooses how many models to use from the question itself, so the clearest prompts are the ones that say what you need to decide, what you already know and what format you want back.",
      "These examples are written for Keplar features. They also work in other assistants, but the notes explain what Keplar will do with them.",
    ],
    tips: ["Say the decision you are making.", "Name constraints and what to exclude.", "For Create, describe the audience and the one action you want visitors to take.", "Read the Disagreements section when it appears."],
    related: [{ label: "Which questions use more models", href: "/docs/how-it-works/which-questions-use-more-models" }, { label: "Build a site", href: "/docs/create/build-a-site" }],
    prompts: [
      { id: "contested", title: "A contested question", text: "I'm deciding between [A] and [B] for [situation and constraints]. Give the strongest case for each, say where informed people disagree, and tell me which facts I should verify before choosing.", why: "A question that invites several viewpoints is one where a panel adds the most; Keplar's Disagreements section shows where models differ.", check: "Verify the facts it lists; Keplar does not open sources." },
      { id: "exact-numbers", title: "Numbers you can rely on", text: "Calculate [arithmetic or counting problem]. Show the working.", why: "Arithmetic and counting are checked by code in Keplar, and the answer is built around the result.", check: "Re-run the calculation if the result is important." },
      { id: "create-brief", title: "A site brief", text: "Build a one-page site for [business], a [what you do] in [place]. Audience: [who]. The one action visitors should take: [action]. Tone: [tone]. Include: [sections]. Leave out: [things].", why: "A clear audience and one action produce a more focused site than a list of features.", check: "Replace any placeholder text and verify prices and hours before publishing." },
      { id: "study-set", title: "Study mode brief", text: "Build a study set from my notes on [topic] for an exam on [date]. Focus on [subtopics]. Include practice questions that mix recall and application.", why: "Study mode builds an outline, flashcards and quizzes from material you provide.", check: "Compare definitions with your course material." },
      { id: "agent-followup", title: "Lead follow-up rules", text: "When someone submits the contact form, draft a reply in a friendly, brief tone. Mention [offer], never quote prices, and propose one call time window. Put it in approvals; do not send.", why: "Clear rules make agent drafts predictable, and approval keeps you in control.", check: "Read and edit every draft before approving." },
      { id: "deep-research-scope", title: "Scope a Deep Research run", text: "Research [topic] for a decision about [decision]. Prefer primary sources and official documentation. Cover [angles]. Note disagreements between sources and anything you couldn't access.", why: "Scope and source preferences make a heavy run cheaper and more useful.", check: "Open the key sources; citations are labeled as not checked by Keplar." },
    ],
  },
];

export const allPrompts = () => promptCategories.flatMap((c) => c.prompts.map((p) => ({ ...p, category: c })));
export const promptCategoryBySlug = (slug: string) => promptCategories.find((c) => c.slug === slug);
