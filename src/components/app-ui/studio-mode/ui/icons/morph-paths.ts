/**
 * Geometry for every MorphIcon. Each icon is a fixed set of stroke "slots"; each state gives every slot a path. Within one
 * icon, a slot's path has the same command structure in every state (tests/studio-ui-icons.test.ts proves it), so the browser
 * interpolates the geometry itself (CSS `d` transition) instead of swapping drawings. Strokes that do not exist in a state
 * collapse to a point at a sensible location with opacity 0, so they shrink away rather than pop.
 *
 * Grid: 24 x 24, live area 2..22, drawn with one stroke style (MorphIcon.module.css: 1.5px, round caps and joins, no fill).
 */

export interface MorphStroke {
  readonly d: string;
  /** 0..1; omitted = 1. Used only to retire a slot that is collapsed to a point in this state. */
  readonly opacity?: number;
}

export interface MorphStateDef {
  readonly strokes: readonly MorphStroke[];
  /** Whole-glyph rotation in degrees (about the centre), for states that are the same drawing turned (chevron). */
  readonly rotate?: number;
  /** Rotate continuously while in this state. Only for a state that means "work is in flight right now" (refresh). */
  readonly spin?: boolean;
}

const P = (d: string, opacity?: number): MorphStroke => (opacity === undefined ? { d } : { d, opacity });

