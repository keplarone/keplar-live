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

Block rules: at most 6 blocks and 8 items; one sentence per why, body, or cell; at most 3 short tags. Never invent a score, benchmark, citation, URL, or "as of" date. A score or stat may include a number only when that exact number is in the material. A source URL only when that URL is in the material; if there is no URL, omit sources. Do not put agreement counts, model names, or who-said-what in the block. For a ranking, note must say the order is a judgment and that it changes, and must not name a date unless the material gives that date. One callout, the single takeaway. A how-to uses a steps block (titles and one line each) and leaves the full guide in the markdown. If you are not sure the block is valid JSON, omit it.`;
