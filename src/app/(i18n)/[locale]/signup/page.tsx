import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authProviders, getSession } from "@/lib/accounts/auth";
import { oauthErrorMessage } from "@/lib/accounts/oauth";
import { authRedirectPath, nextQuery } from "@/lib/accounts/redirect";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { passwordCapabilities } from "@/lib/accounts/password-auth";
import { referralConfig } from "@/lib/referrals/config";
import { TrackOnMount } from "@/components/growth/TrackOnMount";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { localeMetadata } from "@/lib/i18n/seo";
import { getMessages } from "@/lib/i18n/server";
import { authShellCopy } from "@/lib/i18n/auth-copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; next?: string; add?: string; invited?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "signup");
}

/** Same flow as /signup (src/app/(marketing)/signup/page.tsx), with translated copy. */
export default async function LocaleSignUp({ params, searchParams }: P) {
  const [{ locale }, { error, next: rawNext, add, invited }] = await Promise.all([params, searchParams]);
  const a = (await getMessages(locale, "marketing")).auth;
  const next = rawNext ? authRedirectPath(rawNext, "/app?welcome=1") : "/app?welcome=1";
  const adding = add === "1";
  if ((await getSession(await headers())) && !adding) redirect(rawNext ? next : "/app");
  const qs = adding ? `?next=${encodeURIComponent(next)}&add=1` : nextQuery(next, "/app?welcome=1");
  return (
    <AuthShell
      variant="signup"
      nextQs={qs}
      copy={authShellCopy(a, "signup", locale)}
      title={a.signupTitle}
      lead={`${a.signupLead}${invited === "1" && referralConfig().enabled ? ` ${a.invited}` : ""}`}
      notice={oauthErrorMessage(error)}
    >
      <TrackOnMount event="signup_view" />
      <AuthForm mode="signup" providers={{ google: authProviders.google, microsoft: authProviders.microsoft }} caps={passwordCapabilities()} next={next} nextQs={qs} devTools={devToolsEnabled()} />
    </AuthShell>
  );
}
