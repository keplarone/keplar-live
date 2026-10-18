/**
 * A mode the composer may offer while someone is still typing. It is a suggestion only:
 * nothing here turns a mode on. Questions and slash commands are left alone.
 */
import { routeChat } from "@/lib/chat-actions/intent";
import type { ModeKey } from "@/lib/composer/modes";

export type ModeSuggestion = { key: ModeKey; label: string; detail: string };

const QUESTION = /^(?:how|what|why|when|where|which|who|whose|is|are|was|were|should|does|do|did|am|explain|tell me (?:how|why|what))\b/i;

/** "build me a landing page" → Create, "teach me" → Study. Null when the line is a question or too vague to offer. */
export function suggestComposerMode(text: string): ModeSuggestion | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > 400 || t.startsWith("/")) return null;

  // These are requests even when they start with a word the question check would catch ("do research on…").
  if (/^(?:please\s+)?(?:teach me|help me (?:learn|study|understand)|i (?:want|need) to (?:learn|study))\b/i.test(t)) {
    return { key: "study", label: "Study", detail: "Learn this with a study set" };
  }
  if (/^(?:please\s+)?(?:do (?:a |some )?research on|research this in depth|deep[- ]research)\b/i.test(t)) {
    return { key: "deepResearch", label: "Deep Research", detail: "A longer, sourced answer" };
  }
  if (/^(?:please\s+)?(?:debate|argue both sides|steelman)\b/i.test(t)) {
    return { key: "debate", label: "Debate", detail: "Models argue, then one answer" };
  }
  if (QUESTION.test(t)) return null;

  const routed = routeChat(t);
  switch (routed?.intent.type) {
    case "create.new":
      return { key: "create", label: "Create", detail: "Build a website or app" };
    case "study.new":
      return { key: "study", label: "Study", detail: "Flashcards and a quiz" };
    case "slides.new":
      return { key: "slides", label: "Slides", detail: "A deck from this message" };
    default:
      return null;
  }
}
