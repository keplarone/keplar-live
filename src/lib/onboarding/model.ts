/**
 * First-run onboarding: the data model, validation and personalization. Pure (no DOM, no database), so the server
 * routes, the client and the tests share one definition.
 *
 * Nothing here claims anything about answer quality: starter prompts are plain example questions, and the plan line
 * only repeats what the plan actually includes.
 */
import { authRedirectPath } from "@/lib/accounts/redirect";

export const STEPS = ["welcome", "purpose", "preferences", "connect", "ready"] as const;
export type StepId = (typeof STEPS)[number];
export const LAST_STEP = STEPS.length - 1;

export const USES = ["research", "writing", "coding", "site", "business", "learning", "other"] as const;
export type Use = (typeof USES)[number];
export const USE_LABEL: Record<Use, string> = {
  research: "Research",
  writing: "Writing",
  coding: "Coding",
  site: "Build a site or app",
  business: "Run my business",
  learning: "Learning",
  other: "Something else",
};
export const USE_HINT: Record<Use, string> = {
  research: "Questions with sources and disagreements",
  writing: "Drafts, edits, tone",
  coding: "Write, debug, compare approaches",
  site: "Describe it, preview it, publish it",
  business: "Customers, orders, operations",
  learning: "Explain it until it clicks",
  other: "Tell Keplar as you go",
};

export const THEMES = ["dark", "light", "auto"] as const;
export type ThemeChoice = (typeof THEMES)[number];

export type Answers = {
  uses?: Use[];
  role?: string;
  /** What to call them (also saved as the account name). */
  name?: string;
  theme?: ThemeChoice;
  /** Insert key (overtype) available in text fields. Device-local, applied by the client. */
  insertKey?: boolean;
  /** Memory on/off. Applied through the existing memory setting. */
  memory?: boolean;
};

/** Progress that is not an answer: set by the app when something real happens, or by the user. */
export type Progress = {
  /** The user looked at the plan/pricing page (the "learn the plan" checklist item). */
  viewedPlan?: string;
  /** Opened Create. */
  triedCreate?: string;
  /** Hid the checklist. */
  checklistDismissed?: string;
  /** Existing accounts: hid the "Take the tour" entry. */
  tourDismissed?: string;
  /** Skipped the connect-an-app step (so the checklist doesn't nag). */
  connectSkipped?: string;
};
export const PROGRESS_KEYS = ["viewedPlan", "triedCreate", "checklistDismissed", "tourDismissed", "connectSkipped"] as const;
export type ProgressKey = (typeof PROGRESS_KEYS)[number];

export type OnboardingStatus = "pending" | "in_progress" | "completed" | "skipped" | "legacy";

export type OnboardingState = {
  /** False when persistence is off (no database): onboarding is simply not offered. */
  enabled: boolean;
  /** True only for accounts created after onboarding shipped (or after "Replay"). */
  required: boolean;
  status: OnboardingStatus;
  step: number;
  answers: Answers;
  progress: Progress;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
};

/** Should sign-in send this person to /welcome? New (or replaying) accounts that have neither finished nor skipped. */
export const needsWelcome = (s: Pick<OnboardingState, "enabled" | "required" | "completedAt" | "skippedAt">) => s.enabled && s.required && !s.completedAt && !s.skippedAt;

export function statusOf(r: { required: boolean; step: number; completedAt: string | null; skippedAt: string | null; startedAt: string | null }): OnboardingStatus {
  if (r.completedAt) return "completed";
  if (r.skippedAt) return "skipped";
  if (!r.required) return "legacy";
  return r.startedAt || r.step > 0 ? "in_progress" : "pending";
}

/** `/welcome?next=...`, with `next` passed through the same open-redirect guard as sign-in. */
export function welcomePath(next: string | null | undefined, fallback = "/app"): string {
  const n = authRedirectPath(next, fallback);
  return n === fallback ? "/welcome" : `/welcome?next=${encodeURIComponent(n)}`;
}

