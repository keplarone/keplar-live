import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getSession, magicLinkSecret } from "@/lib/accounts/auth";
import { signedInRecently } from "@/lib/accounts/reauth";
import { AuthShell, LinkProblem } from "@/components/auth/AuthShell";
import { DesktopConnect } from "@/components/account/DesktopConnect";
import { connectPath, DESKTOP_APPS, isRequestId } from "@/lib/desktop-auth/core";
import { describeRequest } from "@/lib/desktop-auth/service";
import { defaultStore } from "@/lib/desktop-auth/store";
import s from "@/components/auth/auth.module.css";

// The request id is a capability: never leak it in a Referer header, never index the page.
export const metadata: Metadata = { ...pageMeta("/desktop/connect", "Connect the Keplar app", "Sign in to the Keplar One or Keplar Business desktop app.", { noindex: true }), referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ rid?: string | string[] }> };

/**
 * Where the desktop app's "Sign in" lands, in the person's own browser. Not signed in: the normal sign-in page first (Google,
 * Microsoft, password or an emailed link) and back here. Signed in: show which account will be connected and ask for the code
 * the app is showing (never shown here: a link someone else started and sent can't connect your account by a click). The
 * extension gets an API key, so it also needs a recent sign-in, like creating a key by hand (src/lib/accounts/reauth.ts).
 */
export default async function DesktopConnectPage({ searchParams }: Props) {
  const raw = (await searchParams).rid;
  const rid = typeof raw === "string" ? raw : "";
  const problem = (message: string, name = "Keplar") => (
    <AuthShell variant="recover" title={`Connect ${name}`}>
      <LinkProblem message={message} actions={<Link className={`${s.btn} ${s.btnPrimary}`} href="/signin">Back to sign in</Link>} />
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
  if (extension && !signedInRecently(session)) redirect(`/signin?reauth=1&next=${encodeURIComponent(connectPath(rid))}`);
  const switchTo = `/signin?add=1&next=${encodeURIComponent(connectPath(rid))}`;
  return (
    <AuthShell variant="recover" title={`Connect ${name}`} lead={`Type the code shown in the ${extension ? "extension" : "app"} to connect it.`}>
      <DesktopConnect rid={rid} connectPath={connectPath(rid)} label={info.label} email={session.user.email} switchHref={switchTo} appName={name} scheme={DESKTOP_APPS[info.app].scheme} extension={extension} />
    </AuthShell>
  );
}
