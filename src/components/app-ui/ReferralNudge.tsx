"use client";

/**
 * A one-time, dismissible kit toast that points signed-in people at their invite link (Account → Invite friends).
 * It waits until the third time this browser opens the app, so it never greets a brand-new account, and it never
 * shows while an invite this browser opened is still being claimed (ReferralClaim's toast comes first).
 * The numbers come from GET /api/referrals, so the toast can't promise more than the program grants;
 * if that call fails (signed out, unverified email, program paused) nothing is shown.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/kit";
import { nudgeDue, SEEN_KEY } from "./referral-nudge-logic";

const DELAY_MS = 20_000;

type Summary = { enabled: boolean; link: string; rewards: { referrerCredits: number; friendCredits: number } };

export function ReferralNudge({ signedIn }: { signedIn: boolean }) {
  const started = useRef(false);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });
  useEffect(() => {
    if (!signedIn || started.current || /(?:^|;\s*)kp_ref_p=1/.test(document.cookie)) return;
    started.current = true;
    let due = false;
    try { due = nudgeDue(window.localStorage); } catch { return; }
    if (!due) return;
    const timer = window.setTimeout(() => {
      fetch("/api/referrals", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Summary>) : null))
        .then((d) => {
          if (!d?.enabled || !d.link) return;
          try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* shown once per load at worst */ }
          notify({
            id: "referral-nudge",
            title: "Invite a friend, you both get extra credit",
            description: `You get ${d.rewards.referrerCredits.toLocaleString()} and they get ${d.rewards.friendCredits.toLocaleString()} usage credits when they join with your link. Credit only, never cash.`,
            tone: "info",
            duration: 0,
            action: {
              label: "Copy invite link",
              onClick: () => {
                navigator.clipboard.writeText(d.link)
                  .then(() => notify({ id: "referral-nudge-copied", title: "Invite link copied", tone: "success" }))
                  .catch(() => routerRef.current.push("/account#invite"));
              },
            },
          });
        })
        .catch(() => undefined);
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [signedIn]);
  return null;
}
