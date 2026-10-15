/**
 * API keys (BETA), managed from Account → Developer API.
 *   GET  -> your keys (never the secret), the plan's key policy, and the stated limits.
 *   POST { name, scopes?, expiresInDays? } -> create a key. The full key is in this response ONCE; only its hash is stored.
 * Session sign-in only (a key can't create keys), same-origin, personal workspace only. Creating a key needs a sign-in from
 * the last 10 minutes (403 reauth_required, src/lib/accounts/reauth.ts), and the owner is emailed about the new key.
 */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { getSession } from "@/lib/accounts/auth";
import { requireRecentSignIn } from "@/lib/accounts/reauth";
import { notifySecurityChange } from "@/lib/accounts/security-notice";
import { assertSameOrigin, SAFE_METHODS } from "@/lib/security/origin";
import { API_POLICY, API_SCOPES, API_STATEMENT, SCOPE_BLURB } from "@/lib/api/policy";
import { createKey, listKeys, publicKey } from "@/lib/api/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner(req: Request) {
  if (!SAFE_METHODS.has(req.method.toUpperCase())) assertSameOrigin(req);
  const ws = await requireAccount(req); // personal workspace: this route never opts in to team context
  await limitRequest(req, "api-keys", { perIp: 60, perAccount: 30, accountId: ws.id });
  return ws;
}

export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    const pol = API_POLICY[ws.admin ? "business" : ws.plan];
    return json({ beta: true, plan: ws.plan, available: pol.available || ws.admin, policy: pol, statement: API_STATEMENT, scopes: API_SCOPES.map((s) => ({ id: s, blurb: SCOPE_BLURB[s] })), keys: (await listKeys(ws.id)).map(publicKey) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    requireRecentSignIn(await getSession(req.headers));
    const b = await body<{ name?: unknown; scopes?: unknown; expiresInDays?: unknown }>(req);
    const { key, row } = await createKey(ws.admin ? { ...ws, plan: "business" } : ws, b);
    if (ws.email) await notifySecurityChange(ws.email, "api_key_created", req.headers, row.name);
    return json({ key, shownOnce: true, apiKey: publicKey(row) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
