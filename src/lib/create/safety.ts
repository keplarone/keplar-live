/**
 * Publish-time safety scan for user sites (phishing, malware, abuse).
 * Local heuristics always run. Live adds Google Web Risk lookups for every
 * outbound URL (PLACEHOLDER until GOOGLE_WEB_RISK_API_KEY is set). A "block"
 * verdict stops the deploy; "review" publishes but queues human review.
 */
import { isLive, USER_CONTENT_DOMAIN } from "./platform/config";
import { moderateText } from "./platform/moderation";

export type ScanResult = { verdict: "pass" | "review" | "block"; findings: string[] };

const BRANDS = /\b(paypal|apple id|icloud|microsoft|office ?365|outlook|gmail|google account|chase|wells fargo|bank of america|coinbase|metamask|binance|netflix|amazon)\b/i;

export async function scanSite(files: Record<string, string>): Promise<ScanResult> {
  const findings: string[] = [];
  let block = false;
  let review = false;
  const all = Object.values(files).join("\n");
  const html = Object.entries(files).filter(([p]) => p.endsWith(".html")).map(([, c]) => c).join("\n");

  const hasPassword = /<input[^>]+type=["']?password/i.test(html);
  const hasCard = /\b(card ?number|cvv|cvc|expiry)\b/i.test(html) && /<input/i.test(html);
  if (hasPassword && BRANDS.test(html)) { block = true; findings.push("Password field on a page that names a well-known brand (possible credential phishing)."); }
  else if (hasPassword) { review = true; findings.push("Page collects passwords."); }
  if (hasCard) { block = true; findings.push("Page collects card details directly. Use checkout instead."); }
  if (/seed phrase|recovery phrase|private key/i.test(html) && /<input|<textarea/i.test(html)) { block = true; findings.push("Page asks for a wallet seed phrase."); }
  if (/eval\s*\(\s*atob|unescape\s*\(\s*['"]%|document\.write\s*\(\s*unescape/i.test(all)) { block = true; findings.push("Obfuscated script execution."); }
  if (/coinhive|cryptonight|webminer|miner\.start/i.test(all)) { block = true; findings.push("Crypto-mining script."); }
  if (/<iframe[^>]+(width|height)=["']?0/i.test(html)) { review = true; findings.push("Hidden iframe."); }
  if (/<meta[^>]+http-equiv=["']?refresh[^>]+url=https?:/i.test(html)) { review = true; findings.push("Automatic redirect to another site."); }
  const actions = [...html.matchAll(/<form[^>]+action=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const a of actions) {
    if (/^https?:\/\//i.test(a) && !a.includes(USER_CONTENT_DOMAIN)) { review = true; findings.push(`Form sends data to an external site (${new URL(a).host}).`); }
  }
  const text = html.replace(/<[^>]+>/g, " ").slice(0, 20_000);
  const mod = await moderateText(text);
  if (!mod.allowed) { block = true; findings.push(`Content policy: ${mod.category}.`); }

  if (isLive("scanning")) {
    // PLACEHOLDER: POST https://webrisk.googleapis.com/v1/uris:search for each outbound URL
    // (threatTypes MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE); any match => block.
  }
  return { verdict: block ? "block" : review ? "review" : "pass", findings };
}