export const MORPH_ICONS = {
  /** navigation drawer: three bars fold into a cross; the middle bar shrinks to the centre */
  menu: {
    menu: { strokes: [P("M4 7 L20 7"), P("M4 12 L20 12"), P("M4 17 L20 17")] },
    close: { strokes: [P("M6 6 L18 18"), P("M12 12 L12 12", 0), P("M6 18 L18 6")] },
  },
  /** add / dismiss: the cross leans into an X */
  plus: {
    plus: { strokes: [P("M12 5 L12 19"), P("M5 12 L19 12")] },
    close: { strokes: [P("M7 7 L17 17"), P("M7 17 L17 7")] },
  },
  /** playback: the triangle's three sides become two bars (the right bar is the two slanted sides meeting at its middle) */
  play: {
    play: { strokes: [P("M8 5 L8 19"), P("M8 19 L19 12"), P("M19 12 L8 5")] },
    pause: { strokes: [P("M8 5 L8 19"), P("M16 19 L16 12"), P("M16 12 L16 5")] },
  },
  /**
   * composer: send (arrow up) → working (a still diamond with a centre point: a run is in flight) → complete (check).
   * Working is a fixed geometric state, not a loop: the run's real progress is shown in text and the Activity tab.
   */
  send: {
    send: { strokes: [P("M6 11 L12 5 L18 11"), P("M12 19 L12 12 L12 5"), P("M12 12 L12 12", 0)] },
    working: { strokes: [P("M7 12 L12 7 L17 12"), P("M7 12 L12 17 L17 12"), P("M12 12 L12 12")] },
    complete: { strokes: [P("M5 12.5 L9.5 17 L19 7.5"), P("M5 12.5 L9.5 17 L19 7.5"), P("M9.5 17 L9.5 17", 0)] },
  },
  /** panel size: the corner brackets pivot inward on their outer points */
  expand: {
    expand: { strokes: [P("M14 4 L20 4 L20 10"), P("M10 20 L4 20 L4 14"), P("M20 4 L14 10"), P("M4 20 L10 14")] },
    collapse: { strokes: [P("M14 4 L14 10 L20 10"), P("M10 20 L10 14 L4 14"), P("M20 4 L14 10"), P("M4 20 L10 14")] },
  },
  /** visibility: the eye narrows, the pupil contracts and the slash draws in from the top-left */
  eye: {
    visible: {
      strokes: [
        P("M2.5 12 C4.5 7.8 8 5.5 12 5.5 C16 5.5 19.5 7.8 21.5 12 C19.5 16.2 16 18.5 12 18.5 C8 18.5 4.5 16.2 2.5 12 Z"),
        P("M9 12 A3 3 0 1 1 15 12 A3 3 0 1 1 9 12"),
        P("M4 4 L4 4", 0),
      ],
    },
    hidden: {
      strokes: [
        P("M2.5 12 C4.5 8.6 8 6.8 12 6.8 C16 6.8 19.5 8.6 21.5 12 C19.5 15.4 16 17.2 12 17.2 C8 17.2 4.5 15.4 2.5 12 Z"),
        P("M9.5 12 A2.5 2.5 0 1 1 14.5 12 A2.5 2.5 0 1 1 9.5 12"),
        P("M4 4 L20 20"),
      ],
    },
  },
  /** inspector source view: brackets and slash reassemble into a plus over a minus */
  code: {
    code: { strokes: [P("M8 7 L3 12 L8 17"), P("M16 7 L21 12 L16 17"), P("M14 4 L10 20")] },
    diff: { strokes: [P("M7 8 L12 8 L17 8"), P("M12 3 L12 8 L12 13"), P("M7 19 L17 19")] },
  },
  /** refresh: identical drawing; turns only while a real refresh is in flight and finishes its turn when it ends */
  refresh: {
    idle: { strokes: [P("M19.5 12 A7.5 7.5 0 1 1 17.3 6.7"), P("M17.3 2.7 L17.3 6.7 L13.3 6.7")] },
    active: { strokes: [P("M19.5 12 A7.5 7.5 0 1 1 17.3 6.7"), P("M17.3 2.7 L17.3 6.7 L13.3 6.7")], spin: true },
  },
  /** disclosure: the chevron turns a quarter to point down */
  chevron: {
    collapsed: { strokes: [P("M9 6 L15 12 L9 18")] },
    expanded: { strokes: [P("M9 6 L15 12 L9 18")], rotate: 90 },
  },
  /** build / stop: the block's outline squares off and its inner edges fold onto the square */
  build: {
    build: {
      strokes: [P("M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z"), P("M4 7.5 L12 12 L20 7.5"), P("M12 12 L12 21")],
    },
    stop: {
      strokes: [P("M12 7 L17 7 L17 17 L12 17 L7 17 L7 7 Z"), P("M7 7 L12 7 L17 7"), P("M12 17 L12 17", 0)],
    },
  },
  /** search: the lens tightens and the handle reaches out when the field has focus */
  search: {
    idle: { strokes: [P("M11 4.5 A6.5 6.5 0 1 1 11 17.5 A6.5 6.5 0 1 1 11 4.5"), P("M15.8 15.8 L20 20")] },
    focused: { strokes: [P("M10.5 5.5 A5 5 0 1 1 10.5 15.5 A5 5 0 1 1 10.5 5.5"), P("M14.2 14.2 L20 20")] },
  },
  /** settings (sliders): the three knobs slide to new positions while the settings surface is open */
  settings: {
    closed: {
      strokes: [P("M4 7 L20 7"), P("M4 12 L20 12"), P("M4 17 L20 17"), P("M9 5 L9 9"), P("M15 10 L15 14"), P("M8 15 L8 19")],
    },
    open: {
      strokes: [P("M4 7 L20 7"), P("M4 12 L20 12"), P("M4 17 L20 17"), P("M15 5 L15 9"), P("M9 10 L9 14"), P("M16 15 L16 19")],
    },
  },
} as const satisfies Record<string, Record<string, MorphStateDef>>;

export type MorphIconName = keyof typeof MORPH_ICONS;
export type MorphIconState<N extends MorphIconName> = Extract<keyof (typeof MORPH_ICONS)[N], string>;

export const MORPH_ICON_NAMES = Object.keys(MORPH_ICONS) as MorphIconName[];

/** The states of one icon, in definition order (the first is the resting state). */
export function morphStates<N extends MorphIconName>(name: N): Array<MorphIconState<N>> {
  return Object.keys(MORPH_ICONS[name]) as Array<MorphIconState<N>>;
}

/** The definition of one state. */
export function morphState<N extends MorphIconName>(name: N, state: MorphIconState<N>): MorphStateDef {
  return (MORPH_ICONS[name] as Record<string, MorphStateDef>)[state];
}
