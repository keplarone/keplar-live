/**
 * Appended to the existing synthesis prompt (and, through it, the Free plan's one combined review).
 * It does not add a model call. The fence is optional; a missing or broken one leaves the markdown.
 */
export const RICH_UI_RULES = `
When the question suits a structured answer (a ranking or "best", "top", or "greatest"; a comparison; a timeline; pros and cons; specs; how-to steps; a definition with parts; or statistics), append ONE fenced block after the markdown and immediately before the RESOLUTION line. Omit it for a quick fact, code, math, or chat.

\`\`\`keplar-ui
{"blocks":[{"type":"ranked","note":"This order is a judgment, and it changes.","items":[{"rank":1,"name":"...","maker":"...","why":"..."}]}]}
\`\`\`

The markdown above the fence must stay a complete answer by itself. Use only these block types, and only facts present in the material:
- {"type":"ranked","title":"...","note":"...","items":[{"rank":1,"name":"...","maker":"...","why":"...","tags":["..."],"score":"..."}]}
- {"type":"compare","title":"...","columns":["..."],"rows":[{"label":"...","cells":["..."]}]}
- {"type":"cards","title":"...","items":[{"title":"...","body":"...","tag":"..."}]}
- {"type":"timeline","title":"...","items":[{"when":"...","title":"...","body":"..."}]}
- {"type":"steps","title":"...","items":[{"title":"...","body":"..."}]}
- {"type":"proscons","title":"...","pros":["..."],"cons":["..."]}
- {"type":"stats","items":[{"label":"...","value":"...","note":"..."}]}
- {"type":"callout","text":"..."}
- {"type":"sources","items":[{"title":"...","url":"https://..."}]}

Block rules: at most 6 blocks and 8 items; one sentence per why, body, or cell; at most 3 short tags. Never invent a score, benchmark, citation, URL, or "as of" date. A score or stat may include a number only when that exact number is in the material. A source URL only when that URL is in the material; if there is no URL, omit sources. Do not put agreement counts, model names, or who-said-what in the block. For a best, greatest, or top ranking, list 5 to 8 items in order. Each item needs the name, the maker when you know it, and a one-line why. Use the current generation of each product when you know that name, and write that same name in the markdown. The note must say the order is a judgment and that it changes, and must not name a date unless the material gives that date. One callout, the single takeaway. A how-to uses a steps block (titles and one line each) and leaves the full guide in the markdown. If you are not sure the block is valid JSON, omit it.`;

/**
 * A short, shape-specific instruction for the model that is already answering.
 * It rides on that same call (the panel, or the one combined review). Empty for chat, facts, code, and math.
 */
const RANK = /\b(?:greatest|best|top\s+\d+|ranking|ranked)\b/i;
const WAY = /\b(?:best|good|right|easiest|fastest|safest)\s+way\s+to\b/i;
const COMPARE = /\b(?:compare|comparison|versus|\bvs\.?\b|difference between)\b/i;
const PROS = /\bpros and cons\b/i;
const TIMELINE = /\b(?:history of|timeline of|origins of)\b/i;
const STEPS = /\b(?:how (?:do|can|should|would|could) (?:i|you|we)|how to|steps? to|walk me through|show me how)\b/i;

const CLOSE =
  "The markdown above the fence must already name every item. Use only facts from that markdown. Never invent a score, benchmark, citation, URL, or date. Omit sources when you have no URL. If the JSON would be invalid, omit the fence.";

function fence(body: string): string {
  return `After the markdown, end with exactly one fenced block and nothing after it:\n\n\`\`\`keplar-ui\n${body}\n\`\`\`\n${CLOSE}`;
}

export function richHint(prompt: string): string {
  const p = prompt.trim();
  const words = p.split(/\s+/);
  if (p.length < 8 || words.length < 3 || words.length > 80) return "";
  if (PROS.test(p)) return fence('{"blocks":[{"type":"proscons","pros":["..."],"cons":["..."]},{"type":"callout","text":"One sentence takeaway."}]}');
  if (STEPS.test(p) || WAY.test(p)) return fence('{"blocks":[{"type":"steps","items":[{"title":"Step title from the guide","body":"One line."}]},{"type":"callout","text":"One sentence takeaway."}]}');
  if (COMPARE.test(p)) return fence('{"blocks":[{"type":"compare","columns":["Option A","Option B"],"rows":[{"label":"A real point of comparison","cells":["...","..."]}]},{"type":"callout","text":"One sentence verdict."}]}');
  if (TIMELINE.test(p)) return fence('{"blocks":[{"type":"timeline","items":[{"when":"A year you stated","title":"...","body":"One line."}]},{"type":"callout","text":"One sentence takeaway."}]}');
  if (RANK.test(p)) return `${fence('{"blocks":[{"type":"ranked","note":"This order is a judgment, and it changes.","items":[{"rank":1,"name":"A current name you stated","maker":"Its maker, if you stated one","why":"One line from your answer."}]},{"type":"callout","text":"One sentence takeaway."}]}')}\nFor a best, greatest, or top question, the ranked list has 5 to 8 items, in the order you would rank them. Each item needs the name, the maker when you know it, and a one-line why. Use the current generation of each product when you know it, and the markdown above must already use that same name. Do not stop at one example.`;
  return "";
}
