import type { ReferralConfig } from "@/lib/referrals/config";
import { PRODUCT_NAME } from "./contact";
import type { LegalDoc } from "./types";

/**
 * Referral terms. Built from the live program settings (src/lib/referrals/config.ts), so the numbers on this page are the numbers the code enforces.
 * Do not promise anything here that the code does not do: rewards are extra usage credit only, never cash.
 */
export function referralTerms(c: ReferralConfig): LegalDoc {
  const n = (x: number) => x.toLocaleString("en-US");
  return {
    slug: "referral-terms",
    title: `${PRODUCT_NAME} Referral Terms`,
    subline: "How inviting a friend works, what you both get, and the rules that keep it fair.",
    lastUpdated: "October 4, 2026",
    intro: [
      `Share your personal invite link. When a friend creates a new ${PRODUCT_NAME} account with it and verifies their email, you both get extra usage credit.`,
      c.enabled ? "The program is on." : "The program is paused right now: invite links still open the sign-up page, but no credit is given until it is switched back on.",
    ],
    sections: [
      {
        id: "reward",
        title: "What you get",
        blocks: [
          { type: "list", items: [
            `You. ${n(c.referrerCredits)} extra usage credits for each friend who qualifies.`,
            `Your friend. ${n(c.friendCredits)} extra usage credits on their new account.`,
            `Extra usage credit only. A reward is never cash, a payout, a gift card, a coupon, a discount or a refund, it can't be withdrawn or sold, and it can't be transferred to another account.`,
            `How it is used. Credits are the same extra usage credits as a purchased pack (1 credit is $0.002 of model cost). They are spent only on a paid plan (Lite, Plus or Pro), after that plan's own allowance or rolling limit runs out, and every per-request and per-day cost cap still applies. On Free (which uses free models only) and on Business they wait on the account until they can be used.`,
            `Expiry. Credits expire ${c.validDays} days after they are granted.`,
          ] },
        ],
      },
      {
        id: "qualify",
        title: "What counts",
        blocks: [
          { type: "list", items: [
            "A new account. The friend must open your link in their browser, then create an account that has never existed before, and sign in with a verified email address. Opening the link alone rewards nothing.",
            `Soon after sign-up. The invite must be claimed within ${c.claimWindowDays} days of the account being created, and the link is remembered in the browser for 30 days.`,
            "One reward per account. Each new account can be rewarded once, for one referrer. A mailbox counts once even if it is written another way (dots or +tags in a Gmail address) and one browser can claim once.",
            "Free is enough. Neither of you has to buy anything.",
          ] },
        ],
      },
      {
        id: "limits",
        title: "Limits",
        blocks: [
          { type: "list", items: [
            `Per person. Up to ${n(c.perMonth)} rewarded friends per calendar month (UTC) and ${n(c.lifetime)} in total.`,
            `Whole program. At most ${n(c.dailyProgramCap)} rewards a day. Past that, new claims wait for a manual review.`,
            "When a limit is reached, the invite earns nothing for either person. We say so instead of quietly failing.",
            "We may change the amounts and limits or end the program at any time. Credit already granted stays yours until it expires.",
          ] },
        ],
      },
      {
        id: "fair",
        title: "Keeping it fair",
        blocks: [
          { type: "p", text: "These are not allowed, and a claim that breaks them gets no reward:" },
          { type: "list", items: [
            "Inviting yourself, including with a second account, an alias of your own mailbox, or the same browser.",
            "Throwaway or temporary email addresses.",
            "Creating accounts in bulk, or paying or tricking people to sign up.",
            "Posting your link as spam, in a misleading way, or in a way that suggests it is from Keplar.",
          ] },
          { type: "p", text: "To catch this, Keplar compares a keyed fingerprint of the sign-up mailbox, the coarse network (not your full IP address) and the browser id that the invite set. Some matches (for example two people on one home or office network, or several sign-ups from one company domain) are not a violation, so those claims are held for a person to look at, and approved or declined. Fingerprints are one-way hashes, not readable addresses." },
          { type: "p", text: "A claim can be declined without explanation. Credit gained against these rules can be removed. Abuse can lead to the account being suspended under the Terms of Service." },
        ],
      },
      {
        id: "data",
        title: "What we store",
        blocks: [
          { type: "p", text: "Your invite code and the hashed fingerprints above; for each friend, a masked address (j***@example.com), the date, the outcome and the credit given. The browser keeps two cookies after an invite link is opened (the code, and a flag saying one is waiting), plus a random browser id, used only for this check. Claims are kept after an account is deleted, so deleting and re-registering can't earn a second reward; they hold no chat content." },
        ],
      },
    ],
  };
}
