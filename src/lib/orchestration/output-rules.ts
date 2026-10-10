/**
 * Standing output rules the person sets in plain words: "follow these rules, say nothing more and nothing less, just say Yess."
 *
 * The models are not trusted to keep such a rule (one of them answered the next message with an essay), so the rule is enforced
 * in code, before any model is asked: while it is active the reply IS the literal text. No panel, no metadata card, no credits.
 *
 *  - A rule needs a literal ("just say Yess", 'reply with only "OK"') AND a strictness marker (nothing more/else/less, only,
 *    exactly, just, rules, from now on, always). "just say hello to my friend in French" is a task, not a rule.
 *  - It is STANDING when the message talks about rules / from now on / always / every time / until I say...; otherwise it
 *    applies to that one message.
 *  - A later message that cancels it ("stop", "you can answer normally now", "ignore the rules", "reset") ends it, and that
 *    message is answered normally.
 *  - Pure: history in, literal (or null) out, so it is unit-tested without a server.
 */

export type OutputRule = { text: string; standing: boolean; since: number };
type Turn = { role: "user" | "keplar"; text: string };

const QUOTE = `["“”'‘’«»]`;
const MARKER = /\b(?:nothing\s+(?:more|else|less|but)|and\s+nothing|only|exactly|just|simply|rules?|from\s+now\s+on|always|every\s+(?:time|message|reply|response|answer)|each\s+(?:time|message|reply|response))\b/i;
const STANDING = /\b(?:rules?|from\s+now\s+on|always|every\s+(?:time|message|reply|response|answer)|each\s+(?:time|message|reply|response)|going\s+forward|for\s+the\s+rest|until\s+i\s+(?:say|tell)|whenever|keep\s+(?:doing|saying|answering|replying))\b/i;
const CANCEL = /(?:^\s*(?:reset|stop|cancel|enough|normal)\s*[.!]?\s*$|\b(?:stop|cancel|ignore|forget|drop|end|disregard|reset|undo)\b[^.!?\n]{0,40}\b(?:rules?|that|this|it|the\s+game|the\s+instruction|the\s+yess?|saying)\b|\b(?:answer|reply|respond|talk|speak)\s+normally\b|\bback\s+to\s+normal\b|\bnormal\s+mode\b|\bno\s+more\s+rules?\b|\byou\s+can\s+(?:stop|answer|talk|speak|reply|respond)\b)/i;

const VERB = "(?:say|reply(?:\\s+with)?|respond(?:\\s+with)?|answer(?:\\s+with)?|write|type|output|print|repeat|return)";
const QUOTED = [
  new RegExp(`\\b${VERB}(?:\\s+(?:only|just|exactly))?(?:\\s+with)?\\s+(?:(?:only|just|exactly)\\s+)?${QUOTE}([^"“”'‘’«»\\n]{1,60})${QUOTE}`, "i"),
];
const BARE = new RegExp(`\\b(?:just|only|simply|exactly)\\s+${VERB}\\s+([^\\s.,!?;:"“”'‘’«»]{1,30}(?:\\s+[^\\s.,!?;:"“”'‘’«»]{1,30}){0,2})\\s*(?:[.!?]+|,|;|$|\\band\\b|\\bnothing\\b)`, "i");

/** The literal a rule message asks for, or null when the message isn't a rule. */
export function literalOf(message: string): { text: string; standing: boolean } | null {
  const raw = message.trim();
  if (!raw || raw.length > 400 || /[\r\n]{2,}/.test(raw)) return null;
  if (!MARKER.test(raw)) return null;
  let text: string | null = null;
  for (const rx of QUOTED) {
    const m = rx.exec(raw);
    if (m) {
      text = m[1].trim();
      break;
    }
  }
  if (text === null) {
    const m = BARE.exec(raw);
    // Unquoted: at most three words, and the whole message must be short (a rule, not a task that happens to contain "just say").
    if (m && raw.split(/\s+/).length <= 24) text = m[1].trim();
  }
  if (!text || text.length > 60 || /[<>{}]/.test(text)) return null;
  if (/^(?:it|that|this|so|nothing|something|anything|yes or no|what|why|how|hi to|hello to)\b/i.test(text) && !new RegExp(QUOTE).test(raw)) return null;
  return { text, standing: STANDING.test(raw) };
}

/** The rule in force for `prompt` given the conversation so far, or null. */
export function activeOutputRule(history: readonly Turn[] | undefined, prompt: string): OutputRule | null {
  const users = [...(history ?? []).filter((h) => h.role === "user").map((h) => h.text), prompt];
  let rule: OutputRule | null = null;
  users.forEach((text, i) => {
    const isCurrent = i === users.length - 1;
    const lit = literalOf(text);
    if (lit) {
      rule = { text: lit.text, standing: lit.standing, since: i };
      return;
    }
    if (rule && CANCEL.test(text)) rule = null;
    else if (rule && !rule.standing && !isCurrent) rule = null;
  });
  if (!rule) return null;
  const r: OutputRule = rule;
  // A one-message rule only governs the message that carried it.
  if (!r.standing && r.since !== users.length - 1) return null;
  return r;
}
