/**
 * Shared, reference-counted page scroll lock for modals, sheets and the command palette.
 *
 * Each overlay calls lockScroll() when it opens and the returned release() when it closes. The page stays locked
 * while any overlay holds a lock, and unlocks only when the last one releases, in whatever order they close. That
 * avoids the classic leak where overlay A saves overflow "", B saves "hidden", A closes, then B "restores" hidden
 * and leaves the page stuck. The lock is a data attribute on <html> (styled in globals.css), so it never fights other
 * inline overflow writes such as the app shell's. release() is idempotent.
 */
let holders = 0;

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  holders += 1;
  document.documentElement.setAttribute("data-scroll-lock", "");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.documentElement.removeAttribute("data-scroll-lock");
  };
}

/** For tests: how many overlays currently hold the lock. */
export function scrollLockHolders(): number {
  return holders;
}
