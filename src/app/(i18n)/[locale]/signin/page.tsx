import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
import { localeMetadata } from "@/lib/i18n/seo";
import { getMessages } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { authShellCopy } from "@/lib/i18n/auth-copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; next?: string; add?: string; expired?: string; reauth?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "signin");
}

/** Same flow as /signin (src/app/(marketing)/signin/page.tsx), with translated copy. Server error messages are English for now. */
export default async function LocaleSignIn({ params, searchParams }: P) {
  const [{ locale }, { error, next: rawNext, add, expired, reauth }] = await Promise.all([params, searchParams]);
  const a = (await getMessages(locale, "marketing")).auth;
  const next = authRedirectPath(rawNext, "/account");
  const h = await headers();
  const adding = add === "1";
  // "Please sign in again to continue" (src/lib/accounts/reauth.ts): a sensitive change needs a fresh sign-in, so a signed-in
  // person sees the form instead of being sent on. Signing in again replaces this browser's session with a new one.
  const again = reauth === "1" && !adding;
  if ((await getSession(h)) && !adding && !again) redirect(next);
  if (!adding && (await pendingMfaFor(h))) redirect(twoFactorPath(next));
  const saved = await savedAccounts(h);
  const expiredEmail = typeof expired === "string" && expired.length < 200 ? expired : null;
  const nextQs = adding ? `?next=${encodeURIComponent(next)}&add=1` : again ? `?next=${encodeURIComponent(next)}&reauth=1` : nextQuery(next, "/account");
  return (
    <AuthShell
      variant="signin"
      nextQs={nextQs}
      copy={authShellCopy(a, "signin", locale)}
      title={adding ? a.addTitle : a.signinTitle}
      lead={adding ? a.addLead : next.startsWith("/checkout") ? a.checkoutLead : a.signinLead}
      notice={oauthErrorMessage(error) ?? (again ? "Please sign in again to continue." : null) ?? (expiredEmail ? fmt(a.expired, { email: expiredEmail }) : null)}
    >
      {again ? null : <SavedAccounts accounts={saved} />}
      <AuthForm mode="signin" providers={{ google: authProviders.google, microsoft: authProviders.microsoft }} caps={passwordCapabilities()} next={next} nextQs={nextQs} devTools={devToolsEnabled()} />
    </AuthShell>
  );
}
