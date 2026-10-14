/**
 * Placement for anchored floating UI (Tooltip, Popover, Menu). Pure, so it is unit tested
 * (tests/studio-ui-logic.test.ts). The floating element is fixed-positioned in the top layer.
 */

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PlaceInput {
  anchor: Rect;
  floating: { width: number; height: number };
  viewport: { width: number; height: number };
  side?: Side;
  align?: Align;
  /** gap between anchor and floating element, px */
  offset?: number;
  /** minimum distance kept from the viewport edge, px */
  margin?: number;
}

export interface Placement {
  top: number;
  left: number;
  /** the side actually used (flipped when the preferred side has no room) */
  side: Side;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

function room(side: Side, a: Rect, vp: { width: number; height: number }): number {
  if (side === "top") return a.top;
  if (side === "bottom") return vp.height - (a.top + a.height);
  if (side === "left") return a.left;
  return vp.width - (a.left + a.width);
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));

/** Places the floating box against the anchor, flipping to the opposite side if it does not fit, then clamps into the viewport. */
export function computePlacement({ anchor, floating, viewport, side = "bottom", align = "center", offset = 6, margin = 8 }: PlaceInput): Placement {
  const vertical = side === "top" || side === "bottom";
  const need = (vertical ? floating.height : floating.width) + offset + margin;
  let used = side;
  if (room(side, anchor, viewport) < need && room(OPPOSITE[side], anchor, viewport) > room(side, anchor, viewport)) used = OPPOSITE[side];
  let top: number;
  let left: number;
  if (used === "top" || used === "bottom") {
    top = used === "top" ? anchor.top - offset - floating.height : anchor.top + anchor.height + offset;
    left =
      align === "start" ? anchor.left : align === "end" ? anchor.left + anchor.width - floating.width : anchor.left + (anchor.width - floating.width) / 2;
  } else {
    left = used === "left" ? anchor.left - offset - floating.width : anchor.left + anchor.width + offset;
    top =
      align === "start" ? anchor.top : align === "end" ? anchor.top + anchor.height - floating.height : anchor.top + (anchor.height - floating.height) / 2;
  }
  left = clamp(left, margin, viewport.width - margin - floating.width);
  top = clamp(top, margin, viewport.height - margin - floating.height);
  return { top: Math.round(top), left: Math.round(left), side: used };
}
