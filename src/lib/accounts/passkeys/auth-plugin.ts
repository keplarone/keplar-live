/**
 * Better Auth plugin: sign in with a passkey.
 *   POST /passkey/login/options                       { options, token }  (no email needed; the passkey names its account)
 *   POST /passkey/login/verify { token, response, callbackURL? }  { status, redirectTo }  and the session cookies
 * Same-origin only, rate limited per IP. A passkey is user-verified (fingerprint, face or device PIN), so it counts as two
 * factors: the session is not held for an authenticator-app code. A sign-in from a device the account has not used before
 * still sends the usual "new sign-in" email.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { afterSignInPath } from "@/lib/onboarding/redirect";
import { persistenceEnabled, userById } from "../persist";
import { authRedirectPath } from "../redirect";
import { startSession } from "../session-issue";
import { loginOptions, verifyLogin } from "./webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

const ipOf = (ctx: { headers?: Headers | null }) => (ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local");
const obj = (b: unknown) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {});

async function limit(key: string, max: number, windowSec: number) {
  try {
    await rateLimit(key, max, windowSec, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Wait a few minutes and try again.", code: "RATE_LIMITED" });
    throw e;
  }
}

function sameOrigin(ctx: { headers?: Headers | null; context: { isTrustedOrigin: (o: string) => boolean } }) {
  const origin = ctx.headers?.get("origin");
  if (!origin || !ctx.context.isTrustedOrigin(origin)) throw new APIError("FORBIDDEN", { message: "Invalid origin", code: "INVALID_ORIGIN" });
}

const need = () => {
  if (!persistenceEnabled()) throw new APIError("SERVICE_UNAVAILABLE", { message: "Passkeys need the account database, which isn't connected here.", code: "NOT_AVAILABLE" });
};

export const passkeyAuth = () =>
  ({
    id: "passkey-auth",
    endpoints: {
      passkeyLoginOptions: createAuthEndpoint("/passkey/login/options", { method: "POST", requireHeaders: true }, async (ctx) => {
        sameOrigin(ctx);
        need();
        await limit(`passkey:options:ip:${ipOf(ctx)}`, 30, 600);
        return ctx.json(await loginOptions());
      }),

      passkeyLoginVerify: createAuthEndpoint("/passkey/login/verify", { method: "POST", requireHeaders: true }, async (ctx) => {
        sameOrigin(ctx);
        need();
        const ip = ipOf(ctx);
        await limit(`passkey:verify:ip:${ip}`, 20, 600);
        const b = obj(ctx.body);
        const fail = new APIError("UNAUTHORIZED", { message: "We couldn't sign you in with that passkey. Try again, or use another way to sign in.", code: "PASSKEY_FAILED" });
        if (typeof b.token !== "string" || typeof b.response !== "object" || b.response === null) throw fail;
        const res = await verifyLogin(b.token, b.response as AuthenticationResponseJSON);
        if (!res.ok) {
          if (res.reason === "expired") throw new APIError("BAD_REQUEST", { message: "That took too long. Start again.", code: "PASSKEY_EXPIRED" });
          throw fail;
        }
        const user = await userById(res.userId);
        if (!user) throw fail;
        await startSession(ctx, { email: user.email, name: user.name, provider: "passkey", remember: b.remember !== false, secondFactorDone: true });
        const next = authRedirectPath(typeof b.callbackURL === "string" ? b.callbackURL : undefined, "/app");
        return ctx.json({ status: true, redirectTo: await afterSignInPath(user.id, next, { secondFactorDone: true }) });
      }),
    },
    rateLimit: [{ pathMatcher: (p: string) => p.startsWith("/passkey/"), window: 60, max: 60 }],
  }) satisfies BetterAuthPlugin;
