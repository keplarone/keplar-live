#!/usr/bin/env node
/**
 * Secret scan for the deploy gate (scripts/verify.mjs). Looks for credentials that must never be committed or uploaded:
 * provider API keys, webhook secrets, private keys and database URLs with a password. Scans tracked files AND untracked
 * files that are not ignored, because a Vercel folder deploy uploads those too.
 *
 *   node scripts/secret-scan.mjs        exits 1 and prints file:line (never the value) for every hit
 *   node scripts/secret-scan.mjs --dir .next/static     scans every file under a directory instead (build output, in CI)
 *
 * A match is ignored only when its value is an obvious fixture (example, test, fake, dummy, placeholder, xxxx, or the
 * 0123456789 / abcdef runs used in tests). Real keys never look like that. Values are never printed, only where they are.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PATTERNS = [
  ["Stripe live secret key", /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g],
  ["OpenRouter key", /\bsk-or-v1-[0-9a-f]{32,}/g],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{24,}/g],
  ["OpenAI key", /\bsk-(?!or-|ant-)(?:proj-)?[A-Za-z0-9_-]{40,}/g],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/g],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu|github_pat)_[0-9A-Za-z_]{30,}/g],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{20,}/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["Webhook signing secret", /\bwhsec_[0-9A-Za-z+/=]{24,}/g],
  ["Whop API key", /\bapik_[0-9A-Za-z_]{24,}/g],
  ["Resend API key", /\bre_[0-9A-Za-z]{8}_[0-9A-Za-z]{20,}/g],
  ["Vercel token", /\bvercel_[0-9A-Za-z]{24,}/g],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\s*\n?\s*[A-Za-z0-9+/=]{40,}/g],
  ["Database URL with password", /\bpostgres(?:ql)?:\/\/[^:\s/"'`]+:[^@\s"'`]{8,}@[^\s"'`]+/g],
];

const FIXTURE = /example|test|fake|dummy|placeholder|sample|xxxx|0123456789|abcdef|\*\*\*|<[^>]*>|\$\{/i;
const SKIP_FILE = /(^|\/)(package-lock\.json|node_modules\/|\.next\/|.*\.(png|jpe?g|gif|webp|ico|mp4|webm|woff2?|ttf|otf|pdf|zip|gz|wasm|map))$/i;
const MAX_BYTES = 2 * 1024 * 1024;

/** Every hit in one text, as { label, line } (never the value). */
export function scanText(text) {
  const hits = [];
  for (const [label, re] of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (FIXTURE.test(m[0])) continue;
      hits.push({ label, line: text.slice(0, m.index).split("\n").length });
    }
  }
  return hits.sort((x, y) => x.line - y.line);
}

function files() {
  const i = process.argv.indexOf("--dir");
  if (i >= 0 && process.argv[i + 1]) {
    const out = [];
    const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else out.push(p); } };
    walk(process.argv[i + 1].replace(/\\/g, "/").replace(/\/$/, ""));
    return out;
  }
  const run = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  return [...new Set([...run(["ls-files", "-z"]), ...run(["ls-files", "-z", "--others", "--exclude-standard"])])];
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  const found = [];
  let scanned = 0;
  for (const f of files()) {
    if (SKIP_FILE.test(f)) continue;
    let text;
    try {
      if (statSync(f).size > MAX_BYTES) continue;
      text = readFileSync(f, "utf8");
    } catch { continue; }
    if (text.includes("\0")) continue; // binary
    scanned++;
    for (const h of scanText(text)) found.push(`${f}:${h.line}  ${h.label}`);
  }
  if (found.length) {
    console.error(`secret-scan: ${found.length} possible secret(s) in ${scanned} files. Remove them (and rotate any real key):\n  ${found.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`secret-scan: no secrets found in ${scanned} files.`);
}
