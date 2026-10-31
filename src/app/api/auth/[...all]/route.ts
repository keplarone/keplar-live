import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/accounts/auth";
import { isStoreUnavailable, storeUnavailableNow } from "@/lib/create/platform/neon";
import { outageRedirect } from "@/lib/accounts/outage-redirect";

export const runtime = "nodejs";

const base = toNextJsHandler(auth.handler);

/** Shown by the sign-in form (it reads `message`) while the account database is unavailable. */
const SIGNIN_UNAVAILABLE = "Sign-in is temporarily unavailable. You can still ask Keplar questions without signing in. Please try again in a few minutes.";

const unavailable = () =>
  Response.json({ error: "temporarily_unavailable", code: "TEMPORARILY_UNAVAILABLE", message: SIGNIN_UNAVAILABLE }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });

/**
 * Better Auth, with one addition: while the database is unavailable (neon.ts circuit), a request that failed because of it answers a
 * clear 503 with a message the form shows, instead of a bare 500. Requests that don't need the database (the stateless session
 * cookie read, sign-out) are untouched.
 */
async function guarded(handler: (req: Request) => Promise<Response>, req: Request): Promise<Response> {
  try {
    const res = await handler(req);
    if (res.status >= 500 && storeUnavailableNow()) return unavailable();
    if (res.status >= 300 && res.status < 400 && storeUnavailableNow()) return outageRedirect(res, req);
    return res;
  } catch (e) {
    if (isStoreUnavailable(e) || storeUnavailableNow()) return unavailable();
    throw e;
  }
}

export const GET = (req: Request) => guarded(base.GET, req);
export const POST = (req: Request) => guarded(base.POST, req);
