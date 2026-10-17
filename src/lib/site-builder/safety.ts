/**
 * Abuse checks for the site builder: prompts before generation, sites before publishing.
 * Pure rules plus the shared text moderation (OpenAI omni-moderation when configured, keyword rules otherwise).
 * The sanitizer already removed scripts, password/file inputs, event handlers and external form actions;
 * these checks catch what is left: look-alike login pages, card/ID collection, malware downloads, scams.
 *
 * Prompt rules judge intent. Ordinary apps may mention prices, collections, record labels, wishlists,
 * accounts, and a sign-in for the app itself. A negated phrase ("no fake testimonials") is an instruction
 * to leave the thing out, not a request to build it. There is no separate LLM classifier on this gate.
 */
import { moderateText } from "@/lib/create/platform/moderation";

export type ScanResult = { verdict: "pass" | "review" | "block"; findings: string[] };

const BRANDS =
  "paypal|apple id|icloud|microsoft|office ?365|outlook|gmail|google account|facebook|instagram|whatsapp|linkedin|chase|wells fargo|bank of america|citibank|capital one|hsbc|barclays|coinbase|metamask|binance|kraken|ledger|trezor|netflix|amazon|dhl|fedex|usps|irs|dmv|docusign|dropbox|steam|discord|stripe|venmo|cash app|zelle|robinhood|whop";
