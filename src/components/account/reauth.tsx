"use client";
/**
 * "Please sign in again to continue": what the account pages show when the server answers 403 reauth_required
 * (src/lib/accounts/reauth.ts). The link signs in again and comes back to where the person was.
 * Works on keplar.one and business.keplar.one alike: both serve /signin?reauth=1&next=….
 */
export const REAUTH_CODE = "reauth_required";
export const REAUTH_TEXT = "Please sign in again to continue.";

/** An Error carrying the server's code, so callers can tell "sign in again" from other failures. */
export type CodedError = Error & { status?: number; code?: string };

export const isReauth = (e: unknown) => (e as CodedError | null)?.code === REAUTH_CODE;

/** The sign-in link, returning to `next` (default: this page, including its #section). */
export function reauthHref(next?: string): string {
  const back = next ?? (typeof window === "undefined" ? "/account" : `${window.location.pathname}${window.location.search}${window.location.hash}`);
  return `/signin?reauth=1&next=${encodeURIComponent(back)}`;
}

export function ReauthNotice({ className, linkClassName, next }: { className?: string; linkClassName?: string; next?: string }) {
  return (
    <p className={className} role="alert" data-reauth="">
      {REAUTH_TEXT}{" "}
      <a className={linkClassName} href={reauthHref(next)}>Sign in</a>
    </p>
  );
}

/**
 * Start the account export download (GET /api/account/export). Asks the server first with ?check=1, so a "sign in again"
 * answer is shown on the page instead of being saved as a file; throws a CodedError for that and any other refusal.
 */
export async function startExport(): Promise<void> {
  const res = await fetch("/api/account/export?check=1", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw Object.assign(new Error(j.error || "Couldn't start the download."), { status: res.status, code: j.code }) as CodedError;
  }
  // A file download from an API route (streamed, attachment), not a page: the router can't do this.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/api/account/export");
}
