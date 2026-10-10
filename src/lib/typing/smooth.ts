/**
 * Pure helpers for the smooth caret and the text ease. No DOM here (unit-tested).
 * Everything these drive is VISUAL ONLY: the real text field is never touched, delayed or re-rendered.
 */

/** Frame-rate independent exponential smoothing: moves `cur` toward `target`; `tauMs` is the time to cover ~63% of the gap. */
export function lerpTo(cur: number, target: number, dtMs: number, tauMs: number): number {
  if (!(tauMs > 0) || !(dtMs > 0)) return target;
  const k = 1 - Math.exp(-Math.min(dtMs, 100) / tauMs);
  return cur + (target - cur) * k;
}

/** Has the animation arrived (so the loop can stop and the caret can blink again)? */
export const settled = (cur: number, target: number, eps = 0.15) => Math.abs(cur - target) <= eps;

/** Far jumps (a click elsewhere, a new line far away, a field switch) snap instead of sweeping across the screen. */
export const CARET_SNAP_PX = 260;
export function caretStep(cur: { x: number; y: number }, target: { x: number; y: number }, dtMs: number, tauMs = 48): { x: number; y: number; snapped: boolean } {
  const far = Math.hypot(target.x - cur.x, target.y - cur.y) > CARET_SNAP_PX;
  if (far) return { x: target.x, y: target.y, snapped: true };
  return { x: lerpTo(cur.x, target.x, dtMs, tauMs), y: lerpTo(cur.y, target.y, dtMs, tauMs * 0.8), snapped: false };
}

export type SmoothEnv = { finePointer: boolean; reducedMotion: boolean; forcedColors: boolean; off: boolean };
/** Smooth caret: any doubt means the native caret stays. */
export function smoothCaretAllowed(e: SmoothEnv): boolean {
  return !e.reducedMotion && !e.forcedColors && !e.off;
}

/** Long documents skip the mirror measurement (cost grows with length); the native caret is fine there. */
export const MIRROR_MAX_CHARS = 6000;

/** Input types whose caret position we can mirror. */
export const CARET_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", ""]);

/** CSS properties copied onto the measuring mirror so it wraps exactly like the field. */
export const MIRROR_PROPS = [
  "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust",
  "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing", "wordSpacing", "tabSize", "whiteSpace", "wordBreak",
  "overflowWrap", "direction", "fontKerning", "fontFeatureSettings",
] as const;

/** Streaming text ease: only the newest words are wrapped (older words are plain text), so a huge answer stays one text node. */
export const EASE_TAIL_WORDS = 28;
export type EasePiece = { text: string; word: boolean; index: number };
export function splitForEase(text: string, tail = EASE_TAIL_WORDS): { head: string; words: EasePiece[] } {
  const parts = text.split(/(\s+)/);
  let wordsSeen = 0;
  const total = parts.filter((p, i) => i % 2 === 0 && p !== "").length;
  const from = Math.max(0, total - tail);
  let head = "";
  const words: EasePiece[] = [];
  parts.forEach((p, i) => {
    if (p === "") return;
    if (i % 2 === 1) { if (wordsSeen > from) words.push({ text: p, word: false, index: -1 }); else head += p; return; }
    if (wordsSeen < from) head += p;
    else words.push({ text: p, word: true, index: wordsSeen });
    wordsSeen++;
  });
  return { head, words };
}
