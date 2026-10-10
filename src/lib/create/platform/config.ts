/**
 * Provider configuration for Create + Business OS.
 *
 * Every external dependency sits behind an adapter. With no key configured a
 * provider reports `mode: "off"` and its feature says "not set up yet"; nothing
 * is simulated. Switching a provider on is env-only (docs/architecture-cloud.md).
 */
export type ProviderMode = "off" | "live";

export type ProviderStatus = {
  id: string;
  label: string;
  mode: ProviderMode;
  /** Env vars required for live mode. */
  env: string[];
  /** What this provider does when it is not set up. */
  placeholder?: string;
};

const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim());
const all = (keys: string[]) => keys.every(has);

function provider(id: string, label: string, env: string[], placeholder: string, force?: string): ProviderStatus {
  const forced = force ? process.env[force] : undefined;
  const live = forced === "off" ? false : all(env);
  return { id, label, env, mode: live ? "live" : "off", placeholder: live ? undefined : `Not set up: ${placeholder}` };
}

export function providers() {
  return {
    store: provider("store", "Postgres (Neon)", ["DATABASE_URL"], "local JSON store in .data/ (set DATABASE_URL for Postgres)", "KEPLAR_STORE_MODE"),
    blob: provider("blob", "Object storage (Cloudflare R2)", ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"], "local files in .data/blobs"),
    queue: provider("queue", "Durable jobs (Inngest)", ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"], "in-process timers (jobs stop when the server stops)"),
    codegen: provider("codegen", "Code generation (OpenRouter)", ["OPENROUTER_API_KEY"], "site generation is off"),
    sandbox: provider("sandbox", "Preview sandbox (Vercel Sandbox)", ["VERCEL_SANDBOX_TOKEN", "VERCEL_TEAM_ID"], "static preview served from /sites/preview"),
    hosting: provider("hosting", "User-site hosting (Vercel for Platforms)", ["VERCEL_PLATFORM_TOKEN", "VERCEL_PLATFORM_PROJECT_ID", "VERCEL_TEAM_ID"], "sites are served from this server under /sites"),
    domains: provider("domains", "Custom domains (Vercel Domains API)", ["VERCEL_DOMAINS_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"], "custom domains are off"),
    media: provider("media", "Image + video (OpenRouter)", ["OPENROUTER_API_KEY"], "image and video generation are off"),
    moderation: provider("moderation", "Moderation (OpenAI omni-moderation)", ["OPENAI_MODERATION_API_KEY"], "keyword rules only"),
    scanning: provider("scanning", "URL/malware scan (Google Web Risk)", ["GOOGLE_WEB_RISK_API_KEY"], "local heuristics only"),
    stripe: provider("stripe", "Payments (Stripe Connect)", ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"], "seller payments are off"),
    email: provider("email", "Email connectors (Gmail / Outlook OAuth)", ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"], "email connectors are off"),
    social: provider("social", "Social scheduler (Postiz)", ["POSTIZ_API_URL", "POSTIZ_API_KEY"], "social posting is off"),
    slack: provider("slack", "Slack", ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"], "Slack is off"),
    secrets: provider("secrets", "Token encryption (KMS key)", ["KEPLAR_TOKEN_ENC_KEY"], "dev key only"),
  } satisfies Record<string, ProviderStatus>;
}

export type ProviderId = keyof ReturnType<typeof providers>;

export function isLive(id: ProviderId): boolean {
  return providers()[id].mode === "live";
}

/** Separate registrable domain for user content (never keplar.one). */
export const USER_CONTENT_DOMAIN = process.env.KEPLAR_USER_CONTENT_DOMAIN || "keplar.site";

/** Base path where published sites are served from this server. */
export const LOCAL_SITES_BASE = "/sites";

/** Target a customer's DNS should point to (Vercel values in live mode). */
export const DNS_TARGETS = {
  apexA: process.env.KEPLAR_DNS_APEX_A || "76.76.21.21",
  cname: process.env.KEPLAR_DNS_CNAME || "cname.vercel-dns.com",
};

/**
 * Create needs a model key and a filesystem that persists (published sites and
 * drafts are files). Serverless hosts (VERCEL) don't persist, so Create stays
 * off there until object storage (R2) is wired.
 */
export function createReady(): boolean {
  return isLive("codegen") && !process.env.VERCEL;
}