/** `next` for after onboarding (never an auth page, never off-site; /welcome itself falls back to /app). */
export function afterWelcomePath(raw: string | null | undefined): string {
  const n = authRedirectPath(raw, "/app");
  return /^\/welcome(?:[/?#]|$)/.test(n) ? "/app" : n;
}

/* ───────────── validation ───────────── */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const cleanText = (v: unknown, max: number, label: string): string => {
  if (typeof v !== "string") throw new ValidationError(`${label} must be text.`);
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > max) throw new ValidationError(`${label} can be at most ${max} characters.`);
  if (/[<>]/.test(t)) throw new ValidationError(`${label} can't contain < or >.`);
  return t;
};

/** Validate the `answers` part of a PATCH. Unknown keys are rejected so nothing unexpected is stored. */
export function validateAnswers(input: unknown): Answers {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("answers must be an object.");
  const out: Answers = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    switch (k) {
      case "uses": {
        if (!Array.isArray(v) || v.length > USES.length) throw new ValidationError("uses must be a short list.");
        const list = v.map((x) => String(x)) as Use[];
        if (list.some((x) => !(USES as readonly string[]).includes(x))) throw new ValidationError("Unknown use.");
        out.uses = [...new Set(list)];
        break;
      }
      case "role": out.role = cleanText(v, 60, "Role"); break;
      case "name": out.name = cleanText(v, 60, "Name"); break;
      case "theme":
        if (!(THEMES as readonly unknown[]).includes(v)) throw new ValidationError("Unknown theme.");
        out.theme = v as ThemeChoice;
        break;
      case "insertKey":
      case "memory":
        if (typeof v !== "boolean") throw new ValidationError(`${k} must be true or false.`);
        out[k] = v;
        break;
      default:
        throw new ValidationError(`Unknown answer "${k.slice(0, 30)}".`);
    }
  }
  return out;
}

export function validateStep(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > LAST_STEP) throw new ValidationError("step is out of range.");
  return v;
}

export function validateProgressKey(v: unknown): ProgressKey {
  if (typeof v !== "string" || !(PROGRESS_KEYS as readonly string[]).includes(v)) throw new ValidationError("Unknown progress item.");
  return v as ProgressKey;
}

