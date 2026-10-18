import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getSession } from "@/lib/accounts/auth";
import { authRedirectPath, nextQuery } from "@/lib/accounts/redirect";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { passwordCapabilities } from "@/lib/accounts/password-auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/RecoveryForms";

export const metadata = pageMeta("/forgot-password", "Reset your password", "Reset your Keplar password.", { noindex: true });
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const next = authRedirectPath((await searchParams).next, "/account");
  if (await getSession(await headers())) redirect(next);
  return (
    <AuthShell variant="recover" title="Reset your password" lead="Enter your email and we'll send you a link to choose a new one. This also lets you add a password to an account you use with a sign-in link.">
      <ForgotForm caps={passwordCapabilities()} next={next} nextQs={nextQuery(next, "/account")} devTools={devToolsEnabled()} />
    </AuthShell>
  );
}
