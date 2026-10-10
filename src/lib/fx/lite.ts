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
