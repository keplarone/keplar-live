/**
 * What a Free user is told to upgrade to. The plan ladder is Free → Lite → Plus → Pro → Business, so the NEXT plan above
 * Free is Lite (then Plus). Every Free-facing limit message uses this one sentence so none of them skips a rung.
 */
export const FREE_UPGRADE_HINT = "Upgrade to Lite for more, or Plus for the most.";
export const FREE_NEXT_PLAN = "lite" as const;
export const FREE_NEXT_CHECKOUT = "/checkout?plan=lite";
