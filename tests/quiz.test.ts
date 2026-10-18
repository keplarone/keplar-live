import "./setup";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { quizAsk, newQuizFollowUp } from "@/lib/quiz/ask";
import { parseQuiz } from "@/lib/quiz/schema";
import { gradeAnswer, quizKeyCommand } from "@/lib/quiz/grade";
import { applyQuizVerdicts, reconcileQuizzes } from "@/lib/quiz/reconcile";
import { finalizeQuiz, quizPlain, quizStreamView, takeQuizFence } from "@/lib/quiz/build";
import { QuizBuilding, QuizCard } from "@/components/app-ui/quiz/QuizCard";
import { ModelSynthesizer } from "@/lib/orchestration/live-synthesizer";
import { EvidenceWeightedComparator } from "@/lib/orchestration/comparator";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { LatencyBudget } from "@/lib/orchestration/latency";
import type { ProviderResult } from "@/lib/orchestration/types";
import type { Quiz } from "@/lib/quiz/types";

const SOURCE = [
  "An entrepreneur is a person who starts a business and takes on financial risk.",
  "A sole proprietorship is a business owned by one person.",
  "Revenue is the money a business earns from sales.",
].join("\n");

function q(over: Partial<Quiz["questions"][number]> & Pick<Quiz["questions"][number], "id" | "prompt" | "answer">): Quiz["questions"][number] {
  return {
    type: "multiple_choice",
    options: ["A person who starts a business and takes on financial risk", "A person who only invests", "A lender", "A customer"],
    explanation: "An entrepreneur is a person who starts a business and takes on financial risk.",
    ...over,
  };
}

const QUIZ: Quiz = {
  title: "Entrepreneurship",
  source: "study-guide.pdf",
  kind: "quiz",
  questions: [
    q({ id: "q1", prompt: "What is an entrepreneur?", answer: "A person who starts a business and takes on financial risk" }),
    q({
      id: "q2",
      prompt: "What is revenue?",
      options: ["The money a business earns from sales", "The money left after costs", "A tax", "A loan"],
      answer: "The money a business earns from sales",
      explanation: "Revenue is the money a business earns from sales.",
    }),
  ],
};

test("a quiz request is detected, with 10 questions unless a number is asked for", () => {
  assert.deepEqual(quizAsk("create me a quiz for this study guide"), { kind: "quiz", count: 10 });
  assert.deepEqual(quizAsk("Create a 15-question quiz on chapter 2"), { kind: "quiz", count: 15 });
  assert.deepEqual(quizAsk("quiz me on photosynthesis"), { kind: "quiz", count: 10 });
  assert.deepEqual(quizAsk("make 8 flashcards for chapter 2"), { kind: "flashcards", count: 8 });
  assert.deepEqual(quizAsk("give me some practice questions on cells"), { kind: "quiz", count: 10 });
  assert.equal(quizAsk("how do I write a good quiz?"), null);
  assert.equal(quizAsk("what is a flashcard?"), null);
  assert.equal(quizAsk("make a study guide"), null);
});

test("a valid quiz fence parses, a letter answer maps to its option, and bad JSON is rejected", () => {
  const raw = JSON.stringify(QUIZ);
  const parsed = parseQuiz(raw);
  assert.equal(parsed?.questions.length, 2);
  assert.equal(parsed?.questions[0]?.answer, QUIZ.questions[0]?.answer);

  const lettered = parseQuiz(JSON.stringify({
    title: "T",
    kind: "quiz",
    questions: [{
      id: "q1",
      type: "multiple_choice",
      prompt: "What is an entrepreneur?",
      options: ["A lender", "A person who starts a business and takes on financial risk", "A customer", "A bank"],
      answer: "B",
      explanation: "An entrepreneur is a person who starts a business and takes on financial risk.",
    }],
  }));
  assert.equal(lettered?.questions[0]?.answer, "A person who starts a business and takes on financial risk");

  const tf = (answer: string) => parseQuiz(JSON.stringify({
    title: "T",
    kind: "quiz",
    questions: [{ id: "q1", type: "true_false", prompt: "An entrepreneur takes on financial risk.", answer, explanation: "The guide defines an entrepreneur as someone who takes on financial risk." }],
  }));
  assert.equal(tf("yes")?.questions[0]?.answer, "True");
  assert.equal(tf("not true"), null);

  assert.equal(parseQuiz("not json at all"), null);
  assert.equal(parseQuiz('{"title":"T","questions":[{"type":"multiple_choice","prompt":"?"}]}'), null);
});

