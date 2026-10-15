/**
 * "Lite" rendering for phones and modest devices: touch-first or narrow screens, few CPU cores, little memory, or Save-Data.
 * The background canvases use it to draw fewer dots, at a lower resolution and frame rate; desktop keeps the full effect.
 */
export function liteFx(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (
    matchMedia("(pointer: coarse)").matches ||
    window.innerWidth < 768 ||
    (nav.hardwareConcurrency ?? 8) <= 4 ||
    (nav.deviceMemory ?? 8) <= 4 ||
    Boolean(nav.connection?.saveData)
  );
}

/** Frame interval for a requestAnimationFrame loop: about 30 fps in lite mode, every frame otherwise. */
export const frameGap = (lite: boolean) => (lite ? 1000 / 30 - 2 : 0);

/**
 * Phones (640px and narrower): the marketing pages run no decorative animation at all there. The animated backdrop, the pinned
 * particle scene and the looping product demo are replaced by static versions (CSS in the matching modules), which keeps the
 * main thread free for the hero and the first tap. Keep the width in sync with the `max-width: 640px` blocks in the CSS.
 */
export const PHONE_QUERY = "(max-width: 640px)";
export function isPhone(): boolean {
  return typeof window !== "undefined" && matchMedia(PHONE_QUERY).matches;
}
