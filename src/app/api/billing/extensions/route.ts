import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { canBuyExtension, extensionPack, extensionPacks, extensionsAvailable, extensionValidDays, PACK_IDS, type PackId } from "@/lib/billing/extensions";
import { createExtensionCheckout, whopCheckoutConfigured } from "@/lib/billing/whop";
import { extensionSummary } from "@/lib/create/platform/extensions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: what the limit-reached card needs. Packs are listed only when Whop checkout and the pack's plan id are configured;
 * otherwise `available:false` and the UI says extensions are not on sale yet (and offers the plan upgrade instead).
 * `eligible` is false for Free (free models only: nothing to extend) and Business/admin.
 */
export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req, { allowAnonymous: false });
    const eligible = !ws.admin && canBuyExtension(ws.plan);
    const available = eligible && extensionsAvailable(whopCheckoutConfigured());
    return json({
      plan: ws.plan,
      eligible,
      available,
      validDays: extensionValidDays(),
      packs: available ? extensionPacks().filter((p) => p.available).map((p) => ({ id: p.id, label: p.label, credits: p.credits, priceUsd: p.priceUsd })) : [],
      balance: eligible ? await extensionSummary(ws.id) : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST { pack }: start a Whop checkout for one pack. Signed-in, verified, same-origin, rate limited; paid plans only. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "billing_extension", { perIp: 10 });
    const ws = await requireAccount(req);
    await limitRequest(req, "billing_extension", { perIp: 10, perAccount: 5, accountId: ws.id });
    const { pack } = await body<{ pack?: string }>(req);
    if (!PACK_IDS.includes(pack as PackId)) throw new HttpError(400, "Choose the small or medium pack.");
    if (ws.admin || !canBuyExtension(ws.plan)) throw new HttpError(403, "Extensions add credits for paid models, which the Free plan doesn't use. Upgrade to get them.", "extension_plan");
    const p = extensionPack(pack as PackId);
    if (!whopCheckoutConfigured() || !p.planId) throw new HttpError(503, "Extensions aren't on sale yet.", "extension_unavailable");
    if (!ws.email) throw new HttpError(400, "Your account needs an email address.");
    const c = await createExtensionCheckout({ planId: p.planId, pack: p.id, email: ws.email, workspaceId: ws.id, origin: new URL(req.url).origin });
    return json({ url: c.url });
  } catch (e) {
    return errorResponse(e);
  }
}
