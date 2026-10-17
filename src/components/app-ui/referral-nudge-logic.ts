/** When the one-time invite nudge (ReferralNudge.tsx) is due. Pure, so it can be tested without the app. */

export const SEEN_KEY = "kp_invite_nudge_seen";
const OPENS_KEY = "kp_invite_nudge_opens";
const SHOW_ON_OPEN = 3;

/** Counts this app open and says whether the nudge is due. Storage can be blocked; then it never shows. */
export function nudgeDue(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  if (storage.getItem(SEEN_KEY)) return false;
  const opens = (Number(storage.getItem(OPENS_KEY)) || 0) + 1;
  storage.setItem(OPENS_KEY, String(opens));
  return opens >= SHOW_ON_OPEN;
}
