/**
 * "Try Keplar" becomes "Open Keplar" for people who are signed in, without a flash of the wrong label.
 * Marketing pages are static, so the server cannot know the session. Instead the last known state is remembered in localStorage and an
 * inline script sets <html data-signed="1"> before the first paint; CSS shows the matching one of two spans. usePlan() (loaded by the nav on
 * every page) confirms the real session within a moment and corrects the hint.
 */
export const SIGNED_KEY = "keplar-signed";
export const SIGNED_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(SIGNED_KEY)})==="1")document.documentElement.setAttribute("data-signed","1")}catch(e){}})();`;

/** Is this a "Try Keplar" call to action? ("Try Keplar", "Try Keplar free", "Try it free") */
export function isTryCta(text: string | null | undefined): boolean {
  return !!text && /^Try (Keplar(?: One)?|it)(?: free)?$/.test(text.trim());
}
/** The label text of a React children value when it is plain text ("Try ", "Keplar" pieces are joined). */
export function plainText(children: unknown): string | null {
  if (typeof children === "string") return children;
  if (Array.isArray(children) && children.every((c) => typeof c === "string")) return children.join("");
  return null;
}
