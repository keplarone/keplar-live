import type { Metadata } from "next";
import Link from "next/link";
import s from "../space-studio.module.css";

// Where the Roblox link flow returns (/api/space-studio/identities/roblox/callback). The desktop app's sign-in window closes on
// this URL and reads the result from the query; in a normal browser this page just says what happened.
export const metadata: Metadata = { title: "Space Studio", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  identity_conflict: "That Roblox account is already linked to a different Space Studio account. Nothing was changed.",
  reauth_required: "For your security, sign in again and then link Roblox.",
  already_linked_other: "A different Roblox account is already linked. Unlink it first.",
};

export default async function SpaceStudioReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const linked = q.linked === "roblox";
  const err = typeof q.link_error === "string" ? q.link_error : null;
  return (
    <div className={s.page}>
      <section className={s.hero}>
        <h1 className={s.title}>{linked ? "Roblox is connected." : err ? "Roblox wasn't connected." : "Space Studio"}</h1>
        <p className={s.lede}>{err ? (ERRORS[err] ?? "The Roblox sign-in didn't complete. Try again from Space Studio.") : "You can go back to the Space Studio app."}</p>
        <div className={s.actions}><Link className={s.secondary} href="/space-studio">About Space Studio</Link></div>
      </section>
    </div>
  );
}
