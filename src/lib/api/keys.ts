/**
 * API keys (BETA). A key is `kpl_` + 192 random bits. Only its SHA-256 is stored, so a database leak does not leak working keys, and the key is
 * shown once, at creation. Revoking is immediate: every request looks the key up. A key belongs to the personal workspace that made it; the plan,
 * credits and limits are that workspace's, read fresh on each request. Keys are scoped (`ask`, `usage`).
 */
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { API_POLICY, apiAvailable, isScope, KEY_NAME_MAX, KEY_PREFIX, type ApiScope } from "./policy";

export type ApiKeyRow = {
  id: string;
  workspaceId: string;
  name: string;
  /** First characters of the key, to recognize it in a list. Not enough to use it. */
  prefix: string;
  /** sha256 of the full key. */
  hash: string;
  scopes: ApiScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** Counters for this key (the plan's credits are spent from the workspace as usual). */
  requests: number;
  credits: number;
};

export const apiKeys = () => collection<ApiKeyRow>("api_keys");
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const looksLikeKey = (v: string) => /^kpl_[A-Za-z0-9_-]{32}$/.test(v);
export const publicKey = (k: ApiKeyRow) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, createdAt: k.createdAt, expiresAt: k.expiresAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt, requests: k.requests, credits: k.credits });

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSec?: number) {
    super(message);
  }
}

const active = (k: ApiKeyRow) => !k.revokedAt && (!k.expiresAt || Date.parse(k.expiresAt) > Date.now());

export async function listKeys(wsId: string): Promise<ApiKeyRow[]> {
  return (await apiKeys().list(wsId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createKey(ws: Pick<Workspace, "id" | "plan" | "verified" | "team">, input: { name?: unknown; scopes?: unknown; expiresInDays?: unknown }): Promise<{ key: string; row: ApiKeyRow }> {
  if (ws.team) throw new HttpError(403, "API keys belong to a personal workspace.", "personal_only");
  if (!ws.verified) throw new HttpError(403, "Verify your email address first.", "unverified");
  if (!apiAvailable(ws.plan)) throw new HttpError(402, "API keys are not available on this plan.", "plan_required");
  const name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, KEY_NAME_MAX) : "";
  if (!name) throw new HttpError(400, "Give the key a name so you can recognize it.");
  const scopes = Array.isArray(input.scopes) && input.scopes.length ? [...new Set(input.scopes)] : ["ask"];
  if (!scopes.every(isScope)) throw new HttpError(400, "Unknown scope. Use ask and/or usage.", "bad_scope");
  const days = input.expiresInDays === null || input.expiresInDays === undefined || input.expiresInDays === "" ? null : Number(input.expiresInDays);
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 365)) throw new HttpError(400, "Expiry must be between 1 and 365 days, or none.", "bad_expiry");
  const live = (await listKeys(ws.id)).filter(active);
  const max = API_POLICY[ws.plan].maxKeys;
  if (live.length >= max) throw new HttpError(409, `Your plan allows ${max} active keys. Revoke one to create another.`, "limit");
  if (live.some((k) => k.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, "A key with that name exists. Pick another name.", "duplicate");
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  const t = now();
  const row: ApiKeyRow = {
    id: newId("key"), workspaceId: ws.id, name, prefix: key.slice(0, 10), hash: hashKey(key), scopes: scopes as ApiScope[], createdAt: t,
    expiresAt: days ? new Date(Date.now() + days * 864e5).toISOString() : null, lastUsedAt: null, revokedAt: null, requests: 0, credits: 0,
  };
  await apiKeys().insert(row);
  return { key, row };
}

export async function revokeKey(wsId: string, id: string): Promise<boolean> {
  const k = await apiKeys().get(wsId, id);
  if (!k || k.revokedAt) return false;
  await apiKeys().update(wsId, id, { revokedAt: now() });
  return true;
}

export function bearerOf(req: Request): string | null {
  const h = req.headers.get("authorization");
  const m = h ? /^Bearer\s+(\S+)\s*$/i.exec(h) : null;
  return m ? m[1] : null;
}

/**
 * Authenticate a v1 request by its bearer key. Cookies are never read: an API call cannot ride on a browser session.
 * Order: failed-auth throttle, lookup, scope, plan, per-key limits. Throws ApiError.
 */
export async function authenticateKey(req: Request, need: ApiScope): Promise<{ key: ApiKeyRow; ws: Workspace }> {
  const ip = clientIpOf(req);
  const bad = () => new ApiError(401, "invalid_api_key", "Missing, invalid, revoked or expired API key. Send it as: Authorization: Bearer kpl_...");
  const token = bearerOf(req);
  if (!token || !looksLikeKey(token)) {
    await throttleFailures(ip);
    throw bad();
  }
  const key = await apiKeys().findSystemBy("hash", hashKey(token));
  if (!key || !active(key)) {
    await throttleFailures(ip);
    throw bad();
  }
  if (!key.scopes.includes(need)) throw new ApiError(403, "insufficient_scope", `This key doesn't have the "${need}" scope.`);
  const ws = await workspaceById(key.workspaceId);
  if (!ws) throw bad();
  if (!apiAvailable(ws.plan) && !ws.admin) throw new ApiError(403, "plan_required", "This account's plan no longer includes API access. The key works again when a supported plan is active.");
  const pol = API_POLICY[ws.admin ? "business" : ws.plan];
  // A plan that dropped to fewer keys (e.g. Plus lapsing to Free): only the oldest active keys within the new allowance keep working.
  if (!ws.admin) {
    const live = (await listKeys(ws.id)).filter(active).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const rank = live.findIndex((k) => k.id === key.id);
    if (rank < 0 || rank >= pol.maxKeys) throw new ApiError(403, "plan_required", `Your plan allows ${pol.maxKeys} active key${pol.maxKeys === 1 ? "" : "s"}; this one is over the limit. Revoke older keys or upgrade.`);
  }
  try {
    await rateLimit(`apikey:${key.id}:min`, pol.keyPerMinute, 60, { shared: true });
    await rateLimit(`apikey:${key.id}:day`, pol.keyPerDay, 86_400, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new ApiError(429, "key_rate_limited", `This key is over its limit (${pol.keyPerMinute} requests a minute, ${pol.keyPerDay} a day on your plan). Slow down and retry.`, e.retryAfterSec);
    throw e;
  }
  return { key, ws: { ...ws, via: "api" } };
}

async function throttleFailures(ip: string) {
  try {
    await rateLimit(`apikey:fail:${ip}`, 20, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new ApiError(429, "rate_limited", "Too many failed attempts. Try again in a minute.", e.retryAfterSec);
    throw e;
  }
}

/** Count one request (and the credits it cost) on the key. Best effort: never blocks an answer. */
export async function recordKeyUse(key: ApiKeyRow, credits: number): Promise<void> {
  try {
    await apiKeys().increment(key.workspaceId, key.id, { requests: 1, credits: Math.max(0, Math.round(credits)) }, { ...key, requests: 0, credits: 0 });
    await apiKeys().update(key.workspaceId, key.id, { lastUsedAt: now() });
  } catch {
    /* counters are informational */
  }
}
