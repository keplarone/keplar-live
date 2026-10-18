/**
 * Instructions added to the call that is already answering. Not a second request.
 * The fence matches the keplar-ui pattern: one block, validated, or the markdown stands.
 */
import { quizAsk, quizSourceName } from "./ask";

export const QUIZ_PANEL_RULES = `This message asks for a quiz or for flashcards. Reply with a one-line title, then exactly one keplar-quiz fence and nothing else.
The fence is JSON:
{"title":"...","source":"file name","kind":"quiz","questions":[{"id":"q1","type":"multiple_choice","prompt":"...","options":["...","...","...","..."],"answer":"...","explanation":"...","hint":"..."}]}
- Use the number of questions they asked for. Otherwise 10. Never more than 20. Do not stop early. If the source has fewer distinct facts than that number, write one question per fact and stop.
- type is multiple_choice, true_false, or short_answer.
- multiple_choice has exactly 4 options. answer is the correct option's full text, not a letter.
- true_false uses options ["True","False"] and answer "True" or "False".
- short_answer omits options. answer is a short phrase from the material.
- explanation is one or two sentences grounded in the material. hint is optional.
- Every question must come from the attached file's text. If there is no file, use only the conversation topic. Never invent a name, number, date, or definition.
- Do not write an answer key in the title line. If the JSON would be invalid, omit the fence.`;

export const QUIZ_VERIFY_ADDON = `The draft is a quiz. Also include "quiz":[{"id":"...","verdict":"keep"|"drop"|"fix","answer":"..."}] in your JSON, one entry per question.
- drop when the correct answer is not supported by the attached source, or the responses disagree and the source does not settle it.
- fix when the listed answer is wrong and the source states another one. "answer" must be that text from the source, not a new fact.
- keep when the answer matches the source.
Do not add questions.`;

/** The same fence the panel is asked to append, with the count and file name filled in. */
export function quizPanelHint(req: { prompt: string; docs?: { name: string; source?: string }[]; attachments?: { name: string }[] }): string {
  const ask = quizAsk(req.prompt);
  if (!ask) return "";
  const name = quizSourceName(req);
  const kind = ask.kind === "flashcards" ? "flashcards" : "quiz";
  const body = JSON.stringify({
    title: "...",
    source: name ?? "",
    kind,
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        prompt: "...",
        options: ["...", "...", "...", "..."],
        answer: "...",
        explanation: "One or two sentences from the source.",
        hint: "...",
      },
    ],
  });
  return `After a one-line title, end with exactly one fenced block and nothing after it:\n\n\`\`\`keplar-quiz\n${body}\n\`\`\`\nWrite ${ask.count} ${kind === "flashcards" ? "flashcards, as questions with the term as the prompt and the definition as the answer" : "questions"}. ${name ? `Set source to ${JSON.stringify(name)}. ` : ""}Use only the attached file when there is one, otherwise only the conversation topic. Never invent a fact. If the JSON would be invalid, omit the fence.`;
}
