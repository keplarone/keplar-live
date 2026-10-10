import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { terms } from "@/components/legal/content/terms";
import { privacy } from "@/components/legal/content/privacy";
import { reviewItems, type LegalDoc } from "@/components/legal/content/types";
import { FAQ_MIN_USERS } from "@/lib/faq/normalize";
import { SHARE_LIMITS } from "@/lib/growth/share";
import { OUTPUT_RETENTION_MS } from "@/lib/higgsfield/video";
import { KEEP_DAYS } from "@/lib/learning/pipeline";
import { HUMAN_REPLY } from "@/lib/orchestration/identity-guards";

const text = (d: LegalDoc) => JSON.stringify(d);
const read = (f: string) => readFileSync(f, "utf8");

test("open items are only the three facts the founders must supply (entity, address, jurisdiction)", () => {
  assert.deepEqual(reviewItems(terms).map((r) => r.section.id), ["agreement", "governing-law", "contact"]);
  assert.deepEqual(reviewItems(privacy).map((r) => r.section.id), ["contact"]);
  for (const d of [terms, privacy]) for (const r of reviewItems(d)) assert.match(r.text, /founders|supplied/i);
});

test("the unreviewed-by-an-attorney footer is always rendered, and no certification is claimed", () => {
  assert.match(read("src/components/legal/LegalPage.tsx"), /drafted by the Keplar team and .*not been reviewed by an attorney/);
  for (const d of [terms, privacy]) {
    assert.doesNotMatch(text(d), /SOC ?2|ISO ?27001|HIPAA[- ]compliant|GDPR[- ]compliant|certified|PCI[- ]DSS/i);
    assert.match(d.lastUpdated ?? "", /^[A-Z][a-z]+ \d{1,2}, 2026$/);
  }
  assert.match(privacy.sections.find((x) => x.id === "security")!.blocks.map((b) => JSON.stringify(b)).join(""), /does not currently hold a security certification/);
});

test("no founder ages, birth dates or invented entity details are published", () => {
  for (const d of [terms, privacy]) {
    assert.doesNotMatch(text(d), /\bborn\b|birth ?date|date of birth|Hassen|Hussain/i);
    assert.doesNotMatch(text(d), /\b(Inc\.|LLC|Ltd\.?|GmbH|Corp\.|EIN)\b|\bVAT (id|number)|registration number|Delaware|California|New York|England|Wyoming/);
  }
  const g = terms.sections.find((s) => s.id === "governing-law")!;
  assert.match(JSON.stringify(g), /\[\[governing jurisdiction/);
});

test("minimum age 13, parental permission under 18, in the Terms, the Privacy Policy and the sign-up form", () => {
  assert.match(JSON.stringify(terms.sections.find((s) => s.id === "eligibility")), /at least 13[^"]*under 18[^"]*parent or legal guardian/);
  assert.match(JSON.stringify(privacy.sections.find((s) => s.id === "children")), /at least 13[^"]*under 18/);
  // The sign-up form's copy lives in the client catalogs (src/lib/i18n/messages/client); the form renders it as the checkbox label
  // (t.terms) and the Google/Microsoft consent line (t.oauthConsent), and blocks sign-up until the box is ticked.
  const form = read("src/components/auth/AuthForm.tsx");
  assert.match(form, /rich\(t\.terms,/);
  assert.match(form, /rich\(t\.oauthConsent,/);
  assert.match(form, /if \(!accept\) return fail\(\{ terms: t\.errTerms \}, "terms"\)/);
  const en = read("src/lib/i18n/messages/client/en.ts");
  assert.match(en, /terms: "I am at least 13 \(with a parent or guardian\\u2019s permission if under 18\)/);
  assert.match(en, /oauthConsent: "By continuing with Google or Microsoft you confirm you are at least 13/);
  // every translated sign-up form states the same minimum age (13 in Latin, Bengali, Arabic-Indic, Persian or Devanagari digits)
  for (const f of readdirSync("src/lib/i18n/messages/client")) {
    const c = read(`src/lib/i18n/messages/client/${f}`);
    for (const key of ["terms", "oauthConsent"]) {
      const v = new RegExp(`"?${key}"?: "([^"]*)"`).exec(c)?.[1] ?? "";
      assert.match(v, /13|১৩|١٣|۱۳|१३/, `${f} ${key}`);
    }
  }
});

test("terms decisions: 30-day notice, liability cap, 7-day refund through Whop, no arbitration, creditable billing facts", () => {
  const t = text(terms);
  assert.match(t, /at least 30 days' notice before we raise the price/);
  assert.match(t, /at least 30 days' notice by email or in the app/);
  assert.match(t, /greater of the amount you paid[^"]*12 months[^"]*US\$100/);
  assert.match(t, /within 7 days of your first payment/);
  assert.match(t, /through Whop, our payment processor/);
  assert.match(t, /do not require arbitration/);
  assert.match(t, /does not allow Keplar to train AI models on your input/);
  // The refund promise matches the billing code: a refund or dispute moves the account to Free.
  assert.match(read("src/lib/billing/sync.ts"), /refund\.created/);
  assert.match(t, /account moves to the Free plan/);
  // The AI disclosure matches the fixed reply.
  assert.equal(HUMAN_REPLY, "No.");
  assert.match(t, /If you ask whether Keplar is human, it answers \\"No\.\\"/);
});

test("retention and consent statements match the code constants", () => {
  const p = text(privacy);
  assert.equal(KEEP_DAYS, 45);
  assert.match(p, /deleted after 45 days/);
  assert.equal(SHARE_LIMITS.days, 90);
  assert.match(p, /expires after 90 days/);
  assert.match(text(terms), /stops working after 90 days/);
  assert.equal(OUTPUT_RETENTION_MS, 7 * 86_400_000);
  assert.match(p, /at least 7 days/);
  assert.equal(FAQ_MIN_USERS, 5);
  assert.match(p, /at least five different people/);
  assert.match(p, /180 days/);
  assert.match(read("src/lib/learning/repo.ts"), /Off until the person turns it on/);
  assert.match(read("src/lib/faq/repo.ts"), /off by default/);
});

test("every service provider the code uses is named in the Privacy Policy", () => {
  const infra = JSON.stringify(privacy.sections.find((s) => s.id === "infrastructure-providers"));
  for (const n of ["Vercel", "Neon", "Resend", "Whop", "Stripe", "OpenRouter", "OpenAI", "NVIDIA", "Higgsfield", "Upstash", "Google", "Microsoft"]) assert.ok(infra.includes(n), n);
  assert.match(infra, /Stripe is not used to bill Keplar plans/);
});
