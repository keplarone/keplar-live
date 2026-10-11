/**
 * Self-serve data export and account deletion.
 *
 * Export: every row the workspace owns, as JSON, with secrets redacted. Image bytes are not inlined (their metadata is).
 * Delete: removes every row the workspace owns EXCEPT the collections in RETAINED, which are kept because the law or the
 * integrity of billing and abuse protection needs them (payment records, usage counters, cooldowns, abuse reports). They
 * hold ids and amounts, no chat/memory/site content. tests/privacy.test.ts fails if a collection is added without being
 * classified here, so nothing is silently kept or silently exported.
 */
import { neonConfigured, neonQuery, parseData } from "@/lib/create/platform/neon";
import { collection } from "@/lib/create/platform/store";

/** Kept after deletion (and why): financial records, usage/abuse counters. */
export const RETAINED = [
  "whop_payments",
  "billing_events",
  "apple_subscriptions", // StoreKit originalTransactionId → workspace binding (financial)
  "apple_billing_events", // ASN V2 idempotency log
  "compute_ledger",
  "traffic_visits", // anonymous visit counts (daily-rotating code, no IP, no account link, workspace "system"); rolled up after 35 days
  "traffic_presence", // who is on the site right now: anonymous daily code + last-seen time, workspace "system"; expires in ~40 s, purged after 10 min
  "traffic_daily", // one row per day of rolled-up visit totals (no visitor-level data)
  "ops_fixed_costs", // the founder's own fixed business costs (admin-entered, no personal data)
  "limit_extensions", // purchased limit-extension credits (one row per verified payment): a financial record
  "referral_claims", // one row per referred new account: masked address, keyed hashes of mailbox/network/browser, outcome. Kept so deleting and re-registering cannot earn a second reward
  "referral_counters", // per-referrer monthly/lifetime and per-day program counters; numbers only
  "usage_cooldown",
  "job_slots",
  "model_calls",
  "live_model_spend",
  "create_abuse_reports",
  "trend_pages", // SEO trend tracker pages and settings: public site content built from the glossary, no personal data
  "trend_settings",
  "trend_log",
  "seo_events", // anonymous landing-page funnel counts (random browser id, no account link, workspace "system"); pruned after 180 days
  "sb_slug_holds", // released /s/<slug> addresses held 30 days for their previous workspace (opaque workspace id + dates, workspace "system"); swept by the delete job
  "sb_fingerprints", // content-free structural fingerprints of recent site builds (no text, no names, workspace "system"); pruned after 120 days
  "growth_events", // anonymous product events (random browser id, no account link, no prompt text); pruned after 180 days
  "cost_events", // provider cost per call (feature, model, tokens, USD, latency; workspace "system", no prompt text); purged after 90 days
  "cost_user_day", // per-account daily provider-cost and call counters for quotas (numbers only)
  "cost_feature_day", // per-feature daily cost totals (no personal data)
  "cost_config", // admin cost-guard settings (no personal data)
  "cost_state", // throttles and provider-balance state (no personal data)
  "overage_settings", // overage opt-in and monthly cap: the billing authorization behind any overage charge
  "overage_usage", // overage amounts billed per month: a financial record
] as const;
export const RETAINED_PATTERNS = [/^usage_window_/, /^system_/, /^admin_/, /^ops_/, /^_health$/, /^_cron_beats$/ /* cron heartbeat timestamps, no personal data */];

