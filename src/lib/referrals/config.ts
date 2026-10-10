/**
 * Referral program settings. Rewards are EXTRA USAGE CREDIT only (the same limit-extension credits as a purchased pack),
 * never cash, never a payout, never a discount code. Every number is an env-tunable default with hard bounds, and the
 * terms page (/referral-terms) and the Account panel read these same values, so the page can never promise more than the code does.
 */
const envOf = (n: string) => process.env[n]?.trim() || "";
const intEnv = (n: string, d: number, min: number, max: number) => {
  const v = Math.floor(Number(envOf(n)));
  return envOf(n) && Number.isFinite(v) && v >= min && v <= max ? v : d;
};

export type ReferralConfig = {
  enabled: boolean;
  /** Credits the person who shared the link gets / the new friend gets (1 credit = $0.002 of provider cost, see billing/extensions.ts). */
  referrerCredits: number;
  friendCredits: number;
  /** How long a reward lasts once granted. */
  validDays: number;
  /** Per referrer: rewarded friends per calendar month (UTC) and in total. */
  perMonth: number;
  lifetime: number;
  /** Whole program: rewards granted per UTC day before new ones wait for admin review. */
  dailyProgramCap: number;
  /** How long after sign-up a new account can still claim the invite. */
  claimWindowDays: number;
  /** The referrer's own account must be at least this old for a reward to be automatic. */
  referrerMinAgeHours: number;
};

export function referralConfig(): ReferralConfig {
  return {
    enabled: envOf("KEPLAR_REFERRALS").toLowerCase() !== "off",
    referrerCredits: intEnv("KEPLAR_REFERRAL_CREDITS_REFERRER", 500, 50, 5_000),
    friendCredits: intEnv("KEPLAR_REFERRAL_CREDITS_FRIEND", 500, 50, 5_000),
    validDays: intEnv("KEPLAR_REFERRAL_VALID_DAYS", 180, 14, 365),
    perMonth: intEnv("KEPLAR_REFERRAL_PER_MONTH", 5, 1, 50),
    lifetime: intEnv("KEPLAR_REFERRAL_LIFETIME", 20, 1, 500),
    dailyProgramCap: intEnv("KEPLAR_REFERRAL_DAILY_CAP", 100, 1, 5_000),
    claimWindowDays: intEnv("KEPLAR_REFERRAL_CLAIM_DAYS", 7, 1, 30),
    referrerMinAgeHours: intEnv("KEPLAR_REFERRAL_REFERRER_MIN_AGE_HOURS", 24, 0, 24 * 30),
  };
}

export const REF_COOKIE = "kp_ref"; // HttpOnly: the invite code of the link this browser opened
export const REF_FLAG_COOKIE = "kp_ref_p"; // readable "an invite is waiting" flag (no code in it), so the app knows to claim once
export const DEV_COOKIE = "kp_dev"; // HttpOnly random id: lets us notice one browser claiming many rewards
export const CODE_RE = /^[a-hjkmnp-z2-9]{8}$/;