const BRAND_RE = new RegExp(`\\b(?:${BRANDS})\\b`, "i");
const LOGIN_WORDS = /\b(sign ?in|log ?in|verify (?:your )?(?:account|identity|email)|confirm (?:your )?(?:account|identity|password)|account (?:suspended|locked|limited|on hold)|unusual (?:sign-?in|activity)|security alert|update (?:your )?(?:billing|payment)|re-?activate)\b/i;
const SENSITIVE_FIELD = /\b(card ?(?:number|no\.?)|credit card|debit card|cvv|cvc|security code|expir(?:y|ation)|ssn|social security|routing number|iban|account number|seed phrase|recovery phrase|secret phrase|private key|mnemonic|one-?time (?:code|password)|otp|2fa code|passcode|password)\b/i;
const MALWARE_EXT = /\.(?:exe|scr|msi|bat|cmd|pif|vbs|vbe|js|jse|wsf|ps1|jar|apk|dmg|pkg|lnk|iso|img|hta|reg|dll|docm|xlsm)(?:\s|$)/i;
const SHORTENERS = /^(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rb\.gy|cutt\.ly|shorturl\.at|tiny\.cc|rebrand\.ly|s\.id)$/i;
const SCAM_LANGUAGE = /\b(connect (?:your )?wallet|claim (?:your )?(?:airdrop|reward|prize|bonus)|you(?:'ve| have) won|guaranteed (?:returns|profit)|double your (?:bitcoin|crypto|money)|send (?:\d+ )?(?:btc|eth|usdt) to|investment (?:guaranteed|risk-?free)|crypto giveaway|recover (?:your )?(?:lost )?(?:funds|crypto)|tech support (?:number|hotline))\b/i;
const MINER = /coinhive|cryptonight|webminer|miner\.start|stratum\+tcp/i;

export const PROMPT_REFUSAL = "Keplar can't build that. Sites that imitate other companies, collect passwords or payment details, or distribute malware aren't allowed.";

/** Credentials someone is trying to harvest. Not prices, labels, or the app's own account. */
const CREDENTIAL = "passwords?|credit cards?|debit cards?|card numbers?|cvv|cvc|ssn|social security(?: numbers?)?|seed phrases?|recovery phrases?|private keys?|bank (?:login|details|accounts?)";
/** Harvest verbs, conjugated. Not prefixes: "collection" and "collectors" are not "collect". */
const HARVEST_VERB = "collect(?:s|ed|ing)?|steal(?:s|ing)?|stolen|capture[sd]?|capturing|harvest(?:s|ed|ing)?|grab(?:s|bed|bing)?|skim(?:s|med|ming)?|exfiltrat(?:e|es|ed|ing)";
const DECEPTION_VERB = "clone[ds]?|cloning|fake|replica|spoof(?:ed|ing)?|look-?alike|imitat(?:e|es|ed|ing|ion)";
const STRONG_VERB = "impersonat(?:e|es|ed|ing|ion)|pretend to be";
const LOGINISH = "log ?in|sign ?in|checkout|passwords?";
/** Brand, bank, or a name that is only suspicious next to a login or checkout ("apple", "google"). */
const LOGIN_TARGET = `${BRANDS}|apple|google|bank`;

const PROMPT_RULES: RegExp[] = [
  // "anti-phishing" / "anti-malware" is guidance about the threat, not a request to ship it.
  /(?<!anti-)\b(?:phishing|credential harvest(?:er|ing)?|keylogger|ransomware|malware|spyware|infostealer|stealer|card ?skimmer|skimmer|botnet|ddos)\b/i,
  new RegExp(`\\b(?:${DECEPTION_VERB})\\b[\\s\\S]{0,80}\\b(?:${BRANDS})\\b`, "i"),
  new RegExp(`\\b(?:${DECEPTION_VERB}|${STRONG_VERB})\\b[\\s\\S]{0,70}\\b(?:${LOGIN_TARGET})\\b[\\s\\S]{0,40}\\b(?:${LOGINISH})\\b`, "i"),
  new RegExp(`\\b(?:${DECEPTION_VERB}|${STRONG_VERB})\\b[\\s\\S]{0,50}\\b(?:${LOGINISH})\\b[\\s\\S]{0,40}\\b(?:${LOGIN_TARGET})\\b`, "i"),
  new RegExp(`\\b(?:${STRONG_VERB})\\b[\\s\\S]{0,60}\\b(?:${LOGIN_TARGET}|police|government)\\b`, "i"),
  // "copy" is also marketing copy ("real copy for this audience"). It only counts when it duplicates a company's login or checkout.
  new RegExp(`\\bcopy\\b[\\s\\S]{0,40}\\b(?:${LOGIN_TARGET})\\b[\\s\\S]{0,30}\\b(?:${LOGINISH})\\b`, "i"),
  new RegExp(`\\b(?:${HARVEST_VERB})\\b[\\s\\S]{0,60}\\b(?:${CREDENTIAL})\\b|\\b(?:${CREDENTIAL})\\b[\\s\\S]{0,40}\\b(?:${HARVEST_VERB})\\b`, "i"),
  new RegExp(`\\b(?:asks?|asking) for\\b[\\s\\S]{0,40}\\b(?:${CREDENTIAL})\\b`, "i"),
  /\b(?:fake|counterfeit|forged)\b[\s\S]{0,40}\b(?:id|passport|diploma|invoice|receipt|reviews?|testimonials?|giveaway|lottery|casino|investment)\b/i,
  /\b(?:wallet drainer|connect wallet to claim|crypto drainer)\b/i,
];

/** The harmful phrase is an instruction to leave it out ("no fake testimonials", "don't collect passwords").
 * The negation has to be the one governing the phrase. A second negation in the gap ("not not a fake…") cancels it. */
const NEGATION_BEFORE = /\b(?:do not|don['’]?t|without|avoid(?:ing)?|excluding|instead of|no|not|never)\b(?:\s+(?!not\b|no\b|never\b|don['’]?t\b)[a-z0-9][\w'-]*){0,4}\s*$/i;
const NEGATION_CANCEL = /\b(?:not|no|never|don['’]?t|do not)\b\s*$/i;

function negatedAt(prompt: string, index: number): boolean {
  const clause = prompt.slice(Math.max(0, index - 80), index).split(/[.!?\n]/).pop() ?? "";
  const m = NEGATION_BEFORE.exec(clause);
  if (!m) return false;
  // "not not a fake …" is still a request. A single negation directly in front is not.
  return !NEGATION_CANCEL.test(clause.slice(0, m.index));
}

function hitsHarm(prompt: string, pattern: RegExp): boolean {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const match of prompt.matchAll(re)) {
    if (!negatedAt(prompt, match.index ?? 0)) return true;
  }
  return false;
}

export async function checkPrompt(prompt: string): Promise<string | null> {
  if (PROMPT_RULES.some((rule) => hitsHarm(prompt, rule))) return PROMPT_REFUSAL;
  const v = await moderateText(prompt);
  return v.allowed ? null : (v.reason ?? "That request isn't allowed under the content policy.");
}

const textOf = (html: string) => html.replace(/<(style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

/** Scans the canonical (sanitized) files of one version. */
export async function scanFiles(files: Record<string, string>): Promise<ScanResult> {
  const findings: string[] = [];
  let block = false;
  let review = false;
  const pages = Object.entries(files).filter(([p]) => p.endsWith(".html"));
  const hosts = new Set<string>();
  let externalLinks = 0;

  for (const [path, html] of pages) {
    const text = textOf(html);
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
    const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/gi)].map((m) => m[0]);
    const hasForm = forms.length > 0;
    const formText = forms.join(" ");
    if (hasForm && SENSITIVE_FIELD.test(formText.replace(/<input[^>]+type="hidden"[^>]*>/gi, ""))) {
      block = true;
      findings.push(`${path}: a form asks for passwords, payment card, ID or wallet details. Keplar sites can't collect those.`);
    }
    const headline = title + " " + [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => textOf(m[1])).join(" ");
    if (BRAND_RE.test(headline) && LOGIN_WORDS.test(text) && hasForm) {
      block = true;
      findings.push(`${path}: looks like a sign-in or verification page for a well-known company (possible phishing).`);
    } else if (BRAND_RE.test(title) && LOGIN_WORDS.test(text)) {
      review = true;
      findings.push(`${path}: mentions a well-known company in a sign-in context.`);
    }
    if (SCAM_LANGUAGE.test(text)) {
      block = true;
      findings.push(`${path}: scam-style wording (wallet connect, prizes, guaranteed returns).`);
    }
    if (MINER.test(html)) {
      block = true;
      findings.push(`${path}: crypto-mining code.`);
    }
    for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
      const href = m[1].replace(/&amp;/g, "&");
      let pathname = href;
      try {
        pathname = new URL(href, "https://x.invalid").pathname;
      } catch {
        /* keep the raw value */
      }
      if (MALWARE_EXT.test(pathname + " ") || MALWARE_EXT.test(pathname)) {
        block = true;
        findings.push(`${path}: links to a program or script download (${href.slice(0, 60)}).`);
      }
      if (/^https?:\/\//i.test(href)) {
        externalLinks++;
        try {
          const u = new URL(href);
          hosts.add(u.hostname);
          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || /^\[/.test(u.hostname)) {
            review = true;
            findings.push(`${path}: links to a raw IP address.`);
          }
          if (SHORTENERS.test(u.hostname)) {
            review = true;
            findings.push(`${path}: uses a link shortener (${u.hostname}).`);
          }
          if (/(^|\.)xn--/.test(u.hostname)) {
            review = true;
            findings.push(`${path}: links to an internationalized look-alike domain (${u.hostname}).`);
          }
        } catch {
          /* ignored: the sanitizer keeps only parseable URLs */
        }
      }
    }
  }
  if (externalLinks > 40) {
    review = true;
    findings.push("More than 40 outbound links (possible link spam).");
  }
  const mod = await moderateText(pages.map(([, h]) => textOf(h)).join("\n").slice(0, 20_000));
  if (!mod.allowed) {
    block = true;
    findings.push(`Content policy: ${mod.category ?? "blocked"}.`);
  }
  return { verdict: block ? "block" : review ? "review" : "pass", findings: [...new Set(findings)].slice(0, 12) };
}
