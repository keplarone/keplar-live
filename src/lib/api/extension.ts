/**
 * The browser extension's connection to a Keplar account: no key to create or paste, and it spends the account's credits.
 *
 *   extension: POST /api/extension/connect {challenge, label}   -> {rid, code, url}       (the desktop sign-in flow, app "extension")
 *   browser  : /desktop/connect?rid=...  signed in recently, types the code, presses Connect (POST /api/auth/desktop/approve)
 *   extension: POST /api/extension/token {rid, verifier}        -> {status: "pending"} ... then {status: "connected", key}
 *   extension: POST /api/extension/disconnect  (Bearer key)     -> the connection is revoked
 *
 * What the extension receives is an API key for the person's own personal workspace, marked kind "extension". So it is metered
 * exactly like an app question (the same credits, rolling windows and spend caps; src/lib/api/ask.ts), has the plan's per-key
 * limits, is listed and revocable in Account → Developer API, and is exported and deleted with the account like every key. It does
 * not count toward the plan's key allowance (the person never made it by hand). It is never a browser session: /desktop/finish
 * refuses extension tickets (src/lib/accounts/desktop-auth.ts), and only the extension instance holding the PKCE verifier can
 * collect the key, once.
 */
import { randomBytes } from "node:crypto";
import { id as newId, now } from "@/lib/create/platform/ids";
import { ensureWorkspaceForUser } from "@/lib/accounts/workspaces";
import { exchangeCode, pollRequest, redeemTicket, type Deps } from "@/lib/desktop-auth/service";
import { isRequestId } from "@/lib/desktop-auth/core";
import { apiKeys, hashKey, listKeys, type ApiKeyRow } from "./keys";
import { KEY_NAME_MAX, KEY_PREFIX, type ApiScope } from "./policy";

export const EXTENSION_SCOPES: ApiScope[] = ["ask", "usage"];
/** Browsers connected at once per account; connecting one more retires the oldest. */
export const MAX_EXTENSION_CONNECTIONS = 5;
/** A connection lasts a year unless it is disconnected sooner; the extension then asks to connect again. */
export const EXTENSION_KEY_DAYS = 365;

export type ConnectStatus = "pending" | "connected" | "cancelled" | "denied" | "expired" | "used" | "invalid";
export type ConnectResult = { status: Exclude<ConnectStatus, "connected"> } | { status: "connected"; key: string; email: string };

const live = (k: ApiKeyRow, at: number) => k.kind === "extension" && !k.revokedAt && (!k.expiresAt || Date.parse(k.expiresAt) > at);

/** Mint the connection's key in the person's workspace, and retire the oldest connections past the cap. */
export async function mintExtensionKey(workspaceId: string, label: string): Promise<{ key: string; row: ApiKeyRow }> {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  const t = now();
  const row: ApiKeyRow = {
    id: newId("key"), workspaceId, name: label.slice(0, KEY_NAME_MAX) || "Keplar One extension", prefix: key.slice(0, 10), hash: hashKey(key),
    scopes: [...EXTENSION_SCOPES], createdAt: t, expiresAt: new Date(Date.parse(t) + EXTENSION_KEY_DAYS * 864e5).toISOString(),
    lastUsedAt: null, revokedAt: null, requests: 0, credits: 0, kind: "extension",
  };
  await apiKeys().insert(row);
  const at = Date.now();
  const connected = (await listKeys(workspaceId)).filter((k) => live(k, at)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const old of connected.slice(MAX_EXTENSION_CONNECTIONS)) await apiKeys().update(workspaceId, old.id, { revokedAt: now() });
  return { key, row };
}

/**
 * The extension's poll. Until the person approves: "pending". Once approved, the verifier holder gets the key, exactly once (the
 * code exchange and the ticket are both single use and atomic, so two racing polls can't both collect one). A desktop app's
 * request is never turned into a key, and an extension's request never into a session.
 */
export async function collectConnection(d: Deps, rid: unknown, verifier: unknown): Promise<ConnectResult> {
  if (!isRequestId(rid)) return { status: "invalid" };
  const row = await d.store.get(rid);
  if (!row || row.app !== "extension") return { status: "invalid" };
  const polled = await pollRequest(d, rid, verifier);
  if (polled.status !== "approved") return { status: polled.status };
  const ex = await exchangeCode(d, { rid, code: polled.code, verifier });
  if (!ex.ok) return { status: ex.reason === "not_approved" ? "pending" : ex.reason };
  const who = await redeemTicket(d, ex.ticket);
  if (!who || who.app !== "extension") return { status: "used" };
  const ws = await ensureWorkspaceForUser({ id: who.userId, email: who.email, name: who.name });
  const { key } = await mintExtensionKey(ws.id, row.label);
  return { status: "connected", key, email: who.email };
}

/** The extension's own Disconnect: revokes the connection it holds. A key made by hand can't be revoked this way. */
export async function disconnectExtension(token: string): Promise<"revoked" | "not_found" | "not_extension"> {
  const key = await apiKeys().findSystemBy("hash", hashKey(token));
  if (!key || key.revokedAt) return "not_found";
  if (key.kind !== "extension") return "not_extension";
  await apiKeys().update(key.workspaceId, key.id, { revokedAt: now() });
  return "revoked";
}
