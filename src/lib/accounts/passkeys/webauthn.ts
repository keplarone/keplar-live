/**
 * Passkey ceremonies on top of @simplewebauthn/server. Four steps, each one a function:
 *   registrationOptions / verifyRegistration  add a passkey to the signed-in account
 *   loginOptions / verifyLogin                sign in with a passkey (no email needed: the passkey names its account)
 * Challenges are stored server-side and consumed once (./store.ts), so a captured response cannot be replayed.
 * Passkeys are required to be user-verified (fingerprint, face or device PIN), which is why a passkey sign-in counts as
 * two factors and does not ask for an authenticator-app code on top.
 */
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransport, RegistrationResponseJSON } from "@simplewebauthn/server";
import { addPasskey, findPasskey, listPasskeys, saveChallenge, takeChallenge, touchPasskey } from "./store";

const SITE = () => new URL(process.env.BETTER_AUTH_URL || "https://keplar.one");
/** The relying-party id is the site's host; browsers refuse a passkey for any other site. */
export const rpId = () => SITE().hostname;
export const rpOrigin = () => SITE().origin;
const RP_NAME = "Keplar";

const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
const toB64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");

export async function registrationOptions(user: { id: string; email: string }) {
  const existing = await listPasskeys(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(),
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as AuthenticatorTransport[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const token = await saveChallenge(options.challenge, "register", user.id);
  return { options, token };
}

export type Added = { ok: true; id: string } | { ok: false; reason: "expired" | "invalid" | "too_many" };

export async function verifyRegistration(user: { id: string }, token: string, response: RegistrationResponseJSON, name: string): Promise<Added> {
  const challenge = await takeChallenge(token, "register", user.id);
  if (!challenge) return { ok: false, reason: "expired" };
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rpOrigin(), expectedRPID: rpId(), requireUserVerification: true });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!v.verified || !v.registrationInfo) return { ok: false, reason: "invalid" };
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  try {
    await addPasskey({
      id: credential.id,
      userId: user.id,
      publicKey: toB64(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? response.response.transports ?? []) as string[],
      name: name || (credentialBackedUp ? "Synced passkey" : "Passkey"),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "too_many_passkeys") return { ok: false, reason: "too_many" };
    return { ok: false, reason: "invalid" }; // a credential id that is already registered
  }
  return { ok: true, id: credential.id };
}

export async function loginOptions() {
  const options = await generateAuthenticationOptions({ rpID: rpId(), userVerification: "required" });
  const token = await saveChallenge(options.challenge, "login", null);
  return { options, token };
}

export type LoggedIn = { ok: true; userId: string } | { ok: false; reason: "expired" | "invalid" };

export async function verifyLogin(token: string, response: AuthenticationResponseJSON): Promise<LoggedIn> {
  const challenge = await takeChallenge(token, "login", null);
  if (!challenge) return { ok: false, reason: "expired" };
  const pk = await findPasskey(String(response?.id ?? ""));
  if (!pk) return { ok: false, reason: "invalid" };
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rpOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: true,
      credential: { id: pk.id, publicKey: fromB64(pk.publicKey), counter: pk.counter, transports: pk.transports as AuthenticatorTransport[] },
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!v.verified) return { ok: false, reason: "invalid" };
  await touchPasskey(pk.id, v.authenticationInfo.newCounter, v.authenticationInfo.credentialBackedUp);
  return { ok: true, userId: pk.userId };
}
