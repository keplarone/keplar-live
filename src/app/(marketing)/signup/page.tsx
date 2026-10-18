import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { authProviders, getSession } from "@/lib/accounts/auth";
import { oauthErrorMessage } from "@/lib/accounts/oauth";
import { authRedirectPath, nextQuery } from "@/lib/accounts/redirect";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { passwordCapabilities } from "@/lib/accounts/password-auth";
import { referralConfig } from "@/lib/referrals/config";
import { TrackOnMount } from "@/components/growth/TrackOnMount";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = pageMeta("/signup", "Create your account", "Create a free Keplar account.", { noindex: true });
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; next?: string; add?: string; invited?: string }> };

export default async function SignUpPage({ searchParams }: Props) {
  const { error, next: rawNext, add, invited } = await searchParams;
  const next = rawNext ? authRedirectPath(rawNext, "/app?welcome=1") : "/app?welcome=1";
  const adding = add === "1";
  if ((await getSession(await headers())) && !adding) redirect(rawNext ? next : "/app");
  const qs = adding ? `?next=${encodeURIComponent(next)}&add=1` : nextQuery(next, "/app?welcome=1");
  return (
    <AuthShell
      variant="signup"
      nextQs={qs}
      title="Create your Keplar account"
      lead={`For homework and big decisions, trip plans and side projects, or running a business. Free runs on free open models, and you can upgrade any time.${invited === "1" && referralConfig().enabled ? ` A friend invited you: when your email is verified you both get extra usage credit (never cash). Details in the referral terms.` : ""}`}
      notice={oauthErrorMessage(error)}
    >
      <TrackOnMount event="signup_view" />
      <AuthForm mode="signup" providers={{ google: authProviders.google, microsoft: authProviders.microsoft }} caps={passwordCapabilities()} next={next} nextQs={qs} devTools={devToolsEnabled()} />
    </AuthShell>
  );
}
