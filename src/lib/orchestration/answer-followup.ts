/** Short requests to change the previous answer, not new encyclopedia topics. */
type Turn = { role: "user" | "keplar"; text: string };
type Reading = { instruction: string; summary: string };

const RULES: readonly [RegExp, Reading][] = [
  [/^(?:(?:make|keep) (?:it|that|this) )?(?:shorter|more concise|less wordy|simpler|more casual|less formal|more formal|friendlier|more natural|more human|warmer|punchier)(?: version)?$/, { instruction: "Revise the most recent relevant answer using the requested style. Return the revised text itself, preserving its facts and the user's earlier constraints. Do not explain how to rewrite it or add an introduction.", summary: "Revise the previous answer in the requested style." }],
  [/^(?:(?:put|show|write|give) (?:it|that|this) |(?:make it|turn it into) )?(?:as |in |into )?(?:a table|bullet points|bullets|a list|one paragraph|one sentence|a checklist|an email)$/, { instruction: "Reformat the most recent relevant answer into the requested format. Return the finished result, preserving the facts and earlier constraints. Do not invent missing figures to fill a table or checklist.", summary: "Reformat the previous answer." }],
  [/^(?:continue|keep going|go on|finish it|finish that|finish this)$/, { instruction: "Continue the unfinished answer or task from the point already reached. Preserve the original request and constraints, avoid repeating completed material, and do the next useful work. Do not claim to have run tools or performed actions without evidence.", summary: "Continue the work already in progress." }],
  [/^(?:examples?|give (?:me )?(?:an? |some )?examples?|show (?:me )?(?:an? |some )?examples?|more detail|more details|go deeper|expand on (?:it|that|this))$/, { instruction: "Expand the most recent relevant answer with the requested detail or concrete examples. Address the same subject and constraints; spend the space on new explanation rather than repeating the introduction.", summary: "Add useful detail to the previous answer." }],
  [/^(?:why|why is that|how so|explain why)$/, { instruction: "Explain the basis for the previous answer: the deciding evidence, mechanism or tradeoff. Recheck its premise and correct it if needed. Give a concise explanation, not a restatement or private internal reasoning.", summary: "Explain the basis for the previous answer." }],
  [/^(?:try again|that is wrong|that's wrong|that doesn't work|that does not work|you misunderstood|not what i meant)$/, { instruction: "Recheck the previous answer against the original request and the user's correction. Identify and fix the likely mismatch or error, then give a useful corrected answer. Acknowledge a real mistake briefly; do not automatically accept a false correction or invent a cause.", summary: "Recheck and improve the previous answer." }],
];

export function readAnswerFollowup(raw: string, history: readonly Turn[]): Reading | null {
  const last = history.filter((t) => t.text?.trim()).at(-1);
  // A pending user message or an empty conversation supplies no answer to revise.
  if (last?.role !== "keplar" || !history.some((t) => t.role === "user" && t.text.trim())) return null;
  const text = raw.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim()
    .replace(/[.!?]+$/, "").replace(/^(?:please |can you |could you )/, "").replace(/(?:,? please| pls)$/, "");
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
