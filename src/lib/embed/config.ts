/**
 * Embeddable Ask widget (BETA): themes, sizes, accents, and per-plan limits.
 * Pure and client-safe. The public widget id (`emb_…`) is safe to put on other sites;
 * it is not a secret. Origin allowlists and rate limits are the real controls.
 */
import type { PlanId } from "@/lib/create/platform/plans";

export const EMBED_THEMES = ["dark", "light"] as const;
export type EmbedTheme = (typeof EMBED_THEMES)[number];

export const EMBED_SIZES = ["compact", "standard", "tall"] as const;
export type EmbedSize = (typeof EMBED_SIZES)[number];

/** Flat graphite accents — no purple-blue glow. */
export const EMBED_ACCENTS = ["graphite", "teal", "earth", "sky"] as const;
export type EmbedAccent = (typeof EMBED_ACCENTS)[number];

export const EMBED_ACCENT_HEX: Record<EmbedAccent, string> = {
  graphite: "#3d4450",
  teal: "#2a6f6a",
  earth: "#6b5a45",
  sky: "#3a5f7a",
};

export const EMBED_SIZE_PX: Record<EmbedSize, { width: number; height: number }> = {
  compact: { width: 360, height: 420 },
  standard: { width: 420, height: 560 },
  tall: { width: 420, height: 720 },
};

/** Model lane for the embed: free = OpenRouter :free only; plan = the publisher's plan roster. */
export const EMBED_MODEL_LANES = ["free", "plan"] as const;
export type EmbedModelLane = (typeof EMBED_MODEL_LANES)[number];

export const EMBED_NAME_MAX = 40;
export const EMBED_ORIGIN_MAX = 10;
export const EMBED_QUESTION_CHARS = 2_000;
export const EMBED_HISTORY_TURNS = 4;

export type EmbedPlanPolicy = {
  available: boolean;
  maxWidgets: number;
  /** Asks per minute per widget (shared limiter). */
  perMinute: number;
  /** Asks per rolling day per widget. */
  perDay: number;
};

/** TODO(founder approval): proposed limits; only ever stricter than the plan's own credits. */
export const EMBED_POLICY: Record<PlanId, EmbedPlanPolicy> = {
  free: { available: true, maxWidgets: 1, perMinute: 3, perDay: 40 },
  lite: { available: true, maxWidgets: 2, perMinute: 6, perDay: 120 },
  plus: { available: true, maxWidgets: 5, perMinute: 12, perDay: 400 },
  pro: { available: true, maxWidgets: 10, perMinute: 20, perDay: 1_000 },
  business: { available: true, maxWidgets: 25, perMinute: 40, perDay: 4_000 },
};

export const embedAvailable = (plan: PlanId) => EMBED_POLICY[plan].available;

export const EMBED_STATEMENT =
  "The Ask widget is in beta. Drop it on your site with a short script. Asks spend the publisher's plan credits (Free uses OpenRouter :free models only). You can restrict which origins may load the widget.";

export const isTheme = (v: unknown): v is EmbedTheme => typeof v === "string" && (EMBED_THEMES as readonly string[]).includes(v);
export const isSize = (v: unknown): v is EmbedSize => typeof v === "string" && (EMBED_SIZES as readonly string[]).includes(v);
export const isAccent = (v: unknown): v is EmbedAccent => typeof v === "string" && (EMBED_ACCENTS as readonly string[]).includes(v);
export const isModelLane = (v: unknown): v is EmbedModelLane => typeof v === "string" && (EMBED_MODEL_LANES as readonly string[]).includes(v);

/** Public widget id shape: emb_ + 16 hex. */
export const looksLikeEmbedId = (v: string) => /^emb_[a-f0-9]{16}$/.test(v);