/** Collections that hold user content/data. Listed so the file backend can enumerate and so new ones must be classified. */
export const USER_COLLECTIONS = [
  "accounts_workspaces", "chat_threads", "chat_digests", "memory_items", "memory_settings", "projects", "project_notes", "project_files",
  "sb_sites", "sb_versions", "sb_leads", "sb_templates" /* site snapshots you chose to share as templates; removed with the site or the account */, "sb_template_likes" /* community templates you liked; exported and deleted with the account */, "sb_records" /* site features: visitor signups, bookings, table rows; exported and deleted with the account */, "sb_assets", "sb_shots", "app_builds" /* Keplar Apps build records: your prompt, plan and generated files; the apps' own end-user data lives in app_* tables and is deleted with each app */, "create_projects", "referral_profiles" /* your invite code and hashed network/browser markers */, "create_deploys", "create_domains", "create_media_jobs", "img_jobs", "hf_finalize",
  "collab_invites" /* live-session invite links you created (token hashes only) */, "collab_grants" /* who joined your creations by link */, "collab_branches" /* split-off records */, "critic_reports" /* AI critic reports on your creations */, "sb_deploys" /* deploy and rollback history with logs */,
  "slide_decks", "study_sets", "study_guides", "study_progress", "dev_outbox",
  "biz_settings", "biz_connect_accounts", "biz_connect_events", "biz_orders", "biz_contacts", "biz_deals", "biz_activities", "biz_inbox",
  "biz_connections", "biz_bank_items", "biz_agents", "biz_agent_runs", "biz_approvals", "biz_audit", "biz_table_rows", "biz_pageviews", "biz_schedule_claims", "biz_mock_v2_accounts",
  "business_accounts", "business_reports", "business_layouts", "business_tasks", "business_summaries", // Business profiles and workspace content: exported and removed with their owner.
  "mcp_servers", "mcp_tools", "mcp_grants", "mcp_receipts", "mcp_oauth", "mobile_creds",
  "team_teams", "team_members", "team_invites", "team_audit" /* team workspaces (BETA): scoped by the team id, so exported and deleted with the team, never with a member's account */, "team_memberships" /* your own index of the teams you belong to */, "api_keys" /* hashed API keys (BETA): never exported with a secret, deleted with the account */, "embed_widgets" /* public embed widget configs (BETA): no secrets, deleted with the account */, "answer_shares", "chat_shares" /* shared chat links: the redacted turns you chose; revoked and deleted with the account */, "answer_prefs" /* your answer style and "about you" */, "specialists" /* your saved specialists: instructions, knowledge, starters */, "specialist_shares" /* specialist links you made: a snapshot of that specialist; revoked and deleted with the account */, "family_settings" /* Family mode on/off and homework guidance; the PIN hash is never exported */, "specialist_listings" /* your Specialist directory submissions and their review status */, "feedback", "support_tickets", "learn_settings", "learn_cases", "faq_settings", "core_prefs" /* Keplar Core: tracking opt-out and the learned shorter/longer preference */, "core_jobs" /* Keplar Core background work: the question, working notes and result; expire after 7 days */,
] as const;

export const isRetained = (name: string) => (RETAINED as readonly string[]).includes(name) || RETAINED_PATTERNS.some((p) => p.test(name));
/** Not worth exporting: internal telemetry with no user-authored content. */
const NOT_EXPORTED = new Set(["model_calls", "live_model_spend", "job_slots", "dev_outbox", "seo_events", "growth_events", "sb_fingerprints"]);

const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|authorization|credential|signing|^hash$/i;
/** Redact secret-looking fields at any depth. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) && v !== null && v !== undefined ? "[redacted]" : redact(v)]));
  }
  return value;
}

async function collectionNames(wsId: string): Promise<string[]> {
  if (neonConfigured()) {
    const r = await neonQuery("SELECT DISTINCT collection FROM keplar_rows WHERE workspace_id = $1 ORDER BY collection", [wsId]);
    return r.map((x) => String(x.collection));
  }
  return [...USER_COLLECTIONS, ...RETAINED];
}

async function rowsOf(name: string, wsId: string): Promise<unknown[]> {
  if (neonConfigured()) {
    const r = await neonQuery("SELECT data FROM keplar_rows WHERE collection = $1 AND workspace_id = $2 ORDER BY id", [name, wsId]);
    return r.map((x) => parseData<unknown>(x.data));
  }
  return collection<{ id: string; workspaceId: string }>(name).list(wsId);
}

async function imageMeta(wsId: string): Promise<unknown[]> {
  if (!neonConfigured()) return [];
  try {
    return await neonQuery("SELECT id, content_type, bytes, is_public, created_at FROM keplar_images WHERE workspace_id = $1 ORDER BY created_at", [wsId]);
  } catch {
    return []; // table not created yet
  }
}

export type ExportAccount = { id: string; email: string; name: string; createdAt?: string; providers?: string[] };

/** The export as JSON text pieces, collection by collection (so a large account never builds one giant string). */
export async function* exportChunks(wsId: string, account: ExportAccount, at = new Date()): AsyncGenerator<string> {
  const head = {
    exportedAt: at.toISOString(),
    format: "keplar-export-v1",
    account,
    notes: [
      "Secrets such as connector tokens are redacted.",
      "Images are listed with their metadata; download the image files from Create.",
      "Payment records are held by Whop; the copies here are the ones Keplar keeps for accounting.",
    ],
  };
  yield `${JSON.stringify(head).slice(0, -1)},"collections":{`;
  let first = true;
  for (const name of await collectionNames(wsId)) {
    if (NOT_EXPORTED.has(name)) continue;
    const rows = await rowsOf(name, wsId);
    if (!rows.length) continue;
    yield `${first ? "" : ","}${JSON.stringify(name)}:${JSON.stringify(redact(rows))}`;
    first = false;
  }
  const imgs = await imageMeta(wsId);
  if (imgs.length) yield `${first ? "" : ","}"images":${JSON.stringify(imgs)}`;
  yield "}}";
}

