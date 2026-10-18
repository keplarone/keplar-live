import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { inspectLink } from "@/lib/accounts/link-check";
import { AuthShell, LinkProblem } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/RecoveryForms";
import s from "@/components/auth/auth.module.css";

// Never leak the token in a Referer header.
export const metadata: Metadata = { ...pageMeta("/reset-password", "Choose a new password", "Choose a new Keplar password.", { noindex: true }), referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

const MESSAGES = {
  invalid: "This reset link isn't valid.",
  expired: "This reset link has expired.",
  used: "This reset link was already used.",
  verified: "This reset link isn't valid.",
  unavailable: "Password accounts aren't available on this server right now.",
} as const;

export default async function ResetPasswordPage({ searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const check = await inspectLink("reset", token);
  return (
    <AuthShell variant="recover" title="Choose a new password">
      {check.state === "ok" ? (
        <ResetForm token={token} email={check.email} next={authRedirectPath(check.callback, "/account")} />
      ) : (
        <LinkProblem
          message={`${MESSAGES[check.state]} ${check.state === "unavailable" ? "" : "Request a new one."}`.trim()}
          actions={
            <>
              <Link className={`${s.btn} ${s.btnPrimary}`} href="/forgot-password">Request a new link</Link>
              <Link className={`${s.btn} ${s.btnGhost}`} href="/signin">Back to sign in</Link>
            </>
          }
        />
      )}
    </AuthShell>
  );
}
