/**
 * The study guide for a chat message sent with the composer's Study chip. Study mode builds only from material it is given and adds
 * no outside facts (study/engine.ts), so the guide is the person's attached documents when there are any, otherwise the question and
 * the answer Keplar just wrote for it. Nothing here is invented: an answer too short to study from gets the server's own message.
 */
export const MIN_GUIDE_CHARS = 80;

export function studyGuideFrom(question: string, answerMarkdown: string, docs?: { name: string; text: string }[]): { text: string; source: "documents" | "answer" } {
  const material = (docs ?? []).filter((d) => d.text.trim());
  if (material.length) return { text: material.map((d) => (material.length > 1 ? `${d.name}\n\n${d.text}` : d.text)).join("\n\n").trim(), source: "documents" };
  const q = question.trim();
  return { text: `${q ? `Question: ${q}\n\n` : ""}${answerMarkdown.trim()}`, source: "answer" };
}
