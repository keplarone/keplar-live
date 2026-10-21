/**
 * Leaderboard and directory intelligence: the registry of ranking platforms (data/leaderboards.v1.json), the submission tracker,
 * and the list of official pages the weekly watcher re-reads.
 *
 * Evidence: the v1 registry was compiled on 2026-10-19 from web-search results that quote each cited URL; the research could not
 * open the pages themselves. Every fact therefore carries evidence "search-snippet" until a person confirms it on the page, and a
 * value nobody could confirm is null ("unknown"), never a guess. The weekly watcher reads each platform's own pages and records
 * whether they load and when they change, so a changed submission or methodology page is flagged for re-review.
 *
 * Submissions: no platform here offers an API to submit a listing, and most need an account, a payment, a CAPTCHA or an editorial
 * review. So the tracker never submits anything by itself: it turns each platform into a plan with its blockers, and a person does
 * the submission and records it. One row per platform prevents duplicate submissions; a rejected one can be resubmitted with a note.
 */
import registry from "./data/leaderboards.v1.json";
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import type { WatchTarget } from "./watch";

export const REGISTRY_VERSION = "leaderboards.v1";
export const REGISTRY_EVIDENCE = "search-snippet" as const;

type Tri = boolean | null;
export type Platform = {
  id: string;
  name: string;
  url: string;
  ranksWhat: "apps" | "models" | "both" | "directory-listing";
  methodology: string;
  keplarQualifies: Tri;
  keplarQualifiesReason?: string;
  submissionPossible: Tri;
  submissionUrl: string | null;
  automaticPlacement: Tri;
  requiresAccount: Tri;
  requiresPayment: Tri;
  requiresPaymentNote?: string;
  requiresReview: Tri;
  publicApi: Tri;
  publicApiNote?: string;
  listedAlready: Tri;
  listedAlreadyEvidence?: string;
  notes?: string;
  sources: string[];
  verifiedAt: string;
};
export type CompetitorPages = { id: string; name: string; pages: { kind: string; url: string | null; fetchOk: boolean; note?: string }[] };

export const PLATFORMS = (registry as { platforms: Platform[] }).platforms;
export const COMPETITOR_PAGES = (registry as { competitors: CompetitorPages[] }).competitors;

export type Blocker = "not-applicable" | "automatic" | "account" | "payment" | "editorial-review" | "submission-url-unknown" | "eligibility-unknown";
export type Plan = { platformId: string; name: string; route: "not-applicable" | "automatic" | "owner-task"; blockers: Blocker[]; nextStep: string };

/** Pure: what it would take to be on a platform, from the registry's facts (unknowns stay visible as blockers). */
export function planFor(p: Platform): Plan {
  if (p.ranksWhat === "models" || p.keplarQualifies === false) {
    return { platformId: p.id, name: p.name, route: "not-applicable", blockers: ["not-applicable"], nextStep: p.keplarQualifiesReason ?? "Ranks models, not apps: Keplar doesn't train a model, so it isn't eligible." };
  }
  if (p.automaticPlacement === true) {
    return { platformId: p.id, name: p.name, route: "automatic", blockers: ["automatic"], nextStep: "Placement follows measured traffic; nothing to submit. Track the position in the weekly check." };
  }
  const blockers: Blocker[] = [];
  if (p.keplarQualifies === null) blockers.push("eligibility-unknown");
  if (!p.submissionUrl) blockers.push("submission-url-unknown");
  if (p.requiresAccount !== false) blockers.push("account");
  if (p.requiresPayment === true) blockers.push("payment");
  if (p.requiresReview !== false) blockers.push("editorial-review");
  const steps = [
    p.submissionUrl ? `Open ${p.submissionUrl}` : "Find the official submission page",
    p.requiresAccount !== false ? "sign in with Keplar's own account" : null,
    p.requiresPayment === true ? `approve the fee first (${p.requiresPaymentNote ?? "amount not confirmed"})` : null,
    "submit the product facts from the Command Center (no benchmark or ranking claims)",
    "record the submission here",
  ].filter(Boolean);
  return { platformId: p.id, name: p.name, route: "owner-task", blockers, nextStep: steps.join(", then ") + "." };
}

export type SubmissionStatus = "not_started" | "submitted" | "listed" | "rejected" | "declined";
export type Submission = {
  id: string;
  workspaceId: string;
  platformId: string;
  status: SubmissionStatus;
  listingUrl?: string;
  history: { at: string; by: string; to: SubmissionStatus; note?: string }[];
  updatedAt: string;
};

const SYSTEM = "system";
export const submissionRows = () => collection<Submission>("growth_submissions");

const NEXT: Record<SubmissionStatus, SubmissionStatus[]> = {
  not_started: ["submitted", "declined"],
  submitted: ["listed", "rejected"],
  rejected: ["submitted", "declined"],
  listed: ["rejected"],
  declined: ["not_started"],
};

/** Records a person's submission step. One row per platform; only the allowed moves (so the same platform isn't submitted twice). */
export async function recordSubmission(platformId: string, to: SubmissionStatus, by: string, extra: { note?: string; listingUrl?: string } = {}): Promise<Submission> {
  const p = PLATFORMS.find((x) => x.id === platformId);
  if (!p) throw new HttpError(404, "Unknown platform.", "not_found");
  if (planFor(p).route === "not-applicable" && to !== "declined") throw new HttpError(409, `${p.name} doesn't list apps like Keplar.`, "not_applicable");
  const now = new Date().toISOString();
  const cur = (await submissionRows().get(SYSTEM, platformId)) ?? { id: platformId, workspaceId: SYSTEM, platformId, status: "not_started" as const, history: [], updatedAt: now };
  if (!NEXT[cur.status].includes(to)) throw new HttpError(409, `Already ${cur.status.replace("_", " ")}: can't move to ${to}.`, "bad_transition");
  if (to === "rejected" && cur.status === "submitted" && !extra.note) throw new HttpError(400, "Say why it was rejected (from the platform's message).", "note_required");
  let listingUrl: string | undefined;
  if (to === "listed") {
    try { listingUrl = new URL(String(extra.listingUrl)).toString(); } catch { throw new HttpError(400, "Give the URL of the live listing.", "no_url"); }
  }
  const next: Submission = { ...cur, status: to, ...(listingUrl ? { listingUrl } : {}), history: [...cur.history, { at: now, by, to, ...(extra.note ? { note: extra.note.slice(0, 300) } : {}) }], updatedAt: now };
  if (await submissionRows().get(SYSTEM, platformId)) await submissionRows().update(SYSTEM, platformId, next);
  else await submissionRows().insert(next);
  return next;
}

export const listSubmissions = () => submissionRows().list(SYSTEM);

/** Official pages the weekly watcher re-reads: competitors' pricing/changelog pages and each platform's home and submission pages. */
export function watchTargets(): WatchTarget[] {
  const out: WatchTarget[] = [];
  for (const c of COMPETITOR_PAGES) for (const pg of c.pages) if (pg.url) out.push({ id: `c:${c.id}:${pg.kind}`, group: "competitor", owner: c.name, kind: pg.kind, url: pg.url });
  for (const p of PLATFORMS) {
    if (planFor(p).route === "not-applicable") continue;
    out.push({ id: `l:${p.id}:home`, group: "leaderboard", owner: p.name, kind: "home", url: p.url });
    if (p.submissionUrl) out.push({ id: `l:${p.id}:submit`, group: "leaderboard", owner: p.name, kind: "submission", url: p.submissionUrl });
  }
  return out;
}
