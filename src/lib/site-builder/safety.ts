/**
 * Abuse checks for the site builder: prompts before generation, sites before publishing.
 * Pure rules plus the shared text moderation (OpenAI omni-moderation when configured, keyword rules otherwise).
 * The sanitizer already removed scripts, password/file inputs, event handlers and external form actions;
 * these checks catch what is left: look-alike login pages, card/ID collection, malware downloads, scams.
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

const PROMPT_BLOCKS: RegExp[] = [
  /\b(phishing|credential harvest(?:er|ing)?|keylogger|ransomware|malware|spyware|infostealer|stealer|card skimmer|skimmer|botnet|ddos)\b/i,
  /\b(clone|copy|fake|replica|spoof|look-?alike|imitat\w+|pretend to be|impersonat\w+)\b[\s\S]{0,60}\b(log ?in|sign ?in|bank|paypal|apple|microsoft|facebook|instagram|amazon|coinbase|metamask|binance|netflix|irs|dhl|fedex|usps|government|police)\b/i,
  /\b(collect|steal|capture|harvest|grab|ask(?:s)? for|request|get)\w*\b[\s\S]{0,40}\b(passwords?|credit card|card numbers?|cvv|ssn|social security|seed phrase|recovery phrase|private keys?|bank (?:login|details|account))\b/i,
  /\b(fake|counterfeit)\b[\s\S]{0,30}\b(id|passport|diploma|invoice|receipt|reviews?|testimonials?|giveaway|lottery|casino|investment)\b/i,
  /\b(wallet drainer|connect wallet to claim|crypto drainer)\b/i,
];

export async function checkPrompt(prompt: string): Promise<string | null> {
  if (PROMPT_BLOCKS.some((r) => r.test(prompt))) return PROMPT_REFUSAL;
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
