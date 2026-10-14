/**
 * Geometry for <UltimateMark> (24 grid). The core morphs from a plain disc (the Solar "sun") into a four-point star; the four
 * rays turn 45 degrees and move out onto the outer ring as fixed ticks; two thin concentric rings assemble around it.
 * Core and rays keep identical command structure across states (tests/studio-ui-icons.test.ts), so they interpolate.
 */
export const ULTIMATE = {
  core: {
    idle: "M12 8.5 C13.933 8.5 15.5 10.067 15.5 12 C15.5 13.933 13.933 15.5 12 15.5 C10.067 15.5 8.5 13.933 8.5 12 C8.5 10.067 10.067 8.5 12 8.5 Z",
    active: "M12 5.5 C12.7 10.3 13.7 11.3 18.5 12 C13.7 12.7 12.7 13.7 12 18.5 C11.3 13.7 10.3 12.7 5.5 12 C10.3 11.3 11.3 10.3 12 5.5 Z",
  },
  /** rays: idle = short sun rays on the axes; active = ticks on the diagonals (the group also turns 45deg) across the outer ring */
  rays: {
    idle: ["M12 2.75 L12 5", "M21.25 12 L19 12", "M12 21.25 L12 19", "M2.75 12 L5 12"],
    active: ["M12 1.25 L12 3.25", "M22.75 12 L20.75 12", "M12 22.75 L12 20.75", "M1.25 12 L3.25 12"],
  },
  rings: {
    inner: { r: 7.75 },
    outer: { r: 10 },
  },
} as const;
