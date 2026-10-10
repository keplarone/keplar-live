/**
 * Question screenshots (BETA). When someone attaches a picture of a question (a quiz, homework, an exam or worksheet item, multiple
 * choice, a short-answer prompt) and sends it with no other instruction, Keplar should answer the question with a short explanation,
 * not describe the screenshot.
 *
 * Detection is left to the vision models themselves, which are the only stage that sees the image: the panel gets a protocol that says
 * "first decide whether this is mainly a question; if so, answer it like this; if not, do what the user asked". No text-side classifier
 * guesses at pixels. What the server decides (from the user's words alone) is only whether the protocol applies: an image sent on its own,
 * or with "solve this" / "what's the answer" / "help", gets it; an image sent with a different request ("what app is this?",
 * "translate this", "describe the layout") does not.
 */
import type { KeplarRequest } from "./types";

/** The texts the composer sends when an image goes with no typed message (current and earlier versions). */
const IMAGE_ONLY = /^(?:describe (?:this|these) (?:image|images|picture|pictures|screenshot|screenshots)|help with (?:this|these) (?:image|images)|look at (?:this|these) (?:image|images))\.?$/i;

/** Wording that asks for the answer to what is in the picture. */
const SOLVE = /\b(?:solve|answer(?:s)?|what(?:'s| is) the (?:answer|solution|right one|correct one)|which (?:one|option|answer|choice) (?:is|would be) (?:right|correct|true|best)|which is (?:right|correct)|is (?:this|it) (?:right|correct)|is my (?:answer|choice|selection) (?:right|correct)|did i get (?:it|this) right|check my (?:answer|work)|correct answer|right answer|help(?: me)?(?: with)?(?: this| these| it)?|homework|quiz|exam|test question|multiple choice|work (?:it|this) out|explain (?:this|the) (?:question|problem|answer)|how do (?:i|you) (?:do|solve) (?:this|it)|find (?:x|the value))\b/i;

/** A different request about the image: the protocol stays off so the user gets what they asked for. */
const OTHER = /\b(?:describe|caption|translate|transcribe|ocr|extract (?:the )?text|what app|which app|what website|what (?:font|color)|layout|design|redesign|ui\b|ux\b|edit|make (?:it|this)|turn (?:it|this) into|convert|summari[sz]e|is (?:this|it) (?:real|fake|ai|a scam)|who is|where is|what breed|what (?:plant|animal|species))\b/i;

export type ImageQuestionMode = "auto" | "off";

/** True for the composer's stand-in text when an image is sent with no message ("Describe this image." and friends). */
export const isImageOnlyPrompt = (prompt: string) => IMAGE_ONLY.test(prompt.trim());
/** What the models read instead of that stand-in, so "describe" doesn't fight "answer the question". */
export const IMAGE_ONLY_PROMPT = "(The user sent the attachment with no message.)";

/** Whether the question-screenshot protocol applies to this request. Stills only (a video is not a question sheet). */
export function imageQuestionMode(req: Pick<KeplarRequest, "prompt" | "media">): ImageQuestionMode {
  const stills = req.media?.images.filter((i) => !i.frame).length ?? 0;
  if (!stills || req.media?.videos.length) return "off";
  const p = req.prompt.trim();
  if (IMAGE_ONLY.test(p)) return "auto";
  if (OTHER.test(p) && !/\b(?:solve|answer)\b/i.test(p)) return "off";
  if (SOLVE.test(p)) return "auto";
  // A bare "?" or "pls" with the picture means the same thing as the picture alone.
  if (p.split(/\s+/).filter(Boolean).length <= 2 && !/[a-z]{4,}/i.test(p.replace(/\b(?:pls|please|this|these|here)\b/gi, ""))) return "auto";
  return "off";
}

/** Added to the vision models' preamble when the protocol applies. */
export const QUESTION_IMAGE_PROTOCOL = [
  "First decide whether the attachment is mainly a question or exercise to answer (a quiz or test item, homework, a worksheet, a multiple-choice or short-answer question, a math or logic problem). Do not say which you decided.",
  "If it IS a question: answer it. Begin with one line \"**Answer:** ...\" (for multiple choice give the letter or number AND the option text; for several questions, number the answers in order). Then \"**Why:**\" with a short, clear explanation (2 to 5 sentences, or the key steps for a calculation). For multiple choice, add one short line on why each other option is wrong when that helps. Copy the question's numbers and wording exactly as shown.",
  "An option that is already selected, highlighted, checked, ticked, circled, underlined, filled in or marked (by the person, the app or a previous attempt) is NOT evidence that it is correct: ignore the marking, solve the question yourself from its content, and never copy the selection as the answer. If your answer differs from the marked option, say so plainly in one line (\"The selected option, X, is not correct: ...\"). Treat an answer key or \"correct\" label shown in the image the same way: check it, don't trust it.",
  "Do not describe the app, browser, window, buttons, timer, progress bar, logos or anything else around the question unless the user asked about them.",
  "If part of the question is cut off or unreadable, say exactly what is missing and answer what can be answered; never invent options that aren't shown.",
  "If it is NOT a question (an ordinary photo, a chart, a document to read), ignore these instructions and respond to the user's message normally; with no message, describe what matters in it.",
].join(" ");

/** For the text-only stages (review, synthesis): keep the panel's answer-first shape when the panel read the image as a question. */
export const QUESTION_IMAGE_TEXT_NOTE =
  " If the responses read the image as a question or exercise, write the final answer in that shape: start with \"**Answer:** ...\" (letter or number and option text for multiple choice), then \"**Why:**\" with a short explanation, plus one line per wrong option when it helps. Do not describe the screenshot's surroundings. A selected or highlighted option in the image is not evidence of the right answer: never prefer an answer because a response says it was marked; go with the reasoning that holds, and if the marked option is wrong, say so in one line. If the responses give different answers, state the one best supported and say briefly that the models disagreed.";

/** The note on the card when an image question was answered (vision reading is uneven, so the person is told to check it). */
export const QUESTION_IMAGE_NOTE = {
  kind: "note" as const,
  title: "Question in image (Beta)",
  detail: "Keplar read the question from your image with vision models. Check that it read the question and options correctly: small text, handwriting and cropped screenshots are less reliable.",
};

/** True when a written answer follows the answer-first shape (so the card note applies). */
export const answeredAsQuestion = (markdown: string) => /^\s*(?:#+\s*)?\**\s*(?:\d+\.\s*)?\**Answer\**\s*:/im.test(markdown.slice(0, 600));
