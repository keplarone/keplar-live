import { limitRequest } from "@/lib/create/platform/ratelimit";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { allIdentities, DERIVED, identityViews, spaceOwner, spaceSession } from "@/lib/space-studio/account";
import { planUnlink, PROVIDERS, type Provider } from "@/lib/space-studio/core";
import { commitUnlink } from "@/lib/space-studio/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who(req: Request, write: boolean) {
  const ws = await spaceOwner(req, write, 20);
  const s = await spaceSession(req);
  if (!s) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  return { ws, s };
}

/** GET -> { identities } */
export async function GET(req: Request) {
  try {
    const { ws, s } = await who(req, false);
    return json({ identities: identityViews(await allIdentities(ws.id, s)) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * DELETE { provider } -> { identities } | 409 { code: "last_method" | "reauth_required" | "managed_by_account" } | 404 not_linked.
 * Needs a sign-in within the last 10 minutes (the session's sign-in time); the Keplar account and Google sign-in can't be unlinked here.
 */
export async function DELETE(req: Request) {
  try {
    await limitRequest(req, "space-identities", { perIp: 10 });
    const { ws, s } = await who(req, true);
    const { provider } = await body<{ provider?: unknown }>(req);
    if (typeof provider !== "string" || !PROVIDERS.includes(provider as Provider)) throw new HttpError(400, "Say which account to unlink.", "bad_request");
    const ids = await allIdentities(ws.id, s);
    const plan = planUnlink(ids, provider as Provider, s.authAt, Date.now());
    if (!plan.ok) throw new HttpError(plan.code === "not_linked" ? 404 : 409, plan.message, plan.code);
    if (DERIVED.has(provider as Provider)) throw new HttpError(409, "This sign-in method belongs to your Keplar account and can't be unlinked here.", "managed_by_account");
    await commitUnlink(ws.id, ids.find((i) => i.provider === provider)!, plan.identities.filter((i) => !DERIVED.has(i.provider)));
    return json({ identities: identityViews(await allIdentities(ws.id, s)) });
  } catch (e) {
    return errorResponse(e);
  }
}
