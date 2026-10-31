/**
 * Plan data: the single source for the pricing page, homepage pricing and the
 * SoftwareApplication offers in JSON-LD. Free is unlimited on free open models, subject to fair use and availability.
 */
import { brand } from "./site";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";

export type Tier = {
  id: "free" | "lite" | "plus" | "pro" | "business";
  name: string;
  /** Monthly USD price; null = custom. */
  price: number | null;
  cadence: string;
  summary: string;
  features: string[];
  cta: { label: string; href: string };
};

export const tiers: Tier[] = [
  {
    id: "free",
    name: brand.plans.free,
    price: 0,
    cadence: "forever",
    summary: `Everyday questions with ${brand.engineName}, on free open models.`,
    features: [
      `${brand.engineName} orchestration`,
      "Free open models only",
      "Can be slower when free models are busy",
      "Free model hosts may log prompts",
      "Limited consensus",
      "Web search only in the desktop app (Live Research, beta)",
      "Up to 50 questions a day (fair use)",
      "Image and video questions on free vision models",
      "Study mode: upload a text-based PDF for flashcards, quizzes and a plan (free models, smaller limits)",
      "Saved chats and optional memory when signed in",
    ],
    cta: { label: `Try ${brand.name}`, href: "/app" },
  },
  {
    id: "lite",
    name: brand.plans.lite,
    price: 20,
    cadence: "per month",
    summary: "The step up from Free: premium models for everyday questions, at a lower price.",
    features: [
      `Premium models and ${brand.engineName} consensus`,
      "2,400 credits a month with a 5-hour and a weekly limit",
      "Coding help and file analysis",
      "Study mode on stronger models",
      "Create a small personal site (free keplar.site address)",
      "Image generation, Slides, Deep Research, agents and custom domains start at Plus",
      "Video is Pro and Business only",
    ],
    cta: { label: "Upgrade to Lite", href: "/checkout?plan=lite" },
  },
  {
    id: "plus",
    name: brand.plans.plus,
    price: 45,
    cadence: "per month",
    summary: "For daily use: school, work, health questions, and big decisions.",
    features: [
      `Premium models and advanced ${brand.engineName}`,
      "Larger consensus allowance",
      "Deep Research for big decisions",
      "Coding help and file analysis",
      "Web search only in the desktop app (Live Research, beta)",
      "Create personal sites and apps",
      "Slideshow creator with PowerPoint and PDF export (image ideas are placeholders)",
      "Study mode on stronger models with bigger limits",
      "Image generation",
      "Larger context and priority usage",
    ],
    cta: { label: "Upgrade to Plus", href: "/checkout?plan=plus" },
  },
  {
    id: "pro",
    name: brand.plans.pro,
    price: 99,
    cadence: "per month",
    summary: "For power users and creators: much more usage, creation, and agents.",
    features: [
      "Everything in Plus",
      "More than twice the monthly credits",
      "Video generation",
      "Slideshow creator and Study mode with the largest limits",
      "Advanced creation",
      "Advanced agents",
      "Larger context",
      "Higher priority and concurrency",
    ],
    cta: { label: "Upgrade to Pro", href: "/checkout?plan=pro" },
  },
  // Business is no longer sold on keplar.one: business.keplar.one has its own plans. The "business" plan id stays in the type
  // (and in billing and limits) so accounts already on it keep working.
];

export const formatPrice = (t: Tier) => (t.price === null ? "Custom" : `$${t.price}`);

/** How Keplar Usage is spent: a usage abstraction instead of raw tokens. */
export const computeScale = [
  { task: "Simple answer", cost: "Low" },
  { task: "Consensus answer", cost: "Moderate to high" },
  { task: "Deep Research", cost: "High" },
  { task: "Video generation", cost: "Very high" },
  { task: "Agents", cost: "Metered" },
];

/**
 * Monthly credits per tier, read from the metering source of truth
 * (src/lib/orchestration/plans.ts). 1 credit = 1 Usage unit.
 */

export const SHOW_COMPUTE_ALLOWANCES = true;

export function computeAllowance(id: Tier["id"]): string | null {
  const units = PLAN_ALLOWANCES[id]?.monthlyUnits;
  if (units === undefined) return null;
  if (id === "free") return "No credits needed";
  return units === null ? "Custom credits" : `${units.toLocaleString("en-US")} credits / month`;
}
