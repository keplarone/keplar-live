import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { verifyActionToken } from "@/lib/accounts/action-token";
import { authSecret } from "@/lib/accounts/secret";
import { AuthShell, LinkProblem } from "@/components/auth/AuthShell";
import { SecureAccountConfirm } from "@/components/auth/SecureAccountConfirm";
import s from "@/components/auth/auth.module.css";

export const metadata: Metadata = { ...pageMeta("/secure-account", "Secure your account", "Sign out of every device."), referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/** Landing page for "This wasn't me". Opening it only checks the link; the button signs out every device. */
export default async function SecureAccountPage({ searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const check = verifyActionToken(authSecret(), "secure", token);
  return (
    <AuthShell variant="recover" title="Secure your account">
      {check.ok ? (
        <SecureAccountConfirm token={token} email={check.payload.e} />
      ) : (
        <LinkProblem
          message={check.reason === "expired" ? "This link has expired. Sign in and use “Sign out of all devices” on your Account page." : "This link isn't valid."}
          actions={<Link className={`${s.btn} ${s.btnPrimary}`} href="/signin">Sign in</Link>}
        />
      )}
    </AuthShell>
  );
}