test("a broken fence falls back to the prose and a half-written fence stays hidden", () => {
  const taken = takeQuizFence("Here is the quiz in words.\n\n```keplar-quiz\n{not json\n```\n");
  assert.match(taken.prose, /Here is the quiz/);
  assert.equal(parseQuiz(taken.raw ?? ""), null);
  const open = quizStreamView("Intro.\n\n```keplar-quiz\n{\"title\"");
  assert.equal(open.pending, true);
  assert.doesNotMatch(open.prose, /keplar-quiz/);
  const closed = quizStreamView(`Done.\n\n\`\`\`keplar-quiz\n${JSON.stringify(QUIZ)}\n\`\`\``);
  assert.equal(closed.pending, false);
  assert.match(closed.prose, /Done/);
});

test("short answers ignore case and extra whitespace, and a wrong answer fails", () => {
  assert.equal(gradeAnswer("  An Entrepreneur  ", "an entrepreneur", "short_answer"), true);
  assert.equal(gradeAnswer("entrepreneur", "an entrepreneur", "short_answer"), true);
  assert.equal(gradeAnswer("a lender", "an entrepreneur", "short_answer"), false);
  assert.equal(gradeAnswer("TRUE", "True", "true_false"), true);
  assert.equal(gradeAnswer("False", "True", "true_false"), false);
  assert.equal(gradeAnswer("Revenue", "The money a business earns from sales", "multiple_choice"), false);
});

test("keys: 1-4 and A-D pick, Enter is next, other keys do nothing", () => {
  assert.deepEqual(quizKeyCommand("1"), { type: "pick", index: 0 });
  assert.deepEqual(quizKeyCommand("4"), { type: "pick", index: 3 });
  assert.deepEqual(quizKeyCommand("a"), { type: "pick", index: 0 });
  assert.deepEqual(quizKeyCommand("D"), { type: "pick", index: 3 });
  assert.deepEqual(quizKeyCommand("Enter"), { type: "next" });
  assert.equal(quizKeyCommand("e"), null);
  assert.equal(quizKeyCommand("ArrowRight"), null);
  assert.equal(quizKeyCommand("5"), null);
});

test("models that disagree on a key drop that question unless the source settles it", () => {
  const other: Quiz = {
    ...QUIZ,
    questions: [
      QUIZ.questions[0]!,
      { ...QUIZ.questions[1]!, answer: "The money left after costs", explanation: "Profit is what remains after costs are paid." },
      q({
        id: "q3",
        prompt: "What is a unicorn startup?",
        options: ["A company valued over one billion", "A farm", "A bank", "A school"],
        answer: "A company valued over one billion",
        explanation: "A unicorn startup is a private company valued at over one billion dollars.",
      }),
    ],
  };
  const merged = reconcileQuizzes([QUIZ, other], { source: SOURCE, count: 10, kind: "quiz", sourceName: "study-guide.pdf" });
  assert.equal(merged?.source, "study-guide.pdf");
  assert.deepEqual(merged?.questions.map((x) => x.id), ["q1", "q2"]);
  assert.match(merged?.questions[1]?.answer ?? "", /earns from sales/);
});

test("the verifier can drop or fix a question, and a fix that is not in the source is dropped", () => {
  const dropped = applyQuizVerdicts(QUIZ, [{ id: "q2", verdict: "drop" }], SOURCE);
  assert.deepEqual(dropped?.questions.map((x) => x.id), ["q1"]);
  const fixed = applyQuizVerdicts(QUIZ, [{ id: "q2", verdict: "fix", answer: "The money left after costs" }], SOURCE);
  assert.deepEqual(fixed?.questions.map((x) => x.id), ["q1"]);
  const kept = applyQuizVerdicts(QUIZ, [{ id: "q1", verdict: "fix", answer: "A person who starts a business and takes on financial risk" }], SOURCE);
  assert.equal(kept?.questions[0]?.answer, "A person who starts a business and takes on financial risk");
});

test("the card renders one question, the score screen, and a building skeleton", () => {
  const html = renderToStaticMarkup(createElement(QuizCard, { quiz: QUIZ }));
  assert.match(html, /1 of 2/);
  assert.match(html, /radiogroup/);
  assert.match(html, /What is an entrepreneur/);
  assert.doesNotMatch(html, /keplar-quiz/);
  const done = renderToStaticMarkup(createElement(QuizCard, {
    quiz: QUIZ,
    progress: { index: 1, done: true, picks: { q1: QUIZ.questions[0]!.answer, q2: "The money left after costs" } },
  }));
  assert.match(done, /You got 1 of 2/);
  assert.match(done, /Retry missed/);
  assert.match(done, /Retake/);
  assert.match(done, /New quiz/);
  assert.match(done, /Missed/);
  const sk = renderToStaticMarkup(createElement(QuizBuilding, { source: "study-guide.pdf" }));
  assert.match(sk, /Building your quiz from study-guide\.pdf/);
  const missed = renderToStaticMarkup(createElement(QuizCard, {
    quiz: QUIZ,
    progress: { index: 0, picks: { q1: "A lender" }, done: false },
  }));
  assert.match(missed, /Not quite/);
  assert.match(missed, /The answer is A\./);
  assert.doesNotMatch(missed, /Incorrect/);
  const follow = newQuizFollowUp(QUIZ);
  assert.ok(quizAsk(follow));
});

