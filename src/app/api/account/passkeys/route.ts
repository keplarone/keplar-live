/**
 * Passkeys for the signed-in account (adding, listing, renaming, removing). Signing in with one is a Better Auth
 * endpoint (src/lib/accounts/passkeys/auth-plugin.ts) because it starts a session.
 *   GET                                         { passkeys: [{ id, name, createdAt, lastUsedAt, synced }] }
 *   POST { action: "options" }                  WebAuthn creation options + a single-use token
 *   POST { action: "add", token, response, name? }  verify the browser's answer and store the passkey
 *   POST { action: "rename", id, name }
 *   POST { action: "remove", id }
 * Same-origin only. Passkeys are optional and extra: email links, passwords and 2FA keep working without them.
 */
import { getSession } from "@/lib/accounts/auth";
import { persistenceEnabled } from "@/lib/accounts/persist";
import { deletePasskey, listPasskeys, renamePasskey, summarize } from "@/lib/accounts/passkeys/store";
import { registrationOptions, verifyRegistration } from "@/lib/accounts/passkeys/webauthn";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { writeAudit } from "@/lib/ops/audit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedIn(req: Request) {
  const session = await getSession(req.headers);
  if (!session) throw new HttpError(401, "Log in to continue.", "unauthenticated");
  if (!persistenceEnabled()) throw new HttpError(501, "Passkeys need the account database, which isn't connected here.", "not_available");
  return session;
}

export async function GET(req: Request) {
  try {
    await limitRequest(req, "passkeys_list", { perIp: 60 });
    const session = await signedIn(req);
    return json({ passkeys: (await listPasskeys(session.user.id)).map(summarize) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "passkeys", { perIp: 40, windowSec: 600 });
    const session = await signedIn(req);
    const uid = session.user.id;
    try {
      await rateLimit(`passkeys:user:${uid}`, 30, 600, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.", "rate_limited");
      throw e;
    }
    const b = await body<{ action?: unknown; token?: unknown; response?: unknown; name?: unknown; id?: unknown }>(req);
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
    if (b.action === "options") {
      const { options, token } = await registrationOptions({ id: uid, email: session.user.email });
      return json({ options, token });
    }
    if (b.action === "add") {
      if (typeof b.token !== "string" || typeof b.response !== "object" || b.response === null) throw new HttpError(400, "Something went wrong adding the passkey. Try again.", "bad_request");
      const res = await verifyRegistration({ id: uid }, b.token, b.response as never, name);
      if (!res.ok) {
        if (res.reason === "too_many") throw new HttpError(409, "You have the maximum number of passkeys. Remove one first.", "too_many_passkeys");
        throw new HttpError(400, res.reason === "expired" ? "That took too long. Start again." : "We couldn't verify that passkey. Try again, or use a different device.", `passkey_${res.reason}`);
      }
      await writeAudit("user", "passkey.added", `user ${uid}`).catch(() => undefined);
      return json({ ok: true, passkeys: (await listPasskeys(uid)).map(summarize) });
    }
    if (b.action === "rename" || b.action === "remove") {
      if (typeof b.id !== "string") throw new HttpError(400, "Unknown passkey.", "bad_request");
      if (b.action === "rename") {
        if (!name) throw new HttpError(400, "Give the passkey a name.", "bad_request");
        if (!(await renamePasskey(uid, b.id, name))) throw new HttpError(404, "Passkey not found.", "not_found");
      } else {
        if (!(await deletePasskey(uid, b.id))) throw new HttpError(404, "Passkey not found.", "not_found");
        await writeAudit("user", "passkey.removed", `user ${uid}`).catch(() => undefined);
      }
      return json({ ok: true, passkeys: (await listPasskeys(uid)).map(summarize) });
    }
    throw new HttpError(400, "Unknown action.", "bad_request");
  } catch (e) {
    return errorResponse(e);
  }
}
