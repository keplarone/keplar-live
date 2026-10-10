import { getOnboarding } from "./store";
import { mfaEnabled } from "@/lib/accounts/mfa/store";
import { twoFactorPath } from "@/lib/accounts/mfa/path";
import { needsWelcome, welcomePath } from "./model";

/**
 * Where a sign-in should land: onboarding first for new accounts (carrying `next` along), otherwise `path` unchanged.
 * Never throws and never blocks: no database, an unreadable row or an existing account all mean "go straight there".
 */
export async function afterSignInPath(userId: string, path: string, opts: { secondFactorDone?: boolean } = {}): Promise<string> {
  // Accounts with a second factor go to the code prompt first (their new session is unusable until it is passed).
  if (!opts.secondFactorDone && (await mfaEnabled(userId))) return twoFactorPath(path);
  try {
    return needsWelcome(await getOnboarding(userId)) ? welcomePath(path) : path;
  } catch {
    return path;
  }
}
