import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getSession } from "@/lib/accounts/auth";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { pendingMfaFor } from "@/lib/accounts/mfa/gate";
import { AuthShell } from "@/components/auth/AuthShell";
import { TwoFactorForm } from "@/components/auth/TwoFactorForm";

export const metadata: Metadata = pageMeta("/two-factor", "Two-factor code", "Enter your authenticator code to finish logging in.");
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function TwoFactorPage({ searchParams }: Props) {
  const next = authRedirectPath((await searchParams).next, "/account");
  const h = await headers();
  if (await getSession(h)) redirect(next);
  if (!(await pendingMfaFor(h))) redirect("/signin");
  return (
    <AuthShell variant="recover" title="Enter your code" lead="Your password or link was right. One more step to finish logging in.">
      <TwoFactorForm next={next} />
    </AuthShell>
  );
}