test("a panel quiz is the answer, with no extra model call and no streamed JSON", async () => {
  const [m1, m2] = freeRoster;
  let calls = 0;
  const registry = { generate: async () => { calls++; return { ok: false }; } } as never;
  const fence = (quiz: Quiz) => `Title\n\n\`\`\`keplar-quiz\n${JSON.stringify(quiz)}\n\`\`\``;
  const results: ProviderResult[] = [m1, m2].map((m, i) => ({
    ok: true,
    modelId: m.id,
    stance: "same",
    claims: [],
    text: fence(i === 0 ? QUIZ : { ...QUIZ, questions: [QUIZ.questions[0]!, { ...QUIZ.questions[1]!, answer: "The money left after costs" }] }),
    latencyMs: 1,
    usage: { inputTokens: 1, outputTokens: 1 },
  }));
  const comparison = new EvidenceWeightedComparator().compare(results);
  const s = new ModelSynthesizer(registry, m1, new LatencyBudget(60_000).start());
  const plan = { mode: "consensus", panel: [m1, m2].map((model) => ({ model, slot: "panel", covers: "Reasoning", reason: "" })), verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
  const verification = { mode: "cross-model", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [], quizVerdicts: [{ id: "q1", verdict: "keep" as const }] };
  const classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
  const deltas: string[] = [];
  const out = await s.synthesize({
    req: { prompt: "create me a quiz for this study guide", plan: "free", docs: [{ name: "study-guide.pdf", text: SOURCE, source: "file" }] },
    classification,
    plan,
    results,
    comparison,
    verification,
    onDelta: (t: string) => deltas.push(t),
    signal: undefined,
  } as never);
  assert.equal(calls, 0);
  assert.equal(deltas.join(""), "");
  assert.ok(out.quiz);
  assert.equal(out.quiz?.questions.length, 2);
  assert.match(out.quiz?.questions[1]?.answer ?? "", /earns from sales/);
  assert.doesNotMatch(out.markdown, /keplar-quiz/);
  assert.equal(out.markdown, quizPlain(out.quiz!));
  assert.equal(out.rich, undefined);
});

test("when the fence does not parse, the markdown answer is kept", async () => {
  const [m1] = freeRoster;
  const registry = { generate: async () => ({ ok: false }) } as never;
  const results: ProviderResult[] = [{ ok: true, modelId: m1.id, stance: "a", claims: [], text: "1. What is an entrepreneur? A. A person who starts a business.", latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }];
  const comparison = new EvidenceWeightedComparator().compare(results);
  const s = new ModelSynthesizer(registry, m1, new LatencyBudget(60_000).start());
  const plan = { mode: "single", panel: [{ model: m1, slot: "panel", covers: "Reasoning", reason: "" }], verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
  const verification = { mode: "not-needed", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] } as never;
  const classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
  const out = await s.synthesize({
    req: { prompt: "create me a quiz for this study guide", plan: "free" },
    classification,
    plan,
    results,
    comparison,
    verification,
    onDelta: () => {},
    signal: undefined,
  } as never);
  assert.equal(out.quiz, undefined);
  assert.match(out.markdown, /What is an entrepreneur/);
});

test("the quiz stylesheet uses surface tokens, with motion that turns off", () => {
  const css = readFileSync("src/components/app-ui/quiz/QuizCard.module.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /var\(--surface-panel\)/);
  assert.match(css, /var\(--c-ink\)/);
  assert.match(css, /var\(--hairline-strong\)/);
  assert.match(css, /padding:\s*22px/);
  assert.match(css, /border-radius:\s*12px/);
  assert.match(css, /#3d6b4f/);
  assert.match(css, /#8c403c/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /outline:\s*2px solid var\(--c-ink\)/);
  assert.match(css, /scale:\s*0\.97/);
  assert.doesNotMatch(css, /#fff\b|#ffffff/i);
  assert.doesNotMatch(css, /gradient|blur\(|purple|violet|pink|glow|box-shadow|backdrop-filter/i);
});

test("finalizeQuiz drops a question the verifier rejects", () => {
  const quiz = finalizeQuiz({
    texts: ["```keplar-quiz\n" + JSON.stringify(QUIZ) + "\n```"],
    req: { prompt: "create me a quiz", docs: [{ name: "study-guide.pdf", text: SOURCE, source: "file" }] },
    ask: { kind: "quiz", count: 10 },
    verdicts: [{ id: "q2", verdict: "drop" }],
  });
  assert.deepEqual(quiz?.questions.map((x) => x.id), ["q1"]);
});
