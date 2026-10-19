/**
 * Public, indexable shared answers: an explicit second opt-in on top of a private share link.
 *
 * Default is private (/r/<token>, noindex). The owner can additionally press "Make public" (verified email, explicit consent).
 * Then the same snapshot is also served at /answers/<slug>, which search engines may index, is listed on /answers, in
 * /answers-sitemap.xml, and gets an OG image and structured data. Turning it off, revoking the link or an admin takedown
 * returns a real 404 at once.
 *
 * Safeguards (all in code, tested):
 *  - the question is required (it is the page's title) and is the owner's own edited text;
 *  - nothing is published if the question or answer contains contact details, ID/card numbers, API keys, or addresses we can detect.
 *    We refuse and name the category instead of silently editing the owner's words;
 *  - a minimum length so thin pages are not indexed; at most MAX_PUBLIC public pages per account;
 *  - the page never contains account id, name, email, history or memory (the snapshot has none);
 *  - text is rendered as plain text, no links.
 *  - the question and answer pass the content moderation used for generated media (rules, plus the hosted classifier when
 *    configured); a refusal names the category and the page stays private;
 *  - KEPLAR_PUBLIC_ANSWERS=off pauses the whole surface: nothing publishes, /answers and the sitemap are empty, every public
 *    page is a 404, and the owners' private links keep working.
 * Detection is a safety net, not a guarantee: the dialog tells the owner to re-read the page before publishing.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { moderateText } from "@/lib/create/platform/moderation";
import type { ShareRow } from "./share";

export const PUBLIC_LIMITS = { maxPerAccount: 10, minAnswer: 400, minQuestion: 12, maxTitle: 70 } as const;

const rows = () => collection<ShareRow>("answer_shares");

/** Categories of personal or secret data we can detect with confidence. Returns the labels found. */
export function findPersonalData(text: string): string[] {
  const found = new Set<string>();
  const t = text;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/.test(t)) found.add("an email address");
  if (/(?<![\w.])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}(?![\w])/.test(t)) found.add("a phone number");
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(t)) found.add("a Social Security-style number");
  for (const m of t.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 13 && d.length <= 19 && luhn(d)) found.add("a payment card number");
  }
  if (/\b(?:sk|pk|rk|xox[abp]|ghp|gho|AKIA|AIza)[-_A-Za-z0-9]{16,}/.test(t) || /\bBearer\s+[A-Za-z0-9._-]{20,}/.test(t) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) found.add("a key or secret");
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(t)) found.add("an IP address");
  if (/\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/.test(t)) found.add("a street address");
  if (/\bhttps?:\/\/[^\s/]*(?:token|key|secret|password)=/i.test(t) || /[?&](?:token|key|secret|password|api_key)=\S{8,}/i.test(t)) found.add("a link with a token in it");
  return [...found];
}

function luhn(d: string) {
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export const slugify = (q: string) => {
  const full = q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (full.length <= 60) return full || "answer";
  const cut = full.slice(0, 60);
  const at = cut.lastIndexOf("-"); // end on a whole word
  return (at > 20 ? cut.slice(0, at) : cut).replace(/-+$/g, "");
};
export const validPublicSlug = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}$/.test(s) && s.length <= 80;

/** Title shown on the public page: the owner's question, trimmed. */
export function publicTitle(question: string) {
  const q = question.replace(/\s+/g, " ").trim();
  return q.length > PUBLIC_LIMITS.maxTitle ? `${q.slice(0, PUBLIC_LIMITS.maxTitle - 1).trimEnd()}…` : q;
}