/** Parse the stored JSON defensively (a hand-edited or old row must never break sign-in). */
export function readAnswers(raw: unknown): Answers {
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!j || typeof j !== "object") return {};
    const out: Answers = {};
    const o = j as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      try {
        Object.assign(out, validateAnswers({ [k]: o[k] }));
      } catch {
        /* drop the one bad key */
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function readProgress(raw: unknown): Progress {
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!j || typeof j !== "object") return {};
    const out: Progress = {};
    for (const k of PROGRESS_KEYS) {
      const v = (j as Record<string, unknown>)[k];
      if (typeof v === "string" && v.length < 40) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/* ───────────── personalization ───────────── */

export type Starter = { text: string; hint: string };

const BY_USE: Record<Use, Starter[]> = {
  research: [
    { text: "What do experts disagree about when it comes to intermittent fasting?", hint: "Research · shows disagreement" },
    { text: "Compare the strongest arguments for and against a four-day work week.", hint: "Research · both sides" },
  ],
  writing: [
    { text: "Rewrite this to sound warmer without getting longer: \"Please send the invoice by Friday.\"", hint: "Writing · tone" },
    { text: "Give me three opening lines for a cover letter to a small design studio.", hint: "Writing · drafts" },
  ],
  coding: [
    { text: "I'm a solo developer. JSONB column or a normalized table for user preferences whose shape keeps changing? Pick one and say what would change your mind.", hint: "Coding · second opinion" },
    { text: "Compare Postgres, DynamoDB and MongoDB for a multi-tenant app run by two people. Which would you pick?", hint: "Coding · trade-offs" },
  ],
  site: [
    { text: "What sections should a one-page site for a neighborhood bakery have, and what should each one say?", hint: "Site · plan it first" },
    { text: "Draft the sections and headlines for a landing page for a budgeting app.", hint: "Site · structure" },
  ],
  business: [
    { text: "Draft a clear refund policy for my online store.", hint: "Business · writing" },
    { text: "What should I check before hiring my first employee?", hint: "Business · decisions" },
  ],
  learning: [
    { text: "Explain how vaccines train the immune system, like I'm studying for a biology test.", hint: "Learning" },
    { text: "Teach me the basics of compound interest with one worked example.", hint: "Learning · worked example" },
  ],
  other: [
    { text: "Plan five days in Lisbon on a mid-range budget.", hint: "Everyday" },
    { text: "Do we really only use 10% of our brains?", hint: "Fact-check" },
  ],
};
const GENERIC: Starter[] = [
  { text: "Do we really only use 10% of our brains?", hint: "Fact-check" },
  { text: "Should I lease or buy my next car?", hint: "Decisions" },
  { text: "Explain how photosynthesis works in three short paragraphs.", hint: "Learning" },
];

/**
 * 3-4 starter questions that follow the chosen uses (round-robin across them, so every pick is represented), with a
 * role-flavoured one when a role was given. Always at least 3, never more than 4, no duplicates.
 */
export function starters(a: Pick<Answers, "uses" | "role">): Starter[] {
  const uses = a.uses?.length ? a.uses : [];
  const out: Starter[] = [];
  const seen = new Set<string>();
  const push = (s: Starter | undefined) => {
    if (s && !seen.has(s.text) && out.length < 4) {
      seen.add(s.text);
      out.push(s);
    }
  };
  for (let round = 0; round < 2; round++) for (const u of uses) push(BY_USE[u][round]);
  const role = a.role?.trim();
  if (role && out.length < 4) push({ text: `What are the three biggest mistakes new ${role.toLowerCase()}s make, and how do I avoid them?`, hint: `For your work as ${role}` });
  for (const g of GENERIC) push(g);
  return out.slice(0, 4);
}

/** "Business" prominence and the older per-device "use for" preference follow the chosen uses. */
export function legacyUseFor(a: Pick<Answers, "uses">): "personal" | "business" | "both" | null {
  const u = a.uses ?? [];
  if (!u.length) return null;
  const biz = u.includes("business") || u.includes("site");
  const per = u.some((x) => x !== "business" && x !== "site");
  return biz && per ? "both" : biz ? "business" : "personal";
}

/** The honest plan line for the final step and the checklist. Free is free models only, with no credits to run out. */
export function planLine(plan: string): string {
  switch (plan) {
    case "free":
      return "You're on Free: Keplar answers with free models only, so there are no credits to spend and nothing to be charged. Some features (like Deep Research, image and video tools, and connected apps) need a paid plan.";
    case "lite": return "You're on Lite: all models, with a monthly credit allowance. Deep Research, images, video and connected apps are part of higher plans.";
    case "plus": case "pro": case "business": return `You're on ${plan[0].toUpperCase()}${plan.slice(1)}: your plan's models and credit allowance apply, and you can see what's left in Settings.`;
    default: return "Your plan and what it includes are on the Pricing page.";
  }
}

/* ───────────── checklist ───────────── */

export type ChecklistId = "ask" | "create" | "connect" | "plan";
export type Facts = { chats: number; sites: number; images: number; connectors: number; plan: string };
export type ChecklistItem = { id: ChecklistId; label: string; done: boolean; href: string | null; note?: string };

/**
 * The dismissible checklist. Every "done" comes from something that really exists (a saved chat, a site or image the
 * account made, a connected app) or from a real action (opening the plan page). Free accounts can't connect apps,
 * so that item says what it takes instead of nagging.
 */
export function checklist(f: Facts, p: Progress): ChecklistItem[] {
  const canConnect = f.plan !== "free";
  return [
    { id: "ask", label: "Ask your first question", done: f.chats > 0, href: null },
    { id: "create", label: "Try Create", done: f.sites + f.images > 0 || Boolean(p.triedCreate), href: null, note: "Opens Create. Describe a site or an image." },
    { id: "connect", label: "Connect an app", done: f.connectors > 0, href: null, note: canConnect ? "Beta" : "Needs a paid plan" },
    { id: "plan", label: "See your plan and usage", done: Boolean(p.viewedPlan), href: "/account", note: f.plan === "free" ? "Free runs on free models" : undefined },
  ];
}
