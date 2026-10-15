/**
 * Track A: official gateways. OAuth 2.0 placeholder handshake.
 * No provider credentials are configured. authorize URLs point at example.com,
 * the client id is PLACEHOLDER_CLIENT_ID, and tokens are simulated.
 * State and the simulated token are stored per workspace (app store), and the
 * callback refuses to connect until that account's PIN verifies.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { verifyPin } from "./pin";

export const PROVIDERS: Record<string, { authorizeUrl: string; scopes: string[] }> = {
  logistics: { authorizeUrl: "https://example.com/oauth/authorize", scopes: ["shipments.read", "shipments.write"] },
  commerce: { authorizeUrl: "https://example.com/oauth/authorize", scopes: ["orders.write"] },
  account: { authorizeUrl: "https://example.com/oauth/authorize", scopes: ["profile.read"] },
};

const STATE_TTL_MS = 10 * 60 * 1000;

type StateRow = { id: string; workspaceId: string; provider: string; createdAt: number };
type TokenRow = { id: string; workspaceId: string; provider: string; accessToken: string; simulated: true };

const states = () => collection<StateRow>("wants_oauth_states");
const tokens = () => collection<TokenRow>("wants_oauth_tokens");

export function startConnect(workspaceId: string, provider: string, redirectUri: string): { authorizeUrl: string; state: string; placeholder: true } {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error("unknown_provider");
  const state = randomBytes(16).toString("base64url");
  // Insert is async; the route awaits saveState. This helper stays sync for the URL only.
  const q = new URLSearchParams({
    response_type: "code",
    client_id: "PLACEHOLDER_CLIENT_ID",
    redirect_uri: redirectUri,
    scope: cfg.scopes.join(" "),
    state,
  });
  return { authorizeUrl: `${cfg.authorizeUrl}?${q}`, state, placeholder: true };
}

export async function saveState(workspaceId: string, provider: string, state: string): Promise<void> {
  await states().insert({ id: state, workspaceId, provider, createdAt: Date.now() });
}

export async function connected(workspaceId: string, provider: string): Promise<boolean> {
  return (await tokens().get(workspaceId, provider)) !== null;
}

export async function finishConnect(workspaceId: string, state: string, pin: string | null): Promise<{ status: string; reason?: string; provider?: string; simulated?: true }> {
  const row = await states().findSystemBy("id", state);
  if (!row || row.workspaceId !== workspaceId || Date.now() - row.createdAt > STATE_TTL_MS) {
    if (row) await states().remove(row.workspaceId, row.id);
    return { status: "error", reason: "invalid_or_expired_state" };
  }
  await states().remove(row.workspaceId, row.id);
  const pinCheck = await verifyPin(workspaceId, pin);
  if (pinCheck === "unset") return { status: "error", reason: "pin_not_set" };
  if (pinCheck !== "ok") return { status: "error", reason: "pin_required" };
  const existing = await tokens().get(workspaceId, row.provider);
  const token: TokenRow = { id: row.provider, workspaceId, provider: row.provider, accessToken: `sim_${randomBytes(8).toString("hex")}`, simulated: true };
  if (existing) await tokens().update(workspaceId, row.provider, token);
  else await tokens().insert(token);
  return { status: "connected", provider: row.provider, simulated: true };
}

/** Placeholder execution: no real provider API is called. */
export async function executeGateway(workspaceId: string, provider: string, op: string, params: Record<string, unknown>): Promise<{ status: string; provider: string; reason?: string; op?: string; params?: Record<string, unknown>; note?: string; simulated?: true }> {
  if (!(await connected(workspaceId, provider))) {
    return { status: "needs_connection", provider, reason: `Connect your ${provider} account first (OAuth).` };
  }
  return { status: "simulated", provider, op, params, simulated: true, note: "Placeholder gateway: no real API call made." };
}
