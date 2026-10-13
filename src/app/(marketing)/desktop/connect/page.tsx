import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getSession, magicLinkSecret } from "@/lib/accounts/auth";
import { AuthShell, LinkProblem } from "@/components/auth/AuthShell";
import { DesktopConnect } from "@/components/account/DesktopConnect";
import { connectPath, DESKTOP_APPS, isRequestId } from "@/lib/desktop-auth/core";
import { describeRequest } from "@/lib/desktop-auth/service";
import { defaultStore } from "@/lib/desktop-auth/store";
import s from "@/components/auth/auth.module.css";

// The request id is a capability: never leak it in a Referer header, never index the page.
export const metadata: Metadata = { ...pageMeta("/desktop/connect", "Connect the Keplar app", "Sign in to the Keplar One or Keplar Business desktop app."), referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ rid?: string | string[] }> };

/**
 * Where the desktop app's "Sign in" lands, in the person's own browser. Not signed in: the normal log-in page first (Google,
 * Microsoft, password or an emailed link) and back here. Signed in: show which account will be connected and the code the
 * app is showing, and wait for an explicit click (a link someone else sent can't connect your account by itself).
 */
export default async function DesktopConnectPage({ searchParams }: Props) {
  const raw = (await searchParams).rid;
  const rid = typeof raw === "string" ? raw : "";
  const problem = (message: string, name = "Keplar") => (
    <AuthShell variant="recover" title={`Connect ${name}`}>
      <LinkProblem message={message} actions={<Link className={`${s.btn} ${s.btnPrimary}`} href="/signin">Back to log in</Link>} />
    </AuthShell>
  );
  if (!isRequestId(rid)) return problem("This sign-in link isn't valid. Click Sign in in the Keplar app to start again.");
  const info = await describeRequest({ store: defaultStore(), key: magicLinkSecret() }, rid);
  if (info.state === "unknown") return problem("This sign-in link isn't valid. Click Sign in in the Keplar app to start again.");
  // Keplar One, Keplar Business or the browser extension: what started this sign-in.
  const name = DESKTOP_APPS[info.app].name;
  const extension = info.app === "extension";
  const again = extension ? "Press Connect in the Keplar One extension to start again." : `Click Sign in in the ${name} app to start again.`;
  if (info.state === "expired") return problem(`This sign-in link expired. ${again}`, name);
  if (info.state === "cancelled") return problem(`This sign-in was canceled in the ${extension ? "extension" : "app"}. ${again}`, name);
  if (info.state === "denied") return problem(`You stopped this sign-in. ${again}`, name);
  if (info.state === "finished") return problem("This sign-in is already complete. You can close this tab.", name);
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect(`/signin?next=${encodeURIComponent(connectPath(rid))}`);
  const switchTo = `/signin?add=1&next=${encodeURIComponent(connectPath(rid))}`;
  return (
    <AuthShell variant="recover" title={`Connect ${name}`} lead={`Check that the code below matches the one in the ${extension ? "extension" : "app"}, then connect.`}>
      <DesktopConnect rid={rid} code={info.code} label={info.label} email={session.user.email} switchHref={switchTo} appName={name} scheme={DESKTOP_APPS[info.app].scheme} extension={extension} />
    </AuthShell>
  );
}
