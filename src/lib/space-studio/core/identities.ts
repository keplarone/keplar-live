// Synced from keplarone/space-studio src/core — edit there, then copy.
/**
 * Linked sign-in methods: one Space Studio account, several identities (Keplar, Google, Roblox).
 *
 * Rules (enforced on the server; the UI only reflects them):
 * - An identity is keyed by (provider, provider subject id), never by email. Matching emails never merge accounts.
 * - An identity already linked to another account is a conflict: nothing moves, the person is told and offered support.
 * - Linking and unlinking need a recent sign-in (REAUTH_MS).
 * - Unlinking is refused when it would leave no usable sign-in method.
 * - Roblox is a connection (it proves which Roblox account is theirs); it can be a sign-in method only once Roblox OAuth is configured.
 */
export type Provider = "keplar" | "google" | "roblox";
export const PROVIDERS: Provider[] = ["keplar", "google", "roblox"];
export type Identity = { provider: Provider; subject: string; label: string | null; linkedAt: string; canSignIn: boolean };
export type IdentityIndex = { ownerOf(provider: Provider, subject: string): Promise<string | null> };

export const REAUTH_MS = 10 * 60_000;
export const recentlyAuthenticated = (authAt: number | null, now: number) => typeof authAt === "number" && now - authAt >= 0 && now - authAt <= REAUTH_MS;

export type LinkResult =
  | { ok: true; identities: Identity[] }
  | { ok: false; code: "reauth_required" | "identity_conflict" | "already_linked_other" | "invalid"; message: string };

export async function planLink(accountId: string, current: Identity[], incoming: Identity, index: IdentityIndex, authAt: number | null, now: number): Promise<LinkResult> {
  if (!PROVIDERS.includes(incoming.provider) || !incoming.subject || incoming.subject.length > 200) return { ok: false, code: "invalid", message: "That sign-in could not be verified." };
  if (!recentlyAuthenticated(authAt, now)) return { ok: false, code: "reauth_required", message: "Sign in again to change linked accounts." };
  const owner = await index.ownerOf(incoming.provider, incoming.subject);
  if (owner && owner !== accountId) return { ok: false, code: "identity_conflict", message: "That account is already linked to a different Space Studio account. Nothing was changed. Sign in with it to unlink it there, or contact support." };
  const same = current.find((i) => i.provider === incoming.provider);
  if (same && same.subject !== incoming.subject) return { ok: false, code: "already_linked_other", message: `A different ${incoming.provider} account is already linked. Unlink it first.` };
  if (same) return { ok: true, identities: current };
  return { ok: true, identities: [...current, incoming] };
}

export type UnlinkResult = { ok: true; identities: Identity[] } | { ok: false; code: "reauth_required" | "last_method" | "not_linked" | "managed_by_account"; message: string };

export function planUnlink(current: Identity[], provider: Provider, authAt: number | null, now: number): UnlinkResult {
  const target = current.find((i) => i.provider === provider);
  if (!target) return { ok: false, code: "not_linked", message: "That account isn't linked." };
  // The Keplar identity IS the account: it is removed only by deleting the account.
  if (provider === "keplar") return { ok: false, code: "managed_by_account", message: "Your Keplar account can't be unlinked. To remove it, delete the account." };
  if (!recentlyAuthenticated(authAt, now)) return { ok: false, code: "reauth_required", message: "Sign in again to change linked accounts." };
  const rest = current.filter((i) => i !== target);
  if (target.canSignIn && !rest.some((i) => i.canSignIn)) return { ok: false, code: "last_method", message: "This is your only way to sign in. Link another sign-in method first." };
  return { ok: true, identities: rest };
}

export function unlinkBlockedReason(current: Identity[], provider: Provider): string | null {
  const t = current.find((i) => i.provider === provider);
  if (!t) return null;
  if (provider === "keplar") return "This is your Space Studio account";
  return t.canSignIn && !current.some((i) => i !== t && i.canSignIn) ? "Your only sign-in method" : null;
}
