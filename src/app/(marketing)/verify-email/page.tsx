import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { inspectLink } from "@/lib/accounts/link-check";
import { AuthShell, LinkProblem } from "@/components/auth/AuthShell";
import { VerifyEmailConfirm } from "@/components/auth/RecoveryForms";
import s from "@/components/auth/auth.module.css";

// Never leak the token in a Referer header.
export const metadata: Metadata = { ...pageMeta("/verify-email", "Verify your email", "Verify your Keplar email address."), referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

const MESSAGES = {
  invalid: "This verification link isn't valid.",
  expired: "This verification link has expired. Sign up again to get a new one.",
  used: "This verification link is out of date or was already used. Sign up again to get a new one.",
  verified: "This email is already verified. You can sign in.",
  unavailable: "Verification isn't available on this server right now.",
} as const;

/** Verification landing page. Opening it (or a scanner prefetching it) only checks the link; the button consumes it. */
export default async function VerifyEmailPage({ searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const check = await inspectLink("verify", token);
  return (
    <AuthShell variant="recover" title="Verify your email">
      {check.state === "ok" ? (
        <VerifyEmailConfirm token={token} email={check.email} />
      ) : (
        <LinkProblem
          message={MESSAGES[check.state]}
          actions={
            <>
              <Link className={`${s.btn} ${s.btnPrimary}`} href="/signin">Sign in</Link>
              <Link className={`${s.btn} ${s.btnGhost}`} href="/signup">Sign up</Link>
            </>
          }
        />
      )}
    </AuthShell>
  );
}
