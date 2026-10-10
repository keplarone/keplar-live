/**
 * Better Auth plugin: email + password, with email verification and password reset.
 *
 * Why a plugin and not Better Auth's built-in `emailAndPassword`: the built-in needs Better Auth's own database
 * adapter and user/session/account tables, while Keplar's sessions are a stateless encrypted cookie plus our own
 * `keplar_sessions` rows (so Vercel instances share nothing in memory, and Google, Microsoft, magic link and
 * password all land on one user per email). This plugin keeps that model: it uses Better Auth's scrypt
 * `hashPassword`/`verifyPassword`, its CSRF/origin machinery and cookie writer, and our session records.
 *
 * Endpoints (all POST, JSON, same-origin only):
 *   /password/sign-up              create a pending account and email a verification link
 *   /password/sign-in              log in (verified accounts only)
 *   /password/resend-verification  email a new verification link
 *   /password/verify-email         consume the link: verify, then sign in
 *   /password/forgot               email a reset link (same answer whether or not the address has an account)
 *   /password/reset                consume the link: set a new password, sign out other devices, sign in
 *
 * Security notes:
 * - No user enumeration: sign-in says "Incorrect email or password" for unknown address, wrong password and
 *   accounts without a password alike, and does the same hashing work for all of them; sign-up and forgot answer
 *   identically whether or not the address is registered (an existing owner gets an "you already have an account"
 *   email instead of an error).
 * - Rate limits and lockout: per IP, per IP+email and per email (shared across instances through Upstash or
 *   Postgres when available). The per-email counter is keyed on the address text only, so it behaves the same for
 *   addresses that have no account.
 * - Links are signed, expiring and single use (see ./action-token.ts); pages only check them, the button consumes.
 * - A pending sign-up can't log in, is replaced by a newer sign-up for the same address, and is deleted when the
 *   address is proven another way, so nobody can pre-register someone else's address and keep a password on it.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, formCsrfMiddleware } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { after } from "next/server";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { createActionToken, fingerprint, verifyActionToken, type ActionPurpose } from "./action-token";
import { accountExists, getCredential, markVerified, replacePassword, savePendingCredential } from "./credentials";
import { checkMailDomain, mailDomainOf } from "./email-domain";
import { badMailDomain } from "./email-check";
import { normalizeEmail } from "./magic-token";
import { emailAvailable, sendEmail } from "./outbox";
import { persistenceEnabled, revokeAllSessions, upsertUser } from "./persist";
import { checkPassword, EMAIL_MAX, PASSWORD_MAX, validEmail } from "./password-policy";
import { authRedirectPath } from "./redirect";
import { afterSignInPath } from "@/lib/onboarding/redirect";
import { forgetAllSessions } from "./session-guard";
import { startSession } from "./session-issue";

/** What the pages need to know to render honestly (booleans only; safe for client components). */
export type PasswordCapabilities = { passwords: boolean; email: boolean };
export const passwordCapabilities = (): PasswordCapabilities => ({ passwords: persistenceEnabled(), email: emailAvailable() });

const GENERIC_CREDENTIALS = "Incorrect email or password.";

let dummyHash: Promise<string> | null = null;
/** Hashed once, so an unknown address costs the same scrypt work as a real one (no timing tell). */
const dummy = () => (dummyHash ??= hashPassword("keplar-dummy-password-for-timing"));

