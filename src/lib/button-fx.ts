/** Pure math + gate for the global button effects (src/components/ui/ButtonFx.tsx). */
export function magnetOffset(px: number, py: number, rect: { left: number; top: number; width: number; height: number }, strength = 0.2, max = 6): [number, number] {
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const c = (v: number) => Math.max(-max, Math.min(max, v));
  return [c((px - cx) * strength), c((py - cy) * strength)];
}
/** Effects run only for a fine pointer, motion allowed, and not in a data-saver / low-power browser. */
export function buttonFxAllowed(e: { finePointer: boolean; reducedMotion: boolean; saveData: boolean }): boolean {
  return e.finePointer && !e.reducedMotion && !e.saveData;
}