export type DeleteResult = { deleted: number; retained: string[] };

/** Deletes every user-owned row. Never touches the retained collections. */
export async function deleteWorkspaceData(wsId: string): Promise<DeleteResult> {
  let deleted = 0;
  // Take the person out of the "most frequently asked" counts (keyed hashes in system_faq, which no workspace owns).
  try {
    const { forgetUser } = await import("@/lib/faq/repo");
    await forgetUser(wsId);
  } catch {
    /* best effort: the counts hold only keyed hashes and expire after 60 days */
  }
  // Apps you built: their end-user accounts, records and files live in the app_* tables keyed by the app, not the workspace.
  try {
    const [{ sites }, { deleteAppData }] = await Promise.all([import("@/lib/site-builder/store"), import("@/lib/app-runtime/db")]);
    for (const s of await sites().list(wsId)) if (s.kind === "app") await deleteAppData(s.id);
  } catch {
    /* best effort: no app tables yet */
  }
  const kept: string[] = [];
  for (const name of await collectionNames(wsId)) {
    if (isRetained(name)) {
      kept.push(name);
      continue;
    }
    if (neonConfigured()) {
      const r = await neonQuery("DELETE FROM keplar_rows WHERE collection = $1 AND workspace_id = $2 RETURNING id", [name, wsId]);
      deleted += r.length;
    } else {
      const col = collection<{ id: string; workspaceId: string }>(name);
      for (const row of await col.list(wsId)) if (await col.remove(wsId, row.id)) deleted++;
    }
  }
  if (neonConfigured()) {
    try {
      const r = await neonQuery("DELETE FROM keplar_images WHERE workspace_id = $1 RETURNING id", [wsId]);
      deleted += r.length;
    } catch {
      /* no images table yet */
    }
  }
  return { deleted, retained: kept.filter((n) => n.length) };
}

/** Removes the login itself (user row + sessions). Neon only; the file/cookie fallback has no user table. */
export async function deleteLogin(userId: string, email: string): Promise<void> {
  if (!neonConfigured()) return;
  await neonQuery("DELETE FROM keplar_sessions WHERE user_id = $1", [userId]);
  await neonQuery("DELETE FROM keplar_users WHERE id = $1", [userId]);
  // Second-factor secret, recovery-code hashes and passkeys (the tables exist only once someone has used the feature).
  for (const t of ["keplar_mfa", "keplar_passkeys", "keplar_webauthn_challenges"]) await neonQuery(`DELETE FROM ${t} WHERE user_id = $1`, [userId]).catch(() => undefined);
  // Contact-form messages they sent, if any.
  await neonQuery("DELETE FROM inquiries WHERE lower(email) = lower($1)", [email]).catch(() => undefined);
}

/** True while a paid membership can still bill. A subscription set to end at period end is allowed to be deleted. */
export function activeSubscription(b: { status: string; subscriptionId: string | null; cancelAtPeriodEnd: boolean }): boolean {
  if (!b.subscriptionId) return false;
  if (b.cancelAtPeriodEnd) return false;
  return b.status === "active" || b.status === "trialing" || b.status === "past_due";
}
