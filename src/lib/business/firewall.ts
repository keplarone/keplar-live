/**
 * AI Firewall for outbound agent actions. Server-enforced, deterministic (no model call), and fail-safe:
 * anything it cannot judge low-risk waits for a human.
 *
 *   action -> risk -> cost -> permission -> approval
 *
 * Rules (checked in `inspectAction`):
 *  - BLOCK (never sent, never queued): credentials or private keys in the text, header injection in recipients/subjects,
 *    more than one email recipient in one action.
 *  - HIGH (always needs the owner, never auto-sent): recipient is not a known contact, links to raw IPs / non-https / shorteners,
 *    "@channel"/"@here" mass mentions, text that tries to instruct the assistant (prompt-injection phrases from inbound content),
 *    card-number-like digits, many links.
 *  - MEDIUM: any other email or public post (external audience); a connected-app (MCP) tool the owner marked read-only.
 *  - HIGH also: any connected-app tool that is write, outbound or not yet classified (unknown = write).
 *  - LOW: internal rows and plain Slack posts.
 * Auto-send is allowed only for LOW and MEDIUM actions with no flags, never for unknown recipients.
 */
import type { OutboundAction } from "./types";

export type Risk = "low" | "medium" | "high";
export type Verdict = { risk: Risk; reasons: string[]; blocked: string | null; autoSendAllowed: boolean };

export const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, "a payment API key"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, "an API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "a cloud access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "a GitHub token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "a Slack token"],
  [/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/, "a signed token (JWT)"],
  [/\b(?:password|passwd|secret|api[_ -]?key)\s*[:=]\s*\S{6,}/i, "a password or secret"],
];

const INJECTION = /(ignore (all |any )?(previous|prior|above) (instructions|messages)|disregard (the )?(system|previous) (prompt|instructions)|you are now|system prompt|reveal your (instructions|prompt)|forward (this|all) (email|message)s? to)/i;

const luhn = (digits: string) => {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};
const hasCardNumber = (t: string) => (t.match(/\b(?:\d[ -]?){13,19}\b/g) ?? []).some((m) => luhn(m.replace(/\D/g, "")) && m.replace(/\D/g, "").length >= 13);

const SHORTENERS = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rb\.gy|cutt\.ly)\//i;

function linkProblems(text: string): string[] {
  const out: string[] = [];
  const urls = text.match(/\bhttps?:\/\/[^\s<>)"']+/gi) ?? [];
  if (urls.length > 5) out.push("it contains many links");
  for (const u of urls) {
    if (/^http:\/\//i.test(u)) out.push("it links to a non-secure (http) address");
    try {
      const h = new URL(u).hostname;
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) out.push("it links to a raw IP address");
    } catch {
      out.push("it contains a malformed link");
    }
  }
  if (SHORTENERS.test(text)) out.push("it uses a link shortener");
  return [...new Set(out)];
}

const textOf = (a: OutboundAction): string =>
  a.type === "email.send" ? `${a.subject}\n${a.body}` : a.type === "slack.post" || a.type === "social.schedule" ? a.text : a.type === "mcp.call" ? `${a.tool}\n${safeJson(a.args)}` : a.type === "gcal.event" ? `${a.title}\n${a.description}` : a.type === "github.issue" ? `${a.repo}\n${a.title}\n${a.body}` : a.row.map(String).join(" | ");
const safeJson = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
};

/** Pure and deterministic. `knownEmails` = lowercase emails of the workspace's CRM contacts. */
export function inspectAction(action: OutboundAction, knownEmails: ReadonlySet<string> = new Set()): Verdict {
  const text = textOf(action);
  const reasons: string[] = [];
  let risk = (action.type === "sheets.append" || action.type === "slack.post" ? "low" : "medium") as Risk;
  if (action.type === "mcp.call") {
    // Only a tool the owner marked read-only can be medium (and so eligible for auto-run). Write / outbound / unknown = high:
    // never auto-run, always the owner.
    if (action.toolRisk !== "read") {
      risk = "high";
      reasons.push(action.toolRisk === "write" ? "this tool can change things outside Keplar" : "this tool hasn't been marked read-only, so it is treated as one that can change things");
    } else reasons.push("it sends data to an external app server");
  }
  if (action.type === "gcal.event" || action.type === "github.issue") {
    risk = "high"; // creates something visible to other people; always the owner's call
    reasons.push(action.type === "gcal.event" ? "it adds an event to your calendar" : "it opens a public issue");
  }
  const raise = (r: Risk) => {
    if (r === "high" || (r === "medium" && risk === "low")) risk = r;
  };
  const block = (why: string) => ({ risk: "high" as Risk, reasons: [...reasons, why], blocked: why, autoSendAllowed: false });

  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) return block(`The text contains ${label}. It was not sent.`);

  if (action.type === "email.send") {
    if (/[\r\n]/.test(action.to) || /[\r\n]/.test(action.subject)) return block("The recipient or subject contains a line break (header injection). It was not sent.");
    if (/[,;\s]/.test(action.to.trim())) return block("An email action can have only one recipient. It was not sent.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(action.to)) return block("The recipient isn't a valid email address. It was not sent.");
    if (!knownEmails.has(action.to.trim().toLowerCase())) {
      reasons.push("the recipient isn't one of your contacts");
      raise("high");
    }
  }
  if ((action.type === "slack.post" || action.type === "social.schedule") && /(^|\s)@(channel|here|everyone)\b/i.test(text)) {
    reasons.push("it mentions everyone (@channel / @here)");
    raise("high");
  }
  if (action.type === "social.schedule") reasons.push("it will be public");
  for (const p of linkProblems(text)) {
    reasons.push(p);
    raise("high");
  }
  if (INJECTION.test(text)) {
    reasons.push("it contains text that tries to instruct the assistant");
    raise("high");
  }
  if (hasCardNumber(text)) {
    reasons.push("it contains a card-number-like value");
    raise("high");
  }
  if (action.type === "mcp.call" && (!action.tool || action.tool.length > 128)) return block("The tool name is invalid. It was not run.");
  if (action.type === "email.send" && reasons.length === 0) reasons.push("it goes to a contact outside Keplar");
  return { risk, reasons, blocked: null, autoSendAllowed: risk !== "high" };
}

export class FirewallBlock extends Error {
  status = 422;
  code = "firewall_blocked";
}
