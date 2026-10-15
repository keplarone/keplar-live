import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { authProviders, getSession } from "@/lib/accounts/auth";
import { oauthErrorMessage } from "@/lib/accounts/oauth";
import { authRedirectPath, nextQuery } from "@/lib/accounts/redirect";
import { pendingMfaFor } from "@/lib/accounts/mfa/gate";
import { twoFactorPath } from "@/lib/accounts/mfa/path";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { passwordCapabilities } from "@/lib/accounts/password-auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { SavedAccounts } from "@/components/auth/SavedAccounts";
import { savedAccounts } from "@/lib/accounts/multi-api";

export const metadata = pageMeta("/signin", "Sign in", "Sign in to Keplar.");
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; next?: string; add?: string; expired?: string; reauth?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { error, next: rawNext, add, expired, reauth } = await searchParams;
  const next = authRedirectPath(rawNext, "/account");
  const h = await headers();
  const adding = add === "1";
  // "Add account" arrives signed in on purpose: the current account stays signed in and the new one is added next to it.
  // "Please sign in again to continue" (src/lib/accounts/reauth.ts): a sensitive change needs a fresh sign-in, so a signed-in
  // person sees the form instead of being sent on. Signing in again replaces this browser's session with a new one.
  const again = reauth === "1" && !adding;
  if ((await getSession(h)) && !adding && !again) redirect(next);
  // Signed in with the first factor, second still owed (e.g. after Google/Microsoft): finish at the code prompt.
  if (!adding && (await pendingMfaFor(h))) redirect(twoFactorPath(next));
  const saved = await savedAccounts(h);
  const expiredEmail = typeof expired === "string" && expired.length < 200 ? expired : null;
  const nextQs = adding ? `?next=${encodeURIComponent(next)}&add=1` : again ? `?next=${encodeURIComponent(next)}&reauth=1` : nextQuery(next, "/account");
  return (
    <AuthShell
      variant="signin"
      nextQs={nextQs}
      title={adding ? "Add an account" : "Sign in to Keplar"}
      lead={adding ? "Sign in with another account. The account you're using stays signed in on this device." : next.startsWith("/checkout") ? "Sign in to continue to checkout. You'll go straight to payment after." : "Pick up your threads, projects, and plan."}
      notice={oauthErrorMessage(error) ?? (again ? "Please sign in again to continue." : null) ?? (expiredEmail ? `${expiredEmail} was signed out. Sign in again to use it.` : null)}
    >
      {again ? null : <SavedAccounts accounts={saved} />}
      <AuthForm mode="signin" providers={{ google: authProviders.google, microsoft: authProviders.microsoft }} caps={passwordCapabilities()} next={next} nextQs={nextQs} devTools={devToolsEnabled()} />
    </AuthShell>
  );
}
