/**
 * Shareable answer-comparison links.
 *
 * Private by default: nothing is shared unless the signed-in owner presses "Create link" after seeing exactly what goes in it.
 * A link shows ONE answer: the written answer, how many models agreed, which models were consulted with their stance, and the
 * disagreements. The question is included only if the owner leaves it ticked. No account id, name, email, history or memory is
 * ever included. The owner can revoke it at any time (immediately 404), links expire after 90 days, a page view only
 * increments a counter (no IP, no user agent). Pages are noindex/nofollow/noarchive. Text is rendered as plain text, links are not clickable.
 *
 * Abuse controls: sign-in required, at most 25 live links and 10 new links per hour per account, size caps on every field,
 * an owner-visible list. Reports go to /feedback (kind problem) and the team can remove a link via admin.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { verifySourcing } from "@/lib/orchestration/sourcing";
import type { Sourcing } from "@/lib/orchestration/types";

export const SHARE_LIMITS = { checks: 8, live: 25, perHour: 10, markdown: 12_000, question: 1_500, text: 400, models: 10, disagreements: 4, positions: 5, days: 90 } as const;

export type SharedModel = { name: string; provider: string; slot: "panel" | "verifier" | "judge"; status: string; stance?: string };
/** One cross-model review finding (what held, was reworded, left out or kept as a minority view). Web checks are not part of it; they are sources. */
export type SharedCheck = { kind: string; finding: string; models: string[]; outcome: string; resolution: string };
export type SharedDisagreement = { topic: string; positions: { stance: string; models: string[]; summary: string }[]; resolution: string };
export type ShareRow = {
  id: string;
  workspaceId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  question?: string;
  markdown: string;
  consensus: { level: string; agree: number; disagree: number; responded: number; consulted: number };
  models: SharedModel[];
  disagreements: SharedDisagreement[];
  /** Review findings and the reviewer behind them, for the side-by-side "why this answer" block. Absent on links made before this existed. */
  checks?: SharedCheck[];
  reviewer?: string;
  /** The server-signed web source check (BETA) of this answer, kept only when the signature verifies for the answer id. Never client-made. */
  sourcing?: Sourcing;
  /** Page views (a counter only). */
  views: number;
  /** Recorded when someone opens the Keplar app from this page. */
  cta?: number;
  /** Public/indexable opt-in (src/lib/growth/share-public.ts). Empty string = private. Stays unset until the owner turns it on. */
  publicAt?: string;
  /** When the owner last confirmed the page may be public and indexable. Unset while the link is only private. */
  consentAt?: string;
  /** Stable public URL part (/answers/<publicSlug>). Kept when switched off so a later re-publish keeps the same URL. */
  publicSlug?: string;
  /** Set by an admin to take a public page down; the owner cannot undo it. */
  hiddenAt?: string;
};

const rows = () => collection<ShareRow>("answer_shares");

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max) : "");
const short = (v: unknown, max: number = SHARE_LIMITS.text) => clean(v, max).trim();
const num = (v: unknown, max = 20) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
const SLOTS = ["panel", "verifier", "judge"] as const;
const LEVELS = ["consensus", "partial", "none", "single", "unscored"];

export const newToken = () => randomBytes(18).toString("base64url");
export const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{24}$/.test(t);

export type ShareSnapshot = Pick<ShareRow, "question" | "markdown" | "consensus" | "models" | "disagreements" | "checks" | "reviewer" | "sourcing">;

