import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { magicLinkSecret } from "@/lib/accounts/auth";
import { verifyMagicToken } from "@/lib/accounts/magic-token";
import { AuthShell, LinkProblem } from "@/components/auth/AuthShell";
import { ConfirmSignIn } from "@/components/account/ConfirmSignIn";
import s from "@/components/auth/auth.module.css";

// Never leak the token in a Referer header.
export const metadata: Metadata = { ...pageMeta("/signin/verify", "Confirm sign-in", "Confirm your Keplar sign-in."), referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/**
 * Magic-link landing page. Opening it (or an email scanner prefetching it)
 * only checks the token; the "Sign in" button consumes it.
 */
export default async function VerifySignInPage({ searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const check = verifyMagicToken(magicLinkSecret(), token);
  return (
    <AuthShell variant="recover" title="Sign in to Keplar">
      {check.ok ? (
        <ConfirmSignIn token={token} email={check.payload.e} />
      ) : (
        <LinkProblem
          message={`${check.reason === "expired" ? "This sign-in link has expired." : "This sign-in link isn't valid."} Request a new one.`}
          actions={<Link className={`${s.btn} ${s.btnPrimary}`} href="/signin">Back to log in</Link>}
        />
      )}
    </AuthShell>
  );
}
