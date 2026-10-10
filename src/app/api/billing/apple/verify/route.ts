/**
 * POST /api/billing/apple/verify
 * Signed-in client (iOS shell after StoreKit purchase / restore) posts a StoreKit 2
 * transaction JWS. Verifies with Apple and grants the matching Plus/Pro plan.
 *
 * Also GET returns { configured, products, appAccountToken } for the signed-in user.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { APPLE_PRODUCT_IDS, appleIapConfigured, AppleIapNotConfiguredError, AppleIapVerifyError } from "@/lib/billing/apple";
import { appAccountTokenForWorkspace, syncAppleTransactionForWorkspace } from "@/lib/billing/apple-sync";
import { planCookieHeader, signPlanCookie } from "@/lib/billing/plan-cookie";
import { assertSameOrigin } from "@/lib/security/origin";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await requireAccount(req);
    return json({
      configured: appleIapConfigured(),
      products: APPLE_PRODUCT_IDS,
      appAccountToken: appAccountTokenForWorkspace(ws.id),
      plan: ws.plan,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "apple_verify", { perIp: 30 });
    if (!appleIapConfigured()) throw new HttpError(503, "Apple IAP is not configured.", "apple_iap_not_configured");
    const ws = await requireAccount(req);
    await limitRequest(req, "apple_verify", { perIp: 30, perAccount: 12, accountId: ws.id });
    const data = await body<{ signedTransaction?: string; transactionJws?: string }>(req);
    const signedTransaction = (data.signedTransaction || data.transactionJws || "").trim();
    if (!signedTransaction) throw new HttpError(400, "signedTransaction required.");
    const out = await syncAppleTransactionForWorkspace(ws, signedTransaction);
    const headers: Record<string, string> = {};
    if (ws.email) {
      const periodStart = new Date().toISOString();
      const periodEnd = out.expiresAt ?? new Date(Date.now() + 31 * 864e5).toISOString();
      // plan-cookie only allows Whop manage URLs; Apple subscriptions are managed in Settings.
      const { value, maxAgeSec } = signPlanCookie(ws.email, { plan: out.plan, periodStart, periodEnd, manageUrl: null });
      headers["set-cookie"] = planCookieHeader(value, maxAgeSec, (process.env.BETTER_AUTH_URL || siteUrl).startsWith("https://"));
    }
    return json({ ok: true, ...out }, { headers });
  } catch (e) {
    if (e instanceof AppleIapNotConfiguredError) return json({ error: e.message, code: e.code }, { status: 503 });
    if (e instanceof AppleIapVerifyError) return json({ error: e.message }, { status: e.status });
    if (e && typeof e === "object" && "status" in e && "code" in e && typeof (e as { status: unknown }).status === "number") {
      const err = e as { status: number; message: string; code: string };
      return json({ error: err.message, code: err.code }, { status: err.status });
    }
    return errorResponse(e);
  }
}
