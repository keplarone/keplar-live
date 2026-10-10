/**
 * Pricing page conversion content: plan chooser ("which plan fits"), the plan comparison table, the pricing FAQ and the
 * contextual note shown when someone arrives from an in-app limit (`/pricing?from=...`).
 *
 * Every number in the comparison table is read from the module that ENFORCES it (orchestration plans/limits, Create
 * entitlements, image limits, Slides/Study limits, API policy), so the table cannot drift from what the product does.
 * Rules: nothing that is not live is presented as live ("Coming soon"); no annual price (there is no annual plan to sell);
 * no testimonials, customer counts or badges.
 */
import { tiers, type Tier } from "@/lib/tiers";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { PLAN_LIMITS } from "@/lib/orchestration/limits";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { IMAGE_LIMITS } from "@/lib/images/config";
import { SLIDES_LIMITS, STUDY_LIMITS } from "@/lib/tools/limits";
import { API_POLICY } from "@/lib/api/policy";
import { DEFAULT_COST_CONFIG } from "@/lib/cost/config";

export type PlanKey = Tier["id"];
export const PLAN_ORDER: PlanKey[] = tiers.map((t) => t.id);

/** A cell: text, or `null` for "not included" (rendered as a dash with a screen-reader label). */
export type Cell = string | null;
export type CompareRow = { label: string; hint?: string; values: Record<PlanKey, Cell>; soon?: boolean };
export type CompareGroup = { title: string; rows: CompareRow[] };

const n = (v: number) => v.toLocaleString("en-US");
const per = (f: (p: PlanKey) => Cell): Record<PlanKey, Cell> =>
  Object.fromEntries(PLAN_ORDER.map((p) => [p, f(p)])) as Record<PlanKey, Cell>;

export const FREE_DAILY_QUESTIONS = PLAN_LIMITS.free.dailyRequests;

function priceCell(p: PlanKey): string {
  const t = tiers.find((x) => x.id === p)!;
  return t.price === null ? "Custom" : t.price === 0 ? "$0" : `$${t.price} / month`;
}

function creditsCell(p: PlanKey): string {
  if (p === "free") return `Up to ${FREE_DAILY_QUESTIONS} questions a day`;
  const u = PLAN_ALLOWANCES[p].monthlyUnits;
  return u === null ? "Custom" : `${n(u)} credits a month`;
}

export const compareGroups: CompareGroup[] = [
  {
    title: "Price and usage",
    rows: [
      { label: "Price", values: per(priceCell) },
      { label: "Usage included", hint: "Paid plans meter work in credits; a simple question costs very little, Deep Research and video cost more.", values: per(creditsCell) },
      { label: "Models", values: per((p) => (PLAN_ALLOWANCES[p].models === "free-only" ? "Free open models" : "Premium models")) },
      { label: "Pay-as-you-go above your plan", hint: "Opt-in, off by default, with a monthly cap you set.", soon: true, values: per((p) => (p === "free" ? null : "Coming soon")) },
    ],
  },
  {
    title: "Answers",
    rows: [
      { label: "Several models, one answer, disagreement shown", values: per((p) => (p === "free" ? "Limited" : "Included")) },
      { label: "Deep Research", values: per((p) => (PLAN_ALLOWANCES[p].deepResearch ? "Included" : null)) },
      { label: "Live web lookups", soon: true, values: per(() => "Coming soon") },
      { label: "Study mode from your PDFs", values: per((p) => `Up to ${n(STUDY_LIMITS[p].maxSets)} study sets${p === "free" ? " (free models)" : ""}`) },
      {
        label: "Slides with PowerPoint and PDF export",
        values: per((p) => (p === "free" || p === "lite" ? null : `Up to ${SLIDES_LIMITS[p].maxSlides} slides a deck`)),
      },
    ],
  },
  {
    title: "Create",
    rows: [
      { label: "Sites and apps from text or voice", values: per((p) => `${n(ENTITLEMENTS[p].projects)} project${ENTITLEMENTS[p].projects === 1 ? "" : "s"}`) },
      { label: "Custom domains", values: per((p) => (ENTITLEMENTS[p].customDomains > 0 ? n(ENTITLEMENTS[p].customDomains) : null)) },
      { label: "Image generation", values: per((p) => (IMAGE_LIMITS[p] ? `${n(IMAGE_LIMITS[p]!.perDay)} a day` : null)) },
      { label: "Video generation (Beta)", values: per((p) => (ENTITLEMENTS[p].video ? `Clips up to ${ENTITLEMENTS[p].maxVideoSeconds} s` : null)) },
      { label: "Agents", values: per((p) => (ENTITLEMENTS[p].agents > 0 ? n(ENTITLEMENTS[p].agents) : null)) },
    ],
  },
  {
    title: "Developers and teams",
    rows: [
      { label: "API (Beta)", hint: "Requests per key per day.", values: per((p) => (API_POLICY[p].available ? `${n(API_POLICY[p].keyPerDay)} a day${p === "free" ? " (free models)" : ""}` : null)) },
      { label: "Spend caps, approvals, audit logs", values: per((p) => (p === "business" ? "Included" : null)) },
    ],
  },
];

