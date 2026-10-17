/**
 * Static icon set. Same grid and stroke as MorphIcon (24 x 24, live area 2..22, 1.5px round stroke, no fill), so a
 * static icon and a morphing one can sit side by side.
 */

/** Circle as two arcs (stroke-only, so dots are small circles that read as solid at 1.5px). */
export function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy}`;
}

/** Rounded rectangle path. */
export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  const x2 = x + w, y2 = y + h;
  return (
    `M${x + r} ${y} H${x2 - r} A${r} ${r} 0 0 1 ${x2} ${y + r} V${y2 - r} A${r} ${r} 0 0 1 ${x2 - r} ${y2} ` +
    `H${x + r} A${r} ${r} 0 0 1 ${x} ${y2 - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
  );
}

const dot = (x: number, y: number) => circle(x, y, 0.35);

export const GLYPHS = {
  attach: ["M19.5 11.5 L12.3 18.7 A4.6 4.6 0 0 1 5.8 12.2 L12.9 5.1 A3.1 3.1 0 0 1 17.3 9.5 L10.3 16.5 A1.55 1.55 0 0 1 8.1 14.3 L14.6 7.8"],
  image: [rrect(3.5, 4.5, 17, 15, 2), circle(9, 9.75, 1.5), "M3.5 17 L9 12.5 L12.5 15.5 L15.5 13 L20.5 17"],
  file: ["M6.5 3.5 H13.5 L18.5 8.5 V19 A1.5 1.5 0 0 1 17 20.5 H7 A1.5 1.5 0 0 1 5.5 19 V4.5 A1 1 0 0 1 6.5 3.5 Z", "M13.5 3.5 V8.5 H18.5"],
  folder: [
    "M3.5 6.5 A1.5 1.5 0 0 1 5 5 H9.5 L11.5 7 H19 A1.5 1.5 0 0 1 20.5 8.5 V17.5 A1.5 1.5 0 0 1 19 19 H5 A1.5 1.5 0 0 1 3.5 17.5 Z",
  ],
  history: ["M4.5 12 A7.5 7.5 0 1 0 6.7 6.7", "M6.7 2.7 L6.7 6.7 L10.7 6.7", "M12 8 L12 12 L14.5 14.5"],
  sessions: ["M12 3.5 L20.5 8 L12 12.5 L3.5 8 Z", "M3.5 12 L12 16.5 L20.5 12", "M3.5 16 L12 20.5 L20.5 16"],
  settings: ["M4 7 L20 7", "M4 12 L20 12", "M4 17 L20 17", "M9 5 L9 9", "M15 10 L15 14", "M8 15 L8 19"],
  viewport: [
    "M4 8 V5.5 A1.5 1.5 0 0 1 5.5 4 H8",
    "M16 4 H18.5 A1.5 1.5 0 0 1 20 5.5 V8",
    "M20 16 V18.5 A1.5 1.5 0 0 1 18.5 20 H16",
    "M8 20 H5.5 A1.5 1.5 0 0 1 4 18.5 V16",
    "M12 8.5 L15 10.25 L15 13.75 L12 15.5 L9 13.75 L9 10.25 Z",
  ],
  changes: [rrect(4.5, 3.5, 15, 17, 2), "M12 7 L12 12", "M9.5 9.5 L14.5 9.5", "M9.5 16 L14.5 16"],
  plan: ["M10 7 L19.5 7", "M10 12 L19.5 12", "M10 17 L19.5 17", rrect(4, 5.5, 3, 3, 0.75), rrect(4, 10.5, 3, 3, 0.75), rrect(4, 15.5, 3, 3, 0.75)],
  activity: ["M3 12 L7 12 L9.5 5.5 L14.5 18.5 L17 12 L21 12"],
  terminal: [rrect(3, 4.5, 18, 15, 2), "M7 9.5 L10 12 L7 14.5", "M12.5 15 L17 15"],
  warning: ["M10.7 4.7 A1.5 1.5 0 0 1 13.3 4.7 L20.6 17.6 A1.5 1.5 0 0 1 19.3 19.8 H4.7 A1.5 1.5 0 0 1 3.4 17.6 Z", "M12 9.5 L12 13.5", dot(12, 16.5)],
  error: [circle(12, 12, 8.5), "M9.2 9.2 L14.8 14.8", "M14.8 9.2 L9.2 14.8"],
  info: [circle(12, 12, 8.5), "M12 11 L12 16.5", dot(12, 7.9)],
  check: ["M5 12.5 L9.5 17 L19 7.5"],
  credit: [circle(12, 12, 8.5), "M12 8.5 L15.5 12 L12 15.5 L8.5 12 Z"],
  link: [
    "M10 14 L14 10",
    "M8.6 11.4 L6.9 13.1 A3 3 0 0 0 10.9 17.1 L12.6 15.4",
    "M15.4 12.6 L17.1 10.9 A3 3 0 0 0 13.1 6.9 L11.4 8.6",
  ],
  more: [circle(6, 12, 0.9), circle(12, 12, 0.9), circle(18, 12, 0.9)],
  "drag-handle": [circle(9, 6.5, 0.7), circle(15, 6.5, 0.7), circle(9, 12, 0.7), circle(15, 12, 0.7), circle(9, 17.5, 0.7), circle(15, 17.5, 0.7)],
  close: ["M6 6 L18 18", "M18 6 L6 18"],
  plus: ["M12 5 L12 19", "M5 12 L19 12"],
  minus: ["M5 12 L19 12"],
  "arrow-up": ["M6 11 L12 5 L18 11", "M12 5 L12 19"],
  "arrow-right": ["M13 6 L19 12 L13 18", "M19 12 L5 12"],
  "chevron-down": ["M6 9 L12 15 L18 9"],
  "chevron-right": ["M9 6 L15 12 L9 18"],
  external: ["M14 4 L20 4 L20 10", "M20 4 L11 13", "M18 14 V18.5 A1.5 1.5 0 0 1 16.5 20 H5.5 A1.5 1.5 0 0 1 4 18.5 V7.5 A1.5 1.5 0 0 1 5.5 6 H10"],
  copy: [rrect(8.5, 8.5, 11.5, 11.5, 2), "M15.5 8.5 V5.5 A1.5 1.5 0 0 0 14 4 H5.5 A1.5 1.5 0 0 0 4 5.5 V14 A1.5 1.5 0 0 0 5.5 15.5 H8.5"],
  trash: ["M4 7 L20 7", "M9.5 7 V4.5 H14.5 V7", "M6.5 7 L7.4 19.1 A1 1 0 0 0 8.4 20 H15.6 A1 1 0 0 0 16.6 19.1 L17.5 7"],
  undo: ["M9 14 L4 9 L9 4", "M4 9 H14.5 A5.5 5.5 0 0 1 14.5 20 H11"],
  stop: [rrect(7, 7, 10, 10, 1.5)],
  play: ["M8 5 L19 12 L8 19 Z"],
  search: [circle(11, 11, 6.5), "M15.8 15.8 L20 20"],
  code: ["M8 7 L3 12 L8 17", "M16 7 L21 12 L16 17", "M14 4 L10 20"],
  diff: ["M7 8 L17 8", "M12 3 L12 13", "M7 19 L17 19"],
  eye: ["M2.5 12 C4.5 7.8 8 5.5 12 5.5 C16 5.5 19.5 7.8 21.5 12 C19.5 16.2 16 18.5 12 18.5 C8 18.5 4.5 16.2 2.5 12 Z", circle(12, 12, 3)],
  cube: ["M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z", "M4 7.5 L12 12 L20 7.5", "M12 12 L12 21"],
  refresh: ["M19.5 12 A7.5 7.5 0 1 1 17.3 6.7", "M17.3 2.7 L17.3 6.7 L13.3 6.7"],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof GLYPHS;
export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
