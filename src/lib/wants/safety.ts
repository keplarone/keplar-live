/**
 * Every Keplar Wants request gets a structured, honest result.
 * Illegal, unauthorized, or circumvention intents are refused or escalated with a reason.
 * "Never say no" means the caller always receives JSON, not that every action is allowed.
 */
export type SafetyVerdict = { status: "refused" | "escalated"; code: string; reason: string };

const REFUSE: Array<[RegExp, string, string]> = [
  [/\b(bypass|break|crack|solve|get around)\b.*\b(captcha|login|paywall|2fa|mfa|password)\b/i, "circumvention", "Keplar won't bypass logins, CAPTCHAs, paywalls or site protections."],
  [/\b(hack|phish|ddos|malware|keylog|steal|credential stuff)/i, "unauthorized_access", "Keplar won't help access systems or accounts without authorization."],
  [/\b(fake id|counterfeit|launder|stolen card|carding)\b/i, "illegal", "That action is illegal."],
  [/\b(buy|order|get)\b.*\b(cocaine|heroin|meth|fentanyl|gun without|unregistered gun)\b/i, "illegal", "Keplar can't help obtain illegal goods."],
  [/\b(scrape|mass.?create|bot)\b.*\b(accounts?|reviews?|tickets? in bulk)\b/i, "terms_violation", "That would violate the target site's terms of service."],
  [/\b(someone else'?s|my (ex|boss|neighbou?r)'?s?)\b.*\b(account|email|phone)\b/i, "unauthorized_access", "Keplar only acts on accounts you own and have connected."],
];

const ESCALATE: Array<[RegExp, string, string]> = [
  [/\b(wire|transfer|send)\b.*\$?\d{4,}/i, "high_value_transfer", "Large money movement needs a human review step."],
  [/\b(medical|prescription|dosage)\b/i, "regulated_advice", "Regulated request: routed to a human/professional."],
];

export function checkWant(prompt: string): SafetyVerdict | null {
  const p = prompt.toLowerCase();
  for (const [rx, code, reason] of REFUSE) {
    if (rx.test(p)) return { status: "refused", code, reason };
  }
  for (const [rx, code, reason] of ESCALATE) {
    if (rx.test(p)) return { status: "escalated", code, reason };
  }
  return null;
}