/** First sentence-ish text for descriptions. */
export function publicSummary(markdown: string, max = 155) {
  const t = markdown.replace(/[#*_`>|~-]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, i > 60 ? i : max).trimEnd()}…`;
}

/** The public-answers kill switch: `KEPLAR_PUBLIC_ANSWERS=off` pauses publishing, listing and every public page at once. */
export const publicAnswersOn = (env: Record<string, string | undefined> = process.env) => env.KEPLAR_PUBLIC_ANSWERS?.trim().toLowerCase() !== "off";

export type PublishResult = { ok: true; slug: string; row: ShareRow } | { ok: false; code: "not_found" | "taken_down" | "needs_question" | "too_short" | "personal_data" | "unsafe" | "limit" | "paused"; message: string; found?: string[] };

export async function publishShare(workspaceId: string, token: string, at = Date.now()): Promise<PublishResult> {
  if (!publicAnswersOn()) return { ok: false, code: "paused", message: "Public pages are paused right now. Your private link keeps working." };
  const r = await rows().get(workspaceId, token);
  if (!r || r.revokedAt || Date.parse(r.expiresAt) <= at) return { ok: false, code: "not_found", message: "That link doesn't exist, was turned off, or has expired." };
  if (r.hiddenAt) return { ok: false, code: "taken_down", message: "This page was taken down by Keplar and can't be made public." };
  const q = (r.question ?? "").trim();
  if (q.length < PUBLIC_LIMITS.minQuestion) return { ok: false, code: "needs_question", message: "A public page needs the question as its title. Make a new link with your question included." };
  if (r.markdown.length < PUBLIC_LIMITS.minAnswer) return { ok: false, code: "too_short", message: "This answer is too short to be useful as a public page. Short answers stay private." };
  const found = findPersonalData([q, r.markdown, ...r.disagreements.flatMap((d) => [d.topic, d.resolution, ...d.positions.flatMap((p) => [p.stance, p.summary])]), ...r.models.map((m) => m.stance ?? ""), ...(r.checks ?? []).flatMap((k) => [k.finding, k.resolution]), ...(r.sourcing?.claims ?? []).flatMap((c) => [c.text, c.finding])].join("\n"));
  if (found.length) return { ok: false, code: "personal_data", found, message: `This page appears to contain ${found.join(", ")}. Remove it from the question or answer and make a new link, or keep this one private.` };
  const verdict = await moderateText(`${q}\n\n${r.markdown}`);
  if (!verdict.allowed) return { ok: false, code: "unsafe", message: `This page can't be made public under Keplar's content rules${verdict.category ? ` (${verdict.category})` : ""}. Your private link keeps working.` };
  const mine = await rows().list(workspaceId);
  const already = mine.filter((x) => x.publicAt && !x.revokedAt && !x.hiddenAt).length;
  if (!r.publicAt && already >= PUBLIC_LIMITS.maxPerAccount) return { ok: false, code: "limit", message: `You can have ${PUBLIC_LIMITS.maxPerAccount} public pages at a time. Turn one off to publish another.` };
  const slug = r.publicSlug ?? `${slugify(q)}-${randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 6)}`;
  const row = (await rows().update(workspaceId, token, { publicSlug: slug, publicAt: r.publicAt || new Date(at).toISOString() })) ?? r;
  return { ok: true, slug, row };
}

export async function unpublishShare(workspaceId: string, token: string): Promise<boolean> {
  const r = await rows().get(workspaceId, token);
  if (!r || !r.publicAt) return false;
  await rows().update(workspaceId, token, { publicAt: "" });
  return true;
}

/** Admin takedown by public slug. Irreversible for the owner. */
export async function takeDownPublic(slug: string, at = Date.now()): Promise<boolean> {
  if (!validPublicSlug(slug)) return false;
  const r = await rows().findSystemBy("publicSlug", slug);
  if (!r) return false;
  await rows().update(r.workspaceId, r.id, { hiddenAt: new Date(at).toISOString(), publicAt: "" });
  return true;
}

const isPublic = (r: ShareRow) => Boolean(r.publicAt) && !r.hiddenAt && !r.revokedAt;

/** Public lookup. A page stays up while public (it does not expire after 90 days like a private link). */
export async function openPublic(slug: string, opts: { count?: boolean } = {}): Promise<ShareRow | null> {
  if (!publicAnswersOn() || !validPublicSlug(slug)) return null;
  const r = await rows().findSystemBy("publicSlug", slug);
  if (!r || !isPublic(r)) return null;
  if (opts.count) await rows().increment(r.workspaceId, r.id, { views: 1 }, { ...r, views: 0 }).catch(() => undefined);
  return r;
}

export async function listPublic(limit = 200): Promise<ShareRow[]> {
  if (!publicAnswersOn()) return [];
  return (await rows().listSystemRange({ field: "publicAt", gte: "1" }, limit)).filter(isPublic);
}
