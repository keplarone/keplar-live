/**
 * Fit-to-frame math and DOM helper. A label that is too wide for its frame is scaled down (never below `min`), and only when even the
 * smallest size does not fit does it fall back to an ellipsis plus a title tooltip so the full text stays readable.
 * `fitSize` is pure (unit-tested); `fitElement` is the only DOM part and is used by <FitText>, useFitText and the global FitRuntime.
 */
export const FIT_MIN_PX = 11;

export type FitResult = { size: number; fits: boolean };

/** The font size (px) at which text that needs `needed` px at `current` px fits into `avail` px, never below `min`. */
export function fitSize(opts: { avail: number; needed: number; current: number; min?: number }): FitResult {
  const min = opts.min ?? FIT_MIN_PX;
  const { avail, needed, current } = opts;
  if (!(avail > 0) || !(needed > 0) || !(current > 0)) return { size: current, fits: true };
  if (needed <= avail + 0.5) return { size: current, fits: true };
  const ideal = Math.floor(current * (avail / needed) * 4) / 4; // quarter pixels, rounded down so it really fits
  if (ideal >= min) return { size: ideal, fits: true };
  // never scale up to the minimum when the original is already smaller than it
  const size = Math.min(current, min);
  return { size, fits: size * (needed / current) <= avail + 0.5 };
}

/** Apply fitSize to one element (single-line label, `white-space: nowrap`). Returns true when the text fits. */
export function fitElement(el: HTMLElement, min = FIT_MIN_PX): boolean {
  el.style.fontSize = "";
  el.removeAttribute("data-fit-state");
  const avail = el.clientWidth;
  const needed = el.scrollWidth;
  if (needed <= avail + 0.5) return true;
  const current = parseFloat(getComputedStyle(el).fontSize) || 14;
  const r = fitSize({ avail, needed, current, min });
  if (r.size !== current) el.style.fontSize = `${r.size}px`;
  if (r.fits && el.scrollWidth <= el.clientWidth + 0.5) { el.setAttribute("data-fit-state", "scaled"); return true; }
  // last resort: ellipsis (CSS keys off data-fit-state) and the full text in a tooltip
  el.setAttribute("data-fit-state", "ellipsis");
  if (!el.title && !el.getAttribute("aria-label")) el.title = (el.textContent || "").trim().replace(/\s+/g, " ");
  return false;
}