/** Validates and trims what the browser sent. The browser's copy of the answer is the owner's own content, never trusted for markup. */
export function sanitizeSnapshot(body: unknown, includeQuestion: boolean): ShareSnapshot | string {
  if (!body || typeof body !== "object") return "Nothing to share.";
  const b = body as Record<string, unknown>;
  const markdown = clean(b.markdown, SHARE_LIMITS.markdown).trim();
  if (markdown.length < 10) return "There is no answer to share yet.";
  const c = (b.consensus && typeof b.consensus === "object" ? b.consensus : {}) as Record<string, unknown>;
  const level = LEVELS.includes(String(c.level)) ? String(c.level) : "unscored";
  const models: SharedModel[] = (Array.isArray(b.models) ? b.models : []).slice(0, SHARE_LIMITS.models).flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const x = m as Record<string, unknown>;
    const name = short(x.name, 80);
    if (!name) return [];
    const stance = short(x.stance, 200);
    return [{ name, provider: short(x.provider, 60), slot: SLOTS.find((s) => s === x.slot) ?? "panel", status: short(x.status, 20) || "responded", ...(stance ? { stance } : {}) }];
  });
  const disagreements: SharedDisagreement[] = (Array.isArray(b.disagreements) ? b.disagreements : []).slice(0, SHARE_LIMITS.disagreements).flatMap((d) => {
    if (!d || typeof d !== "object") return [];
    const x = d as Record<string, unknown>;
    const positions = (Array.isArray(x.positions) ? x.positions : []).slice(0, SHARE_LIMITS.positions).flatMap((p) => {
      if (!p || typeof p !== "object") return [];
      const y = p as Record<string, unknown>;
      const stance = short(y.stance, 200);
      return stance ? [{ stance, models: (Array.isArray(y.models) ? y.models : []).slice(0, 8).map((m) => short(m, 80)).filter(Boolean), summary: short(y.summary, 500) }] : [];
    });
    const topic = short(x.topic, 160);
    return topic && positions.length ? [{ topic, positions, resolution: short(x.resolution, 600) }] : [];
  });
  const CHECK_OUTCOMES = ["held", "revised", "removed", "kept-as-dissent"];
  const checks: SharedCheck[] = (Array.isArray(b.checks) ? b.checks : []).flatMap((k) => {
    if (!k || typeof k !== "object") return [];
    const x = k as Record<string, unknown>;
    const finding = short(x.finding, 300);
    const outcome = CHECK_OUTCOMES.find((o) => o === x.outcome);
    if (!finding || !outcome || x.kind === "web") return [];
    return [{ kind: short(x.kind, 20) || "reasoning", finding, models: (Array.isArray(x.models) ? x.models : []).slice(0, 6).map((m) => short(m, 80)).filter(Boolean), outcome, resolution: short(x.resolution, 300) }];
  }).slice(0, SHARE_LIMITS.checks);
  const reviewer = short(b.reviewer, 100);
  // A source check is shown on a shared page only if THIS server made it for THIS answer id (HMAC, orchestration/sourcing.ts). A forged or edited one is dropped.
  const sourcing = verifySourcing(b.id, b.sourcing as Sourcing | undefined) ? (b.sourcing as Sourcing) : undefined;
  const q = includeQuestion ? short(b.question, SHARE_LIMITS.question) : "";
  return {
    ...(q ? { question: q } : {}),
    markdown,
    consensus: { level, agree: num(c.agree), disagree: num(c.disagree), responded: num(c.responded), consulted: num(c.consulted) },
    models,
    disagreements,
    ...(checks.length ? { checks } : {}),
    ...(reviewer ? { reviewer } : {}),
    ...(sourcing ? { sourcing } : {}),
  };
}

export async function liveSharesOf(workspaceId: string, at = Date.now()): Promise<ShareRow[]> {
  return (await rows().list(workspaceId)).filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export class ShareLimitError extends Error {}

export async function createShare(workspaceId: string, snap: ShareSnapshot, at = Date.now()): Promise<ShareRow> {
  const own = await rows().list(workspaceId);
  if (own.filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).length >= SHARE_LIMITS.live) throw new ShareLimitError(`You have ${SHARE_LIMITS.live} live links. Revoke one to make another.`);
  if (own.filter((r) => Date.parse(r.createdAt) > at - 3_600_000).length >= SHARE_LIMITS.perHour) throw new ShareLimitError("You've made several links in the last hour. Try again a little later.");
  const token = newToken();
  const row: ShareRow = { id: token, workspaceId, token, createdAt: new Date(at).toISOString(), expiresAt: new Date(at + SHARE_LIMITS.days * 864e5).toISOString(), ...snap, views: 0 };
  return rows().insert(row);
}

export async function revokeShare(workspaceId: string, token: string): Promise<boolean> {
  const r = await rows().get(workspaceId, token);
  if (!r || r.revokedAt) return false;
  await rows().update(workspaceId, token, { revokedAt: new Date().toISOString() });
  return true;
}

/** Public lookup: only a live (not revoked, not expired) link. Counts the view. */
export async function openShare(token: string, opts: { count?: boolean } = {}, at = Date.now()): Promise<ShareRow | null> {
  if (!validToken(token)) return null;
  const r = await rows().findSystemBy("token", token);
  if (!r || r.revokedAt || Date.parse(r.expiresAt) <= at) return null;
  if (opts.count) await rows().increment(r.workspaceId, r.id, { views: 1 }, { ...r, views: 0 }).catch(() => undefined);
  return r;
}

export async function shareStats(days = 30, at = Date.now()): Promise<{ created: number; live: number; views: number }> {
  const list = await rows().listSystemRange({ field: "createdAt", gte: new Date(at - days * 864e5).toISOString() }, 5000);
  return { created: list.length, live: list.filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > at).length, views: list.reduce((t, r) => t + (r.views || 0), 0) };
}