const ipOf = (ctx: { headers?: Headers | null }) => (ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local");

const tooMany = (message = "Too many attempts. Wait a few minutes and try again, or email yourself a sign-in link.") => new APIError("TOO_MANY_REQUESTS", { message, code: "RATE_LIMITED" });

async function limits(rules: [key: string, max: number, windowSec: number][]) {
  try {
    for (const [key, max, windowSec] of rules) await rateLimit(key, max, windowSec, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw tooMany();
    throw e;
  }
}

/** Same-origin only: a browser POST always carries Origin, and it must be ours (login/reset CSRF guard). */
function sameOrigin(ctx: { headers?: Headers | null; context: { isTrustedOrigin: (o: string) => boolean } }) {
  const origin = ctx.headers?.get("origin");
  if (!origin || !ctx.context.isTrustedOrigin(origin)) throw new APIError("FORBIDDEN", { message: "Invalid origin", code: "INVALID_ORIGIN" });
}

function needPasswords() {
  if (!persistenceEnabled()) throw new APIError("SERVICE_UNAVAILABLE", { message: "Password accounts aren't available on this server yet (no account database is configured). Use an email link or Google/Microsoft instead.", code: "PASSWORDS_UNAVAILABLE" });
}
function needEmail() {
  if (!emailAvailable()) throw new APIError("SERVICE_UNAVAILABLE", { message: "Email delivery isn't configured on this server yet, so we can't send verification or reset emails.", code: "EMAIL_NOT_CONFIGURED" });
}

/** A domain with no mail records can't get our email: say so (with a typo hint) instead of pretending to send. */
async function needMailDomain(email: string) {
  if ((await checkMailDomain(mailDomainOf(email))) === "no_mail") throw badMailDomain(email);
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : "");
const readEmail = (body: Record<string, unknown>) => {
  const email = str(body.email, EMAIL_MAX + 1).trim();
  if (!validEmail(email)) throw new APIError("BAD_REQUEST", { message: "Enter a valid email address.", code: "INVALID_EMAIL" });
  return normalizeEmail(email);
};

/** Run a send in the background when a request scope exists (so response time doesn't depend on the address), else inline. */
async function inBackground(task: () => Promise<unknown>) {
  const safe = () => task().catch(() => console.error("[auth] background email failed"));
  try {
    after(safe);
  } catch {
    await safe();
  }
}

export type PasswordAuthOptions = {
  secret: string;
  /** Public origin used in emailed links. */
  origin: () => string;
};

function linkFor(origin: string, path: string, token: string) {
  const u = new URL(path, origin);
  u.searchParams.set("token", token);
  return u.toString();
}

const footer = "\n\nIf you didn't ask for this, you can ignore this email. Nothing changes until the link is used.\n\nKeplar · https://keplar.one";

export const passwordAuth = (opts: PasswordAuthOptions) => {
  const token = (purpose: ActionPurpose, email: string, hash: string | null, extra: { callbackURL?: string; remember?: boolean } = {}) => createActionToken(opts.secret, purpose, { email, fp: fingerprint(opts.secret, hash), ...extra });

  const deliverVerification = async (email: string, hash: string, extra: { callbackURL?: string; remember?: boolean }) => {
    const url = linkFor(opts.origin(), "/verify-email", token("verify", email, hash, extra));
    return sendEmail({ to: email, kind: "verify-email", subject: "Verify your Keplar email", text: `Welcome to Keplar. Confirm this email address to finish creating your account:\n\n${url}\n\nOpen the link and press "Verify and continue". It expires in 24 hours.${footer}` });
  };

  return {
    id: "password-auth",
    endpoints: {
      passwordSignUp: createAuthEndpoint("/password/sign-up", { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] }, async (ctx) => {
        sameOrigin(ctx);
        needPasswords();
        needEmail();
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const email = readEmail(body);
        const name = str(body.name, 80).trim();
        const password = str(body.password, PASSWORD_MAX * 4);
        const check = checkPassword(password, { email, name });
        if (!check.ok) throw new APIError("BAD_REQUEST", { message: check.problem ?? "Choose a stronger password.", code: "WEAK_PASSWORD" });
        if (body.confirm !== undefined && body.confirm !== password) throw new APIError("BAD_REQUEST", { message: "The two passwords don't match.", code: "PASSWORD_MISMATCH" });
        if (body.acceptTerms !== true) throw new APIError("BAD_REQUEST", { message: "Accept the Terms and Privacy Policy to create an account.", code: "TERMS_REQUIRED" });
        await limits([[`pw:signup:ip:${ipOf(ctx)}`, 8, 600], [`pw:signup:email:${email}`, 3, 600]]);
        await needMailDomain(email);
        const hash = await hashPassword(password); // same work whether or not the address is taken
        const callbackURL = authRedirectPath(typeof body.callbackURL === "string" ? body.callbackURL : undefined, "/app?welcome=1");
        const remember = body.remember !== false;
        const saved = await savePendingCredential({ email, hash, name });
        let ok: boolean;
        if (saved === "created") ok = await deliverVerification(email, hash, { callbackURL, remember });
        else ok = await sendEmail({ to: email, kind: "signup-existing", subject: "You already have a Keplar account", text: `Someone (hopefully you) tried to create a Keplar account with this email address, but you already have one.\n\nLog in: ${new URL("/signin", opts.origin()).toString()}\nForgot your password? ${new URL("/forgot-password", opts.origin()).toString()}${footer}` });
        if (!ok && !emailAvailable()) throw new APIError("SERVICE_UNAVAILABLE", { message: "Email delivery isn't configured on this server yet.", code: "EMAIL_NOT_CONFIGURED" });
        if (!ok && process.env.RESEND_API_KEY) throw new APIError("BAD_GATEWAY", { message: "We couldn't send the email just now. Try again in a minute.", code: "EMAIL_FAILED" });
        // Identical answer for new and existing addresses.
        return ctx.json({ status: true });
      }),

      passwordSignIn: createAuthEndpoint("/password/sign-in", { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] }, async (ctx) => {
        sameOrigin(ctx);
        needPasswords();
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const email = readEmail(body);
        const password = str(body.password, PASSWORD_MAX * 4);
        if (!password) throw new APIError("BAD_REQUEST", { message: "Enter your password.", code: "PASSWORD_REQUIRED" });
        const ip = ipOf(ctx);
        await limits([[`pw:in:ip:${ip}`, 40, 600], [`pw:in:ipemail:${ip}:${email}`, 6, 300], [`pw:in:email:${email}`, 12, 900]]);
        const cred = await getCredential(email);
        const valid = await verifyPassword({ hash: cred?.hash ?? (await dummy()), password }).catch(() => false);
        if (!cred || !valid) throw new APIError("UNAUTHORIZED", { message: GENERIC_CREDENTIALS, code: "INVALID_CREDENTIALS" });
        if (!cred.verifiedAt) throw new APIError("FORBIDDEN", { message: "Verify your email first. We sent you a link when you signed up.", code: "EMAIL_NOT_VERIFIED" });
        const remember = body.remember !== false;
        const { userId } = await startSession(ctx, { email, name: cred.name, provider: "password", remember });
        return ctx.json({ status: true, redirectTo: await afterSignInPath(userId, authRedirectPath(typeof body.callbackURL === "string" ? body.callbackURL : undefined, "/account")) });
      }),

      passwordResendVerification: createAuthEndpoint("/password/resend-verification", { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] }, async (ctx) => {
        sameOrigin(ctx);
        needPasswords();
        needEmail();
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const email = readEmail(body);
        await limits([[`pw:resend:ip:${ipOf(ctx)}`, 8, 600], [`pw:resend:email:${email}`, 3, 600]]);
        await needMailDomain(email);
        const callbackURL = authRedirectPath(typeof body.callbackURL === "string" ? body.callbackURL : undefined, "/app?welcome=1");
        const cred = await getCredential(email);
        if (cred && !cred.verifiedAt) await inBackground(() => deliverVerification(email, cred.hash, { callbackURL, remember: body.remember !== false }));
        else await inBackground(async () => undefined);
        return ctx.json({ status: true });
      }),

      passwordVerifyEmail: createAuthEndpoint("/password/verify-email", { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] }, async (ctx) => {
        sameOrigin(ctx);
        needPasswords();
        await limits([[`pw:verify:ip:${ipOf(ctx)}`, 20, 600]]);
        const res = verifyActionToken(opts.secret, "verify", (ctx.body as { token?: unknown } | undefined)?.token);
        if (!res.ok) throw new APIError("BAD_REQUEST", { message: res.reason === "expired" ? "This verification link has expired. Sign up again to get a new one." : "This verification link isn't valid.", code: `LINK_${res.reason.toUpperCase()}` });
        const { e: email, f, cb } = res.payload;
        const cred = await getCredential(email);
        if (!cred || fingerprint(opts.secret, cred.hash) !== f) throw new APIError("BAD_REQUEST", { message: "This verification link is out of date. Sign up again to get a new one.", code: "LINK_USED" });
        if (cred.verifiedAt) throw new APIError("BAD_REQUEST", { message: "This email is already verified. Log in instead.", code: "ALREADY_VERIFIED" });
        if (!(await markVerified(email, cred.hash))) throw new APIError("BAD_REQUEST", { message: "This verification link was already used.", code: "LINK_USED" });
        const { userId } = await startSession(ctx, { email, name: cred.name, provider: "password", remember: res.payload.r !== 0 });
        return ctx.json({ status: true, redirectTo: await afterSignInPath(userId, authRedirectPath(cb, "/app?welcome=1")) });
      }),

      passwordForgot: createAuthEndpoint("/password/forgot", { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] }, async (ctx) => {
        sameOrigin(ctx);
        needPasswords();
        needEmail();
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const email = readEmail(body);
        await limits([[`pw:forgot:ip:${ipOf(ctx)}`, 8, 600], [`pw:forgot:email:${email}`, 3, 600]]);
        await needMailDomain(email); // depends only on the domain, so it says nothing about whether an account exists
        const callbackURL = authRedirectPath(typeof body.callbackURL === "string" ? body.callbackURL : undefined, "/account");
        // Only addresses that already have an account get mail (no spam to strangers); the answer and its
        // timing are the same either way because the send happens after the response where possible.
        const exists = await accountExists(email);
        await inBackground(async () => {
          if (!exists) return;
          const cred = await getCredential(email);
          const url = linkFor(opts.origin(), "/reset-password", token("reset", email, cred?.hash ?? null, { callbackURL }));
          await sendEmail({ to: email, kind: "password-reset", subject: "Reset your Keplar password", text: `Use this link to choose a new password for your Keplar account:\n\n${url}\n\nOpen the link, then enter a new password. It expires in 30 minutes and works once. Resetting signs you out of other devices.${footer}` });
        });
        return ctx.json({ status: true });
      }),

      passwordReset: createAuthEndpoint("/password/reset", { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] }, async (ctx) => {
        sameOrigin(ctx);
        needPasswords();
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        await limits([[`pw:reset:ip:${ipOf(ctx)}`, 20, 600]]);
        const res = verifyActionToken(opts.secret, "reset", body.token);
        if (!res.ok) throw new APIError("BAD_REQUEST", { message: res.reason === "expired" ? "This reset link has expired. Request a new one." : "This reset link isn't valid.", code: `LINK_${res.reason.toUpperCase()}` });
        const { e: email, f, cb } = res.payload;
        const password = str(body.password, PASSWORD_MAX * 4);
        const cred = await getCredential(email);
        if (fingerprint(opts.secret, cred?.hash ?? null) !== f) throw new APIError("BAD_REQUEST", { message: "This reset link was already used. Request a new one.", code: "LINK_USED" });
        const check = checkPassword(password, { email, name: cred?.name });
        if (!check.ok) throw new APIError("BAD_REQUEST", { message: check.problem ?? "Choose a stronger password.", code: "WEAK_PASSWORD" });
        if (body.confirm !== undefined && body.confirm !== password) throw new APIError("BAD_REQUEST", { message: "The two passwords don't match.", code: "PASSWORD_MISMATCH" });
        if (!(await replacePassword(email, await hashPassword(password), cred?.hash ?? null))) throw new APIError("BAD_REQUEST", { message: "This reset link was already used. Request a new one.", code: "LINK_USED" });
        // The old password may be in someone else's hands: end every other session, then sign this device in.
        try {
          const user = await upsertUser({ email, name: cred?.name, provider: "password" });
          await revokeAllSessions(user.id);
          forgetAllSessions();
        } catch {
          console.error("[auth] could not sign out other devices after a password reset");
        }
        await startSession(ctx, { email, name: cred?.name ?? "", provider: "password", remember: res.payload.r !== 0 });
        return ctx.json({ status: true, redirectTo: authRedirectPath(cb, "/account") });
      }),
    },
    rateLimit: [{ pathMatcher: (p: string) => p.startsWith("/password/"), window: 60, max: 20 }],
  } satisfies BetterAuthPlugin;
};
