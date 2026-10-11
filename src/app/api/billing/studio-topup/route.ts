import { body, errorResponse, json } from "@/lib/create/platform/http";
import { requireAccount } from "@/lib/create/platform/workspace";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { configureStudioTopUp, runStudioTopUp, studioTopUpQuote, studioTopUpState } from "@/lib/billing/studio-topup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const ws = await requireAccount(req);
    await limitRequest(req, "studio_topup_read", { perIp: 60, perAccount: 30, accountId: ws.id });
    const params = new URL(req.url).searchParams;
    return json(params.has("setup") ? await studioTopUpQuote(ws, params.has("amount") ? Number(params.get("amount")) : undefined) : await studioTopUpState(ws));
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireAccount(req);
    await limitRequest(req, "studio_topup_write", { perIp: 60, perAccount: 30, accountId: ws.id });
    const input = await body<{ action?: string; enabled?: unknown; quoteId?: unknown; pack?: unknown; methodId?: unknown; monthlyLimit?: unknown }>(req);
    return json(input.action === "recharge" ? await runStudioTopUp(ws) : await configureStudioTopUp(ws, input));
  } catch (e) { return errorResponse(e); }
}
