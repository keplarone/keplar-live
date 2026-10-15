/** What a key does in the Slides presenter. Pure; tested in tests/keyboard-layers.test.ts. */
export type PresentAction = "next" | "prev" | "first" | "last" | "notes" | "exit" | null;

/**
 * `onControl` is true when focus is on one of the presenter's own buttons: then Enter and Space belong to that button (so the
 * Previous, Next, Notes and Exit buttons work from the keyboard) and are not taken over as "next slide".
 */
export function presentAction(key: string, onControl: boolean): PresentAction {
  if (key === "Escape") return "exit";
  if ((key === "Enter" || key === " ") && onControl) return null;
  if (key === "ArrowRight" || key === "ArrowDown" || key === "PageDown" || key === " " || key === "Enter") return "next";
  if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp" || key === "Backspace") return "prev";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key.toLowerCase() === "n") return "notes";
  return null;
}
