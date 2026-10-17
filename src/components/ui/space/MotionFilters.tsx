/**
 * SVG filters for directional motion blur, referenced from CSS as filter: url(#sp-mb-x) (space.css keyframes sp-mb-x, sp-mb-y,
 * the headline's sp-hl-mb-*). Rendered once by the root layout; a zero-size, hidden <svg>.
 */
export function SpaceMotionFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="sp-mb-x" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="9 0" /></filter>
        <filter id="sp-mb-x-soft" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="4 0" /></filter>
        <filter id="sp-mb-y" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="0 2.2" /></filter>
        <filter id="sp-mb-y2" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="0 5" /></filter>
        <filter id="sp-mb-y3" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="0 9" /></filter>
        <filter id="sp-mb-z" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
    </svg>
  );
}