/** Value-led plan chooser: who each paid step is for, in their words. Order: Free → Plus → Pro → Business. */
export type PlanFit = { plan: PlanKey; who: string; outcome: string; cta: { label: string; href: string } };

export const planFits: PlanFit[] = [
  {
    plan: "free",
    who: "You want to see how it works.",
    outcome: `Ask everyday questions on free models, up to ${FREE_DAILY_QUESTIONS} a day. No card needed.`,
    cta: { label: "Ask Keplar anything", href: "/app" },
  },
  {
    plan: "plus",
    who: "You use AI every day for school, work or big decisions.",
    outcome: "Premium models, Deep Research, Slides, image generation and a custom domain for what you build.",
    cta: { label: "Upgrade to Plus", href: "/checkout?plan=plus" },
  },
  {
    plan: "pro",
    who: "You build and create a lot.",
    outcome: "More than twice the credits of Plus, video, more projects and agents, and higher priority.",
    cta: { label: "Upgrade to Pro", href: "/checkout?plan=pro" },
  },
  {
    plan: "business",
    who: "You run a business on it.",
    outcome: "Commerce, CRM and agents with spend caps, approval gates and audit logs.",
    cta: { label: "Contact Keplar", href: "/inquire" },
  },
];

/** Pricing questions (shown with a few general ones; one FAQPage block per page). Overage is described as it will work, labelled Coming soon. */
export function pricingFaq(opts: { overageLive?: boolean } = {}): { q: string; a: string }[] {
  const o = DEFAULT_COST_CONFIG.overage;
  return [
    {
      q: "What is a credit?",
      a: "Paid plans measure model work in credits instead of raw tokens. A short question uses very little; a consensus answer across several models uses more; Deep Research and video use the most. Your account shows what is left and when it renews.",
    },
    {
      q: "What happens when I reach my limit?",
      a: `On Free, you can ask up to ${FREE_DAILY_QUESTIONS} questions a day; they come back at 00:00 UTC. Nothing is charged and there is nothing to buy on Free. On a paid plan, Keplar tells you before your credits run low; when they run out you can wait for the renewal or move to a bigger plan. You are never charged extra without asking for it.`,
    },
    {
      q: "Can I pay for extra usage instead of upgrading?",
      a: opts.overageLive
        ? `Yes, on paid plans you can turn on pay-as-you-go. It is off by default, you set a monthly cap (up to $${o.maxCapUsd}), and Keplar alerts you at ${o.alertPcts.join("%, ")}% of it.`
        : "Coming soon. Pay-as-you-go above your plan is not available yet. When it launches it will be opt-in and off by default, with a monthly cap you set and alerts before you reach it. Until then, a plan's credits are a hard limit: you are never billed beyond your plan price.",
    },
    {
      q: "Is there an annual plan or discount?",
      a: "Not yet. Every plan is billed monthly, and you can cancel any time.",
    },
    {
      q: "Can I cancel? Do you offer refunds?",
      a: "Cancel any time from your Account; you keep access until the end of the period you paid for. If you are new to a paid plan, email us within 7 days of your first payment and we will refund it in full. The Terms have the details.",
    },
    {
      q: "Who handles payment?",
      a: "Checkout and billing are handled by Whop. Keplar never sees your full card number.",
    },
    {
      q: "Is Free really free? What is the catch?",
      a: "Free runs on free open models, so it can be slower when they are busy, consensus is limited, and the hosts of those free models may log prompts. Don't put anything sensitive into Free. Paid plans use premium models.",
    },
    {
      q: "Do you have team or business pricing?",
      a: "Individual plans are per person. For a team, or for business tools with spend caps and approvals, use the Contact form and we will put together a plan.",
    },
  ];
}

/**
 * Context notes for arrivals from inside the app (`/pricing?from=<key>`). Only known keys render; anything else shows nothing.
 * Each says what happened and what changes on a paid plan, without urgency or countdowns.
 */
export const pricingContext = {
  "daily-limit": {
    title: "You've used today's Free questions.",
    body: `Free includes up to ${FREE_DAILY_QUESTIONS} questions a day on free models; they come back at 00:00 UTC. Paid plans run premium models on a monthly allowance instead.`,
  },
  credits: {
    title: "Your credits are running low.",
    body: "Pro includes more than twice the monthly credits of Plus. Your current plan renews on its own date; nothing is charged until you choose.",
  },
  feature: {
    title: "That feature is on a paid plan.",
    body: "The table below shows which plan includes it. Your chats and work stay where they are when you upgrade.",
  },
  upsell: {
    title: "What changes on a paid plan.",
    body: "Premium models in the panel, a larger consensus allowance and Deep Research. Free stays free.",
  },
} as const satisfies Record<string, { title: string; body: string }>;

export type PricingFrom = keyof typeof pricingContext;
export const asPricingFrom = (v: string | null | undefined): PricingFrom | null =>
  v && Object.prototype.hasOwnProperty.call(pricingContext, v) ? (v as PricingFrom) : null;
